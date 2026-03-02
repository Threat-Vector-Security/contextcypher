# Web Search Integration for AI Threat Modeler

## Overview
This document describes the implementation of Anthropic's web search API integration into the AI Threat Modeler application. The integration enables the AI to perform real-time searches for threat intelligence and vulnerability information from trusted CTI (Cyber Threat Intelligence) sources.

## Update: Chat Web Search Feature (Jan 2025)

### New Feature: Separate Chat Web Search
As of January 2025, the web search feature has been expanded to support two distinct modes:

1. **Threat Analysis Web Search** - Original feature for threat analysis panel
2. **Chat Web Search** - New feature for the Analysis Chat interface

Both features are available only with Anthropic Claude and require Pro license.

## Implementation Summary

### 1. Web Search Configuration (`/server/config/webSearchConfig.js`)
- Central configuration for web search functionality
- Contains a comprehensive whitelist of 53+ CTI domains organized by categories:
  - Vulnerability Databases (NVD, CVE, CWE, etc.)
  - Threat Intelligence (MITRE ATT&CK, AlienVault OTX, etc.)
  - Security Vendor Advisories
  - Exploit Resources
  - Security News Sources
  - GitHub Security Resources
  - Cloud Provider Security Centers
  - Industry-Specific Resources

### 2. AI Provider Integration (`/server/aiProviders.js`)
- Added web search tool configuration for Anthropic API requests
- Implements domain whitelisting based on webSearchConfig
- Handles tool use blocks in responses
- Only enabled when `enableWebSearch` option is passed

### 3. Threat Analysis Enhancement (`/server/services/SimplifiedThreatAnalyzer.js`)
- Intelligent web search triggering based on component characteristics
- Search is triggered for:
  - Components with vendor/version information
  - Components with CVEs mentioned
  - Known vulnerable component types (server, database, framework, etc.)
- Adds web search guidance to prompts when enabled

### 4. Model Profiles (`/server/config/modelProfiles.js`)
- Added Anthropic model profiles with web search support
- Includes web search guidance for different analysis types
- `supportsWebSearch()` helper function to check model capabilities

### 5. Frontend Integration

#### Threat Analysis Panel
- Web search settings in ThreatAnalysisPanel component
- Toggle switch to enable/disable web search (Anthropic only)
- Domain category selection checkboxes
- Settings persist in browser localStorage
- Visual "Pro" indicator for the feature

#### Chat Web Search (New)
- Separate settings in SettingsDrawer General tab
- Independent configuration from threat analysis
- Domain categories include security news for chat context
- Max searches limited to 5 for chat (vs 10 for threat analysis)
- Settings stored in `chatWebSearch` configuration object

### 6. Settings and Defaults

#### Threat Analysis Settings
- Default web search settings in `defaultSettings.ts`:
  - **Enabled by default** for better threat detection
  - Max 3 searches per component
  - Max 10 searches per analysis
  - Default categories: vulnerabilityDatabases, threatIntelligence

#### Chat Web Search Settings (New)
- Separate configuration in `defaultSettings.ts`:
  - **Enabled by default** for real-time threat intelligence
  - Max 5 searches per chat session
  - Default categories: vulnerabilityDatabases, threatIntelligence, securityNews
  - Independent enable/disable from threat analysis

## Usage

### Using Threat Analysis Web Search
1. Set up Anthropic API key in settings
2. Select Anthropic as the AI provider
3. Web search is **enabled by default** in Threat Analysis Panel
4. Optionally adjust domain categories in the panel settings
5. Run threat analysis on components - searches will automatically trigger for:
   - Components with vendor/version information
   - Components with known vulnerabilities
   - High-risk component types

### Using Chat Web Search (New)
1. Set up Anthropic API key in settings
2. Select Anthropic as the AI provider
3. Web search is **enabled by default** for chat
4. Optionally adjust settings in Settings → General → Chat Web Search:
   - Toggle enable/disable if needed
   - Select domain categories (includes Security News by default)
   - Adjust max searches per chat (default: 5)
5. Ask questions about CVEs, vulnerabilities, or recent threats in the Analysis Chat
6. The AI will automatically search when relevant (e.g., "What are the latest vulnerabilities in Apache Log4j?")

### How It Works
1. During threat analysis, the system evaluates each component
2. Components with vendor/version info or known vulnerabilities trigger searches
3. The AI performs targeted searches on whitelisted CTI domains
4. Search results enhance the threat analysis with:
   - Current CVE details and CVSS scores
   - Recent exploits and attack techniques
   - Vendor security advisories
   - Real-time threat intelligence

### Cost Considerations
- Anthropic charges $10 per 1,000 web searches
- The system limits searches to avoid excessive costs:
  - Max searches per component: 3 (configurable)
  - Max searches per analysis: 10 (configurable)
- Only searches when likely to find relevant results

## Security Considerations
- Domain whitelisting prevents searches on untrusted sites
- All searches are logged for audit purposes
- No user data is sent in search queries
- Search queries are constructed from component metadata only

## Testing
Run the integration test:
```bash
node tests/test-web-search-integration.js
```

## Technical Implementation Details

### Chat Web Search Flow
1. User enables chat web search in Settings → General
2. Settings stored in `chatWebSearch` object separate from threat analysis
3. When sending chat messages, `AIRequestService.ts` adds metadata:
   - `enableChatWebSearch: true`
   - `chatWebSearchConfig: { maxSearches, domainCategories }`
4. Backend extracts configuration in `/api/chat` endpoint
5. Configuration passed to `aiManager.generateAnalysis()` with options
6. `aiProviders.js` configures Anthropic tool use with selected domains
7. Response includes web search results integrated into chat response

### Key Differences from Threat Analysis Web Search
- **Configuration**: Stored in `settings.chatWebSearch` vs `settings.threatAnalysis.webSearch`
- **Max Searches**: 5 for chat vs 10 for threat analysis
- **Default Categories**: Includes `securityNews` for broader context
- **Use Cases**: Interactive Q&A vs systematic component analysis
- **UI Location**: Settings drawer vs Threat Analysis panel

## Future Enhancements
1. Add search result caching to reduce API calls
2. Display search sources in threat analysis results
3. Add more granular control over search triggers
4. Implement search result confidence scoring
5. Add support for custom CTI domain lists
6. Show web search indicators in chat UI when searches are performed
7. Add search history and analytics