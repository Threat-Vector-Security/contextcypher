# LangExtract Integration

## Overview

The threat intelligence extraction system has been upgraded to use Google's LangExtract library, replacing the previous pattern-matching approach in ThreatAnalyzer.js.

## Architecture

### Components

1. **Python LangExtract Service** (`services/langextract/`)
   - FastAPI-based microservice running on port 8001
   - Uses LangExtract for AI-powered structured data extraction
   - Reuses AI provider configuration from SimplifiedThreatAnalyzer

2. **LangExtractClient** (`server/services/LangExtractClient.js`)
   - Node.js client for communicating with Python service
   - Handles request/response transformation
   - Provides fallback parsing when service unavailable

3. **Updated Components**
   - `SimplifiedThreatAnalyzer.js` - Now processes imported threat intel via LangExtract
   - `ThreatIntelExtractor.ts` - Frontend service attempts server-side extraction first
   - `/api/threat-intel/extract` - New endpoint for threat intel extraction

## Key Features

- **AI-Powered Extraction**: Uses configured LLM to extract structured threat data
- **Source Grounding**: LangExtract provides source attributions for extracted data
- **Relevance Scoring**: Filters extracted data based on diagram context
- **Fallback Support**: Gracefully degrades to pattern matching if service unavailable

## Running the LangExtract Service

### Development
```bash
cd services/langextract
pip install -r requirements.txt
python main.py
```

### Docker
```bash
cd services/langextract
docker build -t langextract-service .
docker run -p 8001:8001 langextract-service
```

## Configuration

The service uses the same AI provider configuration as the main threat analyzer:
- Ollama (local, default)
- OpenAI
- Anthropic Claude
- Google Gemini

No separate configuration needed - it automatically uses the provider configured in the app.

## API Usage

### Extract Threat Intelligence
```
POST /api/threat-intel/extract
{
  "rawContent": "threat intelligence text...",
  "diagram": { /* diagram data */ }
}
```

### Response Format
```json
{
  "success": true,
  "extractedIntel": {
    "recentCVEs": "CVE-2024-1234...",
    "knownIOCs": "192.168.1.1, malware.com...",
    "threatActors": "APT28, Lazarus Group...",
    "campaignInfo": "Operation X details...",
    "attackPatterns": "T1055, T1082...",
    "mitigations": "Patch systems, monitor...",
    "intelligenceDate": "2024-01-15",
    "relevanceScores": { /* field scores */ },
    "extractionMetadata": { /* metadata */ }
  }
}
```

## Benefits Over Previous System

1. **Intelligence**: AI understands context and relationships
2. **Accuracy**: Better extraction of relevant information
3. **Flexibility**: Works with any unstructured format
4. **Attribution**: Shows source text for each extraction
5. **Scalability**: Can handle large documents efficiently