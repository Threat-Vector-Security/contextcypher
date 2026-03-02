# Browser Architecture Implementation Guide

## Executive Summary

This document describes the completed browser-based architecture for ContextCypher, which has successfully migrated from a Tauri-based desktop application to a pure web application with local server backend. The application now runs entirely in the browser while maintaining all security features through Web Crypto API and browser-native storage.

## Current Architecture Overview

### Implemented Solution: Pure Web Application with Local Server

The migration to a browser-based architecture has been completed successfully, providing the following benefits:

1. **Performance**: Native browser rendering with full GPU acceleration
2. **Development Simplicity**: Single codebase with hot module replacement
3. **Cross-Platform**: Works identically across all modern browsers
4. **Security**: Client-side encryption using Web Crypto API
5. **User Experience**: Full browser developer tools and extensions support

## Implementation Architecture

### System Components

```
┌─────────────────────────────────────────────┐
│           User's Web Browser                 │
│  (Chrome, Firefox, Edge, Safari, etc.)      │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │    React Frontend (localhost:3000)   │   │
│  │  - Diagram Editor                    │   │
│  │  - Threat Analysis UI                │   │
│  │  - Settings Management               │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    │
                    │ HTTP/WebSocket
                    │
┌─────────────────────────────────────────────┐
│        Backend Service (Port 3002)           │
│  ┌─────────────────────────────────────┐   │
│  │         Node.js Server               │   │
│  │  - Express REST API                  │   │
│  │  - AI Provider Integration           │   │
│  │  - Threat Analysis Engine            │   │
│  │  - WebSocket for streaming           │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │      System Service Layer            │   │
│  │  - Windows Service (Windows)         │   │
│  │  - launchd daemon (macOS)           │   │
│  │  - systemd service (Linux)           │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Development Configuration

The application runs as two separate processes during development:

#### Frontend Development Server
- **Port**: 3000 (React development server)
- **Hot Reload**: Enabled for instant updates
- **Script**: `npm start` or `.\Development-Rebuild.ps1`

#### Backend API Server
- **Port**: 3002 (Express server)
- **Auto-restart**: Enabled with nodemon
- **Script**: `npm run dev` in server directory

## Browser-Based Security Implementation

### Client-Side Encryption with Web Crypto API

The application implements secure storage entirely in the browser using modern web standards:

#### Encryption Details
- **Algorithm**: AES-GCM with 256-bit keys
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Salt**: Randomly generated and stored per-browser
- **IV**: Fresh 12-byte IV for each encryption operation
- **Storage**: Encrypted data in localStorage

#### Browser Fingerprinting for Key Derivation
The encryption key is derived from browser-specific characteristics:
```javascript
const passphrase = [
  navigator.userAgent,
  navigator.language,
  navigator.hardwareConcurrency,
  window.screen.width,
  window.screen.height,
  new Date().getTimezoneOffset()
].join('|');
```

## Browser-Based Distribution

### Simple Deployment Model

With the browser-based architecture, distribution is significantly simplified:

#### Local Development
```bash
# Clone repository
git clone https://github.com/yourusername/contextcypher.git

# Install dependencies
npm install
cd server && npm install && cd ..

# Start development environment
.\Development-Rebuild.ps1  # Windows
./rebuild.sh               # macOS/Linux
```

#### Production Deployment
```bash
# Build for production
.\build.cmd               # Windows
./build.sh                # macOS/Linux

# Server runs on port 3002
# Access via: http://localhost:3000
```

### Key Advantages
- No installer needed for development
- Browser handles all UI rendering
- Automatic updates via git pull
- Cross-platform by default

## Implemented Security Features

### Browser-Native Secure Storage

The application uses Web Crypto API for all sensitive data:

#### SecureStorageService Implementation
```typescript
// Encryption using Web Crypto API
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv: iv },
  key,
  encoder.encode(data)
);

// Storage in browser localStorage
localStorage.setItem('contextcypher_all_providers', encryptedBase64);
```

#### Multi-Provider Support
- Stores credentials for multiple AI providers
- Each provider's data encrypted separately
- Automatic migration from old storage formats
- Session-based memory with optional persistence

#### Security Benefits
- No external dependencies required
- Encryption happens entirely client-side
- Server never sees unencrypted API keys
- Browser sandbox provides additional isolation

## Migration Completed

### What Was Accomplished

#### ✅ Frontend Migration
- Removed all Tauri-specific dependencies
- Implemented Web Crypto API for secure storage
- Added File System Access API for file operations
- Updated all file operations to use browser APIs

#### ✅ Backend Adaptation
- Server runs standalone on port 3002
- CORS configured for browser access
- WebSocket support for real-time updates
- All API endpoints accessible from browser

#### ✅ Security Implementation
- Client-side encryption with Web Crypto API
- Browser fingerprinting for key derivation
- Secure storage in localStorage
- No server-side key storage

#### ✅ Developer Experience
- Hot module replacement for frontend
- Nodemon for backend auto-restart
- Unified development scripts
- Browser developer tools integration

## Achieved Benefits

### Performance Improvements
- ✅ Native browser rendering with full GPU acceleration
- ✅ Smooth ReactFlow v12 performance
- ✅ No WebView2 overhead or memory leaks
- ✅ Full browser developer tools access

### Development Benefits
- ✅ Hot module replacement for instant updates
- ✅ Browser debugging with breakpoints and profiling
- ✅ No Rust compilation or Tauri rebuilds
- ✅ Simplified development workflow

### Security Benefits
- ✅ Client-side encryption with Web Crypto API
- ✅ Browser sandbox isolation
- ✅ No server-side API key storage
- ✅ Automatic browser security updates

### User Experience Benefits
- ✅ Familiar browser interface
- ✅ Browser extensions compatibility
- ✅ Native copy/paste and shortcuts
- ✅ Full screen and zoom support

## Current Implementation Details

### File Operations
**Implementation**: File System Access API
- Save diagrams with `showSaveFilePicker()`
- Export threats and architecture files
- Import existing diagram files
- Full browser compatibility

### API Key Management
**Implementation**: SecureStorageService
- Encrypts keys before storing in localStorage
- Supports multiple AI providers
- Automatic key restoration on page load
- Browser-specific encryption keys

### Real-time Updates
**Implementation**: WebSocket Connection
- Streaming threat analysis responses
- Progress indicators for long operations
- Automatic reconnection on disconnect
- Binary data support for efficiency

### Development Workflow
**Implementation**: Dual-server Architecture
- Frontend: React dev server (port 3000)
- Backend: Express API server (port 3002)
- Automatic process management scripts
- Cross-platform development support

## Conclusion

The migration to a browser-based architecture has been successfully completed, delivering:

- **Superior Performance**: Native browser rendering eliminates WebView2 bottlenecks
- **Enhanced Security**: Web Crypto API provides robust client-side encryption
- **Improved Developer Experience**: Hot reload and browser dev tools
- **Simplified Distribution**: No complex installers or platform-specific builds

The application now runs entirely in the browser while maintaining all security features, providing a better user experience and easier maintenance path forward.

## Current Status

The browser-based architecture is fully implemented and operational:

1. **✅ Frontend**: React app runs in any modern browser
2. **✅ Backend**: Express server provides API endpoints
3. **✅ Security**: Web Crypto API encrypts sensitive data
4. **✅ File Operations**: File System Access API handles saves/loads
5. **✅ Development**: Hot reload and auto-restart configured

## Quick Start Guide

### Development Setup

#### Windows
```powershell
# Clone and setup
git clone https://github.com/yourusername/contextcypher.git
cd contextcypher
npm install

# Start development
.\Development-Rebuild.ps1
# Or manually:
cd server && npm run dev  # Terminal 1
npm start                 # Terminal 2
```

#### macOS/Linux
```bash
# Clone and setup
git clone https://github.com/yourusername/contextcypher.git
cd contextcypher
npm install

# Start development
./rebuild.sh
# Or manually:
cd server && npm run dev  # Terminal 1
npm start                 # Terminal 2
```

### Access the Application

1. Frontend: http://localhost:3000
2. Backend API: http://localhost:3002
3. API Documentation: http://localhost:3002/api-docs

### Browser Requirements

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Any Chromium-based browser 90+