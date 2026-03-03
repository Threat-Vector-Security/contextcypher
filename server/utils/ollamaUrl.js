const { URL } = require('url');

const DEFAULT_ALLOWED_OLLAMA_HOSTS = ['127.0.0.1', 'localhost', '::1'];

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
}

function getAllowedOllamaHosts() {
  const envHosts = (process.env.OLLAMA_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => normalizeHost(host))
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_OLLAMA_HOSTS, ...envHosts]);
}

function validateOllamaBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    return { valid: false, error: 'Base URL is required for local LLM' };
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (error) {
    return { valid: false, error: 'Base URL must be a valid URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Base URL must use HTTP or HTTPS' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Base URL must not include credentials' };
  }

  const normalizedHost = normalizeHost(parsed.hostname);
  const allowedHosts = getAllowedOllamaHosts();

  if (!allowedHosts.has(normalizedHost)) {
    return {
      valid: false,
      error: `Ollama host "${normalizedHost}" is not allowed`,
      allowedHosts: Array.from(allowedHosts)
    };
  }

  return { valid: true, parsed };
}

function safeOllamaUrl(baseUrl, endpointPath) {
  const validation = validateOllamaBaseUrl(baseUrl);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (typeof endpointPath !== 'string' || !endpointPath.startsWith('/api/')) {
    throw new Error('Invalid Ollama API path');
  }

  const origin = `${validation.parsed.protocol}//${validation.parsed.host}`;
  return new URL(endpointPath, origin).toString();
}

module.exports = {
  safeOllamaUrl,
  validateOllamaBaseUrl,
  getAllowedOllamaHosts
};
