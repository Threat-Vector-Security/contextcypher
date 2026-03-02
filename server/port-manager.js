const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');

/**
 * Port management utilities for coordinating between server and Tauri
 * FIXED VERSION: Writes port file to correct location in production
 */

// Get the correct port file path based on environment
function getPortFilePath() {
  if (process.env.NODE_ENV === 'production' || process.env.FORCE_PRODUCTION === 'true') {
    // In production, prefer APP_DATA_DIR from Tauri
    let appDataPath;
    
    if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim().length > 0) {
      // Use the app data dir provided by Tauri
      appDataPath = process.env.APP_DATA_DIR;
      console.log('Using APP_DATA_DIR from environment:', appDataPath);
    } else {
      // Fallback to system paths
      const appData = process.env.LOCALAPPDATA || 
                     process.env.APPDATA || 
                     path.join(os.homedir(), 'AppData', 'Local');
      appDataPath = path.join(appData, 'ContextCypher');
      console.log('Using fallback app data path:', appDataPath);
    }
    
    // Ensure directory exists (skip on Vercel)
    if (!process.env.IS_VERCEL && !process.env.VERCEL && !fs.existsSync(appDataPath)) {
      console.log('Creating app data directory:', appDataPath);
      fs.mkdirSync(appDataPath, { recursive: true });
    }
    
    // Return ContextCypher location
    const portFilePath = path.join(appDataPath, '.current-port');
    console.log('Port file path:', portFilePath);
    return [portFilePath];
  } else {
    // Development mode - use project root
    return [path.join(__dirname, '..', '.current-port')];
  }
}

/**
 * Write the current server port to file(s)
 */
function writePortFile(port) {
  // Skip port file writing on Vercel
  if (process.env.IS_VERCEL || process.env.VERCEL) {
    console.log('Skipping port file write on Vercel');
    return;
  }
  
  console.log('\n=== WRITING PORT FILE ===');
  console.log('Port:', port);
  console.log('PID:', process.pid);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('FORCE_PRODUCTION:', process.env.FORCE_PRODUCTION);
  console.log('APP_DATA_DIR:', process.env.APP_DATA_DIR);
  
  const paths = getPortFilePath();
  const portInfo = {
    port: port,
    pid: process.pid,
    timestamp: new Date().toISOString()
  };
  
  console.log('Port file paths:', paths);
  
  paths.forEach(portFile => {
    try {
      // Ensure parent directory exists (skip on Vercel)
      const dir = path.dirname(portFile);
      if (!process.env.IS_VERCEL && !process.env.VERCEL && !fs.existsSync(dir)) {
        console.log('Creating directory:', dir);
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(portFile, JSON.stringify(portInfo, null, 2));
      console.log(`✅ Port information written to ${portFile}`);
      
      // Verify the file was written
      if (fs.existsSync(portFile)) {
        const written = fs.readFileSync(portFile, 'utf8');
        console.log('Verified port file contents:', written);
      }
    } catch (error) {
      console.error(`❌ Failed to write port file to ${portFile}:`, error);
      console.error('Error stack:', error.stack);
    }
  });
  
  // Also write to temp file for MSI launcher (Windows only)
  if (process.platform === 'win32') {
    try {
      const tempPortFile = path.join(os.tmpdir(), 'contextcypher-port.txt');
      // Write just the port number for simple batch file reading
      fs.writeFileSync(tempPortFile, port.toString());
      console.log(`✅ Port number written to temp file: ${tempPortFile}`);
    } catch (error) {
      console.error('Failed to write temp port file for MSI launcher:', error);
      // Non-critical error - don't throw
    }
  }
  
  console.log('=========================\n');
}

/**
 * Read the current port from file
 */
function readPortFile() {
  const paths = getPortFilePath();
  
  // Try each path until we find a valid port file
  for (const portFile of paths) {
    try {
      if (fs.existsSync(portFile)) {
        const content = fs.readFileSync(portFile, 'utf8');
        const parsed = JSON.parse(content);
        console.log(`Read port info from ${portFile}:`, parsed);
        return parsed;
      }
    } catch (error) {
      console.error(`Failed to read port file from ${portFile}:`, error);
    }
  }
  
  // Also check legacy location in development
  if (process.env.NODE_ENV !== 'production') {
    const legacyPath = path.join(__dirname, '..', '.current-port');
    try {
      if (fs.existsSync(legacyPath)) {
        const content = fs.readFileSync(legacyPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      // Ignore
    }
  }
  
  return null;
}

/**
 * Remove the port file (when server shuts down)
 */
function removePortFile() {
  const paths = getPortFilePath();
  
  paths.forEach(portFile => {
    try {
      if (fs.existsSync(portFile)) {
        fs.unlinkSync(portFile);
        console.log(`Port file removed: ${portFile}`);
      }
    } catch (error) {
      console.error(`Failed to remove port file ${portFile}:`, error);
    }
  });
  
  // Also remove temp file for MSI launcher (Windows only)
  if (process.platform === 'win32') {
    try {
      const tempPortFile = path.join(os.tmpdir(), 'contextcypher-port.txt');
      if (fs.existsSync(tempPortFile)) {
        fs.unlinkSync(tempPortFile);
        console.log(`Temp port file removed: ${tempPortFile}`);
      }
    } catch (error) {
      console.error('Failed to remove temp port file for MSI launcher:', error);
      // Non-critical error - don't throw
    }
  }
}

/**
 * Check if a process is running
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a port is in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port, '127.0.0.1'); // Bind to localhost only
  });
}

/**
 * Find an available port starting from the preferred port
 */
async function findAvailablePort(preferredPort = 3001, maxAttempts = 10) {
  // In development, ignore stale port files and scan for a free port.
  // Only honor an existing port file in production.
  if (process.env.NODE_ENV === 'production') {
    const existingPortInfo = readPortFile();
    if (existingPortInfo && isProcessRunning(existingPortInfo.pid)) {
      const inUse = await isPortInUse(existingPortInfo.port);
      if (inUse) {
        console.log(`Server already running on port ${existingPortInfo.port} (PID: ${existingPortInfo.pid})`);
        return existingPortInfo.port;
      }
    }
  }

  // Try to find an available port
  for (let port = preferredPort; port < preferredPort + maxAttempts; port++) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return port;
    }
    console.log(`Port ${port} is in use, trying next...`);
  }

  throw new Error(`No available ports found in range ${preferredPort}-${preferredPort + maxAttempts - 1}`);
}

/**
 * Get all possible server URLs for the frontend to try
 */
function getPossibleServerUrls() {
  const ports = [3001, 3002, 3003, 3004, 3005];
  return ports.map(port => `http://localhost:${port}`);
}

module.exports = {
  writePortFile,
  readPortFile,
  removePortFile,
  isProcessRunning,
  isPortInUse,
  findAvailablePort,
  getPossibleServerUrls
};
