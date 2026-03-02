# Browser Service APIs Documentation

This document describes the browser-compatible service APIs that replace Tauri-specific functionality in ContextCypher.

## Overview

All services are designed to work in a standard web browser environment without requiring Tauri or other desktop-specific APIs. Services use modern web APIs with appropriate fallbacks for broader compatibility.

## Service Imports

All services can be imported from the centralized index:

```typescript
import {
  connectionManager,
  secureStorage,
  updateService,
  deepLinkHandler,
  fileService,
  threatAnalysisLogger,
  chatHistoryLogger
} from './services';
```

## ConnectionManager

Manages the connection to the backend server with automatic port detection and health monitoring.

### API

```typescript
interface ConnectionStatus {
  connected: boolean;
  retrying: boolean;
  lastError?: string;
  retryCount: number;
  serverUrl?: string;
  isInitialStartup?: boolean;
}

// Subscribe to connection status changes
const unsubscribe = connectionManager.subscribe((status: ConnectionStatus) => {
  console.log('Connection status:', status);
});

// Get current status
const status = connectionManager.getStatus();

// Check if connected
const isConnected = connectionManager.isConnected();

// Get server URL
const serverUrl = connectionManager.getServerUrl();

// Force reconnection
await connectionManager.reconnect();

// Clean up
connectionManager.destroy();
```

## SecureStorageService

Provides encrypted storage for sensitive data using Web Crypto API.

### API

```typescript
interface SecureData {
  provider?: string;
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  timestamp?: number;
}

// Initialize (compatibility method)
await secureStorage.initialize();

// Store API keys
await secureStorage.storeApiKeys({
  provider: 'openai',
  apiKey: 'sk-...'
});

// Retrieve API keys
const data = await secureStorage.getApiKeys();

// Clear API keys
await secureStorage.clearApiKeys();

// Check if keys exist
const hasKeys = secureStorage.hasStoredKeys();

// Compatibility methods
await secureStorage.storeAPIKey('openai', 'sk-...');
const allKeys = await secureStorage.retrieveAllAPIKeys();
await secureStorage.clearAPIKey('openai');
await secureStorage.clearAllAPIKeys();
```

## UpdateService

Checks for application updates without Tauri dependencies.

### API

```typescript
interface UpdateStatus {
  checking: boolean;
  available: boolean;
  error?: string;
  version?: string;
  releaseDate?: string;
  downloadUrl?: string;
}

// Subscribe to update status
const unsubscribe = updateService.subscribe((status: UpdateStatus) => {
  console.log('Update status:', status);
});

// Check for updates
const status = await updateService.checkForUpdates();

// Start automatic checks
updateService.startAutoCheck(24); // Check every 24 hours

// Stop automatic checks
updateService.stopAutoCheck();

// Open download page
updateService.openDownloadPage();
```

## DeepLinkHandler

Handles URL-based deep links and callbacks.

### API

```typescript
interface DeepLinkEvent {
  url: string;
  params: URLSearchParams;
  timestamp: number;
}

// Initialize handler
deepLinkHandler.initialize();

// Register callback for pattern
const unsubscribe = deepLinkHandler.on('app-callback', (event: DeepLinkEvent) => {
  console.log('Callback received:', event.params);
});

// Remove callback
deepLinkHandler.off('app-callback', callback);

// Check current URL
deepLinkHandler.checkNow();

// Simulate deep link (for testing)
deepLinkHandler.simulate('contextcypher://app-callback?action=test');
```

## FileService

Provides file operations using Web File System Access API with fallbacks.

### API

```typescript
interface FileDialogOptions {
  title?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  defaultPath?: string;
  multiple?: boolean;
}

// Open file dialog
const filename = await fileService.openFileDialog({
  filters: [{ name: 'JSON Files', extensions: ['json'] }]
});

// Save file dialog
const filename = await fileService.saveFileDialog({
  suggestedName: 'diagram.json',
  filters: [{ name: 'JSON Files', extensions: ['json'] }]
});

// Read file
const content = await fileService.readFile(filename);

// Write file
await fileService.writeFile(filename, content);

// Check if File System Access is supported
const supported = fileService.isFileSystemAccessSupported();
```

## ThreatAnalysisLogger

Logs threat analysis operations with browser storage.

### API

```typescript
// Configure logger
threatAnalysisLogger.configure({
  enabled: true,
  logLevel: 'verbose',
  includeFullContext: true
});

// Start session
const sessionId = threatAnalysisLogger.startSession();

// Generate analysis ID
const analysisId = threatAnalysisLogger.generateAnalysisId();

// Log analysis events
await threatAnalysisLogger.logAnalysisStart(analysisId, nodeCount, edgeCount);
await threatAnalysisLogger.logNodeAnalysis(analysisId, node, threats);
await threatAnalysisLogger.logAnalysisComplete(analysisId, totalThreats, duration);

// End session
threatAnalysisLogger.endSession();

// Download logs
threatAnalysisLogger.downloadLogs();

// Clear logs
threatAnalysisLogger.clearLogs();
```

## ChatHistoryLogger

Logs chat interactions with AI providers.

### API

```typescript
// Initialize logger
await chatHistoryLogger.initialize({
  enabled: true,
  includeSystemMessages: true,
  includeFullContext: true
});

// Log messages
await chatHistoryLogger.logUserMessage(content, context);
await chatHistoryLogger.logAssistantMessage(content, provider, model, tokens);

// Log request data
await chatHistoryLogger.logRequestData({
  provider: 'openai',
  model: 'gpt-4',
  context: analysisContext,
  prompt: promptText
});

// Start new session
chatHistoryLogger.startNewSession();

// Download logs
chatHistoryLogger.downloadLogs();

// Clear logs
chatHistoryLogger.clearLogs();
```

## Storage Limits

Browser storage has the following limitations:

- **localStorage**: ~5-10MB per origin
- **sessionStorage**: ~5-10MB per session
- **IndexedDB**: Varies by browser (typically 50% of free disk space)

Services implement automatic cleanup and rotation to stay within limits.

## Security Considerations

1. **Encryption**: SecureStorageService uses Web Crypto API with AES-GCM encryption
2. **Key Derivation**: Uses PBKDF2 with 100,000 iterations
3. **Storage**: Encrypted data stored in localStorage
4. **Memory**: Sensitive data cleared from memory after use

## Browser Compatibility

All services require a modern browser with support for:

- ES6+ JavaScript
- Web Crypto API
- localStorage
- Fetch API
- URL and URLSearchParams

Optional features:
- File System Access API (Chrome/Edge 86+)
- Clipboard API
- Web Workers

## Migration from Tauri

The browser services maintain API compatibility with the original Tauri services where possible. Key differences:

1. **File Operations**: Use File System Access API instead of Tauri file dialogs
2. **Secure Storage**: Web Crypto instead of Tauri Stronghold
3. **Updates**: HTTP-based checking instead of Tauri updater

## Error Handling

All async methods follow standard Promise patterns:

```typescript
try {
  const result = await service.method();
} catch (error) {
  console.error('Service error:', error);
}
```

Services log errors internally but also throw for application-level handling.