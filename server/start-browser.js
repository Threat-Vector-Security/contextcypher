const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Helper to open URL in default browser
function openBrowser(url) {
    const platform = process.platform;
    let cmd;
    
    if (platform === 'win32') {
        cmd = 'start';
    } else if (platform === 'darwin') {
        cmd = 'open';
    } else {
        cmd = 'xdg-open';
    }
    
    spawn(cmd, [url], { shell: true, detached: true }).unref();
}

// Start the server
console.log('Starting ContextCypher server...');

// Set environment variables for browser mode
process.env.BROWSER_MODE = 'true';
process.env.AUTO_OPEN_BROWSER = 'true';

// Start the server
const serverProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    env: { ...process.env },
    stdio: 'inherit'
});

// Wait a bit for server to start, then open browser
setTimeout(() => {
    const port = process.env.PORT || 3002;
    const url = `http://localhost:${port}`;
    console.log(`Opening browser to ${url}...`);
    openBrowser(url);
}, 3000);

// Handle server process exit
serverProcess.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    process.exit(code);
});

// Handle signals
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    serverProcess.kill('SIGTERM');
});