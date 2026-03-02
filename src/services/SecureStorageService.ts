// Browser-based Secure Storage Service using Web Crypto API
// Implements encryption for sensitive data storage in browser

export interface SecureData {
  provider?: string;
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  timestamp?: number;
}

export interface AllProvidersData {
  openai?: SecureData;
  anthropic?: SecureData;
  gemini?: SecureData;
  lastProvider?: string;
  timestamp?: number;
  [key: string]: SecureData | string | number | undefined;
}

class SecureStorageService {
  private static instance: SecureStorageService;
  private readonly STORAGE_KEY = 'contextcypher_secure';
  private readonly ALL_PROVIDERS_KEY = 'contextcypher_all_providers';
  private readonly SALT_KEY = 'contextcypher_salt';
  private cryptoKey: CryptoKey | null = null;
  
  private constructor() {
    console.log('[SecureStorage] Browser-based secure storage initialized');
  }
  
  static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService();
    }
    return SecureStorageService.instance;
  }
  
  // Derive encryption key from a passphrase (uses browser fingerprint)
  private async deriveKey(): Promise<CryptoKey> {
    if (this.cryptoKey) {
      return this.cryptoKey;
    }
    
    // Generate or retrieve salt
    let salt: Uint8Array;
    const storedSalt = localStorage.getItem(this.SALT_KEY);
    if (storedSalt) {
      salt = Uint8Array.from(atob(storedSalt), c => c.charCodeAt(0));
    } else {
      salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem(this.SALT_KEY, btoa(String.fromCharCode.apply(null, Array.from(salt))));
    }
    
    // Use a combination of browser info as passphrase
    const passphrase = [
      navigator.userAgent,
      navigator.language,
      navigator.hardwareConcurrency,
      window.screen.width,
      window.screen.height,
      new Date().getTimezoneOffset()
    ].join('|');
    
    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    this.cryptoKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    return this.cryptoKey;
  }
  
  // Encrypt data
  private async encrypt(data: string): Promise<string> {
    try {
      const key = await this.deriveKey();
      const encoder = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encoder.encode(data)
      );
      
      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);
      
      // Convert to base64 for storage
      return btoa(String.fromCharCode.apply(null, Array.from(combined)));
    } catch (error) {
      console.error('[SecureStorage] Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }
  
  // Decrypt data
  private async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.deriveKey();
      const decoder = new TextDecoder();
      
      // Convert from base64
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encrypted
      );
      
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('[SecureStorage] Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }
  
  // Store API keys securely
  async storeApiKeys(data: SecureData): Promise<void> {
    try {
      console.log('[SecureStorage] Storing API keys for provider:', data.provider);
      
      // Get existing data
      const allData = await this.getAllProvidersData() || {};
      console.log('[SecureStorage] Existing data before update:', allData);
      
      // Update the specific provider
      if (data.provider) {
        allData[data.provider as keyof AllProvidersData] = {
          ...data,
          timestamp: Date.now()
        };
        allData.lastProvider = data.provider;
        allData.timestamp = Date.now();
        console.log('[SecureStorage] Updated data for provider:', data.provider, allData[data.provider as keyof AllProvidersData]);
      }
      
      const jsonData = JSON.stringify(allData);
      console.log('[SecureStorage] Data to encrypt:', jsonData);
      const encrypted = await this.encrypt(jsonData);
      localStorage.setItem(this.ALL_PROVIDERS_KEY, encrypted);
      console.log('[SecureStorage] Encrypted data stored in localStorage key:', this.ALL_PROVIDERS_KEY);
      
      // Keep single provider storage for backward compatibility
      const singleData = JSON.stringify({
        ...data,
        timestamp: Date.now()
      });
      const singleEncrypted = await this.encrypt(singleData);
      localStorage.setItem(this.STORAGE_KEY, singleEncrypted);
      
      console.log('[SecureStorage] API keys stored successfully');
      
      // Verify storage
      const verifyData = localStorage.getItem(this.ALL_PROVIDERS_KEY);
      console.log('[SecureStorage] Verification - data exists in localStorage:', !!verifyData);
    } catch (error) {
      console.error('[SecureStorage] Failed to store API keys:', error);
      throw error;
    }
  }
  
  // Retrieve API keys
  async getApiKeys(): Promise<SecureData | null> {
    try {
      const encrypted = localStorage.getItem(this.STORAGE_KEY);
      if (!encrypted) {
        console.log('[SecureStorage] No stored API keys found');
        return null;
      }
      
      const decrypted = await this.decrypt(encrypted);
      const data = JSON.parse(decrypted) as SecureData;
      
      console.log('[SecureStorage] Retrieved API keys for provider:', data.provider);
      return data;
    } catch (error) {
      console.error('[SecureStorage] Failed to retrieve API keys:', error);
      // If decryption fails, clear corrupted data
      localStorage.removeItem(this.STORAGE_KEY);
      return null;
    }
  }
  
  // Get all providers data
  async getAllProvidersData(): Promise<AllProvidersData | null> {
    try {
      console.log('[SecureStorage] Getting all providers data from key:', this.ALL_PROVIDERS_KEY);
      const encrypted = localStorage.getItem(this.ALL_PROVIDERS_KEY);
      console.log('[SecureStorage] Found encrypted data:', !!encrypted);
      
      if (!encrypted) {
        console.log('[SecureStorage] No data in ALL_PROVIDERS_KEY, checking single provider storage');
        // Try to migrate from single provider storage
        const singleData = await this.getApiKeys();
        if (singleData && singleData.provider) {
          console.log('[SecureStorage] Migrating from single provider storage');
          const allData: AllProvidersData = {
            [singleData.provider]: singleData,
            lastProvider: singleData.provider,
            timestamp: Date.now()
          };
          return allData;
        }
        return null;
      }
      
      const decrypted = await this.decrypt(encrypted);
      const data = JSON.parse(decrypted) as AllProvidersData;
      
      console.log('[SecureStorage] Retrieved all providers data');
      return data;
    } catch (error) {
      console.error('[SecureStorage] Failed to retrieve all providers data:', error);
      // If decryption fails, clear corrupted data
      localStorage.removeItem(this.ALL_PROVIDERS_KEY);
      return null;
    }
  }
  
  // Clear stored API keys
  async clearApiKeys(): Promise<void> {
    console.log('[SecureStorage] Clearing stored API keys');
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.ALL_PROVIDERS_KEY);
    this.cryptoKey = null;
  }
  
  // Check if we have stored keys
  hasStoredKeys(): boolean {
    return localStorage.getItem(this.STORAGE_KEY) !== null || 
           localStorage.getItem(this.ALL_PROVIDERS_KEY) !== null;
  }
  
  // Compatibility methods for existing code
  async initialize(): Promise<boolean> {
    // Browser storage is always ready
    await this.migrateFromPlainStorage();
    return true;
  }
  
  async storeAPIKey(provider: string, apiKey: string, additionalData?: { organizationId?: string; projectId?: string }): Promise<boolean> {
    try {
      await this.storeApiKeys({ 
        provider, 
        apiKey,
        organizationId: additionalData?.organizationId,
        projectId: additionalData?.projectId
      });
      return true;
    } catch (error) {
      console.error('[SecureStorage] Failed to store API key:', error);
      return false;
    }
  }
  
  // Get the last used provider
  async getLastProvider(): Promise<string | null> {
    try {
      const allData = await this.getAllProvidersData();
      return allData?.lastProvider || null;
    } catch (error) {
      console.error('[SecureStorage] Failed to get last provider:', error);
      return null;
    }
  }
  
  // Get additional data for a provider
  async getProviderData(provider: string): Promise<SecureData | null> {
    try {
      const allData = await this.getAllProvidersData();
      if (!allData) return null;
      
      return allData[provider as keyof AllProvidersData] as SecureData || null;
    } catch (error) {
      console.error('[SecureStorage] Failed to get provider data:', error);
      return null;
    }
  }
  
  async retrieveAllAPIKeys(): Promise<Record<string, string>> {
    try {
      const allData = await this.getAllProvidersData();
      console.log('[SecureStorage] retrieveAllAPIKeys - allData:', allData);
      if (!allData) {
        console.log('[SecureStorage] No data found in storage');
        return {};
      }
      
      const result: Record<string, string> = {};
      
      // Extract API keys from all providers
      const providers: (keyof AllProvidersData)[] = ['openai', 'anthropic', 'gemini'];
      
      for (const provider of providers) {
        const providerData = allData[provider];
        console.log(`[SecureStorage] Provider ${provider} data:`, providerData);
        if (providerData && typeof providerData === 'object' && 'apiKey' in providerData && providerData.apiKey) {
          result[provider] = providerData.apiKey;
          console.log(`[SecureStorage] Found API key for ${provider}`);
        }
      }
      
      console.log('[SecureStorage] Final result:', result);
      return result;
    } catch (error) {
      console.error('[SecureStorage] Failed to retrieve API keys:', error);
      return {};
    }
  }
  
  async clearAPIKey(provider: string): Promise<boolean> {
    try {
      const allData = await this.getAllProvidersData();
      if (!allData) return true;
      
      // Remove the specific provider
      delete allData[provider as keyof AllProvidersData];
      
      // Update storage
      if (Object.keys(allData).length > 2) { // More than just lastProvider and timestamp
        const jsonData = JSON.stringify(allData);
        const encrypted = await this.encrypt(jsonData);
        localStorage.setItem(this.ALL_PROVIDERS_KEY, encrypted);
      } else {
        // No providers left, clear everything
        await this.clearApiKeys();
      }
      
      return true;
    } catch (error) {
      console.error('[SecureStorage] Failed to clear API key:', error);
      return false;
    }
  }
  
  async clearAllAPIKeys(): Promise<boolean> {
    await this.clearApiKeys();
    return true;
  }
  
  // Migrate from old storage format if needed
  async migrateFromPlainStorage(): Promise<void> {
    // Check for old unencrypted storage
    const oldKeys = ['openai_api_key', 'anthropic_api_key', 'gemini_api_key'];
    let migrated = false;
    
    for (const key of oldKeys) {
      const value = localStorage.getItem(key);
      if (value) {
        console.log(`[SecureStorage] Migrating ${key} to secure storage`);
        
        const provider = key.replace('_api_key', '').replace('gemini', 'google');
        await this.storeAPIKey(provider, value);
        
        // Remove old key
        localStorage.removeItem(key);
        migrated = true;
      }
    }
    
    if (migrated) {
      console.log('[SecureStorage] Migration completed');
    }
  }
}

// Export singleton instance
export const secureStorage = SecureStorageService.getInstance();

// Initialize on load
(async () => {
  try {
    await secureStorage.initialize();
    console.log('[SecureStorage] Service initialized successfully');
  } catch (error) {
    console.error('[SecureStorage] Failed to initialize:', error);
  }
})();