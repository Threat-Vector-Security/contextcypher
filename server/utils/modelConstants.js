// server/utils/modelConstants.js
// Shared constants for model token limits and configurations

// Token limits and character approximations
// Rough approximation: 1 token ≈ 4 characters (conservative estimate)
const TOKEN_TO_CHAR_RATIO = 4;

// Default token windows for different model types
// Note: For Ollama models, these are MAXIMUM supported, but default is usually 8192
const MODEL_TOKEN_LIMITS = {
  'foundation-sec': 32768,     // Foundation-Sec models can handle extended context
  'llama-2': 32768,           // Many Llama 2 variants support extended context
  'llama-3': 32768,           // Llama 3 models support even larger contexts
  'llama3.1': 128000,         // Llama 3.1 models support 128k context (but Ollama default is 8192)
  'llama3.2': 128000,         // Llama 3.2 models support 128k context (but Ollama default is 8192)
  'llama3.3': 128000,         // Llama 3.3 models - similar to 3.1 405B performance
  'mistral': 32768,           // Mistral models
  'mixtral': 32768,           // Mixtral MoE models
  'qwen': 32768,              // Qwen models
  'qwen2.5-coder': 32768,     // Qwen 2.5 Coder - good for security code analysis
  'deepseek': 32768,          // DeepSeek models
  'cybersecurity': 16384,     // CyberSecurityThreatAnalysis models (conservative estimate)
  'cybershield': 16384,       // CyberShieldAI models
  'gpt-oss': 32768,           // GPT-OSS models (20b and 120b variants)
  'gpt-3.5': 16384,           // GPT-3.5-turbo-16k 
  'gpt-4': 32768,             // GPT-4-32k
  'gpt-4-turbo': 128000,      // GPT-4 Turbo has 128k context
  'gpt-4o': 128000,           // GPT-4o has 128k context
  'gpt-4o-mini': 128000,      // GPT-4o-mini has 128k context
  'gpt-4.5': 128000,          // GPT-4.5 (if available)
  'claude': 100000,           // Claude models have large context
  'gemini': 1048576,          // Gemini 1.5 Pro supports up to 1M tokens
  'gemma': 131072,            // Gemma models (including Gemma 3:12b) support 128k context
  'gemma2': 8192,             // Gemma 2 models have 8k context by default
  'local': 131072,            // Default to 128k for modern local models
  'default': 131072           // Default to 128k context window minimum
};

// Model information for better context optimization
const getModelInfo = (modelName) => {
  const lowerModel = (modelName || '').toLowerCase();
  
  // Check for specific model patterns
  if (lowerModel.includes('llama3.2') || lowerModel.includes('llama-3.2')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['llama3.2'], type: 'local' };
  } else if (lowerModel.includes('llama3.1') || lowerModel.includes('llama-3.1')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['llama3.1'], type: 'local' };
  } else if (lowerModel.includes('llama-3') || lowerModel.includes('llama3')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['llama-3'], type: 'local' };
  } else if (lowerModel.includes('llama-2') || lowerModel.includes('llama2')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['llama-2'], type: 'local' };
  } else if (lowerModel.includes('mistral')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['mistral'], type: 'local' };
  } else if (lowerModel.includes('mixtral')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['mixtral'], type: 'local' };
  } else if (lowerModel.includes('qwen')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['qwen'], type: 'local' };
  } else if (lowerModel.includes('deepseek')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['deepseek'], type: 'local' };
  } else if (lowerModel.includes('gpt-oss')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gpt-oss'], type: 'local' };
  } else if (lowerModel.includes('gpt-4o-mini')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gpt-4o-mini'], type: 'api' };
  } else if (lowerModel.includes('gpt-4o')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gpt-4o'], type: 'api' };
  } else if (lowerModel.includes('gpt-4.5')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gpt-4.5'], type: 'api' };
  } else if (lowerModel.includes('gpt-4-turbo') || lowerModel.includes('gpt-4-1106')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gpt-4-turbo'], type: 'api' };
  } else if (lowerModel.includes('gpt-4')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gpt-4'], type: 'api' };
  } else if (lowerModel.includes('gpt-3.5')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gpt-3.5'], type: 'api' };
  } else if (lowerModel.includes('claude')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['claude'], type: 'api' };
  } else if (lowerModel.includes('gemini')) {
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gemini'], type: 'api' };
  } else if (lowerModel.includes('gemma2') || lowerModel.includes('gemma-2')) {
    // Gemma 2 models have smaller context
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gemma2'], type: 'local' };
  } else if (lowerModel.includes('gemma')) {
    // Gemma models (including Gemma 3) support 128k context
    return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['gemma'], type: 'local' };
  }

  // Default to local model with conservative limits
  return { model: modelName, maxTokens: MODEL_TOKEN_LIMITS['default'], type: 'local' };
};

module.exports = {
  TOKEN_TO_CHAR_RATIO,
  MODEL_TOKEN_LIMITS,
  getModelInfo
};