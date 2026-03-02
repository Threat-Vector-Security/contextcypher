// Connection Manager for browser-based architecture
import { getFrontendAppSecret } from '../utils/appSecret';

export interface ConnectionStatus {
  connected: boolean;
  retrying: boolean;
  lastError?: string;
  retryCount: number;
  serverUrl?: string;
  isInitialStartup?: boolean;
}

type ConnectionCallback = (status: ConnectionStatus) => void;

class ConnectionManager {
  private static instance: ConnectionManager;
  private status: ConnectionStatus = {
    connected: false, // Start disconnected until verified
    retrying: false,
    retryCount: 0
  };
  private callbacks: Set<ConnectionCallback> = new Set();
  private retryTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private restartInProgress = false;
  private isInitialStartup = true; // Track if this is the first connection attempt
  private readonly MAX_RETRIES = 10; // Increased for automatic reconnection
  private readonly INITIAL_RETRY_DELAY = 1000; // 1 second - faster initial retry
  private readonly MAX_RETRY_DELAY = 10000; // 10 seconds - don't wait too long
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds - more frequent to keep server alive
  private readonly INITIAL_HEALTH_CHECK_INTERVAL = 5000; // 5 seconds - very frequent initially
  private readonly RESTART_AFTER_ATTEMPTS = 2; // Restart server after just 2 failed attempts
  private healthCheckCount = 0; // Track number of health checks
  
  private constructor() {
    // Start initial connection attempt immediately
    console.log('[ConnectionManager] Initializing - starting initial server detection...');
    this.performInitialConnection();
  }
  
  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }
  
  // Browser-based port detection without Tauri
  private async resolveServerUrl(): Promise<string> {
    // Dynamic import to break circular dependency with api.ts
    const { detectServerPort } = await import('../api');
    return await detectServerPort();
  }

  // Probe health with timeout
  private async probeHealth(serverUrl: string, timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${serverUrl}/api/health`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'X-App-Secret': getFrontendAppSecret()
        },
        signal: controller.signal
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  // Subscribe to connection status changes
  subscribe(callback: ConnectionCallback): () => void {
    this.callbacks.add(callback);
    // Immediately notify of current status
    callback(this.status);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }
  
  private notifySubscribers() {
    this.callbacks.forEach(callback => callback(this.status));
  }
  
  private updateStatus(updates: Partial<ConnectionStatus>) {
    const prev = this.status;
    const next = { ...prev, ...updates };
    const changed = (Object.keys(updates) as (keyof ConnectionStatus)[]).some(
      k => prev[k] !== next[k]
    );
    if (!changed) return;
    this.status = next;
    this.notifySubscribers();
  }
  
  private async performInitialConnection() {
    console.log('[ConnectionManager] Starting initial connection to backend server...');
    this.isInitialStartup = true;
    
    try {
      const serverUrl = await this.resolveServerUrl();
      console.log('[ConnectionManager] Initial server URL resolved to:', serverUrl);
      
      this.updateStatus({
        connected: true,
        retrying: false,
        serverUrl: serverUrl,
        retryCount: 0,
        isInitialStartup: true
      });
      
      // Start health checks after successful initial connection
      this.startHealthChecks();
      
      // Mark initial startup as complete after first successful connection
      setTimeout(() => {
        this.isInitialStartup = false;
        this.updateStatus({ ...this.status, isInitialStartup: false });
      }, 2000);
      
    } catch (error) {
      console.error('[ConnectionManager] Initial connection failed:', error);
      this.updateStatus({
        connected: false,
        retrying: true,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        isInitialStartup: true
      });
      
      // Start retry attempts
      this.startRetrying();
    }
  }
  
  private startRetrying() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    
    const attemptReconnect = async () => {
      if (this.status.retryCount >= this.MAX_RETRIES) {
        console.error('[ConnectionManager] Max retries reached, giving up');
        this.updateStatus({
          retrying: false,
          lastError: 'Max connection retries exceeded'
        });
        return;
      }
      
      console.log(`[ConnectionManager] Retry attempt ${this.status.retryCount + 1}/${this.MAX_RETRIES}`);
      this.updateStatus({
        retrying: true,
        retryCount: this.status.retryCount + 1
      });
      
      try {
        const serverUrl = await this.resolveServerUrl();
        console.log('[ConnectionManager] Reconnected to server at:', serverUrl);
        
        this.updateStatus({
          connected: true,
          retrying: false,
          serverUrl: serverUrl,
          retryCount: 0,
          lastError: undefined
        });
        
        // Resume health checks
        this.startHealthChecks();
        
      } catch (error) {
        console.error('[ConnectionManager] Reconnection failed:', error);
        
        // Check if we should try server restart (browser mode doesn't support this)
        if (this.status.retryCount >= this.RESTART_AFTER_ATTEMPTS && !this.restartInProgress) {
          console.log('[ConnectionManager] In browser mode - server restart must be done manually');
        }
        
        const delay = Math.min(
          this.INITIAL_RETRY_DELAY * Math.pow(2, this.status.retryCount - 1),
          this.MAX_RETRY_DELAY
        );
        
        console.log(`[ConnectionManager] Retrying in ${delay}ms...`);
        
        this.retryTimer = setTimeout(() => {
          attemptReconnect();
        }, delay);
      }
    };
    
    // Start first retry attempt
    attemptReconnect();
  }
  
  private startHealthChecks() {
    // Clear any existing health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    // Use more frequent checks initially, then slow down
    const interval = this.healthCheckCount < 10 
      ? this.INITIAL_HEALTH_CHECK_INTERVAL 
      : this.HEALTH_CHECK_INTERVAL;
    
    console.log(`[ConnectionManager] Starting health checks every ${interval}ms`);
    
    this.healthCheckTimer = setInterval(async () => {
      if (!this.status.connected || !this.status.serverUrl) {
        return;
      }
      
      this.healthCheckCount++;
      
      try {
        const serverUrl = this.status.serverUrl;
        const healthy = await this.probeHealth(serverUrl, 5000);
        
        if (!healthy) {
          console.error('[ConnectionManager] Health check failed - server not responding');
          this.updateStatus({
            connected: false,
            retrying: true,
            lastError: 'Health check failed',
            retryCount: 0
          });
          
          // Clear health check timer
          if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
          }
          
          // Start retry process
          this.startRetrying();
        } else {
          // Successful health check
          if (this.healthCheckCount % 10 === 0) {
            console.log(`[ConnectionManager] Health check #${this.healthCheckCount} successful`);
          }
          
          // If we were in initial frequent checks, switch to normal interval
          if (this.healthCheckCount === 10) {
            console.log('[ConnectionManager] Switching to normal health check interval');
            this.startHealthChecks(); // Restart with normal interval
          }
        }
      } catch (error) {
        console.error('[ConnectionManager] Health check error:', error);
      }
    }, interval);
  }
  
  getStatus(): ConnectionStatus {
    return { ...this.status };
  }
  
  isConnected(): boolean {
    return this.status.connected;
  }
  
  getServerUrl(): string | undefined {
    return this.status.serverUrl;
  }
  
  // Force a reconnection attempt
  async reconnect(): Promise<void> {
    console.log('[ConnectionManager] Manual reconnection requested');
    
    // Clear any existing timers
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    
    // Reset status
    this.updateStatus({
      connected: false,
      retrying: true,
      retryCount: 0,
      lastError: undefined
    });
    
    // Attempt connection
    try {
      const serverUrl = await this.resolveServerUrl();
      console.log('[ConnectionManager] Manual reconnection successful:', serverUrl);
      
      this.updateStatus({
        connected: true,
        retrying: false,
        serverUrl: serverUrl,
        retryCount: 0
      });
      
      // Start health checks
      this.startHealthChecks();
      
    } catch (error) {
      console.error('[ConnectionManager] Manual reconnection failed:', error);
      this.updateStatus({
        lastError: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Start automatic retry
      this.startRetrying();
      throw error;
    }
  }
  
  // Handle connection errors from external sources
  handleConnectionError(error: Error) {
    console.error('[ConnectionManager] Connection error reported:', error);
    
    // Update status to disconnected
    this.updateStatus({
      connected: false,
      lastError: error.message
    });
    
    // Start retry process if not already retrying
    if (!this.status.retrying && !this.retryTimer) {
      this.startRetrying();
    }
  }
  
  // Clean up resources
  destroy() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    this.callbacks.clear();
  }
}

// Export singleton instance
export const connectionManager = ConnectionManager.getInstance();

// Also export the class as default for dynamic imports
export default ConnectionManager;
