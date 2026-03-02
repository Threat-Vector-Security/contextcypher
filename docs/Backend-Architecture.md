# AI Threat Modeler - Backend Architecture & API Communications

## Table of Contents
1. [Overview](#overview)
2. [Architecture Components](#architecture-components)
3. [Service Layer](#service-layer)
4. [API Endpoints](#api-endpoints)
5. [AI Provider Integration](#ai-provider-integration)
6. [Simplified Threat Analysis](#simplified-threat-analysis)
7. [Data Flow & Communication](#data-flow--communication)
8. [Security & Authentication](#security--authentication)
9. [Performance & Scalability](#performance--scalability)
10. [Deployment Architecture](#deployment-architecture)

## Overview

The AI Threat Modeler backend is a Node.js/Express server that orchestrates multiple AI services, manages diagram analysis, and consumes user-provided threat intelligence (manual import). The architecture emphasizes offline-first operation, and seamless integration with both local and cloud-based AI providers.

### Key Technologies
- **Node.js** with Express.js for REST API
- **Simplified Threat Analysis** using direct AI provider integration
- **Tauri** for desktop integration and auto-start
- **Ollama** for local LLM integration
- **Multiple AI Provider SDKs** (OpenAI, Anthropic, Gemini)

### Architecture Principles
1. **Offline-First**: Local LLMs prioritized over cloud services
2. **Provider Agnostic**: Seamless switching between AI providers
3. **Context Optimization**: Smart context management for token-limited models
4. **Unified Architecture**: Single Node.js process for all services
5. **Graceful Degradation**: Fallback mechanisms for service unavailability

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                        │
│  ┌─────────────────────────────────────────────────────┐  │
│  │          React Frontend (Port 8080 in dev)           │  │
│  └──────────────────────┬──────────────────────────────┘  │
└────────────────────────┼────────────────────────────────────┘
                         │ HTTP/REST API
┌────────────────────────▼────────────────────────────────────┐
│                Node.js Backend Server                       │
│                    (Port 3002)                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                  Express.js Core                     │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │  │
│  │  │ API Routes  │  │ Middleware   │  │ Services   │ │  │
│  │  └─────────────┘  └──────────────┘  └────────────┘ │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              AI Provider Manager                     │  │
│  │  ┌────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐  │  │
│  │  │ OpenAI │ │Anthropic │ │ Gemini │ │Local/Ollama│  │  │
│  │  └────────┘ └──────────┘ └────────┘ └───────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                 Core Services                        │  │
│  │  ┌──────────────┐  ┌────────────────┐  ┌─────────┐ │  │
│  │  │DiagramIndexer│  │Context         │  │  MCP    │ │  │
│  │  │              │  │Optimization    │  │ Service │ │  │
│  │  └──────────────┘  └────────────────┘  └─────────┘ │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                    Simplified Architecture:
                    All analysis now handled directly
                    through AI Provider Manager
```

## Server Startup Sequence

### Initialization Flow

When the Node.js backend server starts, it follows this sequence:

1. **Load Environment Configuration**
   - Read `.env` file if present
   - Set up logging and error handlers

2. **Initialize Core Services**
   ```javascript
   // In server/index.js - initializeServices()
   // This happens automatically on server start
   
   // Step 1: Create AI Provider Manager
   aiManager = new AIProviderManager(formatters.SECURITY_ANALYSIS_PROMPT);
   
   // Step 2: Load saved provider config (if any)
   const savedCfg = loadSavedProviderConfig();
   if (savedCfg && savedCfg.provider) {
     await aiManager.initializeProvider(savedCfg.provider, savedCfg.config);
   }
   
   // Step 3: If no saved config, initialize default provider
   if (!aiManager.getCurrentProvider()) {
     await aiManager.initializeDefaultProvider();
     // This sets up local LLM with default settings
     // DOES NOT require Ollama to be running
   }
   ```

3. **Default Local LLM Configuration**
   - The server ALWAYS configures a default local LLM provider
   - Uses Ollama on `http://localhost:11434` with `llama3.1:8b` model
   - **Attempts to test connection** to fetch context window if Ollama is available
   - Falls back to configuration-only mode if Ollama isn't running yet
   - Users do NOT need to manually configure through Settings UI

4. **Start Express Server**
   - Bind to port 3002 (or available port)
   - All API endpoints become available
   - Health check endpoint confirms provider status

**IMPORTANT**: This means threat analysis and chat features will work immediately if:
- Ollama is running on the default port (11434)
- The `llama3.1:8b` model is available

Users only need to open Settings and save configuration if they want to:
- Use a different model
- Change temperature/token settings
- Switch to a cloud provider (OpenAI, Anthropic, etc.)

## Service Layer

### 1. Core Services

#### DiagramIndexer (`/server/services/DiagramIndexer.js`)
**Purpose**: Indexes and analyzes diagram structure for efficient querying

**Key Features**:
- Component code generation (e.g., "SER-DMZ-001")
- Persists the generated `indexCode` (nodes) / `edgeCode` (edges) back onto the **same**
  diagram objects (`node.data.indexCode`, `edge.data.indexCode`).  The back-end is now the
  single source of truth – every consumer (front-end tool-tips, diagram legend,
  ContextCypher prompt, etc.) reads the exact same codes.
- Spatial indexing for annotations
- Zone-based component grouping
- Connection analysis and mapping
- High-value component detection

**Methods**:
```javascript
indexDiagram(diagram)
getComponentByCode(code)
getDiagramSummary()
getComponentDirectory()
```

#### Threat Intel Extraction (`/server/routes/threatIntelRoutes.js`)
**Purpose**: Filter and extract intel from user-imported text/files

**Key Features**:
- Component-aware filtering (`server/utils/threatIntelFilter.js`)
- Pattern-based extraction for CVEs, IOCs, threat actors
- Returns structured intel and extraction metadata

#### MCPService (`/server/services/MCPService.js`)
**Purpose**: Model Context Protocol integration for extensibility

**Features**:
- Third-party tool integration
- Custom prompt injection
- External service communication

### 2. AI Provider Management

#### AIProviderManager (`/server/aiProviders.js`)
**Purpose**: Unified interface for multiple AI providers

**Supported Providers**:
- **OpenAI**: GPT-4, GPT-3.5-turbo
- **Anthropic**: Claude 3 family
- **Google Gemini**: Gemini Pro models
- **Local/Ollama**: Any Ollama-compatible model

**Default Provider Initialization**:
```javascript
// IMPORTANT: On server startup, the system automatically initializes
// a default local LLM provider with these settings:
{
  provider: 'local',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.1:8b',
  temperature: 0.1,
  maxTokens: 4096
}

// The initialization attempts to test the connection and fetch
// the actual context window from Ollama if available.
// If Ollama is not running, it falls back to "soft" configuration
// mode, allowing the app to work once Ollama is started.
```

**Key Features**:
```javascript
// Provider initialization with fallback chain
initializeDefaultProvider() // Tries local first, attempts test for context window
initializeProvider(type, config, skipTest = false)
switchProvider(type)
testProvider(type) // Fetches actual context window for Ollama
generateAnalysis(prompt, diagram)
```

**Token Management**:
```javascript
tokenLimits: {
  gemini:    { maxInput: 30720,  maxOutput: 32768 },
  openai:    { maxInput: 128000, maxOutput: 4096  },
  anthropic: { maxInput: 200000, maxOutput: 4096  },
  // `local` is now dynamic – updated at runtime after we query Ollama's
  // /show endpoint.  The default is set to the community maximum so the
  // optimiser never underestimates available space.
  local:     { maxInput: 131072, maxOutput: 4096  }
}
```

**Context Window Detection for Ollama**:
When initializing the local provider, the system:
1. Calls `testProvider('local')` which sends a test request to Ollama
2. During the test, fetches model info via `/api/show` endpoint
3. Parses the response to extract actual context window from model parameters
4. Updates `tokenLimits.local.maxInput` with the detected value
5. Returns the updated limits in the API response for frontend synchronization

Example Ollama model info response parsing:
```javascript
// From testProvider() in aiProviders.js
const modelInfoResponse = await fetch(`${baseUrl}/api/show`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: modelName })
});

// Extract context window from parameters
// Ollama may return: "num_ctx 131072\n" in the parameters field
if (parameters.includes('num_ctx')) {
  const match = parameters.match(/num_ctx\s+(\d+)/);
  if (match) {
    detectedContextWindow = parseInt(match[1], 10);
  }
}
```

### 3. Threat Intelligence Services

#### ThreatIntelService (Temporarily Disabled)
**Purpose**: Aggregate threat data from multiple sources

**Planned Sources**:
- MITRE ATT&CK Framework
- GitHub Security Advisories
- AlienVault OTX
- NVD (National Vulnerability Database)

## API Endpoints

### Health & Status

#### `GET /api/health`
**Purpose**: Server health check and status

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-19T10:30:00Z",
  "port": 3002,
  "uptime": 3600,
  "server": {
    "env": "production",
    "aiProviderConfigured": true,
    "currentProvider": "local"
  }
}
```

### Analysis & Generation Endpoints

#### `POST /api/analyze`
**Purpose**: Full diagram security analysis

**Request Body**:
```json
{
  "diagram": {
    "nodes": [...],
    "edges": [...],
    "metadata": {...}
  },
  "context": {
    "customContext": "Organization security standards...",
    "drawings": [...],
    "messageHistory": [...],
    "metadata": {
      "analysisMode": "comprehensive",
      "useSmartContext": true
    }
  }
}
```

**Response**:
```json
{
  "content": "## Security Analysis\n...",
  "metadata": {
    "provider": "local",
    "model": "llama3.1:8b",
    "timestamp": "2025-01-19T10:30:00Z",
    "contextOptimized": true,
    "threatIntelSources": {
      "mitre": 0,
      "github": 0,
      "alienVault": 0,
      "nvd": 0
    }
  }
}
```

#### `POST /api/chat`
**Purpose**: Interactive conversation with context

**Request Body**:
```json
{
  "message": "What are the main security risks?",
  "diagramId": "diagram-123",
  "provider": "local",
  "context": {
    "diagram": {...},
    "messageHistory": [...],
    "customContext": {...},
    "metadata": {
      "useSmartContext": true
    }
  }
}
```

#### `POST /api/threat-intel/extract`
**Purpose**: Filter and extract CVEs/IOCs/actors from user-imported intel

**Request Body**:
```json
{
  "rawContent": "...intel text or JSON...",
  "diagram": { "nodes": [...], "edges": [...], "metadata": {...} }
}
```

**Response**:
```json
{
  "success": true,
  "extractedIntel": {
    "recentCVEs": "...",
    "knownIOCs": "...",
    "campaignInfo": "...",
    "intelligenceDate": "2025-09-15",
    "extractionMetadata": {
      "filtered_items": 42,
      "matched_components": ["Apache", "MySQL"],
      "filtering": "advanced-component-based"
    }
  }
}
```

#### `POST /api/generate-diagram` (New in 2025-07)
**Purpose**: AI-powered diagram generation from text description

**Key Features**:
- Dedicated endpoint separate from chat/analysis
- Direct AI provider integration
- Three generation modes (technical, process, hybrid)
- No interference with threat analysis prompts
- Prompts built directly in endpoint handler
- Metadata extraction from user descriptions

**Request Body**:
```json
{
  "description": "E-commerce platform with load balancer, web servers...",
  "generationType": "technical", // "technical" | "process" | "hybrid"
  "context": {} // Optional additional context
}
```

**Response**:
```json
{
  "success": true,
  "content": "```cypher\nCREATE (:SystemMetadata {...})\n...```",
  "generationType": "technical",
  "timestamp": "2025-07-31T10:30:00Z"
}
```

**Generation Modes**:
- **Technical**: Exact component representation, no grouping, models vulnerabilities
  - Includes all metadata explicitly mentioned (vendor, version, technology, protocols)
  - No assumptions about security controls not described
  - Two-step process: Create all nodes → Connect every node
- **Process**: Aggressive grouping for workflows, business focus, 30-50 nodes max
  - Groups similar components with instanceCount
  - Focus on flow rather than technical details
  - Metadata included only if explicitly provided
- **Hybrid**: Smart grouping for similar components, balanced approach
  - Groups 3+ similar components
  - Never groups security devices
  - Includes instanceCount for all grouped components
  - Extracts metadata without assumptions

**Metadata Extraction**:
The endpoint instructs the AI to extract metadata ONLY from the user's description:
- vendor (e.g., "nginx", "PostgreSQL", "AWS")
- version (e.g., "v1.22.1", "14.6", "2.7.5") 
- technology (e.g., "React frontend", "Java 17", "Spring Boot")
- protocols (e.g., "HTTP,HTTPS", "MySQL", "TLS")
- securityControls (only if explicitly mentioned)

#### `POST /api/convert-diagram` (New in 2025-09)
**Purpose**: AI-powered conversion of imported diagrams to ContextCypher format

**Key Features**:
- Dedicated endpoint for diagram format conversion
- Privacy-focused with explicit user consent
- Supports conversion from Mermaid, PlantUML, DrawIO, Graphviz, and JSON formats
- Uses configured AI provider (local or cloud)

**Request Body**:
```json
{
  "format": "mermaid",  // "mermaid" | "plantuml" | "drawio" | "dot" | "json"
  "content": "graph TD\n  A[Web Server] --> B[Database]",
  "prompt": "Convert this Mermaid diagram to ContextCypher format...",
  "provider": "local"  // Optional - uses current provider if not specified
}
```

**Response**:
```json
{
  "success": true,
  "diagram": {
    "nodes": [
      {
        "id": "web-server-1",
        "label": "Web Server",
        "type": "server",
        "zone": "DMZ",
        "metadata": {...}
      }
    ],
    "edges": [...],
    "zones": [...]
  },
  "provider": "local"
}
```

**Privacy Implementation**:
- Frontend requires explicit user consent before sending data to AI
- Optional data sanitization removes sensitive information
- Clear indication of which AI provider will process the data

### Settings Management

#### `POST /api/settings/ai-provider`
**Purpose**: Configure AI provider settings and test connectivity

**Request Body**:
```json
{
  "provider": "local",  // or "openai", "anthropic", "gemini"
  "apiKey": "sk-...",   // For public providers only
  "baseUrl": "http://127.0.0.1:11434",  // For local provider
  "model": "llama3.1:8b",
  "temperature": 0.2,
  "maxTokens": 4096,
  "organizationId": "org-...",  // OpenAI only
  "projectId": "project-...",   // Gemini only
  "testOnly": false     // If true, only tests without saving
}
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully switched to local",
  "currentProvider": "local",
  "tokenLimits": {
    "maxInput": 131072,   // Actual context window detected
    "maxOutput": 131072   // For local, matches maxInput
  }
}
```

**Key Features**:
- For local providers, automatically detects context window from Ollama
- Returns actual token limits in response for UI synchronization
- Supports test-only mode to validate settings without applying them
- Handles provider-specific configurations (org ID for OpenAI, project ID for Gemini)

#### `GET /api/settings/current-provider`
**Purpose**: Get current AI provider configuration and status

**Response**:
```json
{
  "provider": "local",
  "isInitialized": true,
  "availableProviders": ["openai", "anthropic", "gemini", "local"],
  "tokenLimits": {
    "maxInput": 131072,
    "maxOutput": 131072
  },
  "modelConfig": {
    "model": "llama3.1:8b",
    "provider": "local",
    "contextWindow": 131072,
    "maxTokens": 131072
  }
}
```

### Provider Management

#### `POST /api/providers/initialize`
**Purpose**: Initialize a new AI provider

**Request Body**:
```json
{
  "provider": "openai",
  "config": {
    "apiKey": "sk-...",
    "model": "gpt-4",
    "temperature": 0.1
  }
}
```

#### `POST /api/providers/switch`
**Purpose**: Switch active AI provider

**Request Body**:
```json
{
  "provider": "anthropic"
}
```

#### `GET /api/providers/status`
**Purpose**: Get all provider statuses

**Response**:
```json
{
  "providers": {
    "openai": { "status": "ready", "model": "gpt-4" },
    "anthropic": { "status": "not_initialized" },
    "gemini": { "status": "error", "error": "Invalid API key" },
    "local": { "status": "ready", "model": "llama3.1:8b" }
  },
  "currentProvider": "local"
}
```

### Model Configuration

#### `GET /api/model/info`
**Purpose**: Get current model configuration

**Response**:
```json
{
  "provider": "local",
  "model": "llama3.1:8b",
  "maxTokens": 8192,
  "contextWindow": 8192,
  "capabilities": {
    "streaming": true,
    "functionCalling": false
  }
}
```

## Model Profile System

### Overview

The Model Profile System provides a centralized, modular approach to managing model-specific behaviors across different AI providers and endpoints. This system allows for fine-tuned control over how different models handle prompts, responses, and formatting requirements without modifying core endpoint logic.

### Architecture

**Location**: `/server/config/modelProfiles.js`

The system consists of:
1. **Model Registry**: Central configuration for all model-specific behaviors
2. **Profile Types**: Endpoint-specific configurations (chat, threatAnalysis, diagramGeneration)
3. **Helper Functions**: Utilities for profile lookup and application

### Model Registry Structure

```javascript
const modelRegistry = {
  'model-key': {
    patterns: ['pattern1', 'pattern2'],  // Patterns to match model names
    profiles: {
      chat: {
        // Chat-specific configurations
        systemPromptPrefix: '',           // Prepended to system prompt
        systemPromptAdditions: '',        // Appended to system prompt
        requiresDiagramFirst: false,      // Put diagram before user message
        contextReinforcement: false,      // Add context reminders
        responseProcessor: function(response) { return response; }
      },
      threatAnalysis: {
        // Threat analysis configurations
        systemPromptAdditions: '',
        requiresJsonExample: false,       // Include JSON structure example
        jsonExample: {},                  // Example JSON structure
        systemAnalysisExample: {},        // System analysis JSON example
        responseProcessor: function(response) { return response; },
        postProcessVulnerabilities: false // Convert vulnerabilities to threats
      },
      diagramGeneration: {
        // Diagram generation configurations
        useJsonFormat: false,             // Use JSON instead of Cypher
        systemPrompt: '',                 // Override entire system prompt
        responseProcessor: function(response) { return response; }
      }
    }
  }
};
```

### Currently Configured Models

#### 1. Foundation Security Models (`foundation-sec`)
- **Chat**: Overrides default task analysis behavior with explicit chat instructions
- **Threat Analysis**: Standard JSON formatting with vulnerability post-processing
- **Diagram Generation**: Uses default Cypher format

#### 2. GPT-OSS Models (`gpt-oss`)
- **Chat**: No special handling
- **Threat Analysis**: Response sanitization to remove thinking process
- **Diagram Generation**: Uses default Cypher format

#### 3. Claude Opus 4 (`claude-opus-4`)
- **Chat**: Adds instructions for clear, direct responses
- **Threat Analysis**: Strict JSON formatting with detailed instructions
- **Diagram Generation**: Enhanced Cypher output validation

#### 4. Local LLM Models (`local-llm`)
Patterns: `llama`, `mistral`, `mixtral`, `qwen`, `phi`, `deepseek`, `gemma`, `vicuna`, `wizardlm`
- **Chat**: Diagram-first ordering, context reinforcement for diagram queries
- **Threat Analysis**: Diagram included in system message (handled by SimplifiedThreatAnalyzer)
- **Diagram Generation**: JSON format with structured component extraction

### Helper Functions

#### `findModelProfile(modelName)`
Finds a model profile by matching patterns against the model name.

```javascript
const profile = findModelProfile('claude-opus-4-20250514');
// Returns: { key: 'claude-opus-4', patterns: [...], profiles: {...} }
```

#### `getEndpointProfile(modelName, endpoint)`
Gets the profile for a specific endpoint.

```javascript
const chatProfile = getEndpointProfile('llama3.1:8b', 'chat');
// Returns: { requiresDiagramFirst: true, contextReinforcement: true, ... }
```

#### `isLocalProvider(provider, modelName)`
Checks if a provider or model is local/Ollama.

```javascript
const isLocal = isLocalProvider('local', 'llama3.1:8b');
// Returns: true
```

#### `applyChatContextReinforcement(userMessage, provider, modelName)`
Applies context reinforcement for chat messages if needed by the model.

```javascript
const reinforced = applyChatContextReinforcement(
  "What's in this diagram?", 
  'local', 
  'llama3.1:8b'
);
// Returns: "What's in this diagram?\n\n[Context: I have provided you...]"
```

#### `getDiagramGenerationConfig(provider, modelName)`
Gets complete diagram generation configuration.

```javascript
const config = getDiagramGenerationConfig('local', 'llama3.1:8b');
// Returns: { useJsonFormat: true, systemPrompt: '...', responseProcessor: fn }
```

### Integration Points

#### 1. SimplifiedThreatAnalyzer
```javascript
const modelProfile = getEndpointProfile(currentModel, 'threatAnalysis');

// Apply system prompt additions
if (modelProfile && modelProfile.systemPromptAdditions) {
  systemPrompt += modelProfile.systemPromptAdditions;
}

// Apply response processor
if (modelProfile && modelProfile.responseProcessor) {
  jsonStr = modelProfile.responseProcessor(jsonStr);
}
```

#### 2. Chat Endpoints
```javascript
// Apply context reinforcement
userMessage = applyChatContextReinforcement(userMessage, provider, currentModel);

// Pass local LLM flag to formatters
isLocalLLM: isLocalProvider(provider, currentModel)
```

#### 3. Diagram Generation
```javascript
// Get diagram config
const diagramConfig = getDiagramGenerationConfig(provider, currentModel);

// Use JSON format if configured
if (diagramConfig.useJsonFormat) {
  // Use JSON extraction approach
}

// Apply response processor
if (diagramConfig.responseProcessor) {
  content = diagramConfig.responseProcessor(content);
}
```

### Adding New Model Profiles

To add support for a new model:

1. **Add to Model Registry**:
```javascript
// In modelProfiles.js
const modelRegistry = {
  // ... existing models ...
  
  'new-model': {
    patterns: ['new-model-name', 'new-model-variant'],
    profiles: {
      chat: {
        systemPromptAdditions: '\n\nSpecial instructions for this model...',
        contextReinforcement: true
      },
      threatAnalysis: {
        requiresJsonExample: true,
        jsonExample: {
          // Your JSON structure
        },
        responseProcessor: function(response) {
          // Custom response processing
          return response;
        }
      },
      diagramGeneration: {
        useJsonFormat: true,
        systemPrompt: 'Custom prompt for diagram generation...'
      }
    }
  }
};
```

2. **Pattern Matching**:
- Patterns are matched case-insensitively against model names
- Use specific patterns to avoid false matches
- Common patterns: model name, version identifiers, variants

3. **Profile Configuration**:
- Only define profiles for endpoints that need special handling
- Undefined profiles will use default behavior
- Response processors should be idempotent

4. **Testing**:
```javascript
// Test profile detection
const profile = findModelProfile('new-model-name-v1');
console.log(profile); // Should return your configuration

// Test endpoint profile
const chatProfile = getEndpointProfile('new-model-name-v1', 'chat');
console.log(chatProfile); // Should return chat-specific config
```

### Best Practices

1. **Minimal Changes**: Only add profiles for models that need special handling
2. **Preserve Defaults**: Models without profiles use standard behavior
3. **Test Thoroughly**: Verify profile matching and response processing
4. **Document Behavior**: Add comments explaining why specific handling is needed
5. **Backward Compatibility**: Ensure changes don't break existing models

### Common Patterns

#### JSON Format Enforcement
```javascript
threatAnalysis: {
  systemPromptAdditions: '\n\nReturn ONLY valid JSON, no explanations.',
  requiresJsonExample: true,
  jsonExample: { /* structure */ }
}
```

#### Response Sanitization
```javascript
responseProcessor: function(response) {
  // Remove markdown code blocks
  const cleaned = response.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
  
  // Extract JSON from text
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned;
}
```

#### Context Ordering
```javascript
chat: {
  requiresDiagramFirst: true,  // Place diagram before user message
  contextReinforcement: true   // Add context reminders
}
```

### Troubleshooting

1. **Profile Not Applied**:
   - Check pattern matching with `findModelProfile(modelName)`
   - Verify endpoint name matches exactly
   - Check logs for model name format

2. **Response Processing Errors**:
   - Response processors should handle edge cases
   - Always return a valid response, even on error
   - Log processing attempts for debugging

3. **Prompt Issues**:
   - Test with minimal additions first
   - Verify JSON examples are valid
   - Check for conflicting instructions

## AI Provider Integration

### Provider Architecture

```javascript
class AIProviderManager {
  async generateAnalysis(prompt, diagram) {
    switch(this.currentProvider) {
      case 'openai':
        return this.generateOpenAIResponse(prompt);
      case 'anthropic':
        return this.generateAnthropicResponse(prompt);
      case 'gemini':
        return this.generateGeminiResponse(prompt);
      case 'local':
        return this.generateLocalResponse(prompt);
    }
  }
}
```

### Local LLM Integration (Ollama)

**Direct HTTP Communication**:
```javascript
async generateLocalResponse(prompt) {
  const response = await axios.post(
    `${this.localLLMConfig.baseUrl}/api/generate`,
    {
      model: this.localLLMConfig.model,
      prompt: prompt,
      options: {
        temperature: 0.1,
        num_predict: this.localLLMConfig.maxTokens
      }
    }
  );
  return response.data.response;
}
```

**WSL/Network Detection**:
- Auto-detects WSL environment
- Provides configuration guidance
- Handles network binding issues

**Status Feedback System (2025-08)**:
The local LLM integration includes real-time status feedback for better user experience:

1. **Connection Status Updates**:
   ```javascript
   // In aiProviders.js - generateLocalResponse()
   if (onToken) {
     onToken('[STATUS:CONNECTING_OLLAMA]');
   }
   ```

2. **Timeout Handling**:
   - 3-minute timeout for Ollama requests
   - Sends `[STATUS:TIMEOUT]` on timeout
   - Proper cleanup with AbortController

3. **Status Token Types**:
   - `[STATUS:CONNECTING_OLLAMA]` - Initial connection attempt
   - `[STATUS:WAITING_FOR_MODEL]` - Model is processing request
   - `[STATUS:MODEL_RESPONDING]` - Model started generating response
   - `[STATUS:TIMEOUT]` - Request timed out
   - `[STATUS:ERROR]` - Connection or processing error

4. **SSE Event Conversion**:
   The streaming endpoint (`/api/chat/stream`) detects these status tokens and converts them to proper SSE events that the frontend can handle, providing real-time feedback to users about the status of their Ollama requests.

### Cloud Provider Integration

**OpenAI SDK Usage**:
```javascript
const openai = new OpenAI({
  apiKey: config.apiKey,
  maxRetries: 3,
  timeout: 120000,
  organization: config.organizationId
});
```

**Streaming Support**:
- Server-Sent Events (SSE) for real-time responses
- Chunk-based processing
- Client disconnect handling

### Chat Prompt Flow (2025-07 update)

All `/api/chat` and `/api/chat/stream` calls now use a single helper in
`server/utils/formatters.js` that produces the **ContextCypher** prompt. The helper merges any frontend-provided `additionalContext` with server-generated context (node/edge additional context, custom context), includes the diagram (Cypher), and, for local LLMs, defers TASK/ANSWER FORMAT until after the full context (diagram + imported Threat Intel).

**Note**: The `/api/generate-diagram` endpoint does NOT use this flow. It builds prompts directly in the endpoint handler to ensure complete separation from threat analysis logic.

### Diagram Generation Prompt Flow

The `/api/generate-diagram` endpoint uses a dedicated prompt construction approach:

1. **System Prompt**: Identifies ContextCypher and sets Cypher output format requirement
2. **Generation Mode Prompt**: Type-specific instructions (technical/process/hybrid)
3. **Metadata Instructions**: Extract vendor, version, technology, protocols ONLY from user input
4. **Two-Step Process**: 
   - Step 1: Create all nodes with metadata
   - Step 2: Connect every node (validation: connections >= nodes)
5. **Example Format**: Shows proper Cypher syntax with metadata fields

Prompt anatomy:
1. **System Header** – identifies the assistant as ContextCypher and summarises its capabilities.
2. **SYSTEM_OVERVIEW** – counts of components, zones and edges.
3. **TASK** – last user utterance + one-line orientation (Nodes / Edges / Zones).
4. **ANSWER FORMAT** – fixed 4-section template.
5. **VISUAL DIAGRAM STRUCTURE** – full Cypher block (every node/edge property).
6. **ADDITIONAL CONTEXT** – customContext, drawings, change log, node/edge notes.
7. **THREAT INTEL** – when enabled.
8. **CONVERSATION HISTORY** – newest 4 messages verbatim, older ones possibly compressed.

The helper also injects `options.num_ctx = contextWindow` for local models, so Ollama receives the full 131 k-token budget when available.

**Why the ordering?** User intent appears before the 30 k-char Cypher block, ensuring even small/quantised local models “lock on” before wading through graph data. Cloud models handle either order, so they benefit too.

## Simplified Threat Analysis

### Direct AI Provider Integration

**Location**: `/server/services/SimplifiedThreatAnalyzer.js`

**Key Features**:
- Direct integration with AI providers (Ollama, OpenAI, Anthropic, etc.)
- Multi-pass analysis for large diagrams
- Trust boundary awareness
- Token-optimized context building
- Component-specific threat isolation
- Qualitative risk assessment with 6x6 matrix

### Analysis Approach

The simplified threat analyzer uses a streamlined approach that maintains the quality of analysis while removing the complexity of multi-agent orchestration:

1. **Single-Pass Analysis** (for smaller diagrams):
   - Comprehensive analysis in one AI call
   - Efficient for diagrams under 50 components
   - Preserves all context and relationships

2. **Multi-Pass Analysis** (for larger diagrams):
   - Pass 1: Trust boundary and zone identification
   - Pass 2: Zone-by-zone detailed analysis
   - Pass 3: Cross-zone threat path analysis
   - Pass 4: Consolidation and deduplication

### Context Optimization

**Unified Context Building**:

The system now uses a single `ContextOptimizationService` that provides:
- Progressive context scaling based on token limits
- Dynamic message history optimization
- Foundation-first context assembly
- Semantic understanding without keyword matching

**Context Structure**:
```
- System prompt (role and expertise)
- Diagram overview (zones, components, connections)*
- Component directory with codes
- Threat analysis summary
- Message history (dynamically sized)
- Custom context and constraints
```
*Note: System overview can be excluded using `excludeSystemOverview` flag for component-specific analysis

**Structured Response Format**:
The threat analyzer now uses a structured format for consistent threat extraction:
- `## SYSTEM_OVERVIEW` - Overall architecture security posture
- `## COMPONENT_THREATS` - Component-specific threats with risk assessment
- `## ATTACK_PATHS` - Cross-component attack vectors with MITRE ATT&CK mapping
- `## VULNERABILITIES` - System-wide vulnerabilities with CVE/CVSS
- `## RECOMMENDATIONS` - Risk-prioritized mitigation strategies

## Data Flow & Communication

### Request Flow

```
1. Frontend → API Request → Express Router
2. Router → Middleware Chain → Request Handler
3. Handler → Service Layer → AI Provider
4. AI Response → Formatting → Response to Frontend
```

### Context Building Pipeline

```javascript
// Simplified flow
async function buildContext(diagram, query) {
  // 1. Index diagram
  const indexer = new DiagramIndexer();
  indexer.indexDiagram(diagram);
  
  // 2. Build foundation context
  const foundation = {
    summary: indexer.getDiagramSummary(),
    directory: indexer.getComponentDirectory()
  };
  
  // 3. Evaluate adequacy
  const adequacy = await evaluateContextAdequacy(query, foundation);
  
  // 4. Fetch details if needed
  if (!adequacy.adequate) {
    const details = await fetchComponentDetails(adequacy.requested);
    return mergeContexts(foundation, details);
  }
  
  return foundation;
}
```

### Error Handling Chain

1. **Service Level**: Try operation → Catch → Log → Return error
2. **API Level**: Validate → Process → Handle errors → Format response
3. **Client Level**: Receive error → Display user-friendly message

## Security & Authentication

### Network Security

**Environment-Based Binding**:
```javascript
// Server host configuration based on environment
function getServerHost() {
  const env = process.env.NODE_ENV || 'development';
  
  switch(env) {
    case 'production':
      return '127.0.0.1'; // Localhost only for security
    
    case 'test':
      return '0.0.0.0'; // For Playwright/testing
    
    case 'development':
      // Only bind to all interfaces if explicitly requested
      return process.env.BIND_ALL_INTERFACES === 'true' ? '0.0.0.0' : '127.0.0.1';
    
    default:
      return '127.0.0.1'; // Safe default
  }
}

const host = getServerHost();
const server = app.listen(port, host, () => {
  console.log(`Server running on ${host}:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Security warning for 0.0.0.0 binding
  if (host === '0.0.0.0') {
    console.warn('⚠️  WARNING: Server is accessible from all network interfaces!');
  }
});
```

This configuration ensures:
- **Production**: Binds to `127.0.0.1` only, preventing external access
- **Development**: Binds to `127.0.0.1` by default, can use `0.0.0.0` with `BIND_ALL_INTERFACES=true`
- **Test**: Binds to `0.0.0.0` for Playwright and integration testing
- Security warnings when binding to all interfaces

**CORS Configuration**:
```javascript
// Environment-aware CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Production: Only allow Tauri origins
    // Development: Allow localhost and WSL IPs
    // Test: Permissive for Playwright testing
    
    // Tauri v2 origins
    const allowedPrefixes = [
      'tauri://',
      'https://tauri.',
      'http://tauri.',
      'wry://',
      'file://',
      'asset.localhost',
      'https://asset.localhost',
      'http://asset.localhost'
    ];
    
    // Check if origin matches Tauri patterns
    const isTauriOrigin = origin && allowedPrefixes.some(prefix => origin.includes(prefix));
    
    if (!origin || isTauriOrigin || isAllowedByEnvironment(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-App-Secret', 'X-Offline-Mode']
};

app.use(cors(corsOptions));
```

**Security Headers**:
```javascript
// Comprehensive security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; ...");
  
  // HSTS in production only
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});
```

**Rate Limiting**:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

### API Key Management

**Environment Variables**:
```bash
# AI Provider Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Application Security
APP_SECRET=your-secure-secret-here  # Required in production
NODE_ENV=production                  # Controls security settings
BIND_ALL_INTERFACES=false           # Development only
```

**Application Authentication**:
```javascript
// Simple shared secret for Tauri-backend communication
app.use('/api/', (req, res, next) => {
  const appSecret = req.headers['x-app-secret'];
  const expectedSecret = process.env.APP_SECRET || 'ai-threat-modeler-dev-secret';
  
  if (appSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
});
```

**Frontend Integration**:
```javascript
// Axios interceptor automatically adds headers (src/api.ts)
api.interceptors.request.use((config) => {
  config.headers['X-App-Secret'] = process.env.REACT_APP_SECRET || 'ai-threat-modeler-dev-secret';
  config.headers['X-Offline-Mode'] = 'true';
  return config;
});

// Raw fetch calls must add headers explicitly
fetch(`${apiBaseUrl}/api/chat/stream`, {
  headers: { 
    'Content-Type': 'application/json',
    'X-App-Secret': process.env.REACT_APP_SECRET || 'ai-threat-modeler-dev-secret',
    'X-Offline-Mode': 'true'
  },
  // ...
});
```

**Secure Storage**:
- Keys never logged
- Environment-only access
- No persistence in requests
- App secret required for all API calls (except health check)
- API keys stored using Tauri Plugin-Stronghold encryption (XChaCha20Poly1305)
- Keys encrypted at rest with 256-bit keys derived from application secret
- Automatic memory cleanup after key operations
- Secure deletion with memory overwrite

### Request Validation

**Input Sanitization**:
- Diagram structure validation
- Token limit enforcement
- SQL injection prevention
- XSS protection

## Performance & Scalability

### Optimization Strategies

1. **Connection Pooling**:
   - Reused HTTP clients
   - Persistent AI provider connections

2. **Caching**:
   - Threat intelligence caching
   - Model response caching (planned)

3. **Async Operations**:
   - Non-blocking I/O
   - Parallel agent execution
   - Background service initialization

4. **Memory Management**:
   ```javascript
   // Periodic memory monitoring
   setInterval(() => {
     const usage = process.memoryUsage();
     logger.info('Memory usage:', {
       rss: `${(usage.rss / 1048576).toFixed(1)} MB`,
       heap: `${(usage.heapUsed / 1048576).toFixed(1)} MB`
     });
   }, 60000);
   ```

### Performance Metrics

**Response Times** (Local LLM):
- Intent Analysis: 0.5-1s
- Component Analysis: 1-2s
- Full Analysis: 5-8s
- Parallel Security: 2-3s

**Token Usage**:
- Minimal Context: <1k tokens
- Overview: 1-2k tokens
- Focused: 2-4k tokens
- Detailed: 4-8k tokens

## Deployment Architecture

### One-Click Offline Installer (Production)

```
AI-Threat-Modeler/
├── AI-Threat-Modeler.exe          # Tauri wrapper (Rust + WebView)
  ├── resources/
  │   ├── server_dist/               # Compiled backend (bytenode) + runtime deps
  │   │   ├── index.js + *.jsc + node_modules/bytenode
  │   ├── node/                      # Portable Node runtime
  │   │   └── node.exe
│   ├── # (Python service removed - simplified architecture)
│   ├── ollama/                   # Ollama binary + model files (*.bin)
│   └── data/                     # Cached diagrams, logs, threat-intel
└── LICENSE
```

Nothing is downloaded after installation; every binary and model required for **offline** operation ships inside the `resources/` directory.

### IP Protection in Packaged Builds

#### Backend Protection
- The packaged app bundles `server_dist/**` (bytenode‑compiled) instead of raw `server/**`.
  - Entry points and services are compiled to V8 bytecode (`*.jsc`) with tiny JS loaders that `require('bytenode')`.
  - `force-production.js` remains plain to bootstrap and then load bytecode.
  - `modelResponseProcessors.js` remains plain for dynamic function resolution compatibility
  - Protection coverage: ~90% of project files (critical logic compiled, formatting functions plain)
  - Model response processors separated into dedicated module for runtime compatibility

#### Frontend Protection (Selective Obfuscation)
- Production builds use selective obfuscation strategy:
  - **NPM Package**: `build-npm.cmd` uses `npm run build:prod` + `scripts/obfuscate-frontend-selective-prod.js`
  - **Vercel**: `vercel.json` configured with `"buildCommand": "npm run build:prod-selective"`
  - **Docker/Portable**: Uses same selective obfuscation approach

- Selective obfuscation targets only critical IP:
  - License validation and key generation functions
  - Cryptographic operations (HMAC, encryption)
  - API secrets and authentication logic
  - Skips all canvas/UI components for performance

- Pattern-based file selection:
  - Scans bundled JS files for sensitive patterns
  - Only obfuscates files with IP code and NO performance code
  - Falls back to standard minification if no pure IP files found

- Build process:
  - `GENERATE_SOURCEMAP=false` for all production builds
  - Selective obfuscation applied post-build
  - Source maps removed after processing
  - Result: Protected IP with smooth canvas performance

#### Model Response Processor Architecture
- **Separation of Concerns**: Response processor functions are separated from configuration data
  - `config/modelProfiles.js`: Contains model configurations with string identifiers for processors
  - `utils/modelResponseProcessors.js`: Contains the actual processor function implementations
- **Runtime Compatibility**: modelResponseProcessors.js is excluded from bytecode compilation to support dynamic function resolution
- **Runtime Resolution**: The `getProcessor()` function dynamically retrieves processors by name at runtime
- **Security Note**: While response processors remain as plain JS, the core AI logic and threat analysis remain protected via bytecode
- **Supported Processors**:
  - `gptOssProcessor`: Extracts JSON from responses with potential wrapper text
  - `claudeOpus4Processor`: Similar JSON extraction for Claude models
  - `claudeOpus4DiagramProcessor`: Handles Cypher output formatting
  - `localLLMDiagramProcessor`: Processes JSON from various local LLM response formats

Implication: Packaged builds provide comprehensive protection with 91.9% backend coverage and 100% frontend coverage, deterring casual reverse engineering while preserving offline operation and performance. The model response processor architecture ensures compatibility with bytecode compilation while maintaining flexibility for model-specific behaviors.

### Frontend AI Provider Initialization (2025-08)

The frontend (SettingsDrawer component) now implements proper sequencing for AI provider initialization:

### Initialization Flow

1. **Server Connectivity Check**:
   - Frontend subscribes to ConnectionManager status on component mount
   - Waits for `connected: true` status before attempting AI provider initialization
   - Prevents premature API calls to an unavailable backend

2. **Provider Initialization**:
   - **Local Providers (Ollama)**:
     - Automatically initialized on startup if `llmMode === 'local'`
     - Sends configuration with `testOnly: false` to fetch context window
     - Context window detection happens during the test phase
   - **Public Providers (OpenAI, Anthropic, Gemini)**:
     - Initialized only if API keys are stored in secure storage
     - Configuration includes model selection and provider-specific settings

3. **Connection Subscription Pattern**:
   ```javascript
   // SettingsDrawer.tsx
   const unsubscribe = connectionManager.subscribe(async (status) => {
     if (!status.connected) return; // Wait for connection
     
     unsubscribe(); // One-time initialization
     // Initialize appropriate provider based on settings
   });
   ```

4. **Context Window Synchronization**:
   When the local LLM context window is fetched, it's synchronized across three systems:
   - **Global Token Estimator**: `setGlobalContextWindow(contextWindow)` - Used for token calculations
   - **Settings Context**: `updateAPISettings({ localLLM: { ...config, contextWindow } })` - Triggers UI updates
   - **Local Component State**: Updates SettingsDrawer's local state for immediate UI feedback
   
   This triple update ensures all components display the correct context window immediately.

5. **Token Limits Response**:
   The `/api/settings/ai-provider` endpoint returns token limits in its response:
   ```javascript
   {
     success: true,
     message: "Successfully switched to local",
     currentProvider: "local",
     tokenLimits: {
       maxInput: 131072,  // Actual context window from Ollama
       maxOutput: 131072
     }
   }
   ```

6. **UI Components Integration**:
   - **AnalysisPanel**: Watches `settings?.api?.localLLM?.contextWindow` to display token usage
   - **Token Estimator**: Uses global context window for all token calculations
   - **Settings Drawer**: Shows actual context window fetched from Ollama

7. **Benefits**:
   - No false positive connectivity on startup
   - AI providers only initialize after server is ready
   - Local LLM context window is fetched automatically
   - Consistent initialization for both local and public providers
   - UI components update reactively when context window changes

## Production Connectivity & Startup (2025-08)

This section clarifies the frontend → backend connectivity in production builds and the expected resource layout.

- Resource layout (installed app):
  - `%LOCALAPPDATA%/ContextCypher/resources/server_dist/**`
    - Contains compiled backend (`*.jsc`) and JS loaders (`*.js`)
    - Includes `node_modules/bytenode`
    - Entry used in production: `force-production.js`
  - `%LOCALAPPDATA%/ContextCypher/resources/node/node.exe`
    - Portable Node runtime the app uses to spawn the backend

- Startup sequence (production):
  1) Tauri app launches.
  2) Launcher locates `resources/server_dist` (prefers `server_dist`, falls back to legacy `server`).
  3) Launcher locates `resources/node/node.exe` and runs:
     - `node.exe force-production.js`
     - Working directory: `server_dist`
     - Environment: `NODE_ENV=production`, `FORCE_PRODUCTION=true`, `BIND_ALL_INTERFACES=false`.
  4) Backend picks a free port (3001–3009) and writes a port file to:
     - `%LOCALAPPDATA%/ContextCypher/.current-port`
  5) Frontend calls Tauri command `get_backend_port` and then health-checks `http://localhost:<port>/api/health`.

- Frontend port detection (production):
  - Primary: `invoke('get_backend_port')` (Tauri state updated after spawn)
  - Verification: health check with retries/backoff on that port
  - Fallbacks: port scan 3001–3005; optional read of port file

- Health check endpoint:
  - `GET /api/health` is exempt from auth headers; should respond even without `X-App-Secret`.

- CSP and connect-src (Tauri):
  - `connect-src` allows `http://localhost:*` and `http://127.0.0.1:*` in production.

### Debug Panel Integration (2025-08)

**Important**: The debug panel provides network logging without breaking production communication.

- Debug panel location: `src/components/DebugPanel.tsx`
- Toggle visibility: F12 key
- Network logging: Via axios interceptors, NOT fetch interception
- Position: Right side, to the left of the AnalysisPanel (500px from right edge)
- Log types: network, error, info, warn, ai

**Critical Production Note**: 
- NEVER intercept `window.fetch` in production builds - it breaks minified code
- Use axios interceptors in `src/api.ts` for safe network logging
- The debug panel logs are populated by `logToDebugPanel()` calls from services

### Frontend-Backend Communication Security

The production build uses several security measures:

1. **App Secret Authentication**:
   ```javascript
   // All API calls must include this header
   headers: {
     'X-App-Secret': process.env.REACT_APP_SECRET || 'contextcypher-dev-secret'
   }
   ```

2. **Port Detection Flow**:
   - Tauri command `get_backend_port` returns the actual port
   - Frontend verifies with health check before marking as connected
   - ConnectionManager handles retries with exponential backoff

3. **CORS Configuration**:
   - Production allows only Tauri origins
   - Development allows localhost for testing
   - No wildcard origins in production

### Resource Path Resolution (2025-08)

The Tauri launcher (main.rs) searches for resources in this order:

1. **Windows Installer Path**: `resources/server_dist`
2. **Direct Resource Path**: `server_dist`
3. **Legacy Path**: `server` (for backward compatibility)

The launcher logs all path checks to debug.log for troubleshooting.

### Known Issues and Solutions

1. **h2 Crate Compilation Errors**:
   - Solution: Run `cargo clean` in src-tauri before building
   - The build.cmd script now includes this automatically

2. **Fetch Interception Breaking Production**:
   - Solution: Remove all fetch interception from debug tools
   - Use axios interceptors for network logging instead

3. **Multiple Server Instances**:
   - Check for orphaned processes: `taskkill /F /IM node.exe`
   - Server implements PID tracking to prevent duplicates

4. **Port Conflicts**:
   - Server tries ports 3001-3009 sequentially
   - Frontend scans all possible ports during connection

#### Troubleshooting production connectivity

If the frontend reports “cannot connect to server” in production:

1) Verify resources exist after install:
   - The app data directory is based on the bundle identifier: `%LOCALAPPDATA%/com.threatmodeler.aioffline/`
   - Check for: `resources/server_dist/index.js`
   - Check for: `resources/node/node.exe`

2) Check launcher debug log:
   - Located at: `%LOCALAPPDATA%/com.threatmodeler.aioffline/debug.log`
   - Look for lines:
     - `Server path resolved to: ...\server_dist`
     - `Using bundled portable Node at: ...\resources\node\node.exe`
     - Any spawn errors or missing file messages

3) Check port file:
   - `%LOCALAPPDATA%/com.threatmodeler.aioffline/.current-port`
   - If missing, the backend likely didn't start

4) Check server logs:
   - `%LOCALAPPDATA%/com.threatmodeler.aioffline/logs/server.log`
   - If missing and APP_DATA_DIR wasn't set, check temp directory

5) Manually start the bundled backend to capture errors:
   - PowerShell:
     ```powershell
     $appDir = "$env:LOCALAPPDATA\com.threatmodeler.aioffline"
     cd "$appDir\resources\server_dist"
     $env:APP_DATA_DIR = $appDir
     ..\node\node.exe force-production.js
     ```
   - If you see `Cannot find module 'bytenode'`, ensure `server_dist/node_modules/bytenode` exists in resources

6) Direct health check:
   - When the server starts, browse to `http://127.0.0.1:<port>/api/health`

7) Firewall/AV:
   - Ensure localhost connections are permitted

**Note**: The app no longer uses hardcoded directory names like "ContextCypher" or "ai-threat-modeler". All paths are resolved dynamically based on the bundle identifier configured in `tauri.conf.json`.

#### Packaging requirements

- The installer MUST bundle both of these:
  - `src-tauri/resources/server_dist/**/*` (compiled backend + runtime deps)
  - `src-tauri/resources/node/**/*` (portable Node)
- The build pipeline stages `server_dist` into `src-tauri/resources/server_dist` and copies `node.exe` there prior to packaging.

#### Dynamic install paths (Updated 2025-08)
- The launcher writes `.current-port` to the app's dynamic app-data directory based on the bundle identifier (`com.threatmodeler.aioffline`).
- Debug logs are written to the same dynamic app-data directory.
- The backend receives `APP_DATA_DIR` from the launcher and writes logs there.
- The frontend uses `invoke('get_backend_port')` for port discovery exclusively - no file reading fallbacks.
- All hardcoded paths (e.g., "ContextCypher", "ai-threat-modeler") have been removed for full installation path flexibility.


#### Auto-Start Sequence
1. Tauri wrapper starts.
2. Rust spawns the **Node.js backend** (`node-backend/node.exe index.js --port 0`).
3. (Step removed - simplified architecture without Python service)
4. Rust starts **Ollama** (if not already running) with the bundled model.
5. When all health-checks pass the React front-end renders.

All processes listen **localhost-only**. Ports are chosen dynamically; React retrieves them via a Tauri command (`invoke('get_backend_port')`).

#### Strict Offline Mode
When the user selects *Offline / Local LLM*:
* `AIProviderManager` is locked to the **local** provider.
* Any network attempt to cloud APIs is blocked at provider level and results in a local error panel – **never a silent fallback**.
* Threat-analysis requests use only the Ollama stack. External internet is not required.

#### Model Management & Custom Models

The app ships with **`llama3-8b-q4_K_M.gguf`** (~4 GB) as the default offline model.  Users can:

1. **Use the bundled model immediately** – no configuration required.
2. **Pull additional models through the UI** (no CLI needed):
   • Settings → Local LLM → “Add / Pull Model”
   • Enter any public-repository model name (e.g. `mistral:7b-instruct-q4_K_M`).
   • The Node backend executes `ollama pull <model>` in a sandbox and streams progress back to the UI.
3. **Resize context window** – the existing “Create Custom Context Model” panel already calls `/api/ollama/create-custom-model`.  After success the new model appears in the dropdown.
4. **Advanced users** may still interact with the embedded Ollama server via the standard CLI (`ollama list`, `ollama run …`).  The binary is on disk in `resources/ollama/` and added to the PATH only for the app process; power users can point their own terminal to that path.

Implementation notes:
* `AIProviderManager` watches the Settings drawer – when the user picks a new model it issues `/api/providers/initialize` with `{ provider:"local", model:"<name>" }`.
* `ollama pull` is executed **once** and cached; subsequent runs detect the model exists.
* Progress events are forwarded via Tauri IPC so the React UI can show a progress bar.

#### Development Environment

**Hybrid Development Workflow**
Due to webpack-dev-server compatibility issues, the recommended development approach uses a hybrid workflow:

```bash
# Install dependencies
npm run prepare:build

# Start hybrid development mode
npm run dev:hybrid

# Or run services individually:
npm run backend         # Backend on port 3002 with nodemon
npm run build:watch     # Auto-rebuild frontend on changes
npm run serve:build     # Serve build directory on port 8080

# For Tauri development
npm run tauri:dev       # Full Tauri environment
```

**Environment Configuration**

Frontend (`.env.development`):
```env
BROWSER=none
PORT=3000
REACT_APP_API_URL=http://localhost:3002
REACT_APP_DEV_MODE=true
REACT_APP_SECRET=contextcypher-dev-secret
```

Backend (`server/.env.development`):
```env
NODE_ENV=development
PORT=3002
# Optional: Development API keys
OPENAI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
GOOGLE_API_KEY=your-key-here
```

#### Dev vs Production — Key Differences

| Aspect | Development (`npm run dev:hybrid`) | Production (Packaged Installer) |
|--------|-----------------------------------|---------------------------------|
| **Process Startup** | Backend runs on port 3002, frontend builds served via http-server on port 8080; Ollama started manually if needed. | Rust launcher spawns Node & Ollama **as child processes**, each selecting an open port (0 ⇒ auto). |
| **Port Discovery** | Frontend configured via REACT_APP_API_URL to connect to http://localhost:3002 directly. | React fetches ports via `invoke('get_backend_port')` (no proxy). |
| **Hot Reload** | Frontend rebuilds on save (build:watch), backend auto-restarts with nodemon. | No live reload; binaries are frozen. |
| **CORS / Proxy** | Handled by the dev proxy middleware. | Not required—same-origin (127.0.0.1) inside the desktop app. |
| **Model Files** | Ollama reads models from user’s global cache; pulling new models writes to that cache. | Default model ships in `resources/ollama/`; pulled models are stored under the same directory within the app sandbox. |
| **Environment Variables** | `.env.development` overrides (PORT, etc.). | Env vars ignored; paths/ports determined at runtime by Rust launcher. |
| **Offline Mode Enforcement** | `strictOffline` may be toggled in Settings for testing. | `strictOffline` automatically enabled when user selects Local LLM; cloud calls are blocked. |

This table ensures contributors understand why certain dev-time conveniences (like the proxy) do not exist in the packaged build and vice-versa.

## Monitoring & Debugging

### Logging System

**Log Levels**:
```javascript
logger.info('Operational message');
logger.warn('Warning condition');
logger.error('Error details', error);
logger.debug('Debug information');
```

**Log Rotation**:
- Daily rotation
- 7-day retention
- Size-based splitting

### Debug Endpoints

```bash
# Check service health
curl http://localhost:3002/api/health

# View provider status
curl http://localhost:3002/api/providers/status

# (Python service removed - simplified architecture)
```

### Performance Monitoring

**Metrics Tracked**:
- Request duration
- Memory usage
- Active connections
- Error rates
- Token consumption

## Future Enhancements

### Planned Features

1. **WebSocket Support**
   - Real-time analysis updates
   - Live collaboration
   - Streaming responses

2. **Advanced Caching**
   - Redis integration
   - Distributed cache
   - Smart invalidation

3. **Enhanced Security**
   - OAuth2 integration
   - Rate limiting
   - API versioning

4. **Scalability**
   - Horizontal scaling
   - Load balancing
   - Microservices architecture

5. **Diagram Generation Enhancements**
   - Streaming diagram generation for real-time progress
   - Template library for common architectures
   - Custom node type definitions
   - Import from infrastructure-as-code

### API Evolution

**Versioning Strategy**:
```
/api/v1/analyze  (current)
/api/v2/analyze  (future)
```

**Backward Compatibility**:
- Deprecation notices
- Migration guides
- Dual support period

## Production Deployment Considerations

### Port Management
The server uses dynamic port allocation with port files written to:
- Development: `.current-port` in project root (default port 3002)
- Production: `%LOCALAPPDATA%\ContextCypher\.current-port` and `%LOCALAPPDATA%\ai-threat-modeler\.current-port`

**Note**: In the hybrid development workflow, the backend defaults to port 3002 (changed from 3001) for better compatibility.

### Frontend Discovery
The frontend connects to the backend through:
1. Configured API URL (environment variable)
2. Health check validation
3. Automatic retry with exponential backoff
4. CORS preflight checks

### Authentication Flow
1. All API requests must include `X-App-Secret` header
2. Health check endpoint (`/api/health`) is exempt
3. Missing or invalid secrets return 401 Unauthorized
4. Streaming endpoints require explicit header inclusion

## Proactive Agent Integration

### Backend API Architect Agent

The backend codebase integrates with Claude Code's proactive agent system through file and keyword triggers. When working on backend components, the backend-api-architect agent automatically provides specialized assistance.

**Automatic Triggers**:
- **Files**: `server/index.js`, `server/services/*.js`, `server/utils/*.js`
- **Keywords**: api, endpoint, rest, backend, express, route, middleware, service layer, error handling

**Agent Capabilities**:
- REST API design following industry best practices
- Express.js middleware patterns and optimization
- Service layer architecture guidance
- Performance optimization strategies
- Error handling and resilience patterns
- Security best practices

**Related Agents**:
- **testing-qa-automation**: Automatically invoked for API testing strategies
- **docs-developer-experience**: Triggered for API documentation needs
- **performance-optimization-analyst**: Engaged for backend performance issues

### Example Workflow

When modifying API endpoints:
1. Edit `server/index.js` → backend-api-architect agent triggers
2. Agent analyzes changes and suggests improvements
3. If new endpoints created → testing-qa-automation agent suggests tests
4. If documentation needed → docs-developer-experience agent helps create it

This semi-automatic system ensures comprehensive backend development support without manual agent invocation.

## Conclusion

The AI Threat Modeler backend represents a sophisticated integration of multiple technologies to provide comprehensive security analysis. The architecture's emphasis on modularity, offline-first operation, and intelligent context management creates a robust platform for threat modeling that works equally well with local and cloud-based AI providers.

The modular architecture allows for flexible deployment options in the browser-based environment. The careful attention to performance, security, and error handling ensures reliable operation across various deployment scenarios - from local development to cloud-scale production.

### Implementation Roadmap (Packaging & Backend Integration)

| Phase | Workstream | Key Tasks |
|-------|------------|-----------|
| 1 | **Service Launcher (Rust)** | • Add `spawn_backend()`, `spawn_ollama()` helpers in `src-tauri/src/backend.rs`.<br/>• Expose `get_backend_port`, `get_ollama_port` via Tauri commands.<br/>• Health-check each child process; show error modal if any fails. |
| 2 | **React Integration** | • Create `src/services/backend.ts` that calls Tauri’s port commands once on start-up and rewrites all `fetch()` URLs.<br/>• Remove CRA proxy + unused dev CORS hacks. |
| 3 | **Node Back-End Updates** | • Add `strictOffline` flag to `AIProviderManager` (block cloud calls when offline mode enabled).<br/>• Implement `/api/models/pull` endpoint that shells out `ollama pull <model>` and streams JSON progress events. |
| 4 | **Settings Drawer** | • Add “Add / Pull Model” UI (progress bar, cancel).<br/>• Auto-reload model list upon success.<br/>• Allow switching between bundled & user-downloaded models. |
| 5 | **Installer Build Pipeline** | • In CI, download platform-specific binaries:<br/> – Node runtime (x64)<br/> – Ollama (x64)<br/> – .<br/>• Download default model file.<br/>• Copy all into `resources/` in Tauri bundle.<br/>• Verify installer size ≤ 4-5 GB (Win) / 3 GB (macOS dmg). |
| 6 | **QA & Release** | • Offline installation test on Windows/macOS/Linux.<br/>• Confirm first-run starts all services without internet.<br/>• Regression test cloud mode (user supplies API key). |

> NOTE: All paths and commands are already referenced earlier in this document; this table simply ties them into a concrete, trackable plan.

> **Implementation Note 2025-07**  
> Both `/api/chat` and `/api/threat-analysis` now call a single helper in `server/utils/context-optimizer.js`.  This module delegates to `ContextOptimizationService.prepareContext()` so the same dynamic-scaling rules apply everywhere.

## Browser Deployment Guide

### Overview
The browser-based architecture enables flexible deployment options without requiring desktop installation. Users access the application directly through their web browsers while maintaining the ability to use local AI models if they have Ollama installed.

### Deployment Options

#### 1. Static Hosting + Separate API
- **Frontend**: Deploy to CDN (Cloudflare, AWS CloudFront, Fastly)
- **Backend**: Deploy to cloud platform (Heroku, Railway, Render)
- **Pros**: Maximum scalability, global distribution
- **Cons**: Requires CORS configuration

#### 2. Single Server Deployment
- **Both Services**: Deploy together on single VPS or cloud instance
- **Proxy**: Use Nginx/Apache to route `/api` to backend
- **Pros**: Simpler configuration, single domain
- **Cons**: Limited scalability

#### 3. Containerized Deployment
- **Docker Compose**: Both services in containers
- **Orchestration**: Kubernetes for scale
- **Pros**: Consistent environments, easy scaling
- **Cons**: More complex setup

#### 4. Serverless Backend
- **Frontend**: Static hosting on CDN
- **Backend**: AWS Lambda, Vercel Functions, Netlify Functions
- **Pros**: Pay-per-use, auto-scaling
- **Cons**: Cold starts, vendor lock-in

### Configuration Examples

#### Nginx Configuration (Single Server)
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # Frontend
    location / {
        root /var/www/frontend;
        try_files $uri /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Docker Compose
```yaml
version: '3.8'
services:
  frontend:
    build: 
      context: .
      dockerfile: frontend.dockerfile
    environment:
      - REACT_APP_API_URL=/api
    ports:
      - "80:80"
    
  backend:
    build:
      context: .
      dockerfile: backend.dockerfile
    environment:
      - NODE_ENV=production
      - PORT=3002
      - ALLOWED_ORIGINS=http://localhost
    ports:
      - "3002:3002"
```

### Security Best Practices

1. **HTTPS Everywhere**
   - Use SSL certificates (Let's Encrypt)
   - Enforce HTTPS redirects
   - Enable HSTS headers

2. **API Security**
   - Rate limiting per IP
   - API key authentication
   - Request signing with HMAC

3. **CORS Configuration**
   - Whitelist specific origins
   - No wildcard origins in production
   - Validate preflight requests

4. **Environment Variables**
   - Never commit secrets
   - Use secret management services
   - Rotate keys regularly

### Monitoring & Maintenance

1. **Health Checks**
   - Uptime monitoring (UptimeRobot, Pingdom)
   - API endpoint monitoring
   - Alert on failures

2. **Performance Monitoring**
   - Application Performance Monitoring (APM)
   - Real User Monitoring (RUM)
   - Server metrics (CPU, RAM, disk)

3. **Logging**
   - Centralized logging (ELK stack, Datadog)
   - Error tracking (Sentry, Rollbar)
   - Audit logs for security

4. **Backups**
   - Database backups (if applicable)
   - Configuration backups
   - Disaster recovery plan
