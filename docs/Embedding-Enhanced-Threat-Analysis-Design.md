# Embedding-Enhanced Threat Intelligence Integration Design

## Overview

This document outlines the design for integrating Google's Gemini Embedding model into the AI Threat Modeler to enhance threat intelligence analysis and real-time threat matching capabilities through semantic understanding.

## Design Philosophy

Unlike traditional threat knowledge bases that rely on pre-loaded data, this design focuses on:
- **Real-time Threat Intel Integration**: Process threat intelligence as it's ingested
- **Semantic Matching**: Find relevant threats based on meaning, not keywords
- **Flexible Ingestion**: Support both manual uploads (offline) and API feeds (online)
- **Context-Aware Analysis**: Match threats to specific architecture components

## What are Embeddings?

Embeddings are dense vector representations of text that capture semantic meaning. They enable:
- **Semantic Search**: Find similar threats based on conceptual similarity
- **Pattern Recognition**: Identify threat patterns across different naming conventions
- **Efficient Matching**: Real-time similarity comparison with ingested threat data
- **Cross-language Support**: Process threat intel from multiple languages

## Gemini Embedding Model Details

### Model Specifications
- **Model Code**: `gemini-embedding-001` (stable)
- **Input Limit**: 2,048 tokens
- **Output Dimensions**: Flexible 128-3,072 (recommended: 768, 1,536, 3,072)
- **Supported Input**: Text
- **Output**: Text embeddings optimized for retrieval
- **Performance**: State-of-the-art across code, multi-lingual, and retrieval tasks

### Model Versions
- **Stable**: `gemini-embedding-001` - Production use
- **Preview**: `gemini-embedding-exp-03-07` - Latest features
- **Last Update**: June 2025

### Key Advantages for Threat Intel
- **Multi-lingual Support**: Process threat intel from any language
- **Code Understanding**: Embed technical indicators and code patterns
- **Retrieval Optimization**: Designed for similarity search use cases
- **Flexible Dimensions**: Balance accuracy vs storage based on needs

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌──────────────────┐  ┌────────────────────────────────┐  │
│  │ ThreatIntelManager│  │  DiagramEditor & Analysis     │  │
│  │ (Manual Upload)   │  │  (Threat Modeling Interface)  │  │
│  └────────┬─────────┘  └────────────┬───────────────────┘  │
└───────────┼──────────────────────────┼──────────────────────┘
            │                          │
┌───────────▼──────────────────────────▼──────────────────────┐
│                   Backend Services                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Enhanced SimplifiedThreatAnalyzer           │   │
│  │  - Threat intel context integration                  │   │
│  │  - Component-to-threat matching                      │   │
│  │  - APT group relevance scoring                       │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                        │
│  ┌──────────────────▼──────────────┐  ┌─────────────────┐  │
│  │   Threat Intel Processor         │  │  Embedding Svc  │  │
│  │  - Intel feed parsing            │  │  - Gemini API   │  │
│  │  - Real-time embedding           │  │  - Caching      │  │
│  │  - Source management             │  │  - Batching     │  │
│  └──────────────────┬──────────────┘  └─────────────────┘  │
│                     │                                        │
│  ┌──────────────────▼────────────────────────────────────┐  │
│  │         Local Vector Storage (JSON/SQLite)            │  │
│  │  - Threat actor embeddings                           │  │
│  │  - Indicator embeddings                              │  │
│  │  - Simple file-based persistence                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Threat Intel Ingestion**:
   - Manual: User uploads files via ThreatIntelManager → Processed and embedded
   - API: Scheduled feeds → Processed and embedded
   - All intel stored with source tracking and timestamps

2. **Analysis Flow**:
   - User triggers threat analysis
   - System generates architecture embeddings
   - Searches vector DB for relevant threats
   - Enhances AI context with matched intel
   - Returns comprehensive analysis

## Core Components

### 1. Embedding Service (`server/services/EmbeddingService.js`)

```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

class EmbeddingService {
  constructor(apiKey, config = {}) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = config.model || 'gemini-embedding-001'; // Stable version
    this.dimensions = config.dimensions || 768; // Recommended for balance
    this.cache = new Map();
    this.vectorDB = null; // Initialized with chosen vector DB
  }

  async embedText(text) {
    // Check cache first
    const cacheKey = this.generateCacheKey(text);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Generate embedding using Gemini (max 2048 tokens input)
    const result = await this.genAI.embedContent({
      model: this.model,
      content: text,
      taskType: 'RETRIEVAL_DOCUMENT', // Optimized for search
      outputDimensionality: this.dimensions
    });

    const embedding = result.embedding;
    this.cache.set(cacheKey, embedding);
    return embedding;
  }

  async getDiagramRepresentation(diagram) {
    // Convert diagram to text representation
    const diagramText = this.diagramToText(diagram);
    return this.getTextRepresentation(diagramText);
  }

  diagramToText(diagram) {
    const components = diagram.nodes.map(node => {
      return `${node.type} "${node.data.label}" in ${node.data.zone} zone with ${node.data.securityLevel} security`;
    });

    const connections = diagram.edges.map(edge => {
      const source = diagram.nodes.find(n => n.id === edge.source);
      const target = diagram.nodes.find(n => n.id === edge.target);
      return `${source.data.label} connects to ${target.data.label} via ${edge.data.protocol} with ${edge.data.encryption} encryption`;
    });

    return [...components, ...connections].join('\n');
  }
}
```

### 2. Threat Intelligence Processor (`server/services/ThreatIntelProcessor.js`)

Real-time processing and embedding of ingested threat intelligence:

```javascript
class ThreatIntelProcessor {
  constructor(matchingService, storePath = './threat-intel-data') {
    this.matchingService = matchingService;
    this.storage = new LocalThreatStorage(storePath);
    this.intelSources = new Map();
    this.keywordIndex = new InvertedIndex(); // For offline search
  }

  async processIntelFeed(intelData, source = 'manual') {
    const processingResult = {
      processed: 0,
      errors: [],
      source: source,
      timestamp: new Date()
    };

    // Process APT groups
    if (intelData.aptGroups) {
      for (const [groupId, groupData] of Object.entries(intelData.aptGroups)) {
        try {
          const representation = await this.createAPTGroupRepresentation(groupId, groupData);
          
          // Store the threat data
          await this.storage.saveThreat(
            `apt_${source}_${groupId}`,
            {
              type: 'apt_group',
              source: source,
              groupId: groupId,
              names: groupData.names,
              ttps: groupData.ttps,
              targets: groupData.targets,
              representation: representation,
              timestamp: new Date()
            }
          );
          
          // Update offline search index
          if (representation.type === 'keywords') {
            this.keywordIndex.addDocument(`apt_${source}_${groupId}`, representation.data);
          }
          processingResult.processed++;
        } catch (error) {
          processingResult.errors.push({ groupId, error: error.message });
        }
      }
    }

    // Process threat indicators
    if (intelData.indicators) {
      for (const indicator of intelData.indicators) {
        const representation = await this.createIndicatorRepresentation(indicator);
        
        await this.storage.saveThreat(
          `indicator_${source}_${indicator.id}`,
          {
            type: 'indicator',
            source: source,
            ...indicator,
            representation: representation,
            timestamp: new Date()
          }
        );
        
        // Update offline search index
        if (representation.type === 'keywords') {
          this.keywordIndex.addDocument(`indicator_${source}_${indicator.id}`, representation.data);
        }
        processingResult.processed++;
      }
    }

    return processingResult;
  }

  async createAPTGroupRepresentation(groupId, groupData) {
    // Create rich text representation of APT group
    const text = `
      APT Group: ${groupId} ${groupData.names?.join(', ') || ''}
      Targets: ${groupData.targets?.join(', ') || 'various sectors'}
      Techniques: ${groupData.ttps?.techniques?.join(', ') || 'unknown'}
      Tools: ${groupData.tools?.join(', ') || 'various'}
      Description: ${groupData.description || 'Advanced persistent threat group'}
    `;
    
    // Get either embedding (online) or keywords (offline)
    return this.matchingService.getTextRepresentation(text);
  }
  
  async createIndicatorRepresentation(indicator) {
    // Create text representation of indicator
    const text = `
      Indicator: ${indicator.type || 'unknown'} ${indicator.value || ''}
      Tags: ${indicator.tags?.join(', ') || 'none'}
      Description: ${indicator.description || 'Threat indicator'}
    `;
    
    return this.matchingService.getTextRepresentation(text);
  }

  async findRelevantThreats(architectureRepresentation, filters = {}) {
    if (architectureRepresentation.type === 'embedding' && this.matchingService.mode === 'online') {
      // Online: Use embedding similarity
      const allThreats = await this.storage.getAllThreats();
      const results = [];
      
      for (const [id, threat] of allThreats) {
        if (threat.representation?.type === 'embedding') {
          const similarity = this.cosineSimilarity(
            architectureRepresentation.data,
            threat.representation.data
          );
          if (similarity > 0.7) {
            results.push({ id, similarity, ...threat });
          }
        }
      }
      
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, filters.topK || 20);
    } else {
      // Offline: Use keyword matching
      const keywords = architectureRepresentation.type === 'keywords' 
        ? architectureRepresentation.data 
        : this.matchingService.extractKeywords(architectureRepresentation.raw);
      
      return this.keywordIndex.search(keywords, filters.topK || 20);
    }
  }
}
```

### 3. Enhanced SimplifiedThreatAnalyzer with Threat Intel

Integration with threat intelligence:

```javascript
class EnhancedSimplifiedThreatAnalyzer extends SimplifiedThreatAnalyzer {
  constructor(aiProviderManager, embeddingService, threatIntelProcessor) {
    super(aiProviderManager);
    this.embeddingService = embeddingService;
    this.threatIntelProcessor = threatIntelProcessor;
  }

  async analyzeThreatPaths(diagram, componentIds, analysisType, additionalContext) {
    // Step 1: Generate representations for architecture and components
    const diagramText = this.diagramToText(diagram);
    const diagramRepresentation = await this.matchingService.getTextRepresentation(diagramText);
    const componentRepresentations = await this.generateComponentRepresentations(diagram);
    
    // Step 2: Get representation and find relevant threat actors
    const diagramRepresentation = await this.matchingService.getTextRepresentation(
      this.diagramToText(diagram)
    );
    const relevantAPTs = await this.threatIntelProcessor.findRelevantThreats(
      diagramRepresentation,
      { type: 'apt_group', topK: 10 }
    );
    
    // Step 3: Find component-specific threats
    const componentThreats = await this.matchComponentsToThreats(componentRepresentations);
    
    // Step 4: Find relevant indicators
    const indicators = await this.threatIntelProcessor.findRelevantThreats(
      diagramRepresentation,
      { type: 'indicator', topK: 20 }
    );
    
    // Step 5: Build threat-intel enhanced context
    const enhancedContext = await this.buildThreatIntelContext({
      diagram,
      relevantAPTs,
      componentThreats,
      indicators,
      tokenLimit: this.getTokenLimit()
    });
    
    // Step 6: Call parent analyzer with threat intel context
    return super.analyzeThreatPaths(
      diagram, 
      componentIds, 
      analysisType, 
      { ...additionalContext, threatIntelContext: enhancedContext }
    );
  }

  async buildSemanticContext({ diagram, similarThreats, historicalContext, tokenLimit }) {
    // Calculate relevance scores for all context pieces
    const contextPieces = [];
    
    // Add relevant threats with scores
    for (const threat of similarThreats) {
      contextPieces.push({
        content: this.formatThreatForContext(threat),
        relevanceScore: threat.score,
        tokenCount: this.estimateTokens(threat)
      });
    }
    
    // Add historical insights
    for (const historical of historicalContext) {
      contextPieces.push({
        content: this.formatHistoricalInsight(historical),
        relevanceScore: historical.score * 0.8, // Slightly lower weight
        tokenCount: this.estimateTokens(historical)
      });
    }
    
    // Sort by relevance and select within token limit
    return this.selectOptimalContext(contextPieces, tokenLimit);
  }
}
```

## Key Features

### 1. Real-time Threat Intel Matching

Match ingested threat intelligence against current architecture:

```javascript
// Example: Processing new threat intel and matching to architecture
const threatIntel = {
  aptGroups: {
    "APT29": {
      names: ["Cozy Bear", "The Dukes"],
      targets: ["Government", "Energy", "Healthcare"],
      ttps: {
        techniques: ["T1566.001", "T1078", "T1055"]
      }
    }
  }
};

// Process threat intel (works offline or online)
await threatIntelProcessor.processIntelFeed(threatIntel, 'cisa-feed');

// Match against current architecture
const architectureText = threatIntelProcessor.diagramToText(diagram);
const architectureRepresentation = await matchingService.getTextRepresentation(architectureText);
const relevantThreats = await threatIntelProcessor.findRelevantThreats(
  architectureRepresentation,
  { type: 'apt_group', topK: 10 }
);

// Results ranked by relevance to your specific architecture
```

### 2. Context Window Optimization

Maximize the value of limited token windows:

```javascript
async selectOptimalContext(contextPieces, tokenLimit) {
  // Sort by relevance score
  contextPieces.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  const selected = [];
  let totalTokens = 0;
  
  for (const piece of contextPieces) {
    if (totalTokens + piece.tokenCount <= tokenLimit) {
      selected.push(piece);
      totalTokens += piece.tokenCount;
    }
  }
  
  return selected.map(p => p.content).join('\n\n');
}
```

### 3. Multi-Source Threat Intel Management

Handle multiple threat intel sources with deduplication:

```javascript
class ThreatIntelSourceManager {
  constructor(processor, vectorDB) {
    this.processor = processor;
    this.vectorDB = vectorDB;
    this.sources = new Map();
  }

  async addSource(sourceConfig) {
    const source = {
      id: sourceConfig.id,
      name: sourceConfig.name,
      type: sourceConfig.type, // 'manual', 'api', 'file'
      format: sourceConfig.format, // 'stix', 'mitre', 'csv', 'custom'
      lastUpdated: null,
      updateInterval: sourceConfig.updateInterval,
      priority: sourceConfig.priority || 1
    };
    
    this.sources.set(source.id, source);
    
    // Process initial data if provided
    if (sourceConfig.data) {
      await this.updateSource(source.id, sourceConfig.data);
    }
  }

  async updateSource(sourceId, data) {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Unknown source: ${sourceId}`);
    
    // Process with source tracking
    const result = await this.processor.processIntelFeed(data, sourceId);
    
    // Update source metadata
    source.lastUpdated = new Date();
    source.recordCount = result.processed;
    
    // Handle deduplication across sources
    await this.deduplicateThreats();
    
    return result;
  }

  async deduplicateThreats() {
    // Group similar threats by embedding similarity
    const allThreats = await this.vectorDB.list({ type: 'apt_group' });
    const clusters = await this.clusterByEmbedding(allThreats, 0.95); // 95% similarity
    
    // Keep highest priority source for each cluster
    for (const cluster of clusters) {
      const sorted = cluster.sort((a, b) => {
        const sourceA = this.sources.get(a.metadata.source);
        const sourceB = this.sources.get(b.metadata.source);
        return (sourceB?.priority || 0) - (sourceA?.priority || 0);
      });
      
      // Mark duplicates
      for (let i = 1; i < sorted.length; i++) {
        await this.vectorDB.update(sorted[i].id, {
          metadata: { ...sorted[i].metadata, duplicate: true, primary: sorted[0].id }
        });
      }
    }
  }
}
```

### 4. Threat Intel Ingestion and Processing

```javascript
// Manual ingestion for offline mode
async ingestManualThreatIntel(file, format = 'auto') {
  const parser = this.getParserForFormat(format, file);
  const intelData = await parser.parse(file);
  
  // Process and embed the threat data
  const result = await this.threatIntelProcessor.processIntelFeed(
    intelData,
    `manual_${file.name}_${Date.now()}`
  );
  
  // Update UI with processing results
  return {
    success: result.processed > 0,
    processed: result.processed,
    errors: result.errors,
    source: file.name
  };
}

// API ingestion for online mode
async ingestAPIThreatIntel(feedConfig) {
  const intelData = await this.fetchFromAPI(feedConfig);
  
  // Process with source tracking
  const result = await this.threatIntelProcessor.processIntelFeed(
    intelData,
    feedConfig.sourceName
  );
  
  // Schedule next update if configured
  if (feedConfig.updateInterval) {
    this.scheduleUpdate(feedConfig);
  }
  
  return result;
}
```

### 5. Architecture-Specific Threat Matching

```javascript
async matchArchitectureToThreats(diagram) {
  // Create text representations for different aspects
  const representations = {
    overall: await this.matchingService.getTextRepresentation(
      this.diagramToText(diagram)
    ),
    components: await this.getComponentRepresentations(diagram),
    dataFlows: await this.getDataFlowRepresentations(diagram),
    securityZones: await this.getSecurityZoneRepresentations(diagram)
  };
  
  // Find relevant threats for each aspect
  const threatMatches = {
    aptGroups: await this.threatIntelProcessor.findRelevantThreats(representations.overall),
    componentThreats: await this.findComponentThreats(representations.components),
    dataFlowRisks: await this.findDataFlowThreats(representations.dataFlows),
    zoneViolations: await this.findZoneThreats(representations.securityZones)
  };
  
  // Aggregate and rank by relevance
  return this.aggregateThreatMatches(threatMatches, diagram);
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
- Set up Gemini API integration
- Implement basic embedding service
- Implement local vector storage (JSON-based for simplicity)
- Create threat intel processor framework

### Phase 2: Threat Intel Integration (Week 3-4)
- Implement manual threat intel ingestion (JSON, CSV, STIX)
- Add API-based intel feed connectors (when online)
- Create embedding strategies for different intel types
- Build source management and deduplication

### Phase 3: Analyzer Enhancement (Week 5-6)
- Enhance SimplifiedThreatAnalyzer with threat intel context
- Implement component-to-threat matching
- Add APT group relevance scoring
- Integrate with existing analysis flow

### Phase 4: Optimization & Testing (Week 7-8)
- Optimize embedding generation and caching
- Implement incremental intel updates
- Performance testing with multiple intel sources
- Accuracy validation with real threat data

### Phase 5: Advanced Features (Week 9-10)
- Add threat intel aging and relevance decay
- Implement custom organizational threat profiles
- Create threat hunting recommendations
- Build threat intel metrics dashboard

## Integration with Existing System

### 1. Offline Mode (Local LLM)

```javascript
// ThreatIntelManager component handles manual uploads
const handleManualUpload = async (file) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = JSON.parse(e.target.result);
    
    // Process threat intel locally
    const result = await api.post('/api/threat-intel/process', {
      data: content,
      source: 'manual',
      format: detectFormat(content)
    });
    
    // Data automatically persisted by LocalThreatStorage
  };
  reader.readAsText(file);
};
```

### 2. Online Mode (API Integration)

```javascript
// Automated feed ingestion when using cloud AI
class ThreatIntelFeedManager {
  async configureFeed(feedConfig) {
    // Only available in online mode
    if (settings.api.provider === 'local') {
      throw new Error('API feeds require online mode');
    }
    
    // Set up scheduled ingestion
    this.scheduleJob(feedConfig.id, feedConfig.schedule, async () => {
      const data = await this.fetchFeed(feedConfig.url, feedConfig.apiKey);
      await this.processor.processIntelFeed(data, feedConfig.id);
    });
  }
}
```

### 3. Analysis Enhancement

```javascript
// In SimplifiedThreatAnalyzer
async _buildComprehensivePrompt(diagram, componentIds, analysisType) {
  const basePrompt = super._buildComprehensivePrompt(diagram, componentIds, analysisType);
  
  // Add threat intel context if available
  const intelContext = await this.buildThreatIntelContext(diagram);
  
  if (intelContext.hasRelevantIntel) {
    return `${basePrompt}

## THREAT INTELLIGENCE CONTEXT
Based on current threat intelligence, the following actors and techniques are relevant:

${intelContext.summary}

Consider these specific threats when analyzing the system.`;
  }
  
  return basePrompt;
}
```

## Benefits

### 1. Real-time Threat Relevance
- Match current threats to your specific architecture
- No outdated pre-built databases
- Flexible ingestion from multiple sources

### 2. Operational Flexibility
- Manual updates for air-gapped environments
- API integration for connected systems
- Source priority and deduplication

### 3. Enhanced Analysis Accuracy
- Context-aware threat matching
- Component-specific threat identification
- APT group behavioral analysis

### 4. Cost Efficiency
- Minimal embedding costs ($0.15/million tokens)
- Efficient vector storage
- Reduced false positives through semantic matching

### 5. Scalability
- Handle multiple threat sources
- Incremental updates
- Fast similarity search

## Technical Considerations

### Vector Database Selection

**Option 1: ChromaDB**
- Pros: Easy to use, good for development, built-in persistence
- Cons: Limited scalability for production

**Option 2: Qdrant**
- Pros: High performance, production-ready, cloud-native
- Cons: More complex setup

**Option 3: FAISS (Facebook AI Similarity Search)**
- Pros: Very fast, minimal dependencies, good for edge deployment
- Cons: Limited to in-memory operations, no built-in persistence

**Recommendation**: Start with ChromaDB for development, migrate to Qdrant for production.

### Embedding Model Configuration

```javascript
const EMBEDDING_CONFIG = {
  model: 'gemini-embedding-001', // Stable version
  // model: 'gemini-embedding-exp-03-07', // Preview version for testing
  dimensions: 768, // Recommended for balance (options: 128-3072)
  maxInputTokens: 2048, // Gemini limit
  maxBatchSize: 100, // For batch processing
  cacheEnabled: true,
  cacheTTL: 3600 * 24 * 7, // 1 week
};
```

### Model Selection Guidelines

- **Dimensions**:
  - 768: Best balance of performance and storage (recommended)
  - 1536: Higher accuracy for complex threat matching
  - 3072: Maximum accuracy but 4x storage requirements
  - 128-512: Low storage requirements, suitable for basic matching

- **Model Versions**:
  - `gemini-embedding-001`: Stable, production-ready
  - `gemini-embedding-exp-03-07`: Preview with latest improvements

### Security Considerations

1. **API Key Management**
   - Store Gemini API key securely
   - Use environment variables
   - Implement key rotation

2. **Data Privacy**
   - Consider what data is sent to Gemini
   - Implement data sanitization for sensitive diagrams
   - Option for on-premise embedding models

3. **Access Control**
   - Limit embedding generation rate
   - Implement user quotas
   - Monitor usage patterns

## Cost Analysis

### Embedding Generation Costs
- Gemini Embedding: $0.15 per million tokens
- Average threat intel entry: ~200 tokens
- Average diagram analysis: ~500 tokens
- Cost per threat actor embedded: ~$0.00003
- Cost per analysis with matching: ~$0.000075

### Threat Intel Processing Costs
- MITRE ATT&CK full dataset (~200 groups): ~$0.006
- Custom threat feed (1000 entries): ~$0.03
- Monthly updates: ~$0.10

### Storage Costs
- Vector per embedding: 768 dimensions * 4 bytes = 3KB (configurable 128-3072)
- 10,000 threat intel entries: ~30MB
- Vector DB storage: ~$0.023/GB/month
- Monthly storage cost: < $0.001

### Total Monthly Cost (estimated)
- Threat intel processing: $0.10
- 10,000 analyses: $0.75
- Storage: < $0.01
- Vector DB queries: $0.10
- **Total: < $1.00/month**

### Cost Comparison
- Traditional threat intel platform: $1,000-10,000/month
- Embedding-based solution: < $1/month
- Cost reduction: 99.9%

## Threat Intel Sources and Formats

### Supported Formats

1. **Native AI Threat Modeler Format**
   ```json
   {
     "version": "2.0",
     "aptGroups": { ... },
     "indicators": [ ... ],
     "ttps": { ... }
   }
   ```

2. **STIX 2.1**
   - Standard format from threat intel platforms
   - Automatic conversion to embeddings

3. **MITRE ATT&CK**
   - Direct import from MITRE exports
   - Technique and group mappings

4. **CSV Format**
   - Simple format for custom data
   - Flexible column mapping

### Example Sources

- **Offline Mode**:
  - MITRE ATT&CK downloads
  - CISA advisories
  - Custom organizational intel
  - Industry-specific threat reports

- **Online Mode**:
  - AlienVault OTX API
  - Abuse.ch feeds
  - Commercial threat intel APIs
  - GitHub security advisories

## Future Enhancements

### 1. Threat Intel Enrichment
- Automatic cross-referencing between sources
- Threat actor attribution confidence scoring
- TTP chain analysis

### 2. Proactive Threat Hunting
- Generate hunting queries based on architecture
- Identify gaps in detection coverage
- Suggest monitoring improvements

### 3. Industry-Specific Profiles
- Pre-configured threat profiles by industry
- Regulatory compliance mapping
- Sector-specific attack patterns

### 4. Threat Intel Metrics
- Source quality scoring
- Intel aging and relevance decay
- Coverage analysis dashboard

## Implementation Considerations

### 1. Privacy and Security
- Threat intel may contain sensitive IOCs
- Consider local embedding generation for sensitive data
- Implement access controls for threat intel management

### 2. Performance Optimization
- Batch embedding generation for large intel feeds
- Implement incremental updates
- Use appropriate vector DB indices

### 3. Quality Control
- Validate threat intel formats before processing
- Monitor embedding quality metrics
- Implement source reliability scoring

## Architecture Summary

The embedding-enhanced threat intelligence system integrates seamlessly with the existing AI Threat Modeler:

1. **ThreatIntelManager (Frontend)**:
   - Handles manual threat intel uploads in offline mode
   - Displays current intel sources and statistics
   - Manages deduplication and source priorities

2. **ThreatIntelProcessor (Backend)**:
   - Processes incoming threat data
   - Generates embeddings using Gemini
   - Stores in local JSON file with metadata

3. **SimplifiedThreatAnalyzer (Enhanced)**:
   - Searches for relevant threats during analysis
   - Enriches prompts with threat intel context
   - Provides APT group and TTP mapping

4. **Local Vector Storage**:
   - Stores embeddings in JSON files
   - Fast in-memory similarity search
   - No external dependencies
   - Supports incremental updates

## Conclusion

Integrating Google's Gemini Embedding model with real-time threat intelligence provides a flexible, powerful system for contextual threat analysis. By focusing on dynamic threat intel integration rather than static knowledge bases, the system remains current and relevant to emerging threats. The architecture supports both offline manual updates and online API integration, making it suitable for various deployment scenarios.

Key advantages:
- **Real-time Relevance**: Threat intel is always current
- **Semantic Understanding**: Finds threats based on meaning, not keywords
- **Flexible Deployment**: Works in both air-gapped and connected environments
- **Cost Effective**: Minimal embedding costs with maximum impact
- **Scalable**: Handles multiple sources with deduplication