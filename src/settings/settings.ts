//settings.ts
import { AppSettings } from '../types/SettingsTypes';
import { defaultSettings as importedDefaultSettings } from './defaultSettings';

const shouldDebugLog = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
  if (shouldDebugLog) {
    console.log(...args);
  }
};

// Use the imported default settings to ensure consistency
export const defaultSettings = importedDefaultSettings;

// Load settings from localStorage
export const loadSettings = (): AppSettings => {
  const savedSettings = localStorage.getItem('settings');
  
  debugLog('Loading settings from localStorage:', savedSettings);
  
  if (!savedSettings) {
    debugLog('No saved settings found, using defaults:', defaultSettings);
    return defaultSettings;
  }
  
  // Parse saved settings
  const parsedSettings = JSON.parse(savedSettings) as Partial<AppSettings>;
  debugLog('Parsed settings:', parsedSettings);
  
  // Migrate old bundled AI settings to local LLM
  if (parsedSettings.api) {
    const legacyMode = parsedSettings.api.llmMode as string;
    if (legacyMode === 'bundled-ai' || legacyMode === 'bundled') {
      debugLog('Migrating old bundled AI settings to local LLM');
      parsedSettings.api.llmMode = 'local';
      parsedSettings.api.provider = 'local';
    }
  }
  
  // Ensure all required properties exist by merging with default settings
  const mergedSettings = {
    ...defaultSettings,
    ...parsedSettings,
    // Ensure nested objects are properly merged
    api: {
      ...defaultSettings.api,
      ...(parsedSettings.api || {}),

      localLLM: {
        ...defaultSettings.api.localLLM,
        ...(parsedSettings.api?.localLLM || {})
      },
      providerConfig: {
        ...defaultSettings.api.providerConfig,
        ...(parsedSettings.api?.providerConfig || {}),
        // Deep merge provider configurations
        openai: {
          ...defaultSettings.api.providerConfig.openai,
          ...(parsedSettings.api?.providerConfig?.openai || {})
        },
        anthropic: {
          ...defaultSettings.api.providerConfig.anthropic,
          ...(parsedSettings.api?.providerConfig?.anthropic || {})
        },
        gemini: {
          ...defaultSettings.api.providerConfig.gemini,
          ...(parsedSettings.api?.providerConfig?.gemini || {})
        }
      }
    },
    // Deep merge other nested objects
    autosave: {
      ...defaultSettings.autosave,
      ...(parsedSettings.autosave || {})
    },
    license: {
      ...defaultSettings.license,
      ...(parsedSettings.license || {})
    },
    effects: {
      ...defaultSettings.effects,
      ...(parsedSettings.effects || {})
    },
    chatHistoryLogging: {
      ...defaultSettings.chatHistoryLogging,
      ...(parsedSettings.chatHistoryLogging || {}),
      // Ensure userHasSetPreference defaults to false for existing users
      userHasSetPreference: parsedSettings.chatHistoryLogging?.userHasSetPreference ?? false
    },
    threatAnalysis: {
      ...defaultSettings.threatAnalysis,
      ...(parsedSettings.threatAnalysis || {})
    },
    secOps: {
      ...defaultSettings.secOps,
      ...(parsedSettings.secOps || {}),
      features: {
        ...defaultSettings.secOps.features,
        ...(parsedSettings.secOps?.features || {})
      },
      threatIntel: {
        ...defaultSettings.secOps.threatIntel,
        ...(parsedSettings.secOps?.threatIntel || {}),
        externalFeeds: {
          ...defaultSettings.secOps.threatIntel.externalFeeds,
          ...(parsedSettings.secOps?.threatIntel?.externalFeeds || {})
        }
      }
    },
    // Handle custom theme
    customTheme: parsedSettings.customTheme || defaultSettings.customTheme,
    // Handle snap to grid
    snapToGrid: parsedSettings.snapToGrid ?? defaultSettings.snapToGrid,
    onboarding: {
      showInitialDiagramPrompt:
        parsedSettings.onboarding?.showInitialDiagramPrompt ??
        defaultSettings.onboarding?.showInitialDiagramPrompt ??
        true,
      tutorialCompleted:
        parsedSettings.onboarding?.tutorialCompleted ??
        defaultSettings.onboarding?.tutorialCompleted ??
        false
    },
    recentDiagramFiles: Array.isArray(parsedSettings.recentDiagramFiles)
      ? parsedSettings.recentDiagramFiles
        .filter((entry: any) => entry && typeof entry.id === 'string' && typeof entry.name === 'string')
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name,
          lastOpenedAt: typeof entry.lastOpenedAt === 'string' ? entry.lastOpenedAt : new Date().toISOString()
        }))
      : (defaultSettings.recentDiagramFiles || [])
  };
  
  debugLog('Final merged settings:', mergedSettings);
  return mergedSettings;
};

// Save settings to localStorage
export const saveSettings = (settings: AppSettings): void => {
  debugLog('Saving settings to localStorage:', settings);
  localStorage.setItem('settings', JSON.stringify(settings));
};
