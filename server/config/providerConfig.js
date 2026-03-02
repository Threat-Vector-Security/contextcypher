// Provider configuration persistence for web application

const path = require('path');
const fs = require('fs');

// Simple provider-config persistence
const PROVIDER_CONFIG_PATH = path.join(__dirname, '..', 'config', 'provider-settings.json');

function loadSavedProviderConfig() {
  try {
    if (fs.existsSync(PROVIDER_CONFIG_PATH)) {
      const raw = fs.readFileSync(PROVIDER_CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load saved provider config:', err.message);
  }
  return null;
}

function saveProviderConfig(cfg) {
  // Skip saving on Vercel (read-only filesystem)
  if (process.env.IS_VERCEL || process.env.VERCEL) {
    console.log('Skipping provider config save on Vercel');
    return;
  }
  
  try {
    fs.mkdirSync(path.dirname(PROVIDER_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(PROVIDER_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save provider config:', err.message);
  }
}

module.exports = {
  loadSavedProviderConfig,
  saveProviderConfig,
  PROVIDER_CONFIG_PATH
};