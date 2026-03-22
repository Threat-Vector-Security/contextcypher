// src/services/settingsApi.ts

import axios, { AxiosError } from 'axios';
// Browser mode - no Tauri imports needed
import { AIProvider } from '../types/SettingsTypes';
import { loadSettings, saveSettings } from '../settings/settings';
// Re-use the shared API instance and port-detection helper so we always
// hit the active Node backend port (which may not be 3001 in dev).
import api, { detectServerPort as detectPort } from '../api';

// Browser mode - always use backend server
const OFFLINE_MODE = false;
// The shared `api` instance from src/api.ts already has correct baseURL.
// If we failed to detect the server port yet, ensure we do it before the first call.

let portDetected = false;
const ensurePortDetected = async () => {
    if (portDetected) return;
    try {
        await detectPort();
    } finally {
        portDetected = true;
    }
};

interface APIErrorResponse {
    message: string;
    error: string;
}

interface ProviderUpdateResponse {
    success: boolean;
    message: string;
    currentProvider?: AIProvider;
    error?: string;
    errorType?: 'INVALID_API_KEY' | 'QUOTA_EXCEEDED' | 'RATE_LIMITED' | 'CONTEXT_LIMIT_EXCEEDED' | 'MODEL_NOT_FOUND' | 'PERMISSION_DENIED' | 'CONNECTION_ERROR' | 'SERVER_ERROR' | 'UNKNOWN_ERROR';
    tokenLimits?: {
        maxInput?: number;
        maxOutput?: number;
    };
}

// Updated interface for secure API key handling
interface ProviderUpdateRequest {
    provider: AIProvider;
    apiKey?: string;
    organizationId?: string;
    projectId?: string;
    baseUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    testOnly?: boolean;
    // GPU performance settings
    gpuMemoryFraction?: number;
    numThreads?: number;
    batchSize?: number;
    // Advanced GPU settings
    gpuOverhead?: number;
    numParallel?: number;
    maxLoadedModels?: number;
    keepAlive?: string;
    gpuLayers?: number;
    selectedGPU?: string;
}

// Flag to prevent multiple provider updates in quick succession
let isUpdatingProvider = false;
let currentUpdateController: AbortController | null = null;

// Timeout duration for provider updates (30 seconds)
const PROVIDER_UPDATE_TIMEOUT = 30000;

/**
 * Cancel any ongoing provider update
 */
export function cancelProviderUpdate(): void {
    if (currentUpdateController) {
        console.log('Cancelling ongoing provider update');
        currentUpdateController.abort();
        currentUpdateController = null;
        isUpdatingProvider = false;
    }
}

/**
 * Check if a provider update is currently in progress
 */
export function isProviderUpdateInProgress(): boolean {
    return isUpdatingProvider;
}

export async function updateAIProvider(request: ProviderUpdateRequest): Promise<ProviderUpdateResponse> {
    let timeoutId: NodeJS.Timeout | undefined;
    
    try {
        // Cancel any existing update request
        if (currentUpdateController) {
            console.log('Cancelling previous provider update request');
            currentUpdateController.abort();
            currentUpdateController = null;
            isUpdatingProvider = false;
        }

        // Prevent multiple provider updates in quick succession
        if (isUpdatingProvider) {
            console.log('Provider update already in progress, skipping duplicate request');
            return {
                success: false,
                message: 'Provider update already in progress'
            };
        }
        
        isUpdatingProvider = true;
        
        // Create new abort controller for this request
        currentUpdateController = new AbortController();
        
        // Set up timeout
        timeoutId = setTimeout(() => {
            if (currentUpdateController) {
                console.log('Provider update timed out after 30 seconds');
                currentUpdateController.abort();
            }
        }, PROVIDER_UPDATE_TIMEOUT);
        console.log(`Attempting to update AI provider (${OFFLINE_MODE ? 'offline' : 'backend'} mode):`, { 
            provider: request.provider, 
            hasApiKey: !!request.apiKey,
            hasBaseUrl: !!request.baseUrl,
            hasModel: !!request.model,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            organizationId: request.organizationId,
            projectId: request.projectId
        });
        
        // Try backend first. If it fails (e.g., pure web build without backend), fall back to offline mode.
        try {
            await ensurePortDetected();
            const response = await api.post('/api/settings/ai-provider', {
              provider: request.provider,
              apiKey: request.apiKey,
              organizationId: request.organizationId,
              projectId: request.projectId,
              baseUrl: request.baseUrl,
              model: request.model,
              temperature: request.temperature,
              maxTokens: request.maxTokens,
              testOnly: request.testOnly,
              // GPU settings
              gpuMemoryFraction: request.gpuMemoryFraction,
              numThreads: request.numThreads,
              batchSize: request.batchSize,
              gpuOverhead: request.gpuOverhead,
              numParallel: request.numParallel,
              maxLoadedModels: request.maxLoadedModels,
              keepAlive: request.keepAlive,
              gpuLayers: request.gpuLayers,
              selectedGPU: request.selectedGPU
            }, {
              signal: currentUpdateController?.signal // Use abort signal
            });
            
            // Clear timeout on success
            if (timeoutId) clearTimeout(timeoutId);

            console.log('Provider update response:', { success: response.data?.success, provider: response.data?.currentProvider });

            if (response.data.error) {
                throw new Error(response.data.error);
            }

            return response.data as ProviderUpdateResponse;
        } catch (err) {
            // If backend responded with an error (i.e. we received an HTTP response),
            // propagate the error so outer catch can surface it to the UI.
            if (axios.isAxiosError(err) && err.response) {
                console.warn('Backend responded with error; not falling back to offline mode', {
                    status: err.response.status,
                    message: err.response.data?.message || err.response.data?.error
                });
                throw err; // handled by outer catch block
            }

            console.warn('Backend unreachable, falling back to offline update.', (err as any)?.message || err);
            // Fall back to offline mode only when backend is not reachable (e.g. pure web build)
            return await updateProviderOffline(request);
        }
    } catch (error: unknown) {
        console.error('Failed to update AI provider:', error);
        
        // Clear timeout on error
        if (timeoutId) clearTimeout(timeoutId);
        
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<APIErrorResponse & { errorType?: string }>;
            
            // Check if the request was cancelled
            if (axiosError.code === 'ERR_CANCELED' || axiosError.message === 'canceled') {
                return {
                    success: false,
                    message: 'Provider update was cancelled'
                };
            }
            
            // Do not update localStorage on error
            const errorMessage = axiosError.response?.data?.message || 
                axiosError.response?.data?.error ||
                'Failed to update AI provider. Please try again.';
            
            const errorType = axiosError.response?.data?.errorType;
                
            return {
                success: false,
                message: errorMessage,
                ...(errorType && { errorType: errorType as ProviderUpdateResponse['errorType'] })
            };
        }
        
        return {
            success: false,
            message: 'An unexpected error occurred while updating the AI provider'
        };
    } finally {
        // Reset the flag and controller immediately
        isUpdatingProvider = false;
        currentUpdateController = null;
    }
}

/**
 * Handle provider updates in offline mode (no backend server required)
 */
async function updateProviderOffline(request: ProviderUpdateRequest): Promise<ProviderUpdateResponse> {
    try {
        const currentSettings = loadSettings();
        
        // Validate the request
        if (!request.provider) {
            return {
                success: false,
                message: 'Provider is required'
            };
        }
        
        // For local LLM mode, validate Ollama connection
        if (request.provider === 'local' && request.baseUrl) {
            const isOllamaAvailable = await validateOllamaConnection(request.baseUrl);
            if (!isOllamaAvailable) {
                return {
                    success: false,
                    message: 'Cannot connect to Ollama. Please ensure Ollama is running on the specified URL.'
                };
            }
        }
        
        // Update settings based on provider
        const updatedSettings = { ...currentSettings };
        
        // Set LLM mode based on provider
        if (request.provider === 'local') {
            updatedSettings.api.llmMode = 'local';
            // Update local LLM settings
            if (request.baseUrl) updatedSettings.api.localLLM.baseUrl = request.baseUrl;
            if (request.model) updatedSettings.api.localLLM.model = request.model;
            if (request.temperature !== undefined) updatedSettings.api.localLLM.temperature = request.temperature;
            if (request.maxTokens !== undefined) updatedSettings.api.localLLM.maxTokens = request.maxTokens;
            // GPU settings
            if (request.gpuMemoryFraction !== undefined) updatedSettings.api.localLLM.gpuMemoryFraction = request.gpuMemoryFraction;
            if (request.numThreads !== undefined) updatedSettings.api.localLLM.numThreads = request.numThreads;
            if (request.batchSize !== undefined) updatedSettings.api.localLLM.batchSize = request.batchSize;
            if (request.gpuOverhead !== undefined) updatedSettings.api.localLLM.gpuOverhead = request.gpuOverhead;
            if (request.numParallel !== undefined) updatedSettings.api.localLLM.numParallel = request.numParallel;
            if (request.maxLoadedModels !== undefined) updatedSettings.api.localLLM.maxLoadedModels = request.maxLoadedModels;
            if (request.keepAlive !== undefined) updatedSettings.api.localLLM.keepAlive = request.keepAlive;
            if (request.gpuLayers !== undefined) updatedSettings.api.localLLM.gpuLayers = request.gpuLayers;
            if (request.selectedGPU !== undefined) updatedSettings.api.localLLM.selectedGPU = request.selectedGPU;
        } else {
            // Public API provider
            updatedSettings.api.llmMode = 'public';
            updatedSettings.api.provider = request.provider;
            
            // Update provider configurations (API keys are handled separately in credentials)
            if (request.provider === 'openai') {
                if (!updatedSettings.api.providerConfig.openai) {
                    updatedSettings.api.providerConfig.openai = {};
                }
                updatedSettings.api.providerConfig.openai.organizationId = request.organizationId || '';
            } else if (request.provider === 'gemini') {
                if (!updatedSettings.api.providerConfig.gemini) {
                    updatedSettings.api.providerConfig.gemini = {};
                }
                updatedSettings.api.providerConfig.gemini.projectId = request.projectId || '';
            }
        }
        
        // Save updated settings
        saveSettings(updatedSettings);

        console.log('Provider updated successfully (offline mode):', request.provider);
        
        return {
            success: true,
            message: 'Provider updated successfully',
            currentProvider: request.provider
        };
        
    } catch (error) {
        console.error('Error updating provider in offline mode:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to update provider'
        };
    }
}

/**
 * Validate Ollama connection
 */
async function validateOllamaConnection(baseUrl: string): Promise<boolean> {
    try {
        // In browser mode, validate by checking Ollama API directly
        const response = await fetch(`${baseUrl}/api/tags`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.ok;
    } catch (error) {
        console.warn('Ollama validation failed:', error);
        return false;
    }
}

export async function validateProviderSettings(request: ProviderUpdateRequest): Promise<boolean> {
    try {
        // In offline mode, handle validation locally
        if (OFFLINE_MODE) {
            return await validateProviderOffline(request);
        }
        
        // Legacy backend validation
        await ensurePortDetected();
        const response = await api.post('/api/settings/validate', {
            provider: request.provider,
            apiKey: request.apiKey,
            organizationId: request.organizationId,
            projectId: request.projectId,
            baseUrl: request.baseUrl,
            model: request.model,
            temperature: request.temperature,
            maxTokens: request.maxTokens
        });
        return response.data.valid;
    } catch (error: unknown) {
        console.error('Provider validation failed:', error);
        return false;
    }
}

/**
 * Validate provider settings in offline mode
 */
async function validateProviderOffline(request: ProviderUpdateRequest): Promise<boolean> {
    try {
        // Basic validation
        if (!request.provider) {
            return false;
        }
        
        // Provider-specific validation
        switch (request.provider) {
            case 'local':
                // Validate Ollama connection
                if (request.baseUrl) {
                    return await validateOllamaConnection(request.baseUrl);
                }
                return false;
                
            case 'openai':
            case 'anthropic':
            case 'gemini':
                // For public APIs, we can't validate without making actual API calls
                // Just validate that required fields are present
                return !!request.apiKey;
                
            default:
                return false;
        }
    } catch (error) {
        console.error('Provider validation failed (offline mode):', error);
        return false;
    }
}

export function getCurrentProvider(): AIProvider {
    return loadSettings().api.provider || 'openai';
}

export function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
}

export function getApiUrl(): string {
    return api.defaults.baseURL || 'N/A';
}
