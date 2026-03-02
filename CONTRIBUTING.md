# Contributing to ContextCypher

## Prerequisites

- **Node.js v18+** ([nvm-windows](https://github.com/coreybutler/nvm-windows) on Windows, [nvm](https://github.com/nvm-sh/nvm) on macOS/Linux)
- **npm v10+**
- **Git**
- **Ollama** (optional) -- for local AI features. [ollama.com](https://ollama.com)

## Setup

```bash
git clone https://github.com/Threat-Vector-Security/contextcypher.git
cd contextcypher
npm install
cd server && npm install && cd ..
```

## Building and Running

The simplest way to build and run the full application:

```powershell
# Windows
.\full-rebuild.ps1

# Linux / macOS
./full-rebuild.sh
```

This installs dependencies, builds the frontend and backend, and starts both servers. If this runs successfully, your environment is working.

For frontend-only work with hot reload:

```powershell
# Windows
.\Development-Rebuild.ps1

# Linux / macOS
./Development-Rebuild.sh
```

Or run manually on any platform:

```bash
# Backend
cd server && npm run dev

# Frontend (separate terminal)
npm start
```

## Submitting Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Verify the app builds and runs (`.\full-rebuild.ps1` on Windows, `./full-rebuild.sh` on Linux/macOS)
4. Commit with a clear message describing what changed
5. Open a Pull Request against `main`

## Code Style

- TypeScript for frontend code
- Material-UI for UI components
- ReactFlow for diagram rendering
- Follow existing patterns in the codebase
- Keep files under 500 lines when practical

## Reporting Issues

Open a GitHub Issue with:

- Steps to reproduce
- Expected vs actual behavior
- OS, Node.js version, and AI provider in use
- Screenshots if it's a UI issue

---

Thanks for contributing.
