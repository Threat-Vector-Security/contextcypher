// Browser-based console logger that stores logs in memory and localStorage
// Replaces Tauri file system logging

const MAX_LOG_ENTRIES = 100;
const STORAGE_KEY = 'contextcypher_console_logs';
let logBuffer: string[] = [];
let isInitialized = false;

// Override console methods to capture logs
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

const SENSITIVE_PATTERN = /sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9._-]{20,}/g;
const SENSITIVE_KEYS = /api[_-]?key|secret|password|token|authorization|credential|private[_-]?key/i;

function redactString(str: string): string {
  return str.replace(SENSITIVE_PATTERN, '[REDACTED]');
}

function formatLogEntry(level: string, args: any[]): string {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        const serialized = JSON.stringify(arg, (key, value) => {
          if (key && SENSITIVE_KEYS.test(key)) return '[REDACTED]';
          return value;
        });
        if (serialized.length > 1000) {
          return `${serialized.slice(0, 1000)}... [truncated ${serialized.length - 1000} chars]`;
        }
        return serialized;
      } catch (e) {
        return String(arg);
      }
    }
    return redactString(String(arg));
  }).join(' ');

  return `[${timestamp}] [${level}] ${message}`;
}

function saveLogsToStorage() {
  try {
    // Save to localStorage for persistence
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logBuffer));
  } catch (error) {
    // Ignore storage errors (quota exceeded, etc.)
    originalConsole.error('Failed to save logs to storage:', error);
  }
}

function loadLogsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      logBuffer = JSON.parse(stored);
      // Ensure we don't exceed max entries
      if (logBuffer.length > MAX_LOG_ENTRIES) {
        logBuffer = logBuffer.slice(-MAX_LOG_ENTRIES);
      }
    }
  } catch (error) {
    originalConsole.error('Failed to load logs from storage:', error);
    logBuffer = [];
  }
}

function addToLogBuffer(entry: string) {
  logBuffer.push(entry);
  
  // Keep only last MAX_LOG_ENTRIES
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer = logBuffer.slice(-MAX_LOG_ENTRIES);
  }
  
  // Save to storage periodically (debounced)
  if (!addToLogBuffer.saveTimer) {
    addToLogBuffer.saveTimer = setTimeout(() => {
      saveLogsToStorage();
      addToLogBuffer.saveTimer = null;
    }, 1000);
  }
}

// Add type for the timer
addToLogBuffer.saveTimer = null as NodeJS.Timeout | null;

// Initialize console interceptors
export function initializeConsoleLogger() {
  if (isInitialized) return;
  
  // Load existing logs from storage
  loadLogsFromStorage();
  
  console.log = (...args: any[]) => {
    originalConsole.log(...args);
    addToLogBuffer(formatLogEntry('LOG', args));
  };
  
  console.error = (...args: any[]) => {
    originalConsole.error(...args);
    addToLogBuffer(formatLogEntry('ERROR', args));
  };
  
  console.warn = (...args: any[]) => {
    originalConsole.warn(...args);
    addToLogBuffer(formatLogEntry('WARN', args));
  };
  
  console.info = (...args: any[]) => {
    originalConsole.info(...args);
    addToLogBuffer(formatLogEntry('INFO', args));
  };
  
  console.debug = (...args: any[]) => {
    originalConsole.debug(...args);
    addToLogBuffer(formatLogEntry('DEBUG', args));
  };
  
  // Save logs on page unload
  window.addEventListener('beforeunload', () => {
    saveLogsToStorage();
  });
  
  // Log initialization with timestamp and environment info
  const initTime = new Date().toISOString();
  console.log(`[${initTime}] Browser console logger initialized`);
  console.log(`[${initTime}] Environment: ${process.env.NODE_ENV}`);
  console.log(`[${initTime}] Browser mode: Yes`);
  console.log(`[${initTime}] Logs stored in localStorage with key: ${STORAGE_KEY}`);
  
  isInitialized = true;
}

// Export function to get current logs
export function getConsoleLogs(): string[] {
  return [...logBuffer];
}

// Export function to clear logs
export function clearConsoleLogs(): void {
  logBuffer = [];
  localStorage.removeItem(STORAGE_KEY);
}

// Export function to download logs as a file
export function downloadConsoleLogs(): void {
  const logs = logBuffer.join('\n');
  const blob = new Blob([logs], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `contextcypher-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export original console for debugging
export { originalConsole };
