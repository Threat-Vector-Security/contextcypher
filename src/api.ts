// src/api.ts
import axios, { AxiosError, AxiosResponse } from 'axios';
import { detectServerPort as detectPort } from './utils/portDetection';
import { connectionManager } from './services/ConnectionManager';
import { logToDebugPanel } from './components/DebugPanel';
import { isVercelDeployment } from './utils/vercelDetection';
import { getFrontendAppSecret } from './utils/appSecret';

const sanitizeHeadersForLogging = (headers: unknown): Record<string, unknown> | undefined => {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  Object.entries(headers as Record<string, unknown>).forEach(([key, value]) => {
    sanitized[key] = key.toLowerCase() === 'x-app-secret' ? '[REDACTED]' : value;
  });
  return sanitized;
};

// Default API base URL - will be updated dynamically
let detectedApiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3002';
// On Vercel, use relative URLs
if (isVercelDeployment()) {
  detectedApiBaseUrl = '';
}
export let API_BASE_URL = detectedApiBaseUrl;

// Configure API client for offline mode
export const api = axios.create({
  baseURL: detectedApiBaseUrl,
  // Increased timeout to allow slower public LLMs (e.g., GPT-4, Claude, Gemini) to
  // complete large diagram analyses without the frontend aborting prematurely.
  // Note: For diagram generation with many components, processing can take time
  // Healthcare systems with 100+ components can take 6+ minutes
  timeout: 900000, // 15 minutes maximum for very slow models like Claude Opus 4
  headers: {
    'Content-Type': 'application/json',
  },
});

// Port detection function
export const detectServerPort = async (): Promise<string> => {
  const serverInfo = await detectPort();
  detectedApiBaseUrl = serverInfo.url;
  api.defaults.baseURL = serverInfo.url;
  API_BASE_URL = serverInfo.url;
  return serverInfo.url;
};

// Update API_BASE_URL getter
export const getApiBaseUrl = (): string => detectedApiBaseUrl;

// Add request interceptor for offline mode and security
api.interceptors.request.use(
  (config) => {
    // Add offline mode header
    config.headers['X-Offline-Mode'] = 'true';
    
    // Add app secret header for authentication
    config.headers['X-App-Secret'] = getFrontendAppSecret();
    
    console.log('API Request (Offline Mode):', {
      method: config.method?.toUpperCase(),
      url: config.url,
      offlineMode: true
    });
    
    // Log to debug panel
    logToDebugPanel('network', `🌐 ${config.method?.toUpperCase() || 'GET'} ${config.url}`, {
      headers: sanitizeHeadersForLogging(config.headers),
      baseURL: config.baseURL
    });
    
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log('API Response:', {
      url: response.config.url,
      status: response.status,
      headers: response.headers,
      offlineMode: true
    });
    
    // Log successful responses to debug panel
    logToDebugPanel('network', `✅ ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError) => {
    const timestamp = new Date().toISOString();
    const errorData = {
      url: error.config?.url,
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      code: error.code,
      responseData: error.response?.data,
      responseHeaders: sanitizeHeadersForLogging(error.response?.headers),
      requestData: error.config?.data ? JSON.parse(error.config.data) : null,
      requestHeaders: sanitizeHeadersForLogging(error.config?.headers),
      offlineMode: true
    };
    
    console.error(`[${timestamp}] API Response Error:`, errorData);
    
    // Log to debug panel
    logToDebugPanel('error', `API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
      status: error.response?.status,
      message: error.message,
      code: error.code,
      data: error.response?.data
    });

    // Handle common offline mode errors
    if (error.response?.status === 401) {
      console.error(`[${timestamp}] Authentication error - checking app secret`);
      return Promise.reject(new Error('Authentication failed - please check app configuration'));
    }

    if (error.response?.status === 403) {
      console.error(`[${timestamp}] CORS or security policy error`);
      return Promise.reject(new Error('Request blocked by security policy'));
    }

    if (error.response?.status === 404) {
      return Promise.reject(new Error('Service not available in offline mode'));
    }

    if (error.response?.status === 500) {
      return Promise.reject(new Error('Server error - please check your local setup'));
    }

    // Network errors - trigger reconnection
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ERR_NETWORK' || error.code === 'ERR_FAILED') {
      console.error(`[${timestamp}] Network error detected - triggering reconnection`);
      // connectionManager already imported
      connectionManager.handleConnectionError(error);
      // Don't immediately reject - let the connection manager handle it
      return Promise.reject(new Error('Connection lost - attempting to reconnect...'));
    }

    return Promise.reject(error);
  }
);

// API Functions for offline mode
export const generateThreatAnalysis = async (
  diagramData: string,
  userPrompt: string,
  settings: any
): Promise<string> => {
  try {
    const response = await api.post('/api/analyze', {
      diagramData,
      userPrompt,
      settings
    });
    return response.data.analysis;
  } catch (error) {
    console.error('Threat analysis error:', error);
    throw error;
  }
};

export const generateAssessment = async (
  diagramData: string,
  settings: any
): Promise<string> => {
  try {
    const response = await api.post('/api/assess', {
      diagramData,
      settings
    });
    return response.data.assessment;
  } catch (error) {
    console.error('Assessment generation error:', error);
    throw error;
  }
};

// AI Provider Functions
export const testAIProvider = async (
  providerType: string,
  config: any,
  settings: any
): Promise<{ success: boolean; message: string }> => {
  try {
    logToDebugPanel('ai', `🔧 Testing AI provider: ${providerType}`, {
      provider: providerType,
      baseUrl: config.baseUrl,
      model: config.model
    });
    
    const response = await api.post('/api/test-provider', {
      providerType,
      config,
      settings
    });
    
    logToDebugPanel('ai', `✅ AI provider test successful: ${providerType}`, response.data);
    return response.data;
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
    logToDebugPanel('error', `❌ AI provider test failed: ${providerType}`, {
      error: errorMessage,
      status: error.response?.status,
      details: error.response?.data
    });
    console.error('AI provider test error:', error);
    throw error;
  }
};

// Note: AI provider initialization is now handled by updateAIProvider in settingsApi.ts
// The /api/initialize-provider endpoint does not exist on the backend

// Threat Intelligence Functions
export const getThreatIntelligence = async (
  query: string
): Promise<any> => {
  try {
    const response = await api.get('/api/threat-intel', {
      params: { query }
    });
    return response.data;
  } catch (error) {
    console.error('Threat intelligence error:', error);
    throw error;
  }
};

export const getVulnerabilityInfo = async (
  cve: string
): Promise<any> => {
  try {
    const response = await api.get('/api/vulnerability', {
      params: { cve }
    });
    return response.data;
  } catch (error) {
    console.error('Vulnerability info error:', error);
    throw error;
  }
};

export const getSecurityAdvisories = async (
  package_name: string
): Promise<any> => {
  try {
    const response = await api.get('/api/security-advisories', {
      params: { package: package_name }
    });
    return response.data;
  } catch (error) {
    console.error('Security advisories error:', error);
    throw error;
  }
};

// Health check
export const healthCheck = async (): Promise<boolean> => {
  try {
    const response = await api.get('/api/health');
    return response.status === 200;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
};

// Test server connection - used by FirstRunSetup
export const testServerConnection = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await api.get('/api/health');
    return {
      success: response.status === 200,
      message: 'Server connection successful'
    };
  } catch (error) {
    console.error('Server connection test failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed'
    };
  }
};

// Chat function with retry logic - used by FirstRunSetup for testing LLM
export const chat = async (
  message: string,
  messageHistory: any[] = [],
  context: any = {},
  provider?: string,
  providerConfig?: {
    provider?: string;
    apiKey?: string;
    organizationId?: string;
    projectId?: string;
    baseUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<{ success: boolean; response?: string; error?: string; choices?: any; metadata?: any }> => {
  let attempts = 0;
  const maxAttempts = 2;
  
  while (attempts < maxAttempts) {
    try {
      // On retry, wait a bit before retrying
      if (attempts > 0) {
        console.log('Chat API: Retrying request...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Only re-detect port if connection manager indicates disconnected for a while
        if (!connectionManager.isConnected() && connectionManager.getStatus().retryCount > 2) {
          console.log('Chat API: Connection lost for multiple retries, re-detecting port...');
          await detectServerPort();
        }
      }
      
      const response = await api.post('/api/chat', {
        message,
        messageHistory,
        context,
        provider,
        providerConfig
      });
      
      console.log('Chat API response:', response.data);
      
      // Handle the formatted response from the server
      if (response.data.choices && response.data.choices[0]?.message?.content) {
        return {
          success: true,
          response: response.data.choices[0].message.content,
          choices: response.data.choices,
          metadata: response.data.metadata
        };
      } else {
        // Fallback for different response formats
        return {
          success: true,
          response: response.data.response || response.data.content || JSON.stringify(response.data),
          choices: response.data.choices,
          metadata: response.data.metadata
        };
      }
    } catch (error: any) {
      attempts++;
      console.log(`Chat API attempt ${attempts} failed:`, error);
      
      if (attempts >= maxAttempts) {
        // Return error on final attempt
        console.error('Chat test failed:', error);
        console.error('Chat error details:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            timeout: error.config?.timeout
          }
        });
        return {
          success: false,
          error: error.response?.data?.message || error.message || 'Unknown error occurred'
        };
      }
      
      // Wait briefly before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // This should never be reached, but adding for TypeScript
  return {
    success: false,
    error: 'Maximum retry attempts exceeded'
  };
};

// Cancel diagram generation
export const cancelDiagramGeneration = async (requestId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const response = await api.post('/api/generate-diagram/cancel', { requestId });
    return response.data;
  } catch (error: any) {
    console.error('Cancel Diagram Generation API error:', error);
    return {
      success: false,
      error: error.message || 'Failed to cancel generation'
    };
  }
};

// Generate diagram function - dedicated endpoint for AI diagram generation
export const generateDiagram = async (
  description: string,
  generationType: 'technical' | 'process' | 'hybrid' | 'dfd' | 'auto' = 'technical',
  context: any = {},
  signal?: AbortSignal
): Promise<{ success: boolean; content?: string; error?: string; generationType?: string; timestamp?: string }> => {
  let attempts = 0;
  const maxAttempts = 2;
  
  while (attempts < maxAttempts) {
    try {
      // On retry, wait a bit before retrying
      if (attempts > 0) {
        console.log('Generate Diagram API: Retrying request...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Only re-detect port if connection manager indicates disconnected for a while
        if (!connectionManager.isConnected() && connectionManager.getStatus().retryCount > 2) {
          console.log('Generate Diagram API: Connection lost for multiple retries, re-detecting port...');
          await detectServerPort();
        }
      }
      
      // Generate a unique request ID for cancellation tracking
      const requestId = `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const response = await api.post('/api/generate-diagram', {
        description,
        generationType,
        context,
        requestId
      }, {
        signal
      });
      
      console.log('Generate Diagram API response:', response.data);
      
      // Include the requestId in the response for cancellation tracking
      return {
        ...response.data,
        requestId
      };
    } catch (error: any) {
      // Check if the error is due to cancellation (don't retry on cancel)
      if (axios.isCancel(error) || error.name === 'CanceledError' || error.name === 'AbortError') {
        console.log('Generate Diagram API cancelled by user');
        return {
          success: false,
          error: 'Generation cancelled by user'
        };
      }
      
      attempts++;
      console.log(`Generate Diagram API attempt ${attempts} failed:`, error);
      
      if (attempts >= maxAttempts) {
        // Return error on final attempt
        console.error('Generate diagram failed:', error);
        console.error('Generate diagram error details:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            timeout: error.config?.timeout
          }
        });
        
        return {
          success: false,
          error: error.response?.data?.message || error.message || 'Diagram generation failed'
        };
      }
      
      // Wait briefly before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // This should never be reached, but adding for TypeScript
  return {
    success: false,
    error: 'Maximum retry attempts exceeded'
  };
};

// Analyze diagram context to recommend generation mode
export const analyzeDiagramContext = async (
  context: string
): Promise<{ 
  success: boolean; 
  analysis?: {
    estimatedNodeCount: number;
    complexity: 'low' | 'medium' | 'high' | 'very-high';
    recommendedMode: 'technical' | 'process' | 'hybrid';
    reasoning: string;
    hasLargeGroups: boolean;
    primarySystemType: 'technical' | 'workflow' | 'mixed';
  };
  error?: string;
}> => {
  let attempts = 0;
  const maxAttempts = 2;
  
  while (attempts < maxAttempts) {
    try {
      // On retry, wait a bit before retrying
      if (attempts > 0) {
        console.log('Analyze Context API: Retrying request...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Only re-detect port if connection manager indicates disconnected for a while
        if (!connectionManager.isConnected() && connectionManager.getStatus().retryCount > 2) {
          console.log('Analyze Context API: Connection lost for multiple retries, re-detecting port...');
          await detectServerPort();
        }
      }
      
      const response = await api.post('/api/analyze-diagram-context', {
        context
      });
      
      console.log('Analyze Context API response:', response.data);
      
      if (response.data.success && response.data.analysis) {
        return {
          success: true,
          analysis: response.data.analysis
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Analysis failed'
        };
      }
    } catch (error: any) {
      attempts++;
      console.log(`Analyze Context API attempt ${attempts} failed:`, error);
      
      if (attempts >= maxAttempts) {
        console.error('Analyze context failed:', error);
        return {
          success: false,
          error: error.response?.data?.message || error.message || 'Context analysis failed'
        };
      }
      
      // Wait briefly before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return {
    success: false,
    error: 'Maximum retry attempts exceeded'
  };
};

// Analyze function - used by FirstRunSetup for testing analysis
export const analyze = async (
  diagramData: any,
  messageHistory: any[] = [],
  context: any = {},
  provider?: string
): Promise<{ success: boolean; analysis?: string; error?: string; choices?: any; metadata?: any }> => {
  try {
    const response = await api.post('/api/analyze', {
      diagram: diagramData,  // Server expects 'diagram', not 'diagramData'
      messageHistory,
      context,
      provider
    });
    
    console.log('Analyze API response:', response.data);
    
    // Handle the formatted response from the server
    if (response.data.choices && response.data.choices[0]?.message?.content) {
      return {
        success: true,
        analysis: response.data.choices[0].message.content,
        choices: response.data.choices,
        metadata: response.data.metadata
      };
    } else {
      // Fallback for different response formats
      return {
        success: true,
        analysis: response.data.analysis || response.data.content || JSON.stringify(response.data),
        choices: response.data.choices,
        metadata: response.data.metadata
      };
    }
  } catch (error) {
    console.error('Analysis test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed'
    };
  }
};

// GRC endpoints
export const getGrcMetadata = async (): Promise<any> => {
  const response = await api.get('/api/grc/metadata');
  return response.data;
};

export const previewTier3Import = async (csvText: string): Promise<any> => {
  const response = await api.post('/api/grc/import/tier3-catalogue/preview', { csvText });
  return response.data;
};

export const importTier3Catalogue = async (csvText: string): Promise<{ rows: any[] }> => {
  const response = await api.post('/api/grc/import/tier3-catalogue', { csvText });
  return {
    rows: response.data?.rows || []
  };
};

export const previewControlSetImport = async (payload: {
  name: string;
  format: 'csv' | 'xlsx';
  csvText?: string;
  xlsxBase64?: string;
}): Promise<any> => {
  const response = await api.post('/api/grc/import/control-set/preview', payload);
  return response.data;
};

export const importControlSet = async (payload: {
  name: string;
  version?: string;
  format: 'csv' | 'xlsx';
  csvText?: string;
  xlsxBase64?: string;
  scopeType?: 'system' | 'diagram' | 'assessment' | 'asset_group';
  scopeId?: string;
}): Promise<any> => {
  const response = await api.post('/api/grc/import/control-set', payload);
  return response.data;
};

export const importControlSetXlsx = async (
  name: string,
  xlsxBase64: string,
  version?: string,
  scopeType?: 'system' | 'diagram' | 'assessment' | 'asset_group',
  scopeId?: string
): Promise<any> => {
  const response = await api.post('/api/grc/import/control-set', {
    name,
    version,
    format: 'xlsx',
    xlsxBase64,
    scopeType,
    scopeId
  });
  return response.data;
};

// Built-in framework catalog
export interface FrameworkCatalogEntry {
  frameworkKey: string;
  name: string;
  version: string;
  releaseDate: string;
  releaseDateLabel: string;
  description: string;
  controlCount: number;
  sourceOrg: string;
  category: 'compliance' | 'threat' | 'government';
  supportsSelectiveLoad: boolean;
  hasBaseControlsOnlyOption: boolean;
  baseControlCount?: number;
  dataFileAvailable: boolean;
}

export const fetchFrameworkCatalog = async (): Promise<FrameworkCatalogEntry[]> => {
  const response = await api.get('/api/grc/frameworks/catalog');
  return response.data?.catalog || [];
};

export const loadBuiltInFramework = async (payload: {
  frameworkKey: string;
  selectedFamilies?: string[];
  baseControlsOnly?: boolean;
  scopeType?: string;
  scopeId?: string;
}): Promise<any> => {
  const response = await api.post('/api/grc/frameworks/load', payload);
  return response.data;
};

// Export the configured API instance
export { api as default };
