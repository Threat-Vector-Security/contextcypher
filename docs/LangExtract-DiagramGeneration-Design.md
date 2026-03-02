# LangExtract Integration for Diagram Generation

## Overview

This document outlines the design for integrating LangExtract into the DiagramGenerationService to replace complex regex-based parsing with AI-powered structured extraction.

## Current vs. Proposed Architecture

### Current Approach
```
User Prompt → AI Provider → Raw Text Response → Complex Regex Parsing → Diagram Structure
```

### Proposed LangExtract Approach
```
User Prompt → AI Provider → Raw Text Response → LangExtract → Validated Diagram Structure
```

## LangExtract Schema Design

### Diagram Component Schema
```python
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Literal

class Position(BaseModel):
    x: float = Field(description="X coordinate on diagram canvas")
    y: float = Field(description="Y coordinate on diagram canvas")

class DiagramComponent(BaseModel):
    id: str = Field(description="Unique identifier for the component")
    type: Literal["cloud-service", "server", "client-device", "web-app", "api", "database", 
                  "firewall", "load-balancer", "external-service", "mobile-app", "iot-device",
                  "container", "microservice", "queue", "cache", "storage", "browser",
                  "desktop-app", "network", "security-zone"] = Field(description="Component type")
    label: str = Field(description="Display name for the component")
    zone: Optional[str] = Field(description="Security zone: External DMZ, Internal, or Trusted")
    ports: Optional[List[str]] = Field(description="Network ports used by component")
    protocols: Optional[List[str]] = Field(description="Protocols supported by component")
    position: Optional[Position] = Field(description="Position on diagram canvas")
    metadata: Optional[Dict[str, str]] = Field(description="Additional component properties")

class Connection(BaseModel):
    id: str = Field(description="Unique identifier for connection")
    source: str = Field(description="Source component ID")
    target: str = Field(description="Target component ID")
    label: Optional[str] = Field(description="Connection description")
    protocol: Optional[str] = Field(description="Communication protocol")
    port: Optional[str] = Field(description="Port number if applicable")
    dataFlow: Optional[str] = Field(description="Type of data flowing")
    encrypted: Optional[bool] = Field(default=True, description="Whether connection is encrypted")
    metadata: Optional[Dict[str, str]] = Field(description="Additional connection properties")

class DiagramStructure(BaseModel):
    title: str = Field(description="Diagram title describing the system")
    description: Optional[str] = Field(description="Detailed description of the architecture")
    components: List[DiagramComponent] = Field(description="All components in the diagram")
    connections: List[Connection] = Field(description="All connections between components")
    architecture_type: Optional[str] = Field(description="Type of architecture pattern detected")
    metadata: Optional[Dict[str, str]] = Field(description="Additional diagram metadata")
```

## Implementation Plan

### 1. Python LangExtract Service Extension

Create a new endpoint in the existing LangExtract service:

```python
# services/langextract/diagram_extractor.py
from langextract import SchemaExtractor
from .schemas import DiagramStructure

class DiagramExtractor:
    def __init__(self, ai_provider):
        self.extractor = SchemaExtractor(
            schema=DiagramStructure,
            model=ai_provider,
            grounding_enabled=True,
            confidence_threshold=0.7
        )
    
    async def extract_diagram_structure(self, ai_response: str, context: dict) -> DiagramStructure:
        """
        Extract structured diagram data from AI response
        """
        prompt = f"""
        Extract the system architecture diagram structure from the AI response.
        The response may be in Cypher format, JSON, or natural language.
        
        Context:
        - User requested: {context.get('user_prompt', '')}
        - Diagram type: {context.get('diagram_type', 'general')}
        
        Focus on:
        1. Identifying all system components and their types
        2. Understanding connections and data flows
        3. Detecting security zones and boundaries
        4. Capturing protocols and ports where specified
        """
        
        result = await self.extractor.extract(
            text=ai_response,
            prompt=prompt
        )
        
        return result

# Add endpoint to main.py
@app.post("/api/diagram/extract")
async def extract_diagram(request: DiagramExtractionRequest):
    extractor = DiagramExtractor(ai_provider=get_ai_provider(request.provider))
    result = await extractor.extract_diagram_structure(
        ai_response=request.ai_response,
        context=request.context
    )
    return {
        "success": True,
        "diagram": result.dict(),
        "extraction_metadata": {
            "confidence_scores": result.confidence_scores,
            "source_attributions": result.source_attributions
        }
    }
```

### 2. Node.js Client Update

```javascript
// server/services/LangExtractDiagramClient.js
class LangExtractDiagramClient {
  constructor() {
    this.baseUrl = process.env.LANGEXTRACT_URL || 'http://localhost:8001';
  }

  async extractDiagramStructure(aiResponse, context = {}) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/diagram/extract`, {
        ai_response: aiResponse,
        context: context,
        provider: this.getConfiguredProvider()
      });

      if (response.data.success) {
        return this.transformToReactFlowFormat(response.data.diagram);
      }
    } catch (error) {
      console.error('LangExtract diagram extraction failed:', error);
      // Fallback to existing parser
      return null;
    }
  }

  transformToReactFlowFormat(diagram) {
    // Transform LangExtract output to ReactFlow node/edge format
    const nodes = diagram.components.map(comp => ({
      id: comp.id,
      type: this.mapComponentType(comp.type),
      position: comp.position || this.calculatePosition(comp.id),
      data: {
        label: comp.label,
        zone: comp.zone,
        ...comp.metadata
      }
    }));

    const edges = diagram.connections.map(conn => ({
      id: conn.id,
      source: conn.source,
      target: conn.target,
      type: 'smoothstep',
      data: {
        label: conn.label,
        protocol: conn.protocol,
        encrypted: conn.encrypted
      }
    }));

    return { nodes, edges, metadata: diagram.metadata };
  }
}
```

### 3. DiagramGenerationService Integration

Update the parseAIResponse method:

```typescript
// src/services/DiagramGenerationService.ts
private async parseAIResponse(aiResponse: string): Promise<AIGeneratedDiagram | null> {
  // Try LangExtract first for structured extraction
  if (this.langExtractEnabled && this.langExtractClient) {
    try {
      const extractedDiagram = await this.langExtractClient.extractDiagramStructure(
        aiResponse,
        {
          user_prompt: this.lastUserPrompt,
          diagram_type: this.currentDiagramType,
          ai_provider: this.currentProvider
        }
      );

      if (extractedDiagram) {
        console.log('[LangExtract] Successfully extracted diagram structure');
        return this.convertLangExtractToDiagram(extractedDiagram);
      }
    } catch (error) {
      console.warn('[LangExtract] Extraction failed, falling back to regex parsing:', error);
    }
  }

  // Fallback to existing regex parsing
  return this.parseAIResponseWithRegex(aiResponse);
}
```

## Benefits

1. **Robustness**: AI-powered extraction handles format variations better than regex
2. **Maintainability**: Schema-based approach is easier to extend and modify
3. **Source Attribution**: LangExtract provides confidence scores and source grounding
4. **Multi-format Support**: Single extraction logic handles Cypher, JSON, and natural language
5. **Better Error Recovery**: AI can infer missing information from context
6. **Consistency**: Structured output regardless of AI provider response format

## Configuration

Add to application settings:

```javascript
{
  "langExtract": {
    "enabled": true,
    "diagramExtraction": true,
    "fallbackToRegex": true,
    "confidenceThreshold": 0.7
  }
}
```

## Migration Strategy

1. **Phase 1**: Deploy LangExtract service with diagram extraction endpoint
2. **Phase 2**: Update DiagramGenerationService to try LangExtract first
3. **Phase 3**: Keep regex parsing as fallback for reliability
4. **Phase 4**: Monitor success rates and gradually phase out regex parsing
5. **Phase 5**: Optimize prompts based on extraction patterns

## Testing Approach

1. Create test suite with various AI response formats
2. Compare LangExtract results with regex parsing results
3. Measure extraction accuracy and performance
4. Test with all supported AI providers
5. Validate edge cases and error scenarios