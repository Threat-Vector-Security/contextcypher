# Threat Intelligence Integration Architecture

## Overview

The current threat intelligence architecture is intentionally simple and deterministic: users manually import intel via the Intel panel, the server performs lightweight component-aware filtering and pattern extraction, and that curated intel is embedded into the AI prompt context for analysis alongside the diagram. There are no live feeds or background updaters in this mode.

## Current State

**Status**: Manual import + server-side filtering/extraction
- Active endpoint: `POST /api/threat-intel/extract` (pattern matching + component filtering)
- No live source fetching; no background caching/updaters
- Manual import via ThreatIntelPanel UI (Replace/Append)
- Intel stored with the diagram (AnalysisContext.importedThreatIntel)
- Intel is injected into AI prompt context for both chat and analysis

## Architecture Components

### 1. Data Sources

- User-provided files in common formats (TXT, JSON, CSV, STIX, MISP, NVD JSON dumps)
- No direct API calls to external intel sources in this mode

### 2. Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  ThreatIntelPanel.tsx       │    ThreatIntelExtractor.ts       │
│  - Import UI & editor       │    - Parses various formats      │
│  - Progress tracking        │    - Relevance filtering         │
│                             │                                    │
│  AnalysisContextProvider    │    ThreatAnalysisPanel.tsx       │
│  - Stores imported intel    │    - Displays results            │
└────────────────┬───────────┴──────────────┬────────────────────┘
                 │                          │
                 ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API (Express)                         │
├─────────────────────────────────────────────────────────────────┤
│  /api/threat-intel/extract  │    AIProviderManager              │
│  - Pattern extraction       │    - Manages AI providers        │
│  - Component filtering      │    - Context window mgmt         │
│                             │                                    │
│  threatIntelRoutes.js       │    (No Python service required)  │
│  - Handles extraction req   │                                  │
└────────────────┬───────────┴──────────────┬────────────────────┘
                 │                          │
                 ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│          Threat Intelligence Processing                          │
├─────────────────────────────────────────────────────────────────┤
│  Server Pattern Matching    │    Client-Side Processing        │
│  - CVE/IOC extraction       │    - Same patterns if needed     │
│  - Component filtering      │    - Basic relevance scoring     │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Data Flow

#### Current Implementation Flow
1. **Manual Import Process**
   - User imports threat intelligence data via ThreatIntelPanel
   - Supported formats: JSON, CSV, TXT, STIX, MISP
   - Data is parsed by ThreatIntelExtractor on client-side

2. **Server Extraction (single path)**
   - Client sends raw intel and diagram to `/api/threat-intel/extract`
   - Server filters content against diagram components (`server/utils/threatIntelFilter.js`)
   - Pattern-based extraction for CVEs, IOCs, threat actors
   - Returns structured fields and extraction metadata

3. **Client-Side Only (if desired)**
   - ThreatIntelExtractor can apply the same pattern logic purely client-side
   - Useful for offline usage or testing

### 4. Manual Import Feature (Currently Implemented)

#### ThreatIntelPanel Import Functionality

The application currently supports manual threat intelligence import through the ThreatIntelPanel UI:

**Features**:
- File import support (.txt, .json, .csv, STIX/MISP/NVD JSON)
- Replace or Append modes
- Progress dialog (reading/processing/analyzing) with filtering stats
- Clear all intel
- Data persists with the diagram

**Import Workflow**:
1. User opens ThreatIntelPanel from AnalysisPanel (Intel tab)
2. Clicks "Import from File" button
3. Selects Replace or Append mode via toggle
4. File is processed with progress dialog showing:
   - Current stage (reading, processing, analyzing, completing)
   - Method used (AI-powered or pattern matching)
   - Progress bar with percentage
5. Data is stored in AnalysisContext.importedThreatIntel
6. Threat intel persists with diagram saves

**Stored Structure (AnalysisContext.importedThreatIntel)**:
```typescript
importedThreatIntel: {
  raw: string;
  processed: {
    recentCVEs?: string;
    knownIOCs?: string;
    campaignInfo?: string;
    threatActors?: string;
    attackPatterns?: string;
    mitigations?: string;
  };
  metadata: {
    totalImported: number;
    relevantExtracted: number;
    importDate: string;
    source: string;
    matchedComponents?: string[];
    format?: string;
  };
}
```

**UI Components**:
- ThreatIntelPanel.tsx: Main import interface with text editor
- Import controls: File upload, Clear All, Replace/Append toggle
- Progress dialog: Shows import status and method
- Integration with ThreatAnalysisPanel via "Open Threat Intelligence Panel" button

### 5. Integration Points

#### Frontend Integration

Frontend injection (chat)
```typescript
// AnalysisPanel.tsx
// additionalContext now includes "=== IMPORTED THREAT INTELLIGENCE ===" section when present
additionalContext: threatIntelContext ? `${cypherContext}\n\n${threatIntelContext}` : cypherContext
```

#### Backend Integration
**threatIntelRoutes.js**
- Single path: component filtering + pattern extraction (no AI)
**formatters.js**
- Merges client-provided `additionalContext` with server-generated context
- For local LLMs: defers TASK/ANSWER FORMAT until after all context (diagram + intel)
**SimplifiedThreatAnalyzer (API)**
- Reads `additionalContext.threatIntelText` or `additionalContext.threatIntel` or extracts the "IMPORTED THREAT INTELLIGENCE" section from `additionalContext`
- Appends intel to node/system prompts before instructions
- `findGitHubAdvisories(node)` - Searches GitHub advisories
- `findAlienVaultThreats(node)` - Searches AlienVault indicators
- `findNVDVulnerabilities(node)` - Searches NVD vulnerabilities
- `enhanceNodeData(node)` - Infers vendor/product from node data

**Risk Calculation**:
- Uses qualitative risk matrix (Likelihood × Impact)
- Confidence scoring based on number of findings
- Node risk levels: LOW, MEDIUM, HIGH, CRITICAL
- Connection risk based on encryption and zone transitions

### 5. API Endpoints

#### Currently Active Endpoints
- `POST /api/threat-intel/extract` - Component filtering + pattern extraction
  - Request body: `{ rawContent: string, diagram: DiagramData }`
  - Response: `{ success: boolean, extractedIntel: object }`

#### Planned/Disabled Endpoints
- `GET /api/threat-intel/all` - Returns all cached threat intelligence data
- `GET /api/threat-intel/database-info` - Get local database information
- `POST /api/threat-intel/update-database` - Update local threat intel database
- `POST /api/threat-intel/clear-cache` - Clear threat intelligence cache

### 6. Pro Feature Integration

Current mode operates without licensing gates. If/when Pro gating returns, only the manual import UI and server extraction would be gated.

### 7. Settings Integration

No external intel provider configuration is required in this mode. Frontend settings related to real-time intel can be ignored.

### 8. Current Implementation Details

#### Backend Integration (server/routes/threatIntelRoutes.js)
```javascript
// AI Manager is now properly integrated
const aiManager = req.app.get('aiManager');
const hasAIProvider = aiManager && aiManager.getCurrentProvider();

// Three processing modes:
1. LangExtract Service (if available)
2. Direct AI Processing (if AI configured)
3. Client-side fallback (if no AI)
```

#### Client Integration (src/services/ThreatIntelExtractor.ts)
```typescript
// Supports multiple formats
parseThreatIntel(content: string, filename?: string): ParsedThreatIntel {
  // Auto-detects: JSON, CSV, STIX, MISP, NVD
  // Falls back to text parsing
}

// AI-powered extraction
async extractRelevant(parsed: ParsedThreatIntel, diagram: any, options?: ExtractionOptions): Promise<ExtractedThreatIntel> {
  // Tries server-side AI extraction first
  // Falls back to client-side pattern matching
}
```

#### Filtering Module (server/utils/threatIntelFilter.js)
The system now includes an advanced component-based filtering module that provides:
- **CPE (Common Platform Enumeration) matching**: Maps diagram components to CPE identifiers
- **Context-aware filtering**: Filters threat intel based on component context and versions
- **Relevance scoring**: Calculates relevance scores for each threat item
- **Dramatic reduction in noise**: Achieves 97%+ reduction in irrelevant CVEs

Example: large NVD JSON reduced to a small set of component-relevant CVEs.

#### LLM Support
- Local (Ollama) and cloud models are supported for analysis. In local mode, instructions are appended after the context to improve utilization of the intel and diagram.

#### Key Integration Points

1. **AnalysisContextProvider.tsx Enhancement**:
   - Threat intel data is now formatted and included in the AI prompt context
   - Added disclaimer about threat intel being "potentially relevant"
   - Provides comprehensive metadata about filtering effectiveness

   ```typescript
   // Threat intel is included in additionalContext with:
   - Source information
   - Import date and statistics
   - Total imported vs relevant extracted (with percentage)
   - Matched components list
   - Formatted CVEs, IOCs, threat actors, etc.
   - Clear disclaimer about evaluating applicability
   ```

2. **Express App Context Fix**:
   The aiManager is now properly set in Express app context:
   ```javascript
   // In server/index.js startServer()
   app.set('aiManager', aiManager);
   ```

3. **Real-World Test Results**:
   - Successfully imported and filtered NVD JSON data
   - Component-based filtering identified relevant threats for specific technologies
   - AI models can now see and reference specific CVEs and IOCs in their analysis

### 9. Manual Ingestion Methods

For air-gapped environments, the system supports manual threat intelligence updates:

1. **Export Package Creation** (on internet-connected system):
```javascript
const updatePackage = {
  metadata: {
    version: "2024.1.15",
    timestamp: new Date().toISOString(),
    sources: ['mitre', 'vulnerabilities', 'advisories', 'patterns']
  },
  data: {
    mitre: { /* MITRE ATT&CK data */ },
    vulnerabilities: { /* NVD/CVE data */ },
    advisories: { /* GitHub advisories */ },
    patterns: { /* Threat patterns */ }
  }
};
```

2. **Import Process**:
- Transfer update package via secure medium
- Upload through settings panel or API
- System validates and installs update
- Services automatically refresh

### 10. Performance Considerations

- **Caching**: All API responses cached with appropriate TTLs
- **Parallel Fetching**: All 4 sources fetched simultaneously
- **Incremental Updates**: Only fetch changed data when possible
- **Node-level Caching**: Analysis results cached per node
- **Batch Processing**: Analyze multiple nodes in parallel

### 11. Error Handling

- **API Failures**: Graceful degradation to cached data
- **Rate Limits**: Exponential backoff with retry logic
- **Invalid Data**: Validation and fallback to minimal datasets
- **Offline Detection**: Automatic switch to offline mode

### 12. Testing Approach

1. **Unit Tests**:
   - Threat matching algorithms
   - Risk calculation logic
   - Data transformation functions

2. **Integration Tests**:
   - API endpoint responses
   - Cache behavior
   - Service initialization

3. **End-to-End Tests**:
   - Full analysis flow with threat intel
   - Offline mode functionality
   - Manual update process

## Implementation Priority

1. **Phase 1**: Manual Import + Pattern Extraction (Complete)
2. **Phase 2**: Optional live-feed integration (Deferred)
3. **Phase 3**: Prompt tuning for specific local models (Ongoing)

## Security Considerations

- API keys stored securely (environment variables)
- No sensitive data in frontend
- Rate limiting on API endpoints
- Input validation for manual updates
- Audit logging for threat intel access

## Conclusion

The system now intentionally focuses on manual threat intel ingestion with deterministic server-side filtering and extraction. The imported intel is embedded directly into the AI prompt context (both chat and analysis), and for local LLMs the instructions are sent after the full context to maximize model attention on the intel and diagram. This design is fast, predictable, and easy to reason about.
