const fs = require('fs');
const path = require('path');

// Use a logs directory in the server folder
const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Generate session-based log filename with timestamp
const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
const LOG_FILE = path.join(LOGS_DIR, `server_${sessionTimestamp}.log`);

// Configuration
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB max per log file
const MAX_LOG_FILES = 10; // Keep last 10 log files
let currentLogSize = 0;
let rotationCounter = 0;

// Ensure logs directory exists and is writable
try {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    // Test write permissions by writing a test file
    const testFile = path.join(LOGS_DIR, 'test.log');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile); // Clean up test file
    
    // Clean up old log files if too many exist
    cleanupOldLogs();
    
    // Create new log file for this session
    fs.writeFileSync(LOG_FILE, `=== Log session started at ${new Date().toISOString()} ===\n`);
    
    // Create symlink to latest log for easy access
    const latestLink = path.join(LOGS_DIR, 'server.log');
    if (fs.existsSync(latestLink)) {
        fs.unlinkSync(latestLink);
    }
    try {
        fs.symlinkSync(path.basename(LOG_FILE), latestLink);
    } catch (err) {
        // Symlinks might fail on Windows without admin rights, try to copy instead
        try {
            // Remove existing server.log if it exists
            if (fs.existsSync(latestLink)) {
                fs.unlinkSync(latestLink);
            }
            fs.copyFileSync(LOG_FILE, latestLink);
        } catch (copyErr) {
            // If copy also fails, just log a warning and continue
            console.warn('Warning: Could not create server.log link/copy:', copyErr.message);
            console.log('Logs will be written to:', LOG_FILE);
        }
    }
    
    console.log('Successfully initialized logging to:', LOG_FILE);
    console.log('Latest log available at:', latestLink);
} catch (error) {
    console.error('Failed to initialize file logging:', error.message);
    console.log('Continuing with console logging only');
}

// Clean up old log files
function cleanupOldLogs() {
    try {
        const files = fs.readdirSync(LOGS_DIR)
            .filter(f => f.startsWith('server_') && f.endsWith('.log'))
            .map(f => ({
                name: f,
                path: path.join(LOGS_DIR, f),
                time: fs.statSync(path.join(LOGS_DIR, f)).mtime
            }))
            .sort((a, b) => b.time - a.time); // Sort by modification time, newest first
        
        // Remove old files if we have too many
        if (files.length >= MAX_LOG_FILES) {
            for (let i = MAX_LOG_FILES - 1; i < files.length; i++) {
                fs.unlinkSync(files[i].path);
                console.log('Removed old log file:', files[i].name);
            }
        }
    } catch (error) {
        console.error('Error cleaning up old logs:', error);
    }
}

// Get current log file with rotation support
function getCurrentLogFile() {
    // Check if we need to rotate
    if (currentLogSize > MAX_LOG_SIZE) {
        rotationCounter++;
        const rotatedFile = LOG_FILE.replace('.log', `.${rotationCounter}.log`);
        currentLogSize = 0;
        
        console.log(`Rotating log file to: ${rotatedFile}`);
        fs.writeFileSync(rotatedFile, `=== Log rotation ${rotationCounter} at ${new Date().toISOString()} ===\n`);
        
        // Update symlink/copy to point to new file
        const latestLink = path.join(LOGS_DIR, 'server.log');
        try {
            if (fs.existsSync(latestLink)) {
                fs.unlinkSync(latestLink);
            }
            fs.symlinkSync(path.basename(rotatedFile), latestLink);
        } catch (err) {
            // Windows fallback
            fs.copyFileSync(rotatedFile, latestLink);
        }
        
        return rotatedFile;
    }
    
    return rotationCounter > 0 ? LOG_FILE.replace('.log', `.${rotationCounter}.log`) : LOG_FILE;
}

// Simple logging function with size tracking
function writeToLog(message) {
    try {
        const logFile = getCurrentLogFile();
        const messageWithNewline = message + '\n';
        fs.appendFileSync(logFile, messageWithNewline);
        currentLogSize += Buffer.byteLength(messageWithNewline, 'utf8');
        
        // Update the server.log symlink/copy periodically
        const latestLink = path.join(LOGS_DIR, 'server.log');
        if (!fs.existsSync(latestLink) || currentLogSize % 1000 === 0) {
            try {
                fs.copyFileSync(logFile, latestLink);
            } catch (err) {
                // Ignore errors updating the link
            }
        }
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
}

// Redact sensitive values from log output
const SENSITIVE_KEYS = /api[_-]?key|secret|password|token|authorization|credential|private[_-]?key/i;
const SENSITIVE_PATTERNS = [
    /sk-[a-zA-Z0-9]{20,}/g,            // OpenAI API keys
    /key-[a-zA-Z0-9]{20,}/g,           // Generic API keys
    /Bearer\s+[a-zA-Z0-9._-]{20,}/g,   // Bearer tokens
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
        const redacted = Array.isArray(value) ? [...value] : { ...value };
        for (const key of Object.keys(redacted)) {
            if (SENSITIVE_KEYS.test(key)) {
                redacted[key] = '[REDACTED]';
            } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                redacted[key] = redactSensitive(redacted[key]);
            }
        }
        return redacted;
    }
    return value;
}

// Format log message with support for multiple arguments
function formatLog(level, ...args) {
    const timestamp = new Date().toISOString();

    // Handle multiple arguments
    const formattedArgs = args.map(arg => {
        const sanitized = redactSensitive(arg);
        if (typeof sanitized === 'object' && sanitized !== null) {
            // For Error objects, include message and stack
            if (arg instanceof Error) {
                return `${arg.message}\n${arg.stack}`;
            }
            return JSON.stringify(sanitized, null, 2);
        }
        return sanitized;
    });

    const formattedMessage = formattedArgs.join(' ');

    return `${timestamp} [${level}] ${formattedMessage}`;
}

// Export logger functions with support for multiple arguments
module.exports = {
    info: (...args) => {
        const sanitized = args.map(redactSensitive);
        const logMessage = formatLog('INFO', ...args);
        console.log(...sanitized);
        writeToLog(logMessage);
    },
    error: (...args) => {
        const sanitized = args.map(redactSensitive);
        const logMessage = formatLog('ERROR', ...args);
        console.error(...sanitized);
        writeToLog(logMessage);
    },
    warn: (...args) => {
        const sanitized = args.map(redactSensitive);
        const logMessage = formatLog('WARN', ...args);
        console.warn(...sanitized);
        writeToLog(logMessage);
    },
    debug: (...args) => {
        const sanitized = args.map(redactSensitive);
        const logMessage = formatLog('DEBUG', ...args);
        console.debug(...sanitized);
        writeToLog(logMessage);
    }
};
