# Development Environment Guide

## Overview

This guide documents the hybrid development workflow for the AI Threat Modeler application. Due to webpack-dev-server compatibility issues with newer Node.js versions, we use a production build approach with hot-reload capabilities for an efficient development experience.

## Quick Start

### Development Script Selection

| Working on | Use Script | Features |
|------------|------------|----------|
| React components, UI, styles | `.\Development-Rebuild.ps1` | Hot reload, instant updates |
| Backend APIs, services | `.\full-rebuild.ps1` | Production-like build |
| Both frontend & backend | `.\full-rebuild.ps1` | Complete rebuild |
| Testing production build | `.\build.cmd` | Creates installers |

### Quick Frontend Development (Recommended)

```bash
# Start development servers
npm run dev

# This will:
# 1. Start backend server on port 3002 with nodemon
# 2. Start frontend dev server on port 3000 with hot reload
# 3. Enable automatic restarts on file changes
```

### Production Build Testing

```bash
# Build all deployment packages
.\build.cmd

# This creates:
# 1. Windows MSI installer
# 2. Docker container image
# 3. Portable ZIP package

# Test locally without building installers
npm run build
npm run serve:build
```

### Manual Method

```bash
# 1. Start backend server (Terminal 1)
cd server
npm run dev  # Runs on port 3002 with nodemon

# 2. Start frontend dev server (Terminal 2)
npm start  # Runs on port 3000 with hot reload

# 3. Open browser to http://localhost:3000
```

## Prerequisites

- **Node.js v18.20.5** (via nvm-windows)
- **npm v10.8.2** or higher
- **http-server** (global installation)

## Initial Setup

### 1. Install Node Version Manager

- **Windows**: Download nvm-windows from https://github.com/coreybutler/nvm-windows/releases
- **macOS/Linux**: Use nvm from https://github.com/nvm-sh/nvm

### 2. Install and Use Node.js v18.x

```bash
# Install Node.js (latest v18)
nvm install 18

# Use this version
nvm use 18

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 10.x.x or higher
```

### 3. Install Global Dependencies (Optional)

```bash
# Install http-server globally for serving production builds
npm install -g http-server

# Or use npx (no global install needed)
npx http-server build -p 8080
```

### 4. Install Project Dependencies

```powershell
# In project root
npm install

# Install server dependencies
cd server
npm install
cd ..
```

## Development Scripts

### Available Scripts

The project includes npm scripts for different development scenarios:

#### Quick Frontend Development
- **`npm run dev`** - React hot reload for frontend and backend development

**Features:**
- Starts React dev server with hot reload on port 3000
- Starts backend with nodemon for auto-restart on port 3002
- Perfect for UI/component development
- Instant updates without rebuilding

#### Production Build
- **`npm run build`** - Creates production build

**Features:**
- Optimized frontend build in `build/` directory
- Ready for deployment to web server
- Includes all optimizations and minification

#### Serve Production Build
- **`npm run serve:build`** - Test production build locally

**Features:**
- Serves built frontend on port 8080
- Backend remains on port 3002
- Tests production-like environment

**Usage Examples:**
```bash
# Frontend development (hot reload)
npm run dev

# Build for production
npm run build

# Test production build locally
npm run serve:build
```

### Cleanup Commands

For manual cleanup of stuck processes:

```bash
# Kill process on specific port (Linux/macOS)
lsof -ti:3000 | xargs kill -9
lsof -ti:3002 | xargs kill -9

# Kill process on specific port (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Clean build artifacts
rm -rf build/ node_modules/.cache/
```

This will:
- Kill all processes on ports 3000 and 3002
- Clear build caches and temporary files

## Development Workflow

### Making Changes

#### Frontend Changes (UI, Components, Styles):
1. Edit your React components, services, or styles
2. If not running: `.\Development-Rebuild.ps1`
3. Changes appear instantly with hot reload
4. No need to restart or rebuild

#### Backend Changes (APIs, Services):
1. Edit your server files
2. Run `.\full-rebuild.ps1`
3. Wait for complete rebuild (~30 seconds)
4. Test with production-like builds

#### Mixed Changes (Frontend + Backend):
1. Make all your changes
2. Run `.\full-rebuild.ps1`
3. Get production-like environment
4. Verify everything works together

### Browser Cache Issues

If changes don't appear:
- Hard refresh: `Ctrl+F5`
- Clear cache: `Ctrl+Shift+Delete`
- Use Developer Tools → Network → "Disable cache"
- Try Incognito/Private browsing mode

## Environment Configuration

### Frontend (.env.development)

```env
BROWSER=none
PORT=3000
REACT_APP_API_URL=http://localhost:3002
REACT_APP_DEV_MODE=true
REACT_APP_SECRET=contextcypher-dev-secret
```

### Backend (server/.env.development)

```env
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug
```

## Common Tasks

### Running Tests

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
```

### Type Checking

```bash
npm run type-check      # Check TypeScript types
```

### Linting

```bash
npm run lint            # Run ESLint
npm run lint:fix        # Fix auto-fixable issues
```

### Building for Production

```bash
# Full production build with installers
.\build.cmd

# Creates in release/ directory:
# - ContextCypher-Setup-{version}.msi (Windows)
# - contextcypher-docker.tar (Docker image)
# - ContextCypher-Portable-{version}.zip (All platforms)

# Quick build without installers
npm run build           # Just optimized frontend
```

## Troubleshooting

### Port Already in Use

```bash
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9  # Linux/macOS
# or
netstat -ano | findstr :3000    # Windows (then use taskkill)

# Find and kill process using port 3002
lsof -ti:3002 | xargs kill -9  # Linux/macOS
```

### Server Won't Stop

If Ctrl+C doesn't work:

```bash
# Force kill all Node processes (use with caution)
pkill -f node           # Linux/macOS
# or
taskkill /IM node.exe /F  # Windows
```

### API Connection Issues

Common issues and solutions:

1. **Wrong Port**: Check that backend shows "Server running on port 3002"
2. **Ollama/Local LLM Issues**: 
   - Edit `server/config/provider-settings.json`
   - Change `localhost:11434` to `127.0.0.1:11434`
   - Clear browser localStorage and restart

### Build Not Updating

```bash
# Clear build cache and rebuild
rm -rf build/
npm run build

# Clear all caches
rm -rf build/ node_modules/.cache/
npm run build
```

## VS Code Integration

### Recommended Extensions

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- React snippets

### Launch Configuration

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "program": "${workspaceFolder}/server/index.js",
      "cwd": "${workspaceFolder}/server",
      "console": "integratedTerminal"
    }
  ]
}
```

## Tips for Efficient Development

1. **Use npm run dev**: Starts both frontend and backend with hot reload
2. **Browser DevTools**: Keep developer tools open for debugging
3. **Network Tab**: Monitor API calls between frontend and backend
4. **React DevTools**: Install browser extension for component debugging
5. **Console Logging**: Use structured logging for better debugging

## Development Script Reference

### Quick Reference Table

| Script | Purpose | Hot Reload | Build Time |
|--------|---------|------------|------------|
| `npm run dev` | Frontend & backend development | ✅ Yes | Instant |
| `npm run build` | Frontend build only | ❌ No | ~30 sec |
| `npm run serve:build` | Test production build | ❌ No | Instant |
| `.\build.cmd` | Full installer build | ❌ No | ~2-3 min |
| `.\build.cmd --msi` | Windows MSI only | ❌ No | ~1 min |
| `.\build.cmd --docker` | Docker image only | ❌ No | ~1 min |
| `.\build.cmd --portable` | Portable ZIP only | ❌ No | ~1 min |
| `npm test` | Run test suite | N/A | Varies |

### Development Workflow

```bash
# Start development (recommended)
npm run dev
# Frontend: http://localhost:3000 (hot reload)
# Backend: http://localhost:3002 (auto-restart)

# Build and test production
npm run build
npm run serve:build
# Frontend: http://localhost:8080
# Backend: http://localhost:3002
```