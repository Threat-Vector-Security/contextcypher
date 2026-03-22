const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine log directory based on environment
function getLogDirectory() {
    if (process.env.NODE_ENV === 'production' || process.env.FORCE_PRODUCTION === 'true') {
        // Use app-data dir provided by the Tauri host
        const appDataDir = process.env.APP_DATA_DIR;
        if (appDataDir && appDataDir.trim().length > 0) {
            return path.join(appDataDir, 'logs');
        }
        
        // Windows: Use %LOCALAPPDATA%\ContextCypher
        if (process.platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA;
            if (localAppData) {
                return path.join(localAppData, 'ContextCypher', 'logs');
            }
        }
        
        // Mac/Linux: Use standard app data locations
        const homeDir = os.homedir();
        if (process.platform === 'darwin') {
            return path.join(homeDir, 'Library', 'Application Support', 'ContextCypher', 'logs');
        } else if (process.platform === 'linux') {
            return path.join(homeDir, '.local', 'share', 'ContextCypher', 'logs');
        }
        
        // Ultimate fallback to temp directory
        return path.join(os.tmpdir(), 'contextcypher-server-logs');
    } else {
        // In development, use local logs directory
        return path.join(__dirname, '..', 'logs');
    }
}

const LOGS_DIR = getLogDirectory();
const LOG_FILE = path.join(LOGS_DIR, 'server.log');

// Initialize logging with better error handling
function initializeLogging() {
    try {
        // Create logs directory if it doesn't exist
        if (!fs.existsSync(LOGS_DIR)) {
            fs.mkdirSync(LOGS_DIR, { recursive: true });
            console.log('Created logs directory:', LOGS_DIR);
        }

        // Test write permissions
        const testFile = path.join(LOGS_DIR, '.test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        
        // Create log file with header
        const header = `=== ContextCypher Server Log ===
Started: ${new Date().toISOString()}
Environment: ${process.env.NODE_ENV || 'development'}
Force Production: ${process.env.FORCE_PRODUCTION || 'false'}
Log Directory: ${LOGS_DIR}
================================\n\n`;
        
        fs.writeFileSync(LOG_FILE, header);
        console.log('Logging initialized to:', LOG_FILE);
        
        return true;
    } catch (error) {
        console.error('WARNING: Failed to initialize file logging:', error.message);
        console.error('Continuing with console logging only');
        return false;
    }
}

// Initialize on module load
const fileLoggingEnabled = initializeLogging();

// Safe write to log file
function writeToLog(message) {
    if (!fileLoggingEnabled) return;
    
    try {
        fs.appendFileSync(LOG_FILE, message + '\n');
    } catch (error) {
        // Silently fail - don't crash the server over logging
    }
}

// Redact sensitive values from log output
const SENSITIVE_KEYS = /api[_-]?key|secret|password|token|authorization|credential|private[_-]?key/i;
const SENSITIVE_PATTERNS = [
    /sk-[a-zA-Z0-9]{20,}/g,
    /key-[a-zA-Z0-9]{20,}/g,
    /Bearer\s+[a-zA-Z0-9._-]{20,}/g,
];

function redactSensitive(value) {
    if (typeof value === 'string') {
        let result = value;
        for (const pattern of SENSITIVE_PATTERNS) {
            result = result.replace(pattern, '[REDACTED]');
        }
        return result;
    }
    if (typeof value === 'object' && value !== null && !(value instanceof Error)) {
        try {
            const redacted = Array.isArray(value) ? [...value] : { ...value };
            for (const key of Object.keys(redacted)) {
                if (SENSITIVE_KEYS.test(key)) {
                    redacted[key] = '[REDACTED]';
                } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                    redacted[key] = redactSensitive(redacted[key]);
                }
            }
            return redacted;
        } catch (e) {
            return value;
        }
    }
    return value;
}

// Format log message
function formatLog(level, ...args) {
    const timestamp = new Date().toISOString();

    const formattedArgs = args.map(arg => {
        const sanitized = redactSensitive(arg);
        if (typeof sanitized === 'object' && sanitized !== null) {
            if (arg instanceof Error) {
                return `${arg.message}\n${arg.stack}`;
            }
            try {
                return JSON.stringify(sanitized, null, 2);
            } catch (e) {
                return '[Circular Reference]';
            }
        }
        return String(sanitized);
    });

    return `${timestamp} [${level}] ${formattedArgs.join(' ')}`;
}

// Export logger functions
module.exports = {
    info: (...args) => {
        const sanitized = args.map(redactSensitive);
        console.log(...sanitized);
        writeToLog(formatLog('INFO', ...args));
    },
    error: (...args) => {
        const sanitized = args.map(redactSensitive);
        console.error(...sanitized);
        writeToLog(formatLog('ERROR', ...args));
    },
    warn: (...args) => {
        const sanitized = args.map(redactSensitive);
        console.warn(...sanitized);
        writeToLog(formatLog('WARN', ...args));
    },
    debug: (...args) => {
        if (process.env.NODE_ENV !== 'production') {
            const sanitized = args.map(redactSensitive);
            console.debug(...sanitized);
            writeToLog(formatLog('DEBUG', ...args));
        }
    },
    getLogPath: () => LOG_FILE,
    getLogDirectory: () => LOGS_DIR
};