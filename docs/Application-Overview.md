# AI Threat Modeler: Application Overview

## 1. High-Level Summary

AI Threat Modeler (ContextCypher) is an intelligent, offline-first browser-based application for creating system architecture diagrams and generating AI-powered security threat analysis. It is designed for security professionals, architects, and developers who need a private, secure, and powerful tool to model and analyze system threats. By leveraging local Large Language Models (LLMs), it ensures that all user data remains on the local machine, making it suitable for use in highly secure environments. The application runs entirely in modern web browsers without requiring any desktop installation.

## 2. Core Capabilities & Features

### Free Features

*   **Intuitive Diagramming:** Create and modify system architecture diagrams using a rich, node-based editor. Users can add, remove, and connect components, and group them into logical security zones.
*   **AI-Powered Threat Analysis:** Submit your diagram for an in-depth security analysis. The AI, acting as a security expert, identifies potential threats, vulnerabilities, and risks, providing detailed findings based on frameworks like MITRE ATT&CK and NIST.
*   **AI Diagram Generation (Pro Feature):** Automatically generate a complete and editable threat model diagram from a natural language text description of a system.
*   **Drawing & Annotation Layer:** Overlay diagrams with free-form drawings, boundary boxes, and text annotations to add further context or highlight specific areas of concern.
*   **Offline-First Operation:** The application is designed to work entirely offline by default, connecting to a local LLM server (like Ollama) for all AI functionality.
*   **Cross-Platform Browser Experience:** As a browser-based application, it runs on any modern web browser across Windows, macOS, and Linux, providing a seamless and accessible user experience without installation.
*   **Secure & Private:** No user data, diagrams, or analysis requests are sent to external cloud services in the primary operating mode. API keys are encrypted client-side using the Web Crypto API with AES-GCM encryption.
*   **Code Protection:** Production builds include comprehensive obfuscation - backend compiled to V8 bytecode (91.2% coverage) and frontend JavaScript obfuscated with hexadecimal identifiers.
*   **File Management & Autosave:** A modern file system interface for saving and loading diagrams, complete with a configurable autosave feature to prevent data loss.
*   **Update Checking:** Integrated update notification system that automatically checks for new versions on startup for all users. Features a non-intrusive bottom-left corner notification when updates are available.

## 3. Technology Stack

*   **Frontend:** React, TypeScript, Material-UI, ReactFlow
*   **Backend:** Node.js, Express.js
*   **Browser Runtime:** Modern web browsers with Web Crypto API support
*   **Primary AI Integration:** Local LLMs (Ollama, LocalAI) via an OpenAI-compatible API
*   **Development AI Integration:** OpenAI, Google Gemini, Anthropic Claude
## 4. Architectural Components

The application is composed of two primary architectural layers that work together to deliver a unified browser-based experience.

### Deployment Options

The browser-based architecture supports multiple deployment scenarios:

**Development Mode:**
- Backend runs on port 3002 with nodemon for auto-restart
- Frontend served on port 3000 for development
- CORS configured for localhost origins

**Production Deployment:**
- Can be deployed to any web hosting service
- Backend API can be hosted separately or together
- Supports cloud deployment (AWS, Azure, GCP) or on-premises
- No installation required for end users

### 4.1. Frontend (`src/`)

The frontend is a React-based single-page application responsible for the entire user interface.

*   **`DiagramEditor.tsx`:** The core component that renders the interactive diagramming canvas using ReactFlow.
*   **`AnalysisPanel.tsx`:** The persistent side panel that contains the chat interface for interacting with the AI and viewing analysis results.
*   **`AnalysisContextProvider.tsx`:** The central state management hub. It holds the state of the diagram, message history, and other critical context, making it available to all other components.
*   **`SettingsDrawer.tsx`:** The UI for configuring application settings, including AI provider selection and autosave preferences.
*   **`NodeEditor.tsx` & `EdgeEditor.tsx`:** Panels for editing the detailed security properties of diagram components.
*   **`DrawingLayerComponent.tsx`:** A transparent canvas overlay that handles all drawing and annotation functionality.
*   **`DeepLinkHandler.tsx`:** Manages deep link callbacks from external sources.

### 4.2. Backend (`server/`)

The backend is a lightweight Node.js/Express server that handles AI provider integration and analysis orchestration.

*   **`index.js`:** The main server entry point that sets up the Express app, middleware, and API routes (default port 3002).
*   **`aiProviders.js`:** A service that abstracts the communication logic for different AI providers, presenting a unified interface for sending requests.
*   **`MCPService.js` (Model Context Protocol Service):** Orchestrates the entire analysis workflow, from formatting the context to calling the AI provider and processing the response.
*   **`formatters.js`:** A key utility that gathers all context (diagram, chat history, etc.) and formats it into the detailed, structured prompt that the AI needs to perform an accurate analysis.

### 4.3. Browser Features

The application leverages modern browser APIs for enhanced functionality:

*   **File System Access API:** Enables direct file operations for saving and loading diagrams
*   **Web Crypto API:** Provides client-side encryption for secure API key storage
*   **localStorage:** Persists encrypted settings and preferences across sessions
*   **Canvas API:** Powers the drawing and annotation layer
*   **WebGL:** Enables GPU acceleration for complex diagram rendering

## 5. Key Services Deep Dive

Several services encapsulate the application's core business logic.

*   **`AIRequestService.ts` (`src/services/`):** A frontend service that acts as the initial point of contact for any AI request. It determines whether to call the local LLM directly or route the request through the embedded backend server (for public APIs in development).
*   **`DiagramGenerationService.ts` (`src/services/`):** Contains all the logic for the AI Diagram Generation feature. It builds the prompt, calls the AI, and then validates, cleans, and formats the AI's JSON response into a usable diagram structure.
*   **`SecureStorageService.ts` (`src/services/`):** Provides military-grade encryption for API key storage using the Web Crypto API. Implements secure storage, retrieval, and deletion of API keys with automatic memory cleanup and AES-GCM 256-bit encryption.
*   **`UpdateService.ts` (`src/services/`):** Manages version update checking for all users. Compares semantic versions to determine if updates are available and displays non-intrusive notifications when new versions are found.
*   **`AnalysisService.ts` (`src/services/`):** A frontend service that kicks off the analysis process by gathering the necessary data from the context provider and passing it to the `AIRequestService`.

