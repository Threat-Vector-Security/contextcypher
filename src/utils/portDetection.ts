// Port detection utilities for the browser frontend
// No Tauri dependencies
import { isVercelDeployment } from './vercelDetection';
import { getFrontendAppSecret } from './appSecret';

const DEFAULT_PORT = 3002;
const POSSIBLE_PORTS = [3002, 3001, 3003, 3004, 3005];

// Get base URL from environment or default to localhost
const BASE_URL = process.env.REACT_APP_API_URL 
  ? process.env.REACT_APP_API_URL.replace(/:\d+$/, '') // Remove port if present
  : 'http://localhost';

export interface ServerInfo {
  port: number;
  url: string;
  status: 'ok' | 'error';
  secret?: string;
}

/**
 * Check if a server is running on a specific port
 */
async function checkPort(port: number): Promise<ServerInfo | null> {
  const url = `${BASE_URL}:${port}`;
  console.log(`Checking port ${port} at ${url}/api/health`);
  
  try {
    const headers = { 
      'Content-Type': 'application/json',
      'X-App-Secret': getFrontendAppSecret()
    };
    
    const response = await fetch(`${url}/api/health`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(1500)
    });
    
    console.log(`Response status for port ${port}:`, response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Health check response data:', data);
      // Server might return the actual port it's running on
      const actualPort = data.port || port;
      console.log(`Server health check successful on port ${actualPort}`);
      return {
        port: actualPort,
        url: `${BASE_URL}:${actualPort}`,
        status: 'ok'
      };
    } else {
      console.warn(`Health check failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(`Port ${port} check failed:`, error);
    // Port not available or server not responding
    // This is expected if the server is not on this port
  }
  
  return null;
}

/**
 * Detect which port the server is running on
 */
export async function detectServerPort(): Promise<ServerInfo> {
  console.log('Starting server port detection...');
  console.log('Environment:', process.env.NODE_ENV);
  
  // Check if we're on Vercel deployment
  if (isVercelDeployment()) {
    console.log('Vercel deployment detected - using serverless functions');
    return {
      port: 443, // HTTPS port
      url: '', // Use relative URLs for Vercel
      status: 'ok'
    };
  }
  
  console.log('Browser mode: Yes');
  
  // In browser mode, scan through possible ports
  for (const port of POSSIBLE_PORTS) {
    const serverInfo = await checkPort(port);
    if (serverInfo) {
      console.log(`Server detected on port ${serverInfo.port}`);
      
      // Store the detected port for future use
      sessionStorage.setItem('contextcypher_server_port', serverInfo.port.toString());
      
      return serverInfo;
    }
  }
  
  // Check if we have a previously detected port
  const storedPort = sessionStorage.getItem('contextcypher_server_port');
  if (storedPort) {
    const port = parseInt(storedPort, 10);
    console.log(`Using previously detected port: ${port}`);
    return {
      port,
      url: `${BASE_URL}:${port}`,
      status: 'ok'
    };
  }
  
  // Fallback to default if no server found
  console.warn(`No active server found on ports [${POSSIBLE_PORTS.join(', ')}]. Falling back to default.`);
  return {
    port: DEFAULT_PORT,
    url: `${BASE_URL}:${DEFAULT_PORT}`,
    status: 'error'
  };
}

/**
 * Get the current server URL with retry logic
 */
export async function getServerUrl(): Promise<string> {
  const serverInfo = await detectServerPort();
  return serverInfo.url;
}

/**
 * Clear cached server port (useful for reconnection)
 */
export function clearCachedPort(): void {
  sessionStorage.removeItem('contextcypher_server_port');
}
