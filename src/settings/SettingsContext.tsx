//settingscontext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppSettings, APISettings, SettingsContextType, APICredentials, AIProvider } from '../types/SettingsTypes';
import { defaultSettings, loadSettings, saveSettings } from './settings';
import { chatHistoryLogger } from '../services/ChatHistoryLogger';
import { updateAIProvider } from '../services/settingsApi';
import { secureStorage as SecureStorageService } from '../services/SecureStorageService';
import { licenseService } from '../services/LicenseService';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [credentials, setCredentials] = useState<APICredentials>({
    apiKeys: {},
    activeKeys: new Set()
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // Load settings from localStorage on component mount
  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        console.log('Loading settings from localStorage for offline mode');
        const userSettings = loadSettings();
        console.log('Loaded settings:', userSettings);
        setSettings(userSettings);
        
        // Theme checking is now handled in App.tsx when license-check-complete event fires
        // This ensures proper timing and state updates
        
        // Initialize variable to hold stored keys
        let storedKeys: Partial<Record<AIProvider, string>> = {};
        
        // Initialize secure storage and load stored API keys if enabled
        console.log('[SettingsContext] Secure storage check:', {
          enabled: userSettings.secureStorage?.enabled,
          userSettingsObject: userSettings,
          willAttemptInit: userSettings.secureStorage?.enabled !== false
        });
        
        if (userSettings.secureStorage?.enabled !== false) { // Default to true if not set
          try {
            console.log('[SettingsContext] Initializing secure storage for API keys...');
            console.log('[SettingsContext] Browser mode enabled');
            console.log('[SettingsContext] Calling SecureStorageService.initialize()...');
            const initialized = await SecureStorageService.initialize();
            
            if (initialized) {
              console.log('Secure storage initialized successfully');
              
              // Load all stored API keys
              storedKeys = await SecureStorageService.retrieveAllAPIKeys();
              console.log('Found stored API keys for providers:', Object.keys(storedKeys));
              
              // Update credentials with stored keys
              if (Object.keys(storedKeys).length > 0) {
                setCredentials(prev => {
                  // Convert Set to Array, add new keys, then back to Set
                  const currentKeys = Array.from(prev.activeKeys);
                  const newKeys = Object.keys(storedKeys) as AIProvider[];
                  const combinedKeys = [...currentKeys, ...newKeys];
                  return {
                    ...prev,
                    apiKeys: { ...prev.apiKeys, ...storedKeys },
                    activeKeys: new Set(combinedKeys)
                  };
                });
                console.log('API keys loaded from secure storage');
              }
            } else {
              console.warn('Failed to initialize secure storage - API keys will not persist');
            }
          } catch (storageError) {
            console.error('Error with secure storage:', storageError);
            // Continue without secure storage - keys will be session-only
          }
        } else {
          console.log('[SettingsContext] Secure storage is disabled by user preference');
        }
        
        // Auto-sync AI provider settings with server on startup
        if (userSettings.api.llmMode === 'local') {
          try {
            console.log('Auto-syncing local LLM settings with server on startup');
            const syncResult = await updateAIProvider({
              provider: 'local',
              baseUrl: userSettings.api.localLLM.baseUrl,
              model: userSettings.api.localLLM.model,
              temperature: userSettings.api.localLLM.temperature,
              maxTokens: userSettings.api.localLLM.maxTokens
            });
            
            if (syncResult.success) {
              console.log('Local LLM settings synced successfully with server');
            } else {
              console.warn('Failed to sync local LLM settings with server:', syncResult.message);
            }
          } catch (syncError) {
            console.warn('Error syncing local LLM settings with server:', syncError);
          }
        } else if (userSettings.api.llmMode === 'public' && storedKeys[userSettings.api.provider as AIProvider]) {
          // Also sync public AI provider if we have a stored API key
          try {
            console.log(`Auto-syncing ${userSettings.api.provider} with stored API key on startup`);
            const syncResult = await updateAIProvider({
              provider: userSettings.api.provider,
              apiKey: storedKeys[userSettings.api.provider as AIProvider],
              ...(userSettings.api.provider === 'openai' && userSettings.api.providerConfig?.openai && {
                organizationId: userSettings.api.providerConfig.openai.organizationId,
                model: userSettings.api.providerConfig.openai.model || 'gpt-4o-2024-08-06',
                reasoningEffort: userSettings.api.providerConfig.openai.reasoningEffort
              }),
              ...(userSettings.api.provider === 'gemini' && userSettings.api.providerConfig?.gemini && {
                projectId: userSettings.api.providerConfig.gemini.projectId,
                model: userSettings.api.providerConfig.gemini.model || 'gemini-2.5-pro'
              }),
              ...(userSettings.api.provider === 'anthropic' && userSettings.api.providerConfig?.anthropic && {
                model: userSettings.api.providerConfig.anthropic.model || 'claude-sonnet-4-20250514'
              })
            });
            
            if (syncResult.success) {
              console.log(`${userSettings.api.provider} synced successfully with server`);
            } else {
              console.warn(`Failed to sync ${userSettings.api.provider} with server:`, syncResult.message);
            }
          } catch (syncError) {
            console.warn(`Error syncing ${userSettings.api.provider} with server:`, syncError);
          }
        }
        
        // Initialize chat history logger with settings
        if (userSettings.chatHistoryLogging) {
          await chatHistoryLogger.initialize({
            enabled: userSettings.chatHistoryLogging.enabled,
            logFilePath: userSettings.chatHistoryLogging.logFilePath
          });
          
          // Start new session on app startup
          if (userSettings.chatHistoryLogging.enabled) {
            chatHistoryLogger.startNewSession();
          }
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        // Fallback to default settings on error
        setSettings(defaultSettings);
        
        // Initialize logger with default settings
        if (defaultSettings.chatHistoryLogging) {
          await chatHistoryLogger.initialize({
            enabled: defaultSettings.chatHistoryLogging.enabled,
            logFilePath: defaultSettings.chatHistoryLogging.logFilePath
          });
        }
      } finally {
        setIsInitialized(true);
      }
    };
    
    loadUserSettings();
  }, []);

  // Clean up API keys when component unmounts (app closes)
  useEffect(() => {
    return () => {
      console.log('Clearing all API keys on app close');
      setCredentials({
        apiKeys: {},
        activeKeys: new Set()
      });
    };
  }, []);



  const persistSettings = useCallback((updatedSettings: AppSettings) => {
    try {
      saveSettings(updatedSettings);
    } catch (error) {
      console.error('Error saving settings to localStorage:', error);
    }
  }, []);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev: AppSettings) => {
      const updated = {
        ...prev,
        ...newSettings,
      };
      persistSettings(updated);

      if (newSettings.chatHistoryLogging) {
        chatHistoryLogger.updateOptions({
          enabled: newSettings.chatHistoryLogging.enabled,
          logFilePath: newSettings.chatHistoryLogging.logFilePath
        });
      }

      return updated;
    });
  }, [persistSettings]);

  const updateAPISettings = useCallback((newAPISettings: Partial<APISettings>) => {
    setSettings((prev: AppSettings) => {
      const updated = {
        ...prev,
        api: {
          ...prev.api,
          ...newAPISettings,
        },
      };

      console.log('Updating API settings:', {
        previous: prev.api,
        new: newAPISettings,
        result: updated.api
      });

      persistSettings(updated);
      return updated;
    });
  }, [persistSettings]);



  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const setAPIKey = useCallback(async (provider: AIProvider, apiKey: string, additionalData?: { organizationId?: string; projectId?: string }) => {
    console.log(`Setting API key for ${provider} (memory + secure storage)`);

    setCredentials(prev => ({
      apiKeys: {
        ...prev.apiKeys,
        [provider]: apiKey
      },
      activeKeys: new Set([...Array.from(prev.activeKeys), provider])
    }));

    if (settingsRef.current.secureStorage?.enabled !== false) {
      try {
        const stored = await SecureStorageService.storeAPIKey(provider, apiKey, additionalData);
        if (stored) {
          console.log(`API key for ${provider} securely stored`);
        } else {
          console.warn(`Failed to store API key for ${provider} - will be session-only`);
        }
      } catch (error) {
        console.error(`Error storing API key for ${provider}:`, error);
      }
    }
  }, []);

  const clearAPIKey = useCallback(async (provider: AIProvider) => {
    console.log(`Clearing API key for ${provider}`);

    setCredentials(prev => {
      const newKeys = { ...prev.apiKeys };
      delete newKeys[provider];
      const newActiveKeys = new Set(prev.activeKeys);
      newActiveKeys.delete(provider);

      return {
        apiKeys: newKeys,
        activeKeys: newActiveKeys
      };
    });

    if (settingsRef.current.secureStorage?.enabled !== false) {
      try {
        const cleared = await SecureStorageService.clearAPIKey(provider);
        if (cleared) {
          console.log(`API key for ${provider} cleared from secure storage`);
        } else {
          console.warn(`Failed to clear API key for ${provider} from secure storage`);
        }
      } catch (error) {
        console.error(`Error clearing API key for ${provider}:`, error);
      }
    }
  }, []);

  const clearAllAPIKeys = useCallback(async () => {
    console.log('Clearing all API keys');

    setCredentials({
      apiKeys: {},
      activeKeys: new Set()
    });

    if (settingsRef.current.secureStorage?.enabled !== false) {
      try {
        const cleared = await SecureStorageService.clearAllAPIKeys();
        if (cleared) {
          console.log('All API keys cleared from secure storage');
        } else {
          console.warn('Failed to clear all API keys from secure storage');
        }
      } catch (error) {
        console.error('Error clearing all API keys:', error);
      }
    }
  }, []);

  const hasAPIKey = useCallback((provider: AIProvider): boolean => {
    return credentials.activeKeys.has(provider) && !!credentials.apiKeys[provider];
  }, [credentials]);

  const getAPIKey = useCallback((provider: AIProvider): string | undefined => {
    return credentials.apiKeys[provider];
  }, [credentials]);

  const contextValue = React.useMemo(() => ({
    settings,
    credentials,
    updateSettings,
    updateAPISettings,
    setAPIKey,
    clearAPIKey,
    clearAllAPIKeys,
    hasAPIKey,
    getAPIKey,
    isInitialized
  }), [settings, credentials, updateSettings, updateAPISettings, setAPIKey, clearAPIKey, clearAllAPIKeys, hasAPIKey, getAPIKey, isInitialized]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};