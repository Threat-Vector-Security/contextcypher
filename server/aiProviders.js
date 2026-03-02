// server/aiProviders.js
let OpenAI = null;
let Anthropic = null;
let GoogleGenerativeAI = null;

try {
  OpenAI = require('openai');
} catch (error) {
  console.warn('[aiProviders] OpenAI SDK not available at startup:', error.message);
}

try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (error) {
  console.warn('[aiProviders] Anthropic SDK not available at startup:', error.message);
}

try {
  ({ GoogleGenerativeAI } = require('@google/generative-ai'));
} catch (error) {
  console.warn('[aiProviders] Gemini SDK not available at startup:', error.message);
}

const AbortController = global.AbortController || (() => {
  try {
    return require('abort-controller').AbortController;
  } catch (error) {
    console.warn('[aiProviders] abort-controller package not available; using runtime AbortController only');
    return null;
  }
})();
const PROVIDER_TIMEOUT = 600000; // 10 minutes — diagram generation with large systems can take several minutes
const axios = require('axios');
const logger = require('./utils/logger-wrapper'); // Fixed logger import path
const modelCapabilities = require('./utils/modelCapabilities');
const webSearchConfig = require('./config/webSearchConfig');

// Safe console wrapper to prevent EPIPE errors
const safeConsole = {
  log: (...args) => {
    try {
      console.log(...args);
    } catch (e) {
      // Ignore console errors - EPIPE, broken pipe, etc.
    }
  },
  warn: (...args) => {
    try {
      console.warn(...args);
    } catch (e) {
      // Ignore console errors
    }
  },
  error: (...args) => {
    try {
      console.error(...args);
    } catch (e) {
      // Ignore console errors  
    }
  },
  debug: (...args) => {
    try {
      console.debug(...args);
    } catch (e) {
      // Ignore console errors
    }
  }
};

class AIProviderManager {
  constructor(systemPrompt) {
    this.providers = {};
    this.currentProvider = null;
    this.systemPrompt = systemPrompt;
    this.localLLMConfig = null; // Initialize local LLM config
    this.providerConfigs = {}; // Store configs for all providers
    this.modelConfigs = {}; // Store model names for each provider
    
    this.tokenLimits = {
      gemini: {
        maxInput: 30720,
        maxOutput: 8192  // Most Gemini models support 8k output
      },
      openai: {
        maxInput: 128000,
        maxOutput: 16384  // GPT-4o supports 16k output
      },
      anthropic: {
        maxInput: 200000,
        maxOutput: 8192  // Claude 3.5 Sonnet: 8192, Claude 4: 8192
      },
      // Local provider (Ollama) – default assumes large community window; will be
      // overridden after we discover the real contextWindow via /model-info
      local: {
        maxInput: 131072,   // Default to 128k context for modern local models
        maxOutput: 131072   // Allow full context for output, will be updated based on user config
      }
    };
    
    // Note: Default provider initialization will be handled explicitly by the server
  }

  async initializeDefaultProvider() {
    // Default to local LLM for offline-first approach
    safeConsole.log('Initializing default local LLM provider...');
    
    try {
      // Initialize local LLM with default configuration
      // Don't skip the test - we want to fetch the context window if Ollama is available
      await this.initializeProvider('local', {
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.1:8b',
        temperature: 0.2,
        maxTokens: 4096
      }, false); // Don't skip test - fetch context window
      safeConsole.log('Default local LLM provider initialized successfully');
    } catch (error) {
      safeConsole.log('Local LLM not available on startup, will retry when requested:', error.message);
      // Still initialize the provider but mark it as not tested
      // This allows the app to work once Ollama is started
      try {
        await this.initializeProvider('local', {
          baseUrl: 'http://127.0.0.1:11434',
          model: 'llama3.1:8b',
          temperature: 0.2,
          maxTokens: 4096
        }, true); // Skip test for configuration only
      } catch (configError) {
        safeConsole.log('Failed to configure local LLM:', configError.message);
      }
    }
  }

  async initializeProvider(type, config, skipTest = false) {
    safeConsole.log('Initializing provider:', {
      type,
      hasApiKey: type !== 'local' ? !!config.apiKey : 'N/A',
      hasOrgId: !!config.organizationId,
      hasProjectId: !!config.projectId,
      hasBaseUrl: !!config.baseUrl,
      hasModel: !!config.model,
      skipTest
    });

    // Extract configuration values
    const baseUrl = config.baseUrl;
    const model = config.model;

    // Only non-local providers need API keys
    if (type !== 'local' && !config.apiKey) {
        throw new Error(`No API key provided for ${type}`);
    }

    if (type === 'local' && !baseUrl) {
        throw new Error('Base URL is required for local LLM');
    }

    // Clean up existing provider if switching
    if (this.currentProvider && this.currentProvider !== type) {
        safeConsole.log(`Cleaning up previous provider: ${this.currentProvider}`);
        this.providers[this.currentProvider] = null;
    }

    try {
        switch (type) {
            case 'openai':
                if (!OpenAI) {
                    throw new Error('OpenAI SDK is not installed in the runtime environment');
                }
                const openai = new OpenAI({
                    apiKey: config.apiKey,
                    maxRetries: 3,
                    timeout: PROVIDER_TIMEOUT,
                    organization: config.organizationId || undefined
                });
                this.providers.openai = openai;
                break;

            case 'anthropic':
                if (!Anthropic) {
                    throw new Error('Anthropic SDK is not installed in the runtime environment');
                }
                this.providers.anthropic = new Anthropic({
                    apiKey: config.apiKey
                });
                break;

            case 'gemini':
                if (!GoogleGenerativeAI) {
                    throw new Error('Google Generative AI SDK is not installed in the runtime environment');
                }
                this.providers.gemini = new GoogleGenerativeAI(config.apiKey);
                break;

            case 'local':
                // For Ollama, we don't use the OpenAI SDK
                // We'll store the config and use direct HTTP calls
                safeConsole.log(`Local LLM (Ollama) baseURL: ${baseUrl}`);
                
                // Auto-detect WSL and provide helpful message
                if (process.platform === 'linux' && process.env.WSL_DISTRO_NAME) {
                    safeConsole.log('⚠️  Running in WSL - make sure Ollama is configured to accept external connections');
                    safeConsole.log('   See OLLAMA_SETUP.md for instructions');
                }
                
                // Store configuration but don't create OpenAI instance
                this.providers.local = {
                    type: 'ollama',
                    baseURL: baseUrl.replace(/\/$/, ''), // Remove trailing slash
                    isOllama: true
                };
                
                // Store local LLM configuration
                this.localLLMConfig = {
                    baseUrl: baseUrl,
                    model: model || 'llama3.1:8b',
                    temperature: config.temperature || 0.2,
                    // `contextWindow` is the real capacity discovered from Ollama
                    // Default to 131072 (128k) for modern local models, will be updated after detection
                    contextWindow: config.contextWindow || 131072,
                    // `maxTokens` remains as an OUTPUT limit; default to 4096 unless user sets
                    maxTokens: config.maxTokens || 4096,
                    // GPU configuration
                    gpuMemoryFraction: config.gpuMemoryFraction || 0.9,
                    numThreads: config.numThreads || 0,
                    batchSize: config.batchSize || 512,
                    // Advanced GPU settings
                    gpuOverhead: config.gpuOverhead || 1024,
                    numParallel: config.numParallel || 1,
                    maxLoadedModels: config.maxLoadedModels || 1,
                    keepAlive: config.keepAlive || '5m',
                    gpuLayers: config.gpuLayers ?? -1,
                    selectedGPU: config.selectedGPU || 'auto'
                };

                // Update runtime token limits to use the actual model capabilities
                if (this.localLLMConfig.contextWindow) {
                  this.tokenLimits.local.maxInput = this.localLLMConfig.contextWindow;
                }
                // Update output limit to match user's configured maxTokens
                if (this.localLLMConfig.maxTokens) {
                  this.tokenLimits.local.maxOutput = this.localLLMConfig.maxTokens;
                }
                
                safeConsole.log('Local LLM config updated:', {
                    receivedModel: model,
                    storedModel: this.localLLMConfig.model,
                    baseUrl: this.localLLMConfig.baseUrl
                });
                break;

            default:
                throw new Error(`Unsupported provider: ${type}`);
        }

        // Test the new provider unless skipTest is true
        if (!skipTest) {
            await this.testProvider(type);
        } else {
            safeConsole.log(`Skipping test for ${type} provider as requested`);
        }

        this.providerConfigs[type] = config; // Store the full config
        
        // Store model configuration for non-local providers
        if (type !== 'local' && config.model) {
            this.modelConfigs[type] = config.model;
            safeConsole.log(`${type} provider model set to: ${config.model}`);
        }

        // Dynamically fetch context window for supported providers
        try {
          if (!skipTest) {
            await this.updateProviderContextWindow(type, config);
          }
        } catch (e) {
          safeConsole.warn('Context window detection failed:', e.message);
        }

        this.currentProvider = type;
        safeConsole.log(`${type} provider initialized and set as current.`);

        return true;
    } catch (error) {
        safeConsole.error(`Failed to initialize provider ${type}:`, error);
        throw new Error(`Failed to initialize ${type}: ${error.message}`);
    }
  }

  /**
   * Detect and update the maxInput token limit for remote providers
   */
  async updateProviderContextWindow(type, config) {
    const modelName = config.model;
    if (!modelName) return;

    switch (type) {
      case 'gemini': {
        try {
          // REST API expects the full model name with 'models/' prefix
          const apiModelName = modelName.startsWith('models/') ? modelName : `models/${modelName}`;
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/${encodeURIComponent(apiModelName)}?key=${config.apiKey}`;
          const { data } = await axios.get(endpoint, { timeout: 10000 });
          const limit =
            data.inputTokenLimit ||
            data.contextWindowTokenCount ||
            data.contextWindowTokens ||
            data.contextWindow ||
            data.maxInputTokens ||
            null;
          if (limit) {
            this.tokenLimits.gemini.maxInput = Number(limit);
            safeConsole.log(`Gemini context window detected: ${limit} tokens`);
          }
        } catch (err) {
          safeConsole.warn('Failed to retrieve Gemini model info:', err.response?.data || err.message);
        }
        
        // Always set output limit from fallback
        const outputLimit = modelCapabilities.getFallbackOutputLimit(modelName);
        if (outputLimit) {
          this.tokenLimits.gemini.maxOutput = outputLimit;
          safeConsole.log(`Gemini output limit set to ${outputLimit} tokens for ${modelName}`);
        }
        break;
      }

      case 'openai': {
        try {
          const { data } = await axios.get(`https://api.openai.com/v1/models/${modelName}`, {
            headers: { Authorization: `Bearer ${config.apiKey}` },
            timeout: 10000
          });
          const limit = data.context_window || data.contextWindow || null;
          if (limit) {
            this.tokenLimits.openai.maxInput = Number(limit);
            safeConsole.log(`OpenAI context window detected: ${limit} tokens`);
          } else {
            // Use fallback for models not yet in API
            const fallbackLimit = modelCapabilities.getFallbackContextWindow(modelName);
            if (fallbackLimit) {
              this.tokenLimits.openai.maxInput = fallbackLimit;
              safeConsole.log(`OpenAI using fallback context window for ${modelName}: ${fallbackLimit} tokens`);
            }
          }
        } catch (err) {
          safeConsole.warn('Failed to retrieve OpenAI model info:', err.response?.data || err.message);
          // Try fallback on error
          const fallbackLimit = modelCapabilities.getFallbackContextWindow(modelName);
          if (fallbackLimit) {
            this.tokenLimits.openai.maxInput = fallbackLimit;
            safeConsole.log(`OpenAI using fallback context window for ${modelName}: ${fallbackLimit} tokens`);
          }
        }
        
        // Always set output limit from fallback (OpenAI API doesn't provide this)
        const outputLimit = modelCapabilities.getFallbackOutputLimit(modelName);
        if (outputLimit) {
          this.tokenLimits.openai.maxOutput = outputLimit;
          safeConsole.log(`OpenAI output limit set to ${outputLimit} tokens for ${modelName}`);
        }
        break;
      }

      case 'anthropic': {
        try {
          const { data } = await axios.get('https://api.anthropic.com/v1/models', {
            headers: { Authorization: `Bearer ${config.apiKey}` },
            timeout: 10000
          });
          if (Array.isArray(data?.data)) {
            const match = data.data.find(m => m.id === modelName || m.name === modelName);
            if (match && match.context_window) {
              this.tokenLimits.anthropic.maxInput = Number(match.context_window);
              safeConsole.log(`Anthropic context window detected: ${match.context_window} tokens`);
            }
          }
        } catch (err) {
          safeConsole.warn('Failed to retrieve Anthropic model info:', err.response?.data || err.message);
          // Use fallback for context window
          const fallbackLimit = modelCapabilities.getFallbackContextWindow(modelName);
          if (fallbackLimit) {
            this.tokenLimits.anthropic.maxInput = fallbackLimit;
            safeConsole.log(`Anthropic using fallback context window for ${modelName}: ${fallbackLimit} tokens`);
          }
        }
        
        // Always set output limit from fallback (Anthropic API doesn't provide this)
        const outputLimit = modelCapabilities.getFallbackOutputLimit(modelName);
        if (outputLimit) {
          this.tokenLimits.anthropic.maxOutput = outputLimit;
          safeConsole.log(`Anthropic output limit set to ${outputLimit} tokens for ${modelName}`);
        }
        break;
      }
      // Anthropic endpoint currently doesn’t expose context window per model.
      default:
        break;
    }
  }

  /**
   * Switch to a provider that has already been initialized
   * @param {string} type - The provider type to switch to (openai, anthropic, gemini)
   * @returns {Promise<boolean>} - True if successful
   */
  async switchProvider(type) {
    safeConsole.log(`Switching to provider: ${type}`);
    
    if (!['openai', 'anthropic', 'gemini', 'local'].includes(type)) {
      throw new Error(`Unsupported provider: ${type}`);
    }
    
    // Check if the provider is already initialized
    if (!this.providers[type]) {
      throw new Error(`Provider ${type} not initialized. Please initialize it first.`);
    }
    
    // Set the current provider
    this.currentProvider = type;
    safeConsole.log(`Successfully switched to provider: ${type}`);
    return true;
  }
  
  isProviderInitialized(type) {
    return !!this.providers[type];
  }

  async testProvider(type) {
    try {
      if (!this.providers[type]) {
        throw new Error(`Provider ${type} not initialized`);
      }

      logger.info(`Testing provider: ${type}`);
      
      // Make actual API calls to test both authentication and usage availability
      switch (type) {
        case 'openai':
          try {
            // Test with a minimal completion request to verify both auth and quota
            const response = await this.providers.openai.chat.completions.create({
              model: this.modelConfigs.openai || 'gpt-4o-2024-08-06',
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 1, // Minimal usage to test quota
              stream: false
            });
            
            if (!response.choices || response.choices.length === 0) {
              throw new Error('Invalid response from OpenAI API');
            }
            
            logger.info('OpenAI API test successful');
            return { success: true, message: 'OpenAI API key is valid and has usage available' };
            
          } catch (error) {
            logger.error('OpenAI test failed:', error);
            
            // Parse specific OpenAI errors based on status codes and error messages
            if (error.status === 401) {
              throw new Error('Invalid OpenAI API key - please check your key');
            } else if (error.status === 429) {
              if (error.message?.includes('quota') || error.message?.includes('billing')) {
                throw new Error('OpenAI API quota exceeded - please check your billing and usage limits');
              } else {
                throw new Error('OpenAI API rate limit exceeded - please wait a moment and try again');
              }
            } else if (error.status === 400) {
              // Parse the error body for more specific error types
              const errorBody = error.message || '';
              
              if (errorBody.includes('context_length_exceeded') || errorBody.includes('exceed context limit')) {
                const match = errorBody.match(/(\d+)\s*\+\s*(\d+)\s*>\s*(\d+)/);
                if (match) {
                  const inputTokens = match[1];
                  const maxTokens = match[2];
                  const limit = match[3];
                  throw new Error(`OpenAI context limit exceeded: ${inputTokens} input + ${maxTokens} max output > ${limit} model limit. Reduce diagram complexity or max tokens.`);
                } else {
                  throw new Error('OpenAI context limit exceeded - reduce input size or max tokens');
                }
              } else if (errorBody.includes('model')) {
                // Check if it's a reasoning model that requires tier 5
                const reasoningModels = ['o1', 'o1-preview', 'o1-mini', 'gpt-5'];
                const isReasoningModel = reasoningModels.some(model => 
                  this.modelConfigs.openai?.toLowerCase().includes(model)
                );
                
                if (isReasoningModel) {
                  throw new Error(`OpenAI model "${this.modelConfigs.openai}" requires Tier 5 access ($1,000+ spent and 30+ days). Current tier insufficient. Visit platform.openai.com/account/limits to check your tier.`);
                } else {
                  throw new Error(`OpenAI model "${this.modelConfigs.openai}" not available - please check your model access`);
                }
              } else {
                throw new Error(`OpenAI request error: ${errorBody}`);
              }
            } else if (error.code === 'insufficient_quota') {
              throw new Error('OpenAI API quota exhausted - please add credits to your account');
            } else if (error.status === 403) {
              throw new Error('OpenAI API access forbidden - check your organization settings');
            } else if (error.status === 500) {
              throw new Error('OpenAI server error - please try again later');
            } else if (error.status === 503) {
              throw new Error('OpenAI service temporarily unavailable - please try again later');
            } else {
              throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
            }
          }

        case 'anthropic':
          try {
            // Test with a minimal message request
            const testParams = {
              model: this.modelConfigs.anthropic || 'claude-sonnet-4-20250514',
              max_tokens: 1, // Minimal usage to test quota
              messages: [{ role: 'user', content: 'Hi' }]
            };
            
            // Add beta header if needed
            const headers = {};
            if (modelCapabilities.getModelCapabilities(testParams.model).requiresBetaHeader) {
              headers['anthropic-beta'] = 'max-tokens-3-5-sonnet-2024-07-15';
            }
            
            const response = await this.providers.anthropic.messages.create(testParams, {
              headers: headers
            });
            
            if (!response.content || response.content.length === 0) {
              throw new Error('Invalid response from Anthropic API');
            }
            
            logger.info('Anthropic API test successful');
            return { success: true, message: 'Anthropic API key is valid and has usage available' };
            
          } catch (error) {
            logger.error('Anthropic test failed:', error);
            
            // Parse specific Anthropic errors based on their documentation
            // https://docs.anthropic.com/en/api/errors
            const errorBody = error.message || '';
            const errorType = error.error?.type || error.type;
            
            if (error.status === 401 || errorType === 'authentication_error') {
              throw new Error('Invalid Anthropic API key - please check your key');
            } else if (error.status === 403 || errorType === 'permission_error') {
              throw new Error('Anthropic API access denied - check your account permissions or feature access');
            } else if (error.status === 404 || errorType === 'not_found_error') {
              throw new Error(`Anthropic model "${this.modelConfigs.anthropic}" not found - please check model availability`);
            } else if (error.status === 413 || errorType === 'request_too_large') {
              throw new Error('Anthropic request too large - reduce input size');
            } else if (error.status === 429 || errorType === 'rate_limit_error') {
              // Check for specific rate limit types
              if (errorBody.includes('daily') || errorBody.includes('per-day')) {
                throw new Error('Anthropic daily rate limit exceeded - wait until tomorrow or upgrade your plan');
              } else if (errorBody.includes('tokens')) {
                throw new Error('Anthropic token rate limit exceeded - wait a few minutes before retrying');
              } else {
                throw new Error('Anthropic API rate limit exceeded - please wait before retrying');
              }
            } else if (error.status === 500 || errorType === 'api_error') {
              throw new Error('Anthropic API server error - please try again later');
            } else if (error.status === 529 || errorType === 'overloaded_error') {
              throw new Error('Anthropic API is temporarily overloaded - please try again in a few minutes');
            } else if (error.status === 400) {
              // Parse specific 400 errors
              if (errorType === 'invalid_request_error') {
                if (errorBody.includes('credit') || errorBody.includes('balance')) {
                  throw new Error('Anthropic API credit balance too low - please add credits to your account');
                } else if (errorBody.includes('context') || errorBody.includes('token')) {
                  const match = errorBody.match(/(\d+)\s*tokens?/);
                  if (match) {
                    throw new Error(`Anthropic context limit exceeded (${match[1]} tokens) - reduce input size`);
                  } else {
                    throw new Error('Anthropic token limit exceeded - reduce input size');
                  }
                } else if (errorBody.includes('model')) {
                  throw new Error(`Anthropic model "${this.modelConfigs.anthropic}" not available - check your model access`);
                } else {
                  throw new Error(`Anthropic request error: ${errorBody}`);
                }
              } else {
                throw new Error(`Anthropic invalid request: ${errorBody}`);
              }
            } else {
              throw new Error(`Anthropic API error: ${errorBody}`);
            }
          }

        case 'gemini':
          try {
            // Test with a minimal generation request
            const modelName = this.modelConfigs.gemini || 'gemini-2.5-pro';
            logger.info(`Testing Gemini with model: ${modelName}`);
            
            // Use model name without prefix for the SDK
            const validModelName = modelName.startsWith('models/') ? modelName.replace('models/', '') : modelName;
            
            const model = this.providers.gemini.getGenerativeModel({ 
              model: validModelName 
            });
            
            const result = await model.generateContent({
              contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
              generationConfig: {
                maxOutputTokens: 1, // Minimal usage to test quota
                temperature: 0.2
              }
            });
            
            if (!result.response) {
              throw new Error('Invalid response from Gemini API');
            }
            
            logger.info('Gemini API test successful');
            return { success: true, message: 'Gemini API key is valid and has usage available' };
            
          } catch (error) {
            logger.error('Gemini test failed:', error);
            logger.error('Gemini error details:', {
              message: error.message,
              code: error.code,
              status: error.status,
              statusText: error.statusText,
              details: error.details || error.response?.data,
              errorName: error.name,
              stack: error.stack
            });
            
            // Parse specific Gemini errors based on their documentation
            // https://ai.google.dev/gemini-api/docs/troubleshooting
            const errorBody = error.message || '';
            const errorCode = error.code || error.status;
            
            // Check for specific error codes and messages
            if (errorCode === 403 || errorBody.includes('API_KEY_INVALID') || errorBody.includes('invalid api key')) {
              throw new Error('Invalid Google Gemini API key - please check your key at makersuite.google.com');
            } else if (errorCode === 403 && errorBody.includes('PERMISSION_DENIED')) {
              throw new Error('Gemini API access denied - enable the Generative Language API in Google Cloud Console');
            } else if (errorCode === 404 || errorBody.includes('MODEL_NOT_FOUND') || errorBody.includes('models/.*not found')) {
              throw new Error(`Gemini model "${this.modelConfigs.gemini}" not found - use a valid model like gemini-2.5-pro or gemini-1.5-pro`);
            } else if (errorCode === 429 || errorBody.includes('RATE_LIMIT_EXCEEDED') || errorBody.includes('Resource has been exhausted')) {
              // Parse specific rate limit types
              if (errorBody.includes('per minute')) {
                throw new Error('Gemini per-minute rate limit exceeded - wait 60 seconds before retrying');
              } else if (errorBody.includes('daily')) {
                throw new Error('Gemini daily quota exceeded - wait until tomorrow or upgrade to a paid plan');
              } else if (errorBody.includes('requests per minute')) {
                const match = errorBody.match(/(\d+)\s*requests?\s*per\s*minute/i);
                if (match) {
                  throw new Error(`Gemini rate limit exceeded (${match[1]} requests/minute) - slow down your requests`);
                } else {
                  throw new Error('Gemini API rate limit exceeded - please wait before retrying');
                }
              } else {
                throw new Error('Gemini API rate limit exceeded - please wait a moment and try again');
              }
            } else if (errorCode === 400) {
              // Parse specific 400 errors
              if (errorBody.includes('INVALID_ARGUMENT')) {
                if (errorBody.includes('token') || errorBody.includes('context')) {
                  const tokenMatch = errorBody.match(/(\d+)\s*tokens?/);
                  if (tokenMatch) {
                    throw new Error(`Gemini token limit exceeded (${tokenMatch[1]} tokens) - reduce input size`);
                  } else {
                    throw new Error('Gemini context length exceeded - reduce the size of your input');
                  }
                } else if (errorBody.includes('temperature')) {
                  throw new Error('Gemini invalid temperature value - must be between 0.0 and 1.0');
                } else if (errorBody.includes('maxOutputTokens')) {
                  throw new Error('Gemini invalid max tokens value - check model limits');
                } else {
                  throw new Error(`Gemini invalid request: ${errorBody}`);
                }
              } else if (errorBody.includes('QUOTA_EXCEEDED') || errorBody.includes('quota')) {
                throw new Error('Gemini API quota exceeded - check your Google Cloud billing and quotas');
              } else {
                throw new Error(`Gemini request error: ${errorBody}`);
              }
            } else if (errorCode === 500 || error.status === 500 || errorBody.includes('INTERNAL')) {
              logger.error('Gemini 500 error - full details:', error);
              // Expose the actual error details instead of generic message
              const errorMessage = error.message || errorBody || 'Unknown server error';
              throw new Error(`Gemini API error (${errorCode || error.status || 500}): ${errorMessage}`);
            } else if (errorCode === 503 || error.status === 503 || errorBody.includes('UNAVAILABLE')) {
              throw new Error('Gemini API temporarily unavailable - please try again in a few minutes');
            } else if (errorBody.includes('billing')) {
              throw new Error('Gemini API billing not configured - set up billing in Google Cloud Console');
            } else {
              throw new Error(`Gemini API error: ${errorBody}`);
            }
          }

        case 'local':
          try {
            // Test Ollama connection and model availability
            const baseUrl = this.providers.local.baseURL;
            logger.info(`Testing Ollama connection at: ${baseUrl}`);
            
            // First check if Ollama is running
            logger.info(`Fetching Ollama models from: ${baseUrl}/api/tags`);
            const tagsResponse = await fetch(`${baseUrl}/api/tags`);
            logger.info(`Ollama tags response status: ${tagsResponse.status}`);
            
            if (!tagsResponse.ok) {
              const errorText = await tagsResponse.text().catch(() => 'No error details');
              logger.error(`Ollama connection failed: ${tagsResponse.status} - ${errorText}`);
              throw new Error('Cannot connect to Ollama server - please ensure Ollama is running');
            }
            
            const tags = await tagsResponse.json();
            const modelName = this.localLLMConfig?.model;
            
            // Check if the specified model is available
            const modelExists = tags.models?.some(model => 
              model.name === modelName || 
              model.name.startsWith(modelName.split(':')[0])
            );
            
            if (!modelExists) {
              throw new Error(`Model "${modelName}" not found in Ollama. Available models: ${tags.models?.map(m => m.name).join(', ') || 'none'}`);
            }
            
            // Test actual generation with minimal request
            const testResponse = await fetch(`${baseUrl}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: modelName,
                prompt: 'Hi',
                stream: false,
                options: {
                  num_predict: 1, // Minimal generation to test functionality
                  temperature: 0.2
                }
              })
            });
            
            if (!testResponse.ok) {
              const errorText = await testResponse.text();
              throw new Error(`Ollama generation failed: ${errorText}`);
            }
            
            const testResult = await testResponse.json();
            
            // Log the actual response format for debugging
            logger.info('Ollama test response format:', {
              hasResponse: !!testResult.response,
              hasText: !!testResult.text,
              hasContent: !!testResult.content,
              keys: Object.keys(testResult),
              responsePreview: testResult.response ? testResult.response.substring(0, 50) : 'N/A'
            });
            
            // Check for various possible response fields
            const responseText = testResult.response || testResult.text || testResult.content;
            if (!responseText && !testResult.done) {
              logger.error('Unexpected Ollama response format:', testResult);
              throw new Error('Invalid response from Ollama model - no recognized response field');
            }
            
            logger.info('Local LLM test successful');
            
            // After successful test, fetch model info to get actual context window and GPU status
            try {
              const modelInfoResponse = await fetch(`${baseUrl}/api/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
              });
              
              if (modelInfoResponse.ok) {
                const modelInfo = await modelInfoResponse.json();
                logger.info('Ollama model info retrieved:', {
                  model: modelName,
                  parameters: modelInfo.parameters ? Object.keys(modelInfo.parameters) : [],
                  modelfile: modelInfo.modelfile ? modelInfo.modelfile.substring(0, 200) : 'N/A'
                });
                
                // Extract GPU information
                let gpuInfo = {
                  available: false,
                  inUse: false,
                  layersOnGPU: 0,
                  totalLayers: 0
                };
                
                // Check if GPU layers are specified in parameters or modelfile
                if (modelInfo.parameters) {
                  let detectedContextWindow = null;
                  let gpuLayers = null;
                  
                  // If parameters is a string (Ollama format), parse it
                  if (typeof modelInfo.parameters === 'string') {
                    logger.info(`Parsing Ollama parameters string for ${modelName}`);
                    const lines = modelInfo.parameters.split('\n');
                    for (const line of lines) {
                      const [key, value] = line.trim().split(/\s+/);
                      if (key === 'num_ctx') {
                        detectedContextWindow = parseInt(value);
                        logger.info(`Found num_ctx in parameters: ${detectedContextWindow}`);
                      } else if (key === 'num_gpu' || key === 'gpu_layers') {
                        gpuLayers = parseInt(value);
                      }
                    }
                  } else if (typeof modelInfo.parameters === 'object') {
                    // If it's already an object
                    logger.info(`Parameters is object for ${modelName}:`, modelInfo.parameters);
                    detectedContextWindow = modelInfo.parameters.num_ctx ? parseInt(modelInfo.parameters.num_ctx) : null;
                    if (detectedContextWindow) {
                      logger.info(`Found num_ctx in parameters object: ${detectedContextWindow}`);
                    }
                    gpuLayers = modelInfo.parameters.num_gpu || modelInfo.parameters.gpu_layers;
                    if (gpuLayers) gpuLayers = parseInt(gpuLayers);
                  } else if (Array.isArray(modelInfo.parameters) && modelName.includes('gpt-oss')) {
                    // Special handling for gpt-oss models which return parameters as an array
                    logger.info('GPT-OSS model detected with array parameters, using known context window');
                    detectedContextWindow = 32768; // Known context window for gpt-oss models
                  }
                  
                  // If still no context window detected, check modelfile
                  if (!detectedContextWindow && modelInfo.modelfile) {
                    const modelfileMatch = modelInfo.modelfile.match(/num_ctx\s+(\d+)/i);
                    if (modelfileMatch) {
                      detectedContextWindow = parseInt(modelfileMatch[1]);
                      logger.info(`Context window found in modelfile: ${detectedContextWindow}`);
                    }
                  }
                  
                  // Check modelfile for GPU layers if not found in parameters
                  if (gpuLayers === null && modelInfo.modelfile) {
                    const gpuMatch = modelInfo.modelfile.match(/(?:num_gpu|gpu_layers)\s+(\d+)/i);
                    if (gpuMatch) {
                      gpuLayers = parseInt(gpuMatch[1]);
                      logger.info(`GPU layers found in modelfile: ${gpuLayers}`);
                    }
                  }
                  
                  // Update GPU info
                  if (gpuLayers !== null && gpuLayers > 0) {
                    gpuInfo.available = true;
                    gpuInfo.inUse = true;
                    gpuInfo.layersOnGPU = gpuLayers;
                  }
                  
                  // Try to detect total layers from model architecture
                  if (modelInfo.modelfile) {
                    // Common patterns for layer count in model names
                    const layerPatterns = [
                      /(\d+)b/i,  // e.g., "7b" model might have ~32 layers
                      /layers?[:\s]*(\d+)/i,
                      /n_layers?[:\s]*(\d+)/i
                    ];
                    
                    // Approximate layer counts for common model sizes
                    const modelSizeToLayers = {
                      '3b': 26,
                      '7b': 32,
                      '8b': 32,
                      '13b': 40,
                      '30b': 60,
                      '70b': 80,
                      '180b': 100
                    };
                    
                    // Try to match model size
                    const sizeMatch = modelName.toLowerCase().match(/(\d+)b/);
                    if (sizeMatch) {
                      const size = sizeMatch[0];
                      gpuInfo.totalLayers = modelSizeToLayers[size] || 0;
                    }
                  }
                  
                  // Final fallback for known models
                  if (!detectedContextWindow) {
                    const modelConstants = require('./utils/modelConstants');
                    const modelConstInfo = modelConstants.getModelInfo(modelName);
                    if (modelConstInfo && modelConstInfo.maxTokens > 8192) {
                      detectedContextWindow = modelConstInfo.maxTokens;
                      logger.info(`Using known context window for ${modelName}: ${detectedContextWindow} tokens (from modelConstants)`);
                    } else {
                      logger.info(`No context window found for ${modelName}, will use default: ${modelConstInfo?.maxTokens || 131072} tokens`);
                    }
                  }
                  
                  if (detectedContextWindow) {
                    logger.info(`Model supports context window of ${detectedContextWindow} tokens`);

                    // Update the local LLM config with detected context window and GPU info
                    if (this.localLLMConfig) {
                      this.localLLMConfig.contextWindow = detectedContextWindow;
                      this.localLLMConfig.gpuInfo = gpuInfo;
                      // Also update token limits
                      this.tokenLimits.local.maxInput = detectedContextWindow;
                      logger.info('Updated configuration:', {
                        contextWindow: detectedContextWindow,
                        maxInput: this.tokenLimits.local.maxInput,
                        gpuInfo: gpuInfo
                      });
                    }
                  } else {
                    // If no context window detected, use the configured value or model constants fallback
                    logger.warn(`No context window detected for ${modelName} from Ollama API`);
                    if (this.localLLMConfig && this.localLLMConfig.contextWindow) {
                      logger.info(`Using user-configured context window: ${this.localLLMConfig.contextWindow} tokens`);
                      this.tokenLimits.local.maxInput = this.localLLMConfig.contextWindow;
                    } else {
                      logger.info(`Using default/fallback context window: ${this.tokenLimits.local.maxInput} tokens`);
                    }
                  }
                }
                
                // Check system GPU availability
                try {
                  // Try to get GPU info from Ollama ps endpoint
                  const psResponse = await fetch(`${baseUrl}/api/ps`);
                  if (psResponse.ok) {
                    const psData = await psResponse.json();
                    logger.info('Ollama ps data:', psData);
                    
                    // Check if any models are using GPU
                    if (psData.models && Array.isArray(psData.models)) {
                      for (const model of psData.models) {
                        if (model.details && model.details.gpu_layers > 0) {
                          gpuInfo.available = true;
                          logger.info('GPU detected from running model:', model.name);
                          break;
                        }
                      }
                    }
                  }
                } catch (psError) {
                  logger.debug('Could not fetch Ollama ps data:', psError.message);
                }
                
                // Check Ollama version for GPU support if not already detected
                if (!gpuInfo.available) {
                  try {
                    const versionResponse = await fetch(`${baseUrl}/api/version`);
                    if (versionResponse.ok) {
                      const versionData = await versionResponse.json();
                      logger.info('Ollama version:', versionData);
                      
                      // Ollama with GPU support usually has version info
                      if (versionData.version) {
                        // Check if running on Windows/Linux (usually has GPU support)
                        const platform = require('os').platform();
                        if (platform === 'win32' || platform === 'linux') {
                          gpuInfo.available = true;
                          gpuInfo.detectedFromSystem = true;
                          logger.info('GPU likely available based on platform and Ollama version');
                        }
                      }
                    }
                  } catch (versionError) {
                    logger.debug('Could not check Ollama version:', versionError.message);
                  }
                }
                
                // Store GPU info
                if (this.localLLMConfig) {
                  this.localLLMConfig.gpuInfo = gpuInfo;
                }
              }
            } catch (infoError) {
              logger.warn('Could not fetch model info (non-critical):', infoError.message);
            }
            
            return { success: true, message: `Local LLM "${modelName}" is ready and responding` };
            
          } catch (error) {
            logger.error('Local LLM test failed:', error);
            logger.error('Error type:', error.constructor.name);
            logger.error('Error code:', error.code);
            
            // Parse specific Ollama errors
            if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
              throw new Error('Cannot connect to Ollama server at ' + this.providers.local?.baseURL + ' - please ensure Ollama is running with "ollama serve"');
            } else if (error.message?.includes('fetch failed')) {
              throw new Error('Network error connecting to Ollama - please check if Ollama is running on ' + this.providers.local?.baseURL);
            } else if (error.message?.includes('model') && error.message?.includes('not found')) {
              throw new Error(error.message); // Pass through the detailed model error
            } else {
              throw new Error(`Local LLM error: ${error.message || 'Unknown error'}`);
            }
          }

        default:
          throw new Error(`Unknown provider type: ${type}`);
      }
      
    } catch (error) {
      logger.error(`Provider test failed for ${type}:`, error);
      return { 
        success: false, 
        message: error.message || 'Provider test failed',
        errorType: this.categorizeError(error.message || error.toString())
      };
    }
  }

  // Helper method to categorize errors for better handling
  categorizeError(errorMessage) {
    const lowerMsg = errorMessage.toLowerCase();
    
    if (lowerMsg.includes('invalid') && (lowerMsg.includes('key') || lowerMsg.includes('token'))) {
      return 'INVALID_API_KEY';
    } else if (lowerMsg.includes('quota') || lowerMsg.includes('credit') || lowerMsg.includes('billing')) {
      return 'QUOTA_EXCEEDED';
    } else if (lowerMsg.includes('rate limit')) {
      return 'RATE_LIMITED';
    } else if (lowerMsg.includes('context limit') || lowerMsg.includes('context_length_exceeded') || lowerMsg.includes('max_tokens')) {
      return 'CONTEXT_LIMIT_EXCEEDED';
    } else if (lowerMsg.includes('model') && (lowerMsg.includes('not found') || lowerMsg.includes('not available'))) {
      return 'MODEL_NOT_FOUND';
    } else if (lowerMsg.includes('permission') || lowerMsg.includes('access denied') || lowerMsg.includes('forbidden')) {
      return 'PERMISSION_DENIED';
    } else if (lowerMsg.includes('connect') || lowerMsg.includes('network')) {
      return 'CONNECTION_ERROR';
    } else if (lowerMsg.includes('server error') || lowerMsg.includes('unavailable')) {
      return 'SERVER_ERROR';
    } else {
      return 'UNKNOWN_ERROR';
    }
  }


  async generateResponse(messages, options = {}) {
    try {
      const currentProvider = this.getCurrentProvider();
      if (!currentProvider) {
        throw new Error('No AI provider is configured');
      }

      if (!this.providers[currentProvider]) {
        throw new Error(`Provider ${currentProvider} not properly initialized`);
      }

      logger.info(`Generating response with provider: ${currentProvider}`);

      // Extract temperature, maxTokens, and timeout from options (passed from settings)
      // Use values from options if provided, otherwise fall back to localLLMConfig or defaults
      const { signal, timeout: requestTimeout, ...otherOptions } = options;
      const temperature = otherOptions.temperature !== undefined ? otherOptions.temperature : (this.localLLMConfig?.temperature || 0.2);
      const maxTokens = otherOptions.maxTokens !== undefined ? otherOptions.maxTokens : undefined;

      // Verbose request logging for threat analysis visibility
      try {
        logger.info('[AI] Request start', {
          provider: currentProvider,
          model: this.modelConfigs?.[currentProvider],
          messagesCount: Array.isArray(messages) ? messages.length : 'n/a',
          sysChars: Array.isArray(messages) ? (messages.find(m => m.role === 'system')?.content?.length || 0) : 0,
          usrChars: Array.isArray(messages) ? (messages.find(m => m.role === 'user')?.content?.length || 0) : 0,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens
        });
      } catch {}

      let result;
      switch (currentProvider) {
        case 'openai':
          try {
            const requestParams = {
              model: this.modelConfigs.openai || "gpt-4o-2024-08-06",
              messages: this.formatMessages(messages),
              temperature: temperature,
              max_tokens: maxTokens || this.tokenLimits.openai.maxOutput,
              stream: false
            };
            
            // Add reasoning parameter if model supports it and it's configured
            if (modelCapabilities.supportsReasoning(requestParams.model) && 
                this.providerConfigs.openai?.reasoningEffort) {
              requestParams.reasoning_effort = this.providerConfigs.openai.reasoningEffort;
              // o1 models don't support temperature parameter
              delete requestParams.temperature;
              logger.info(`Using reasoning effort: ${requestParams.reasoning_effort} for model: ${requestParams.model}`);
            }
            
            const createOptions = {};
            if (requestTimeout) {
              createOptions.timeout = requestTimeout;
            }
            const response = await this.providers.openai.chat.completions.create(requestParams, createOptions);

            if (!response.choices || response.choices.length === 0) {
              throw new Error('No response generated from OpenAI');
            }

            const content = response.choices[0].message?.content;
            if (!content) {
              throw new Error('Empty response from OpenAI');
            }

            result = {
              content,
              metadata: {
                provider: 'openai',
                model: this.modelConfigs.openai,
                tokenUsage: {
                  promptTokens: response.usage?.prompt_tokens,
                  completionTokens: response.usage?.completion_tokens,
                  totalTokens: response.usage?.total_tokens
                },
                timestamp: new Date().toISOString()
              }
            };
            
            return result;

          } catch (error) {
            logger.error('OpenAI generation error:', error);
            
            // Enhanced error handling for OpenAI
            if (error.status === 401) {
              throw new Error('QUOTA_ERROR: OpenAI API key is invalid or expired. Please check your API key in Settings.');
            } else if (error.status === 429) {
              if (error.message?.includes('quota') || error.message?.includes('billing')) {
                throw new Error('QUOTA_ERROR: OpenAI API quota exceeded. Please check your billing and add credits to your account.');
              } else {
                throw new Error('RATE_LIMIT_ERROR: OpenAI API rate limit exceeded. Please try again later.');
              }
            } else if (error.code === 'insufficient_quota') {
              throw new Error('QUOTA_ERROR: OpenAI API quota exhausted. Please add credits to your account.');
            } else if (error.status === 400 && error.message?.includes('model')) {
              // Check if it's a reasoning model that requires tier 5
              const reasoningModels = ['o1', 'o1-preview', 'o1-mini', 'gpt-5'];
              const isReasoningModel = reasoningModels.some(model => 
                this.modelConfigs.openai?.toLowerCase().includes(model)
              );
              
              if (isReasoningModel) {
                throw new Error(`MODEL_ERROR: OpenAI model "${this.modelConfigs.openai}" requires Tier 5 access. You need to spend $1,000+ and have 30+ days account age. Check your tier at platform.openai.com/account/limits`);
              } else {
                throw new Error(`MODEL_ERROR: OpenAI model "${this.modelConfigs.openai}" not available. Please check your model access.`);
              }
            } else {
              throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
            }
          }
          break;

        case 'anthropic':
          try {
            // Extract system message and user/assistant messages for Anthropic
            const formattedMessages = this.formatMessages(messages);
            const systemMessages = formattedMessages.filter(msg => msg.role === 'system');
            const conversationMessages = formattedMessages.filter(msg => msg.role !== 'system');
            
            // Combine all system messages into one
            const systemContent = systemMessages.map(msg => msg.content).join('\n\n');
            
            const requestParams = {
              model: this.modelConfigs.anthropic || "claude-sonnet-4-20250514",
              max_tokens: maxTokens || this.tokenLimits.anthropic.maxOutput,
              temperature: temperature,
              messages: conversationMessages
            };
            
            // Add system parameter if there are system messages
            if (systemContent) {
              requestParams.system = systemContent;
            }
            
            // Add web search configuration (for both threat analysis and chat)
            if (options.enableWebSearch) {
              // For chat web search, the config comes in a different format
              const maxSearches = options.webSearchConfig?.maxSearches || options.maxSearches || webSearchConfig.defaultMaxSearches || 5;
              let domainCategories = options.webSearchConfig?.domainCategories || [];
              
              // Get allowed domains based on categories
              let allowedDomains = [];
              if (domainCategories.length > 0) {
                // Get domains for selected categories
                domainCategories.forEach(category => {
                  if (webSearchConfig.allowedDomains[category]) {
                    allowedDomains = allowedDomains.concat(webSearchConfig.allowedDomains[category]);
                  }
                });
              } else if (webSearchConfig.getAllowedDomains) {
                // Fallback to all domains if no categories specified (threat analysis mode)
                allowedDomains = webSearchConfig.getAllowedDomains();
              } else {
                // Ultimate fallback
                allowedDomains = [];
              }
              
              // Only add web search tools if we have allowed domains
              if (allowedDomains.length > 0) {
                requestParams.tools = [{
                  type: "web_search_20250305",
                  name: "web_search",
                  max_uses: maxSearches,
                  allowed_domains: allowedDomains
                  // Don't include blocked_domains when using allowed_domains
                }];
              
                // Enable tool use
                requestParams.tool_choice = { type: "auto" };
                
                logger.info('Web search enabled for Anthropic', {
                  maxSearches: requestParams.tools[0].max_uses,
                  domainCount: requestParams.tools[0].allowed_domains.length,
                  categories: domainCategories,
                  source: options.webSearchConfig ? 'chat' : 'threat-analysis'
                });
              }
            }
            
            // Add beta header for Claude 3.5 Sonnet to enable 8192 output tokens
            const headers = {};
            if (modelCapabilities.getModelCapabilities(requestParams.model).requiresBetaHeader) {
              headers['anthropic-beta'] = 'max-tokens-3-5-sonnet-2024-07-15';
              logger.info(`Using beta header for ${requestParams.model} to enable 8192 output tokens`);
            }
            
            const response = await this.providers.anthropic.messages.create(requestParams, {
              headers: headers
            });

            if (!response.content || response.content.length === 0) {
              throw new Error('No response generated from Anthropic');
            }

            // Handle tool use (web search) in response
            let content = '';
            let webSearchCount = 0;
            let searchResults = [];
            
            // Process all content blocks, including tool use
            for (const block of response.content) {
              if (block.type === 'text') {
                content += block.text;
              } else if (block.type === 'tool_use' && block.name === 'web_search') {
                webSearchCount++;
                // Web search was performed, results are incorporated in the text
                logger.info(`Web search ${webSearchCount} performed by Anthropic`);
                if (block.input) {
                  searchResults.push({
                    query: block.input.query || 'Unknown query',
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }

            if (!content) {
              throw new Error('Empty response from Anthropic');
            }

            return {
              content,
              metadata: {
                provider: 'anthropic',
                model: this.modelConfigs.anthropic,
                tokenUsage: {
                  promptTokens: response.usage?.input_tokens,
                  completionTokens: response.usage?.output_tokens,
                  totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
                },
                webSearches: webSearchCount > 0 ? {
                  count: webSearchCount,
                  searches: searchResults
                } : undefined,
                timestamp: new Date().toISOString()
              }
            };

          } catch (error) {
            logger.error('Anthropic generation error:', error);
            
            // Enhanced error handling for Anthropic
            if (error.status === 401) {
              throw new Error('QUOTA_ERROR: Anthropic API key is invalid or expired. Please check your API key in Settings.');
            } else if (error.status === 429) {
              if (error.message?.includes('quota') || error.message?.includes('credit')) {
                throw new Error('QUOTA_ERROR: Anthropic API quota exceeded. Please check your usage limits and billing.');
              } else {
                throw new Error('RATE_LIMIT_ERROR: Anthropic API rate limit exceeded. Please try again later.');
              }
            } else if (error.type === 'authentication_error') {
              throw new Error('QUOTA_ERROR: Anthropic API authentication failed. Please check your API key in Settings.');
            } else if (error.type === 'permission_error') {
              throw new Error('QUOTA_ERROR: Anthropic API access denied. Please check your account permissions.');
            } else if (error.status === 400 && error.message?.includes('model')) {
              throw new Error(`MODEL_ERROR: Anthropic model "${this.modelConfigs.anthropic}" not available. Please check your model access.`);
            } else {
              throw new Error(`Anthropic API error: ${error.message || 'Unknown error'}`);
            }
          }

        case 'gemini':
          try {
            const modelName = this.modelConfigs.gemini || "gemini-2.5-pro";
            // Google Gemini SDK expects model names WITHOUT the 'models/' prefix
            const validModelName = modelName.startsWith('models/') ? modelName.replace('models/', '') : modelName;
            
            const model = this.providers.gemini.getGenerativeModel({
              model: validModelName
            });

            const geminiResult = await model.generateContent({
              contents: messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
              })),
              generationConfig: {
                stopSequences: ["Human:", "Assistant:"],
                maxOutputTokens: maxTokens || this.tokenLimits.gemini.maxOutput,
                temperature: temperature,
                topP: 0.8,
                topK: 40
              },
              safetySettings: [
                {
                  category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                  threshold: "BLOCK_NONE"
                },
                {
                  category: "HARM_CATEGORY_HATE_SPEECH",
                  threshold: "BLOCK_NONE"
                },
                {
                  category: "HARM_CATEGORY_HARASSMENT",
                  threshold: "BLOCK_NONE"
                },
                {
                  category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                  threshold: "BLOCK_NONE"
                },
                {
                  category: "HARM_CATEGORY_CIVIC_INTEGRITY",
                  threshold: "BLOCK_NONE"
                }
              ]
            });

            const response = geminiResult.response;
            if (!response) {
              throw new Error('No response generated from Gemini');
            }

            const content = response.text();
            if (!content) {
              throw new Error('Empty response from Gemini');
            }

            result = {
              content,
              metadata: {
                provider: 'gemini',
                model: this.modelConfigs.gemini,
                tokenUsage: {
                  promptTokens: geminiResult.response?.usageMetadata?.promptTokenCount,
                  completionTokens: geminiResult.response?.usageMetadata?.candidatesTokenCount,
                  totalTokens: geminiResult.response?.usageMetadata?.totalTokenCount
                },
                timestamp: new Date().toISOString()
              }
            };
            
            return result;

          } catch (error) {
            logger.error('Gemini generation error:', error);
            logger.error('Gemini error details:', {
              message: error.message,
              code: error.code,
              status: error.status,
              statusText: error.statusText,
              details: error.details || error.response?.data,
              errorName: error.name,
              stack: error.stack,
              fullError: JSON.stringify(error, null, 2)
            });
            
            // Log the actual request that was sent
            logger.error('Gemini request details:', {
              model: validModelName,
              messageCount: messages.length,
              temperature: temperature,
              maxTokens: maxTokens || this.tokenLimits.gemini.maxOutput
            });
            
            // Enhanced error handling for Gemini
            if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid api key')) {
              throw new Error('QUOTA_ERROR: Google Gemini API key is invalid. Please check your API key in Settings.');
            } else if (error.message?.includes('QUOTA_EXCEEDED') || error.message?.includes('quota')) {
              throw new Error('QUOTA_ERROR: Gemini API quota exceeded. Please check your usage limits and billing.');
            } else if (error.message?.includes('RATE_LIMIT_EXCEEDED')) {
              throw new Error('RATE_LIMIT_ERROR: Gemini API rate limit exceeded. Please try again later.');
            } else if (error.message?.includes('MODEL_NOT_FOUND')) {
              throw new Error(`MODEL_ERROR: Gemini model "${this.modelConfigs.gemini}" not found. Please check your model access.`);
            } else if (error.message?.includes('PERMISSION_DENIED')) {
              throw new Error('QUOTA_ERROR: Gemini API access denied. Please check your API key permissions.');
            } else if (error.status === 400 || error.code === 400) {
              // Expose the actual 400 error with details
              const errorDetails = error.message || error.statusText || 'Bad Request';
              throw new Error(`Gemini API error (400): ${errorDetails}`);
            } else if (error.status === 500 || error.code === 500) {
              // Expose the actual 500 error with details
              const errorDetails = error.message || error.statusText || 'Server Error';
              throw new Error(`Gemini API error (500): ${errorDetails}`);
            } else {
              throw new Error(`Gemini API error: ${error.message || 'Unknown error'}`);
            }
          }

        case 'local':
          // Local LLM logic remains the same as it doesn't have quota issues
          result = await this.generateLocalResponse(messages, options);
          return {
            content: result.content,
            metadata: {
              provider: 'local',
              model: this.localLLMConfig?.model || 'unknown',
              tokenUsage: result.tokenUsage,
              timestamp: new Date().toISOString()
            }
          };

        default:
          throw new Error(`Unsupported provider: ${currentProvider}`);
      }

    } catch (error) {
      logger.error('Generate response error:', error);
      
      // Add error categorization for better frontend handling
      const errorMessage = error.message || 'Unknown error occurred';
      const errorType = this.categorizeError(errorMessage);
      
      // Create enhanced error object
      const enhancedError = new Error(errorMessage);
      enhancedError.type = errorType;
      enhancedError.provider = this.getCurrentProvider();
      enhancedError.timestamp = new Date().toISOString();
      
      throw enhancedError;
    }
  }


  async generateAnalysis(message, diagram, options = {}) {
    try {
        // Check if we have a current provider
        if (!this.currentProvider) {
            safeConsole.log('No current provider set');
            // Don't automatically default to OpenAI - let the user configure through settings
            throw new Error('No AI provider configured. Please configure an AI provider in the settings.');
        }

        // Double-check that the provider is initialized
        if (!this.providers[this.currentProvider]) {
            throw new Error(`AI provider ${this.currentProvider} not initialized. Please check your API key in settings.`);
        }

        safeConsole.log('Generating analysis with:', {
            provider: this.currentProvider,
            messageLength: message?.length,
            diagramNodes: diagram?.nodes?.length
        });

        // Format the prompt
        const prompt = this.formatAnalysisPrompt(message, diagram);

        // Create messages array for generateResponse
        const messages = [{
            role: 'system',
            content: this.systemPrompt
        }, {
            role: 'user',
            content: prompt
        }];

        // Use the existing generateResponse method with messages array
        // Pass temperature and maxTokens from localLLMConfig (applies to both local and public)
        // Also pass through any web search options
        const result = await this.generateResponse(messages, {
            temperature: this.localLLMConfig?.temperature,
            maxTokens: this.localLLMConfig?.maxTokens,
            ...options
        });

        // Extract the assistant content in a provider-agnostic way
        let analysisContent = '';

        if (result && Array.isArray(result.choices) && result.choices.length > 0) {
            // OpenAI / Local LLM style
            analysisContent = result.choices[0].message?.content || result.choices[0].text || '';
        } else if (result && Array.isArray(result.candidates) && result.candidates.length > 0) {
            // Gemini style – combine parts
            const parts = result.candidates[0].content?.parts || [];
            analysisContent = parts.map(part => {
                if (typeof part === 'string') return part;
                if (typeof part.text === 'string') return part.text;
                return '';
            }).join('');
        } else if (typeof result === 'string') {
            analysisContent = result;
        }

        if (!analysisContent) {
            analysisContent = 'Error: Unable to extract analysis content from AI provider response.';
        }

        return {
            analysis: analysisContent,
            provider: this.currentProvider,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        safeConsole.error('Analysis generation error:', {
            message: error.message,
            provider: this.currentProvider,
            type: error.constructor.name
        });
        throw error;
    }
  }

  formatAnalysisPrompt(message, diagram, threatIntel) {
    // Convert diagram to a more readable format for the AI
    const diagramSummary = {
      nodes: diagram.nodes.map(node => {
        const nodeVulnerabilities = {
          nvd: threatIntel?.nvdVulnerabilities?.filter(vuln => 
            vuln.affects?.some(comp => 
              node.data.components?.some(c => 
                c.name === comp.name && c.version === comp.version
              )
            )
          ),
          mitre: threatIntel?.mitreAttack?.filter(technique => 
            technique.platforms.includes(node.data.technology)
          ),
          github: threatIntel?.githubAdvisories?.filter(advisory =>
            node.data.components?.some(c => 
              advisory.package === c.name && advisory.affectedVersions.includes(c.version)
            )
          )
        };

        return {
          type: node.type,
          label: node.data.label,
          vendor: node.data.vendor,
          product: node.data.product,
          version: node.data.version,
          technology: node.data.technology,
          patchLevel: node.data.patchLevel,
          security: {
            level: node.data.securityLevel,
            zone: node.data.zone,
            controls: node.data.securityControls
          },
          vulnerabilities: nodeVulnerabilities,
          components: node.data.components
        };
      }),
      connections: diagram.edges.map(edge => ({
        from: edge.source,
        to: edge.target,
        label: edge.data.label,                    // CRITICAL: Include descriptive labels like "Debug Port (8000)"
        protocol: edge.data.protocol,
        encryption: edge.data.encryption,          // Fixed field name from 'encrypted' to 'encryption'
        securityLevel: edge.data.securityLevel,
        dataClassification: edge.data.dataClassification,
        description: edge.data.description,
        portRange: edge.data.portRange
      }))
    };

    return `
      ${this.systemPrompt || 'You are a security analysis assistant.'}
      
      TASK: ${message}
      
      SYSTEM DIAGRAM WITH THREAT INTEL:
      ${JSON.stringify(diagramSummary, null, 2)}
      
      Known Vulnerabilities Summary:
      - NVD Vulnerabilities: ${threatIntel?.nvdVulnerabilities?.length || 0}
      - MITRE ATT&CK Techniques: ${threatIntel?.mitreAttack?.length || 0}
      - GitHub Security Advisories: ${threatIntel?.githubAdvisories?.length || 0}
      
      Please analyze the security risks and provide:
      1. Potential vulnerabilities (including known CVEs and threat intel matches)
      2. Security recommendations
      3. Compliance considerations
      4. Best practices for the given architecture
    `;
  }

  // Add this helper method to the class
  formatMessages(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }

    return messages.map(msg => {
      // Ensure proper structure and add formatting instructions to system messages
      if (msg.role === 'system') {
        const originalContent = msg.content || '';
        
        // Only add formatting instructions for specific contexts where markdown is problematic
        // For threat analysis JSON responses, we don't need these instructions
        const isJsonResponse = originalContent.includes('Return ONLY valid JSON') || 
                              originalContent.includes('JSON response') ||
                              originalContent.includes('JSON format');
        
        if (!isJsonResponse) {
          // Add strong formatting instructions to system message for non-JSON responses
          const formattingInstruction = '\n\nCRITICAL FORMATTING REQUIREMENTS:\n- DO NOT use asterisks (*) anywhere in your response\n- DO NOT use hashtags (#) for headers\n- DO NOT use **bold**, *italic*, or any markdown formatting\n- Use only plain text with simple bullet points (•)\n- Write section titles as plain text without any symbols\n- Never use **, *, ###, ##, or # characters for formatting\n- Keep all text clean without markdown decorations';
          
          return {
            role: 'system',
            content: originalContent + formattingInstruction
          };
        }
        
        return {
          role: 'system',
          content: originalContent
        };
      }
      
      return {
        role: msg.role || 'user',
        content: msg.content || ''
      };
    }).filter(msg => msg.content.trim().length > 0);
  }

  async streamResponse(messages, options = {}) {
    const { onToken, onComplete, signal } = options;
    
    safeConsole.log('\n=== Stream Response Debug ===');
    safeConsole.log('Current provider:', this.currentProvider);
    safeConsole.log('Provider instance:', !!this.providers[this.currentProvider]);
    safeConsole.log('Has onToken callback:', !!onToken);
    safeConsole.log('Has onComplete callback:', !!onComplete);
    
    if (!this.currentProvider || !this.providers[this.currentProvider]) {
      const errorMsg = 'No AI provider configured. Please configure an AI provider (e.g., Ollama, OpenAI) in the settings to use streaming.';
      safeConsole.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Format messages for the current provider
    const formattedMessages = this.formatMessages(messages);
    let fullResponse = '';
    let localTimeoutId = null; // Declare at outer scope for cleanup

    try {
      switch (this.currentProvider) {
        case 'local':
          safeConsole.log('Starting Local LLM streaming...');
          safeConsole.log('Formatted messages for streaming:', formattedMessages.length, 'messages');
          safeConsole.log('Context window configuration:', {
            contextWindow: this.localLLMConfig?.contextWindow,
            maxTokens: this.localLLMConfig?.maxTokens,
            tokenLimit: this.tokenLimits.local.maxInput,
            numCtxSending: this.localLLMConfig?.contextWindow || 131072,
            defaultNumCtx: 131072
          });
          
          // Set up timeout for local LLM
          const LOCAL_LLM_TIMEOUT_MS = 180000; // 180 seconds (3 minutes) for local LLMs which can be slower
          
          // Apply the same enhancement for streaming as we did for non-streaming
          const lastMsg = formattedMessages[formattedMessages.length - 1];
          const isAnalysisReq = lastMsg && lastMsg.role === 'user' && 
                              (lastMsg.content.toLowerCase().includes('analyze') ||
                               lastMsg.content.toLowerCase().includes('analyse') ||
                               lastMsg.content.toLowerCase().includes('diagram'));
          
          if (isAnalysisReq && formattedMessages.length > 0 && formattedMessages[0].role === 'system') {
            const sysMsg = formattedMessages[0];
            if (sysMsg.content.includes('CREATE') && sysMsg.content.includes('SecurityNode')) {
              sysMsg.content += `\n\nREMINDER FOR ANALYSIS: The Cypher format above IS the diagram the user wants you to analyze. You have full visibility of their system architecture through this representation. Please proceed with the security analysis of the components and connections shown above.`;
            }
          }
          
          // Check if the system message contains the diagram context
          const systemMsg = formattedMessages.find(m => m.role === 'system');
          if (systemMsg) {
            safeConsole.log('System message length:', systemMsg.content.length);
            if (systemMsg.content.includes('CREATE (') && systemMsg.content.includes('SecurityNode')) {
              safeConsole.log('✅ System message CONTAINS Cypher diagram context');
              // Count nodes and edges
              const createCount = (systemMsg.content.match(/CREATE\s*\(/g) || []).length;
              const matchCount = (systemMsg.content.match(/MATCH\s*\(/g) || []).length;
              safeConsole.log(`Cypher content in streaming: ${createCount} CREATE statements, ${matchCount} MATCH statements`);
            } else {
              safeConsole.log('❌ System message MISSING Cypher diagram context');
              safeConsole.log('First 1000 chars of system message:', systemMsg.content.substring(0, 1000));
            }
          }
          
          if (!this.localLLMConfig) {
            throw new Error('Local LLM configuration not found');
          }
          let { baseUrl, model, temperature, maxTokens, contextWindow } = this.localLLMConfig;
          
          // Force IPv4 to avoid ECONNREFUSED on IPv6
          baseUrl = baseUrl.replace('http://localhost', 'http://127.0.0.1');
          safeConsole.log('Using baseUrl for streaming:', baseUrl);
          
          // Check if this is the Foundation-Sec model which might need special handling
          const isFoundationSec = model && model.includes('foundation-sec');
          // Check if this is a threat analysis request from options
          const isThreatAnalysis = options.isThreatAnalysis || false;
          
          let response;
          
          // Send status update - connecting to Ollama
          if (onToken) {
            onToken('[STATUS:CONNECTING_OLLAMA]');
          }
          
          // Create AbortController with timeout
          const timeoutController = new AbortController();
          const combinedSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
          
          // Set timeout
          localTimeoutId = setTimeout(() => {
            safeConsole.error(`Local LLM timeout after ${LOCAL_LLM_TIMEOUT_MS}ms`);
            if (onToken) {
              onToken('[STATUS:TIMEOUT]');
            }
            timeoutController.abort();
          }, LOCAL_LLM_TIMEOUT_MS);
          
          if (isFoundationSec && isThreatAnalysis) {
            // Foundation-Sec model FOR THREAT ANALYSIS - use special handling
            const modifiedMessages = formattedMessages.map(msg => {
              if (msg.role === 'system') {
                return {
                  ...msg,
                  content: msg.content + '\n\nIMPORTANT: You must provide detailed security analysis including specific CVEs, attack paths, and vulnerabilities when they exist in the system being analyzed.'
                };
              }
              return msg;
            });
            
            logger.info('Using special handling for Foundation-Sec model streaming (threat analysis mode)');
            
            response = await fetch(`${baseUrl}/api/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: model,
                messages: modifiedMessages,
                stream: true,
                options: {
                  temperature: 0.2,
                  num_predict: maxTokens,
                  num_ctx: contextWindow || 131072, // Use detected window or 128k default
                  repeat_penalty: 1.1,
                  top_k: 40,
                  top_p: 0.95,
                  stop: [],
                  seed: 123,
                  penalize_newline: false,
                  // GPU-specific options
                  num_gpu: this.localLLMConfig?.gpuLayers ?? -1,
                  num_thread: this.localLLMConfig?.numThreads || 0,
                  num_batch: this.localLLMConfig?.batchSize || 512
                },
              }),
              signal: combinedSignal,
            });
          } else {
            // Use standard /api/chat for other models
            response = await fetch(`${baseUrl}/api/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: model,
                messages: formattedMessages,
                stream: true,
                options: {
                  temperature: temperature,
                  num_predict: maxTokens,
                  num_ctx: contextWindow || 131072, // Use detected window or 128k default
                  repeat_penalty: 1.1,
                  top_k: 40,
                  top_p: 0.9,
                  // GPU-specific options
                  num_gpu: this.localLLMConfig?.gpuLayers ?? -1,
                  num_thread: this.localLLMConfig?.numThreads || 0,
                  num_batch: this.localLLMConfig?.batchSize || 512
                },
              }),
              signal: combinedSignal,
            });
          }

          // Check response status
          if (!response.ok) {
            clearTimeout(localTimeoutId);
            if (onToken) {
              onToken('[STATUS:ERROR]');
            }
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`Local LLM request failed with status ${response.status}: ${errorText}`);
          }

          if (!response.body) {
            clearTimeout(localTimeoutId);
            if (onToken) {
              onToken('[STATUS:ERROR]');
            }
            throw new Error('No response body from local LLM');
          }
          
          // Send status update - waiting for model response
          if (onToken) {
            onToken('[STATUS:WAITING_FOR_MODEL]');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let hasReceivedData = false;
          let firstTokenTime = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            // Ollama streams JSON objects separated by newlines
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.trim()) {
                try {
                  const parsed = JSON.parse(line);
                  // Handle both /api/chat and /api/generate response formats
                  let token = null;
                  if (parsed.message && parsed.message.content) {
                    // /api/chat format
                    token = parsed.message.content;
                  } else if (parsed.response) {
                    // /api/generate format
                    token = parsed.response;
                  }
                  
                  if (token) {
                    if (!hasReceivedData) {
                      hasReceivedData = true;
                      firstTokenTime = Date.now();
                      safeConsole.log('First token received from Ollama');
                      // Send status update - model is responding
                      if (onToken) {
                        onToken('[STATUS:MODEL_RESPONDING]');
                      }
                    }
                    const cleaned = token.replace(/\*/g, '');
                    if (cleaned) onToken?.(cleaned);
                    fullResponse += token;
                  }
                  
                  if (parsed.done) {
                    // We can break here as Ollama signals the end
                    break;
                  }
                } catch (e) {
                  safeConsole.error('Error parsing local LLM stream chunk:', e);
                }
              }
            }
          }
          
          // Clear timeout on successful completion
          clearTimeout(localTimeoutId);
          
          // Check if we received any data
          if (!hasReceivedData && !fullResponse) {
            safeConsole.warn('Ollama streaming completed but no data was received');
          }
          
          const localResponse = {
            choices: [{
              message: {
                content: fullResponse,
                role: 'assistant'
              }
            }],
            metadata: {
              provider: 'local',
              timestamp: new Date().toISOString()
            }
          };
          if (onComplete) {
            onComplete(localResponse);
          }
          return localResponse;

        case 'openai':
          safeConsole.log('Starting OpenAI streaming...');
          
          let stream;
          let streamTimeout = null;
          const OPENAI_STREAM_TIMEOUT_MS = 90000; // 90 second timeout
          const CHUNK_TIMEOUT_MS = 30000; // 30 second timeout between chunks
          
          try {
            const streamParams = {
              model: this.modelConfigs.openai || 'gpt-4o-2024-08-06',
              messages: formattedMessages,
              temperature: 0,
              max_tokens: this.tokenLimits.openai.maxOutput,
              stream: true
            };
            
            // Add reasoning parameter if model supports it and it's configured
            if (modelCapabilities.supportsReasoning(streamParams.model) && 
                this.providerConfigs.openai?.reasoningEffort) {
              streamParams.reasoning_effort = this.providerConfigs.openai.reasoningEffort;
              // o1 models don't support temperature parameter
              delete streamParams.temperature;
              logger.info(`Streaming with reasoning effort: ${streamParams.reasoning_effort} for model: ${streamParams.model}`);
            }
            
            stream = await this.providers.openai.chat.completions.create(streamParams);
          } catch (streamCreateError) {
            safeConsole.error('Failed to create OpenAI stream:', streamCreateError);
            throw new Error(`OpenAI streaming initialization failed: ${streamCreateError.message}`);
          }

          try {
            let chunkCount = 0;
            const maxChunks = 10000; // Prevent infinite loops
            let lastChunkTime = Date.now();
            
            // Set up overall stream timeout
            streamTimeout = setTimeout(() => {
              safeConsole.error('OpenAI stream timeout - exceeding maximum duration');
              if (stream && typeof stream.controller?.abort === 'function') {
                stream.controller.abort();
              }
            }, OPENAI_STREAM_TIMEOUT_MS);
            
            for await (const chunk of stream) {
              chunkCount++;
              
              // Check for cancellation
              if (signal?.aborted) {
                throw new Error('Request was cancelled');
              }
              
              // Check chunk timeout
              const now = Date.now();
              if (now - lastChunkTime > CHUNK_TIMEOUT_MS) {
                safeConsole.error('OpenAI stream chunk timeout - no data for 30 seconds');
                break;
              }
              lastChunkTime = now;
              
              // Safety check to prevent infinite loops
              if (chunkCount > maxChunks) {
                safeConsole.warn(`OpenAI stream exceeded maximum chunk count (${maxChunks}), terminating`);
                break;
              }

              // Safely handle chunk parsing with proper error handling
              try {
                // Skip null, undefined, or empty chunks
                if (!chunk) {
                  continue;
                }
                
                // OpenAI streaming chunks should be well-formed, but let's be defensive
                if (chunk && chunk.choices && Array.isArray(chunk.choices) && chunk.choices.length > 0) {
                  const choice = chunk.choices[0];
                  
                  // Handle content delta
                  if (choice.delta && choice.delta.content && typeof choice.delta.content === 'string') {
                    const delta = choice.delta.content;
                    fullResponse += delta;
                    if (onToken) {
                      try {
                        onToken(delta);
                      } catch (tokenError) {
                        safeConsole.error('Error in onToken callback:', tokenError);
                        // Don't fail the entire stream for callback errors
                      }
                    }
                  }
                  
                  // Handle end of stream
                  if (choice.finish_reason) {
                    safeConsole.log('OpenAI stream finished:', choice.finish_reason);
                  }
                } else {
                  // Log unexpected chunk structure for debugging
                  safeConsole.debug('Skipping malformed OpenAI chunk:', {
                    hasChoices: !!chunk.choices,
                    choicesType: typeof chunk.choices,
                    choicesLength: Array.isArray(chunk.choices) ? chunk.choices.length : 'not array'
                  });
                }
              } catch (chunkError) {
                safeConsole.warn('Error processing OpenAI streaming chunk:', chunkError.message);
                safeConsole.debug('Problematic chunk:', {
                  chunkType: typeof chunk,
                  chunkKeys: chunk ? Object.keys(chunk) : 'null/undefined',
                  firstChoice: chunk?.choices?.[0] ? Object.keys(chunk.choices[0]) : 'no first choice'
                });
                // Continue processing other chunks instead of failing completely
                continue;
              }
            }
            
            // Clear timeout on successful completion
            if (streamTimeout) {
              clearTimeout(streamTimeout);
              streamTimeout = null;
            }
            
            safeConsole.log(`OpenAI streaming completed. Processed ${chunkCount} chunks, response length: ${fullResponse.length}`);
            
          } catch (streamError) {
            // Clear timeout on error
            if (streamTimeout) {
              clearTimeout(streamTimeout);
              streamTimeout = null;
            }
            
            safeConsole.error('OpenAI streaming error:', streamError);
            // If we have partial response, don't throw - return what we have
            if (fullResponse.trim()) {
              safeConsole.log('Returning partial response due to streaming error. Response length:', fullResponse.length);
            } else {
              throw streamError;
            }
          }
          
          // Final safety check for empty responses
          if (!fullResponse.trim()) {
            safeConsole.warn('OpenAI streaming completed but no content was received');
            fullResponse = 'Error: No content received from OpenAI streaming API';
          }
          
          // Return formatted response for OpenAI streaming
          const openaiResponse = {
            choices: [{
              message: {
                content: fullResponse,
                role: 'assistant'
              }
            }],
            metadata: {
              provider: 'openai',
              timestamp: new Date().toISOString()
            }
          };
          
          if (onComplete) {
            safeConsole.log('OpenAI streaming calling onComplete with response length:', fullResponse.length);
            onComplete(openaiResponse);
          }
          
          return openaiResponse;

        case 'anthropic':
          safeConsole.log('Starting Anthropic streaming...');
          safeConsole.log('Anthropic provider instance:', !!this.providers.anthropic);
          safeConsole.log('Anthropic model config:', this.modelConfigs.anthropic);
          safeConsole.log('Formatted messages count:', formattedMessages.length);
          safeConsole.log('System message length:', formattedMessages.find(m => m.role === 'system')?.content?.length || 0);
          safeConsole.log('User messages count:', formattedMessages.filter(m => m.role !== 'system').length);
          let anthropicStream;
          let anthropicStreamTimeout = null;
          const ANTHROPIC_STREAM_TIMEOUT_MS = 90000; // 90 second timeout
          
          try {
            const streamParams = {
              model: this.modelConfigs.anthropic || 'claude-sonnet-4-20250514',
              max_tokens: this.tokenLimits.anthropic.maxOutput,
              temperature: 0,
              messages: formattedMessages.filter(m => m.role !== 'system'),
              system: formattedMessages.find(m => m.role === 'system')?.content || '',
              stream: true
            };
            
            // Add web search configuration for streaming (same logic as non-streaming)
            if (options.enableWebSearch) {
              const maxSearches = options.webSearchConfig?.maxSearches || options.maxSearches || webSearchConfig.defaultMaxSearches || 5;
              let domainCategories = options.webSearchConfig?.domainCategories || [];
              
              let allowedDomains = [];
              if (domainCategories.length > 0) {
                domainCategories.forEach(category => {
                  if (webSearchConfig.allowedDomains[category]) {
                    allowedDomains = allowedDomains.concat(webSearchConfig.allowedDomains[category]);
                  }
                });
              } else if (webSearchConfig.getAllowedDomains) {
                allowedDomains = webSearchConfig.getAllowedDomains();
              } else {
                allowedDomains = [];
              }
              
              if (allowedDomains.length > 0) {
                streamParams.tools = [{
                  type: "web_search_20250305",
                  name: "web_search",
                  max_uses: maxSearches,
                  allowed_domains: allowedDomains
                  // Don't include blocked_domains when using allowed_domains
                }];
                
                streamParams.tool_choice = { type: "auto" };
                
                safeConsole.log('Web search enabled for Anthropic streaming', {
                  maxSearches: streamParams.tools[0].max_uses,
                  domainCount: streamParams.tools[0].allowed_domains.length,
                  categories: domainCategories,
                  source: options.webSearchConfig ? 'chat' : 'threat-analysis'
                });
              }
            }
            
            // Add beta header for Claude 3.5 Sonnet to enable 8192 output tokens
            const headers = {};
            if (modelCapabilities.getModelCapabilities(streamParams.model).requiresBetaHeader) {
              headers['anthropic-beta'] = 'max-tokens-3-5-sonnet-2024-07-15';
              safeConsole.log(`Using beta header for ${streamParams.model} to enable 8192 output tokens`);
            }
            
            anthropicStream = await this.providers.anthropic.messages.create(streamParams, {
              headers: headers
            });
            safeConsole.log('Anthropic stream created successfully');
          } catch (streamCreateError) {
            safeConsole.error('Failed to create Anthropic stream:', streamCreateError);
            safeConsole.error('Anthropic stream error details:', {
              name: streamCreateError.name,
              message: streamCreateError.message,
              stack: streamCreateError.stack?.substring(0, 500)
            });
            throw new Error(`Anthropic streaming initialization failed: ${streamCreateError.message}`);
          }

          try {
            let chunkCount = 0;
            let lastChunkTime = Date.now();
            const CHUNK_TIMEOUT_MS = 30000; // 30 second timeout between chunks
            
            // Set up overall stream timeout
            anthropicStreamTimeout = setTimeout(() => {
              safeConsole.error('Anthropic stream timeout - exceeding maximum duration');
              // Anthropic doesn't expose stream controller, so we'll just break the loop
            }, ANTHROPIC_STREAM_TIMEOUT_MS);
            
            for await (const chunk of anthropicStream) {
              chunkCount++;
              
              // Check for cancellation
              if (signal?.aborted) {
                throw new Error('Request was cancelled');
              }
              
              // Check if timeout was triggered
              if (anthropicStreamTimeout === null) {
                safeConsole.warn('Anthropic stream terminated due to timeout');
                break;
              }
              
              // Check chunk timeout
              const now = Date.now();
              if (now - lastChunkTime > CHUNK_TIMEOUT_MS) {
                safeConsole.error('Anthropic stream chunk timeout - no data for 30 seconds');
                break;
              }
              lastChunkTime = now;

              try {
                if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
                  const delta = chunk.delta.text;
                  fullResponse += delta;
                  if (onToken) {
                    try {
                      onToken(delta);
                    } catch (tokenError) {
                      safeConsole.error('Error in onToken callback:', tokenError);
                      // Don't fail the entire stream for callback errors
                    }
                  }
                }
              } catch (chunkError) {
                safeConsole.warn('Error processing Anthropic chunk:', chunkError);
                // Continue processing other chunks
                continue;
              }
            }
            
            // Clear timeout on successful completion
            if (anthropicStreamTimeout) {
              clearTimeout(anthropicStreamTimeout);
            }
            
            safeConsole.log(`Anthropic streaming completed. Processed ${chunkCount} chunks, response length: ${fullResponse.length}`);
            
          } catch (streamError) {
            // Clear timeout on error
            if (anthropicStreamTimeout) {
              clearTimeout(anthropicStreamTimeout);
            }
            
            safeConsole.error('Anthropic streaming error:', streamError);
            // If we have partial response, don't throw - return what we have
            if (fullResponse.trim()) {
              safeConsole.log('Returning partial Anthropic response due to streaming error. Response length:', fullResponse.length);
            } else {
              throw streamError;
            }
          }
          
          // Return formatted response for Anthropic streaming
          const anthropicResponse = {
            choices: [{
              message: {
                content: fullResponse,
                role: 'assistant'
              }
            }],
            metadata: {
              provider: 'anthropic',
              timestamp: new Date().toISOString()
            }
          };
          
          if (onComplete) {
            safeConsole.log('Anthropic streaming calling onComplete with response length:', fullResponse.length);
            onComplete(anthropicResponse);
          }
          
          return anthropicResponse;

        case 'gemini':
          safeConsole.log('Starting Gemini streaming...');
          const gemini = this.providers.gemini;
          
          if (!gemini) {
            throw new Error('Gemini provider not initialized');
          }

          try {
            const modelName = this.modelConfigs.gemini || 'gemini-2.5-pro';
            // Google Gemini SDK expects model names WITHOUT the 'models/' prefix
            const validModelName = modelName.startsWith('models/') ? modelName.replace('models/', '') : modelName;
            
            const geminiModel = gemini.getGenerativeModel({
              model: validModelName
            });

            // Gemini expects a flat array of content strings for history
            const history = formattedMessages
              .slice(0, -1)
              .map(msg => ({
                  role: msg.role === 'assistant' ? 'model' : 'user', 
                  parts: [{ text: msg.content }]
              }));
              
            const lastMessage = formattedMessages[formattedMessages.length - 1];

            const result = await geminiModel.generateContentStream({
              contents: [...history, { role: lastMessage.role, parts: [{ text: lastMessage.content }] }],
              generationConfig: {
                maxOutputTokens: 4000,
                temperature: 0,
              },
            });

            for await (const chunk of result.stream) {
              if (signal?.aborted) {
                throw new Error('Request was cancelled');
              }

              // Check if chunk and its properties are valid
              if (chunk && chunk.candidates && chunk.candidates.length > 0) {
                const candidate = chunk.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                  const part = candidate.content.parts[0];
                  if (part.text) {
                    const delta = part.text;
                    fullResponse += delta;
                    if (onToken) {
                      onToken(delta);
                    }
                  }
                }
              }
            }

            // Always close the underlying fetch/stream to free the connection.
            try {
              if (typeof result.close === 'function') {
                result.close();
              }
            } catch (closeErr) {
              safeConsole.debug('Gemini result.close() threw (ignored):', closeErr?.message);
            }
          } catch (error) {
            safeConsole.error('Gemini streaming error:', error);
            safeConsole.error('Gemini streaming error details:', {
              message: error.message,
              code: error.code,
              status: error.status,
              statusText: error.statusText,
              details: error.details || error.response?.data,
              errorName: error.name,
              stack: error.stack,
              fullError: JSON.stringify(error, null, 2)
            });
            
            // Log the actual request that was sent
            safeConsole.error('Gemini streaming request details:', {
              model: validModelName,
              messageCount: formattedMessages.length,
              temperature: 0,
              maxTokens: 4000
            });
            
            if (!fullResponse.trim()) {
              // Enhanced error message with actual details
              if (error.status === 400 || error.code === 400) {
                const errorDetails = error.message || error.statusText || 'Bad Request';
                throw new Error(`Gemini API error (400): ${errorDetails}`);
              } else if (error.status === 500 || error.code === 500) {
                const errorDetails = error.message || error.statusText || 'Server Error';
                throw new Error(`Gemini API error (500): ${errorDetails}`);
              } else {
                throw error; // Re-throw if no content was generated
              }
            }
          }
          
          const geminiResponse = {
            choices: [{
              message: {
                content: fullResponse,
                role: 'assistant'
              }
            }],
            metadata: {
              provider: 'gemini',
              timestamp: new Date().toISOString()
            }
          };
          
          if (onComplete) {
            onComplete(geminiResponse);
          }
          
          return geminiResponse;

        default:
          throw new Error(`Streaming not implemented for provider: ${this.currentProvider}`);
      }

      // This code is unreachable since all cases either return or throw
      // Removed unreachable code

    } catch (error) {
      // Clean up local LLM timeout if it exists
      if (this.currentProvider === 'local' && typeof localTimeoutId !== 'undefined' && localTimeoutId) {
        clearTimeout(localTimeoutId);
      }
      
      if (error.name === 'AbortError' || error.message === 'Request was cancelled' || error.message?.includes('cancel')) {
        safeConsole.log(`Streaming request cancelled for provider: ${this.currentProvider}`);
        
        // Check if it was a timeout for local LLM
        if (this.currentProvider === 'local' && error.message?.includes('timeout')) {
          throw new Error('Local LLM request timed out. The model may be overloaded or the prompt may be too complex. Please try again.');
        }
        
        throw new Error('Request was cancelled');
      }
      
      safeConsole.error('Streaming error:', {
        provider: this.currentProvider,
        message: error.message,
        name: error.name
      });
      
      throw error;
    }
  }

  /**
   * Build environment variables for GPU configuration
   */
  buildGPUEnvironment() {
    if (!this.localLLMConfig) return {};
    
    const env = {};
    
    // GPU Memory Management
    if (this.localLLMConfig.gpuMemoryFraction !== undefined) {
      env.OLLAMA_GPU_MEMORY_FRACTION = String(this.localLLMConfig.gpuMemoryFraction);
    }
    
    // GPU Overhead (in MB, convert to bytes)
    if (this.localLLMConfig.gpuOverhead !== undefined) {
      env.OLLAMA_GPU_OVERHEAD = String(this.localLLMConfig.gpuOverhead * 1024 * 1024);
    }
    
    // Parallel Processing
    if (this.localLLMConfig.numParallel !== undefined) {
      env.OLLAMA_NUM_PARALLEL = String(this.localLLMConfig.numParallel);
    }
    
    // Max Loaded Models
    if (this.localLLMConfig.maxLoadedModels !== undefined) {
      env.OLLAMA_MAX_LOADED_MODELS = String(this.localLLMConfig.maxLoadedModels);
    }
    
    // Keep Alive Duration
    if (this.localLLMConfig.keepAlive !== undefined) {
      env.OLLAMA_KEEP_ALIVE = this.localLLMConfig.keepAlive;
    }
    
    // GPU Selection
    if (this.localLLMConfig.selectedGPU && this.localLLMConfig.selectedGPU !== 'auto') {
      env.CUDA_VISIBLE_DEVICES = this.localLLMConfig.selectedGPU;
    }
    
    // CPU Threads (if specified)
    if (this.localLLMConfig.numThreads !== undefined && this.localLLMConfig.numThreads > 0) {
      env.OLLAMA_NUM_THREADS = String(this.localLLMConfig.numThreads);
    }
    
    logger.info('GPU Environment variables:', env);
    return env;
  }

  async generateLocalResponse(messages, options = {}) {
    try {
      if (!this.localLLMConfig) {
        throw new Error('Local LLM configuration not found');
      }

      let { baseUrl, model, temperature, maxTokens, contextWindow } = this.localLLMConfig;
      const { requireJsonFormat = false } = options; // Extract JSON format requirement
      
      // Force IPv4 to avoid ECONNREFUSED on IPv6
      baseUrl = baseUrl.replace('http://localhost', 'http://127.0.0.1');
      
      // Format messages for the request
      const formattedMessages = this.formatMessages(messages);
      
      safeConsole.log('Generating local LLM response:', {
        model,
        messageCount: formattedMessages.length,
        temperature,
        maxTokens,
        contextWindow,
        actualNumCtx: contextWindow || 131072
      });

      // Log the first message to debug Foundation-Sec issues
      if (formattedMessages.length > 0) {
        logger.info('First message preview:', {
          role: formattedMessages[0].role,
          contentLength: formattedMessages[0].content?.length || 0,
          contentPreview: formattedMessages[0].content?.substring(0, 200) || 'N/A'
        });
        
        // Enhanced logging for local LLM to check if diagram context is present
        const systemMsg = formattedMessages.find(m => m.role === 'system');
        if (systemMsg) {
          logger.info('=== LOCAL LLM SYSTEM MESSAGE CHECK ===');
          logger.info('System message length:', systemMsg.content.length);
          
          // Check for Cypher diagram content
          if (systemMsg.content.includes('CREATE (') && systemMsg.content.includes('SecurityNode')) {
            logger.info('✅ System message CONTAINS Cypher diagram context');
            // Count nodes and edges in the Cypher
            const createCount = (systemMsg.content.match(/CREATE\s*\(/g) || []).length;
            const matchCount = (systemMsg.content.match(/MATCH\s*\(/g) || []).length;
            logger.info(`Cypher content: ${createCount} CREATE statements, ${matchCount} MATCH statements`);
          } else {
            logger.error('❌ System message MISSING Cypher diagram context');
            logger.error('First 500 chars of system message:', systemMsg.content.substring(0, 500));
          }
          logger.info('=== END SYSTEM MESSAGE CHECK ===');
        }
        
        // Log all messages to understand the conversation flow
        logger.info('=== ALL MESSAGES TO LOCAL LLM ===');
        formattedMessages.forEach((msg, index) => {
          logger.info(`Message ${index + 1} (${msg.role}):`);
          logger.info(`- Length: ${msg.content.length} chars`);
          logger.info(`- Preview: ${msg.content.substring(0, 150)}...`);
        });
        logger.info('=== END ALL MESSAGES ===');
      }

      // Check if this is the Foundation-Sec model which might need special handling
      const isFoundationSec = model && model.includes('foundation-sec');
      
      let response;
      
      if (isFoundationSec) {
        // Foundation-Sec model - try a different approach
        // Let's use the chat endpoint but ensure the model's built-in system prompt is preserved
        
        logger.info('Using special handling for Foundation-Sec model');
        
        // For threat analysis, we need to ensure the security-focused prompts get through
        const modifiedMessages = formattedMessages.map(msg => {
          if (msg.role === 'system') {
            // Prepend to the model's built-in system prompt rather than replacing it
            return {
              ...msg,
              content: msg.content + '\n\nIMPORTANT: You must provide detailed security analysis including specific CVEs, attack paths, and vulnerabilities when they exist in the system being analyzed.'
            };
          }
          return msg;
        });
        
        logger.info('Foundation-Sec message preview:', {
          messageCount: modifiedMessages.length,
          firstMsgRole: modifiedMessages[0]?.role,
          firstMsgLength: modifiedMessages[0]?.content?.length || 0,
          firstMsgPreview: modifiedMessages[0]?.content?.substring(0, 300) || 'N/A',
          numCtxSending: contextWindow || 131072,
          contextWindowConfig: contextWindow
        });
        
        response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: modifiedMessages,
            stream: false,
            options: {
              temperature: 0.2, // Low temperature for consistent responses
              num_predict: maxTokens || 4096,
              num_ctx: contextWindow || 131072, // Use detected window or 128k default
              repeat_penalty: 1.1,
              top_k: 40,
              top_p: 0.95,
              stop: [], // Clear stop sequences
              seed: 123, // Fixed seed for consistency
              penalize_newline: false,
              // GPU-specific options
              num_gpu: this.localLLMConfig?.gpuLayers ?? -1,
              num_thread: this.localLLMConfig?.numThreads || 0,
              num_batch: this.localLLMConfig?.batchSize || 512
            },
            // Only add format: 'json' when explicitly required (e.g., for threat analysis)
            ...(requireJsonFormat ? { format: 'json' } : {})
          }),
          signal: options.signal // Add abort signal support
        });
      } else {
        // Use standard /api/chat for other models
        logger.info('Sending to Ollama with context window:', {
          model,
          numCtx: contextWindow || 131072,
          contextWindowFromConfig: contextWindow,
          tokenLimitsLocal: this.tokenLimits.local.maxInput,
          messageCount: formattedMessages.length,
          totalMessageLength: formattedMessages.reduce((sum, msg) => sum + msg.content.length, 0)
        });
        
        response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: formattedMessages,
            stream: false,
            options: {
              temperature: temperature || this.localLLMConfig?.temperature || 0.2,
              num_predict: maxTokens || 4096,
              num_ctx: contextWindow || 131072, // Use detected window or 128k default
              repeat_penalty: 1.1,
              top_k: 40,
              top_p: 0.9,
              // GPU-specific options
              num_gpu: this.localLLMConfig?.gpuLayers ?? -1, // -1 means use all layers
              num_thread: this.localLLMConfig?.numThreads || 0, // 0 means auto
              num_batch: this.localLLMConfig?.batchSize || 512
            },
          }),
          signal: options.signal // Add abort signal support
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama request failed: ${errorText}`);
      }

      const result = await response.json();
      
      // Log the actual response structure
      logger.info('Ollama response structure:', {
        hasMessage: !!result.message,
        hasContent: !!(result.message && result.message.content),
        hasResponse: !!result.response,
        keys: Object.keys(result),
        messageKeys: result.message ? Object.keys(result.message) : [],
        messageContent: result.message ? result.message.content : undefined,
        responseContent: result.response
      });
      
      // Enhanced logging for foundation-sec model
      if (isFoundationSec) {
        logger.info('Foundation-Sec raw response:', {
          model: model,
          responseType: typeof result,
          responseKeys: Object.keys(result || {}),
          messageContentPreview: result.message?.content?.substring(0, 500), // First 500 chars
          responseContentPreview: result.response?.substring(0, 500),
          fullMessageContent: result.message?.content,
          fullResponseContent: result.response,
          requestedFormat: 'json'
        });
      }
      
      // Handle different response formats from Ollama
      let responseContent = null;
      
      // Try to get content from various possible locations
      if (result.message && result.message.content) {
        responseContent = result.message.content;
      } else if (result.response) {
        responseContent = result.response;
      } else if (result.message && typeof result.message === 'string') {
        responseContent = result.message;
      }
      
      if (!responseContent) {
        logger.error('Invalid Ollama response - no content found:', JSON.stringify(result).substring(0, 500));
        
        // For Foundation-Sec, retry with a simplified prompt if it returns empty
        if (isFoundationSec && result.done && !responseContent) {
          logger.info('Foundation-Sec returned empty response, retrying with simplified prompt');
          
          // Retry with just the user message
          const userMessage = formattedMessages.find(m => m.role === 'user');
          if (userMessage) {
            const simplifiedPrompt = `Human: ${userMessage.content}\nAssistant:`;
            
            const retryResponse = await fetch(`${baseUrl}/api/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: model,
                prompt: simplifiedPrompt,
                stream: false,
                options: {
                  temperature: 0.2, // Low temperature for consistent responses
                  num_predict: maxTokens || 4096,
                  num_ctx: contextWindow || 131072, // Use detected window or 128k default
                  repeat_penalty: 1.1,
                  top_k: 40,
                  top_p: 0.9,
                  // GPU-specific options
                  num_gpu: this.localLLMConfig?.gpuLayers ?? -1,
                  num_thread: this.localLLMConfig?.numThreads || 0,
                  num_batch: this.localLLMConfig?.batchSize || 512
                },
              }),
            });
            
            if (retryResponse.ok) {
              const retryResult = await retryResponse.json();
              if (retryResult.response) {
                logger.info('Foundation-Sec retry successful');
                responseContent = retryResult.response;
              }
            }
          }
        }
        
        if (!responseContent) {
          throw new Error('Invalid response from Ollama - no content found');
        }
      }

      // Return in standardized format
      return {
        content: responseContent,
        tokenUsage: {
          promptTokens: result.prompt_eval_count,
          completionTokens: result.eval_count,
          totalTokens: (result.prompt_eval_count || 0) + (result.eval_count || 0)
        }
      };
    } catch (error) {
      // Check if request was aborted
      if (error.name === 'AbortError') {
        logger.info('Local LLM request aborted');
        throw error; // Re-throw AbortError as-is
      }
      logger.error('Local LLM generation error:', error);
      throw new Error(`Local LLM error: ${error.message}`);
    }
  }

  getCurrentProvider() {
    logger.info('[AIProviderManager] getCurrentProvider called:', {
      currentProvider: this.currentProvider,
      hasProviders: Object.keys(this.providers).length > 0,
      providers: Object.keys(this.providers)
    });
    return this.currentProvider;
  }

  getCurrentModel() {
    if (this.currentProvider === 'local' && this.localLLMConfig) {
      return this.localLLMConfig.model;
    } else if (this.currentProvider && this.modelConfigs[this.currentProvider]) {
      return this.modelConfigs[this.currentProvider];
    }
    return null;
  }

  isLocalProvider() {
    return this.currentProvider === 'local';
  }

  getFullModelConfig() {
    if (this.currentProvider && this.providerConfigs[this.currentProvider]) {
      const config = this.providerConfigs[this.currentProvider];
      const fullConfig = {
        model: config.model,
        provider: this.currentProvider,
        contextWindow: config.contextWindow || config.maxTokens,
        maxTokens: config.maxTokens || config.contextWindow || undefined
      };
      
      // Add local LLM specific configuration
      if (this.currentProvider === 'local') {
        fullConfig.baseUrl = config.baseUrl;
      }
      
      return fullConfig;
    }
    return {
      model: null,
      provider: this.currentProvider
    };
  }


  getClient() {
    const client = this.providers[this.currentProvider];
    if (!client) {
      throw new Error(`No client available for provider: ${this.currentProvider}`);
    }
    return client;
  }
}

module.exports = AIProviderManager;
