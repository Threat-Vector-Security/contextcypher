# ContextCypher

An offline-first desktop application for creating system architecture diagrams and generating AI-powered security threat analysis.

Built for security professionals, architects, and developers. Visually map out your systems and receive security insights powered by local LLMs without your data leaving your machine.

## Features

- **Offline-First** -- Operates entirely offline using local LLMs (Ollama). Your data stays on your machine.
- **AI-Powered Threat Analysis** -- Identifies threats, vulnerabilities, and risks using MITRE ATT&CK and NIST frameworks.
- **AI Diagram Generation** -- Describe your system in plain text and get a complete threat model diagram.
- **Diagram Editor** -- ReactFlow-based editor with custom nodes, security zones, and connection properties.
- **Drawing & Annotation Layer** -- Free-form drawings, text, and boundary boxes on your diagrams.
- **Autosave** -- Configurable autosave with modern file system integration.
- **Multiple AI Providers** -- Ollama (default, offline), OpenAI, Anthropic Claude, Google Gemini.

## Technology Stack

- **Frontend:** React 18, TypeScript, Material-UI, ReactFlow
- **Backend:** Node.js v18, Express.js
- **AI:** Ollama (local, offline), OpenAI, Anthropic Claude, Google Gemini

## Prerequisites

- **Node.js** v18.x or later
- **npm** v10.x or later
- **Ollama** (optional) -- for local AI. Download from [ollama.com](https://ollama.com)

## Getting Started

```bash
git clone https://github.com/Threat-Vector-Security/contextcypher.git
cd contextcypher
npm install
cd server && npm install && cd ..
```

### Development with Hot Reload (Frontend Work)

```powershell
.\Development-Rebuild.ps1
```

Starts the backend on port 3002 (with nodemon) and the React dev server on port 3000 (with hot reload). Best for UI and component work.

### Full Rebuild (Backend Work)

```powershell
.\full-rebuild.ps1
```

Builds the frontend with React minification and the backend, then starts both servers. Use this when making backend changes or testing a production-like build.

### Manual Start

```bash
# Backend (with auto-restart)
cd server && npm run dev

# Frontend (separate terminal)
npm start

# Both at once
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3002

### Running Tests

```bash
npm test
npm run test:watch
```

## Architecture

```
src/                    # React frontend
├── components/         # DiagramEditor, SettingsDrawer, ThreatAnalysisPanel, etc.
├── services/           # AnalysisService, ConnectionManager, etc.
├── hooks/              # React hooks
├── types/              # TypeScript types
└── utils/              # Utilities

server/                 # Express backend
├── services/           # SimplifiedThreatAnalyzer, AIProviderManager, etc.
├── utils/              # Security, logging, model capabilities
├── config/             # Server configuration
├── routes/             # Express route handlers
└── data/               # Security knowledge base
```

The frontend handles diagramming, settings, and display. The backend handles AI provider communication, threat analysis orchestration, and MITRE ATT&CK mapping.

## Setting Up Ollama

```bash
# Install (macOS/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.2

# Windows: download from https://ollama.com/download
```

Open Settings in the app and select Ollama as your AI provider.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[Apache 2.0](LICENSE)
