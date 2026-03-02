//sanitization.js
const sensitivePatterns = [
  /(?:\d{1,3}\.){3}\d{1,3}/g,          // IP addresses
  /[\w.-]+@[\w.-]+\.\w+/g,             // Email addresses
  /password\d+/gi,                      // Passwords
  /api-key-\d+/gi,                      // API keys
  /sk-[A-Za-z0-9]{16,}/g,             // OpenAI-like secret key
  /AKIA[0-9A-Z]{16}/g,                // AWS access key id
  /[A-Za-z0-9+\/]{40,}/g,            // Generic long base64 token
  /[\w.-]+\.(?:internal|local|corp)/gi, // Internal domains
  /(?:acme|technologies|corp)/gi        // Company names
  // Version numbers and port numbers removed - they are needed for security analysis
];

function sanitizeText(text) {
  if (!text) return '';
  
  let sanitized = text;
  sensitivePatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, match => {
      if (pattern.toString().includes('\\d{1,3}\\.')) return 'x.x.x.x';
      if (pattern.toString().includes('@')) return 'user@example.com';
      if (pattern.toString().includes('password')) return '[REDACTED]';
      if (pattern.toString().includes('api-key')) return '[REDACTED]';
      if (pattern.toString().includes('internal|local|corp')) return 'example.com';
      if (pattern.toString().includes('acme|technologies|corp')) return 'COMPANY';
      return '[REDACTED]';
    });
  });
  
  return sanitized;
}

module.exports = { sanitizeText }; 