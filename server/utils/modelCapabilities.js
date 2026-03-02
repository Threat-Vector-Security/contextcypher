// Model Capabilities Detection for AI Providers
// Handles reasoning parameters and other model-specific features

const modelCapabilities = {
  // Models that support reasoning_effort parameter
  // Based on OpenAI documentation for o1 and future GPT-5 series
  REASONING_MODELS: {
    'o1': ['low', 'medium', 'high'],
    'o1-preview': ['low', 'medium', 'high'],
    'o1-mini': ['low', 'medium', 'high'],
    'gpt-5': ['minimal', 'low', 'medium', 'high'],
    'gpt-5-turbo': ['minimal', 'low', 'medium', 'high']
  },
  
  // Fallback context windows for models that may not be in API yet
  FALLBACK_CONTEXT_WINDOWS: {
    'o1': 128000,
    'o1-preview': 128000,
    'o1-mini': 128000,
    'gpt-5': 200000,  // Estimated based on trends
    'gpt-5-turbo': 200000,
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16384
  },
  
  // Fallback max output tokens for models
  FALLBACK_OUTPUT_LIMITS: {
    // OpenAI models
    'o1': 32768,
    'o1-preview': 32768,
    'o1-mini': 65536,
    'gpt-5': 32768,  // Estimated
    'gpt-5-turbo': 32768,
    'gpt-4o': 16384,
    'gpt-4o-mini': 16384,
    'gpt-4-turbo': 4096,
    'gpt-4': 4096,
    'gpt-3.5-turbo': 4096,
    // Anthropic models
    'claude-3-5-sonnet': 8192,  // 4096 default, 8192 with beta header
    'claude-3-5-haiku': 4096,
    'claude-3-opus': 4096,
    'claude-3-sonnet': 4096,
    'claude-3-haiku': 4096,
    'claude-sonnet-4': 8192,  // Claude 4 models
    'claude-opus-4': 8192,
    // Gemini models
    'gemini-1.5-pro': 8192,
    'gemini-1.5-flash': 8192,
    'gemini-2.0-flash': 8192,
    'gemini-2.5-pro': 8192,
    'gemini-pro': 2048  // Legacy model
  },
  
  // Check if model supports reasoning parameters
  supportsReasoning: function(modelName) {
    if (!modelName) return false;
    return Object.keys(this.REASONING_MODELS).some(model => 
      modelName.toLowerCase().includes(model.toLowerCase())
    );
  },
  
  // Get available reasoning levels for model
  getReasoningLevels: function(modelName) {
    if (!modelName) return null;
    
    for (const [model, levels] of Object.entries(this.REASONING_MODELS)) {
      if (modelName.toLowerCase().includes(model.toLowerCase())) {
        return levels;
      }
    }
    return null;
  },
  
  // Get fallback context window if API doesn't provide one
  getFallbackContextWindow: function(modelName) {
    if (!modelName) return null;
    
    for (const [model, contextWindow] of Object.entries(this.FALLBACK_CONTEXT_WINDOWS)) {
      if (modelName.toLowerCase().includes(model.toLowerCase())) {
        return contextWindow;
      }
    }
    return null;
  },
  
  // Get fallback output limit if API doesn't provide one
  getFallbackOutputLimit: function(modelName) {
    if (!modelName) return null;
    
    for (const [model, outputLimit] of Object.entries(this.FALLBACK_OUTPUT_LIMITS)) {
      if (modelName.toLowerCase().includes(model.toLowerCase())) {
        return outputLimit;
      }
    }
    return null;
  },
  
  // Check if model has specific capabilities
  getModelCapabilities: function(modelName) {
    return {
      supportsReasoning: this.supportsReasoning(modelName),
      reasoningLevels: this.getReasoningLevels(modelName),
      fallbackContextWindow: this.getFallbackContextWindow(modelName),
      fallbackOutputLimit: this.getFallbackOutputLimit(modelName),
      // Future capabilities can be added here
      supportsFunctionCalling: !this.supportsReasoning(modelName), // o1 models don't support function calling
      supportsStreaming: true, // Most models support streaming
      supportsSystemMessage: !modelName?.toLowerCase().includes('o1-mini'), // o1-mini has limited system message support
      // Special flags for models requiring beta headers
      requiresBetaHeader: modelName?.toLowerCase().includes('claude-3-5-sonnet')
    };
  }
};

module.exports = modelCapabilities;