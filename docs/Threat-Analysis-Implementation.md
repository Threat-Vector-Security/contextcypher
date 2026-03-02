# Threat Analysis Implementation Guide

## Overview

This document provides a comprehensive explanation of how the AI Threat Modeler's threat analysis functionality works, from user interaction through AI processing to threat extraction and display.

**Last Updated**: August 2025
**Version**: 3.4 - SSE Progress Streaming with Separated Result Delivery

### Recent Major Changes (v3.4)
- **SSE Architecture Redesign**: Separated progress streaming from result delivery to handle large payloads
- **Result Storage**: Analysis results stored server-side with unique IDs for reliable retrieval
  - 5-minute TTL (Time To Live) for automatic cleanup
  - Map-based storage for fast access
  - Result sizes can exceed 100KB without issues
- **Dedicated Result Endpoint**: New `/api/threat-analysis/result/:id` endpoint for fetching completed results
- **Retry Logic**: Frontend implements automatic retry for result fetching
  - 3 retry attempts with 1-second delay
  - Handles race conditions between SSE completion and result storage
- **Progress Callback Integration**: SimplifiedThreatAnalyzer now accepts progressCallback for real-time updates
- **No Size Limitations**: Eliminated SSE truncation issues by sending only lightweight progress updates

### Previous Major Changes (v3.3)
- **Progressive Knowledge Building**: Each node analysis now includes accumulated knowledge from previously analyzed components
- **Immediate Result Storage**: Node analysis results are stored immediately after each analysis, enabling real-time UI updates
- **Vulnerability → Threat → TTP Flow**: Clear logical progression from identifying vulnerabilities to threats they enable to MITRE TTPs
- **Optimized for Local LLMs**: Designed for models with large context windows but limited cognitive capacity due to quantization
- **Attack Path Discovery**: System analysis focuses on chaining identified vulnerabilities into realistic attack paths

### Previous Major Changes (v3.2)
- **CVE Accuracy**: AI must only report CVEs that exist in NVD and affect the exact versions specified
- **Separated Recommended Controls**: Security recommendations now stored separately from threats, not shown in "Identified Threats" panel
- **Concise Analysis**: Stricter word limits and focus on observable issues only
- **No Speculation**: Eliminated hypothetical scenarios and "potential" issues without evidence
- **Component-Specific Controls**: Each node's recommended controls shown in analysis report under that component

### Previous Major Changes (v3.1)
- **Context-Aware Analysis**: AI now analyzes based on ALL provided data, not just specific fields
- **Refined Risk Classification**: Clear distinction between actual vulnerabilities (HIGH risk) vs documentation gaps (MEDIUM risk)
- **Security Control Recommendations**: AI recommends appropriate controls when they're missing based on component context
- **Frontend Fixes**: Fixed "Analyze Entire Diagram" and node analysis to properly use returned diagram with additionalContext
- **Balanced Prompts**: Removed prescriptive field checking in favor of principle-based guidelines

### Previous Major Changes (v3.0)
- **Node-by-Node Architecture**: Complete rewrite using SimplifiedThreatAnalyzer with individual node analysis followed by system consolidation
- **Cost Estimation**: Pre-analysis cost estimation with user confirmation dialogs
- **Phase-Based Progress**: Real-time progress tracking through analysis phases (node analysis, system analysis, enrichment)
- **Individual Node Analysis**: Each node analyzed sequentially for comprehensive assessment
- **Enhanced UI Flow**: Tabbed interface with dedicated threat analysis and settings panels

### Previous Changes (v2.3)
- **Per-Threat MITRE ATT&CK Mapping**: Every THREAT line for a node or connection must now end with a `MITRE: T####` clause. Regex parsers and the data model have been updated (`mitreTechniques` array) so UI components can display technique badges automatically.
- **Regex Updates**: `threatPattern` & fallback patterns in `server/index.js` now capture optional MITRE IDs; threat objects include `mitreTechniques`.
- **Prompt Updates**: `SimplifiedThreatAnalyzer` instructs the model to append `| MITRE: ...` for each threat.

## Architecture Overview

```
User Interface (ThreatAnalysisMainPanel)
        ↓
ThreatAnalysisPanel (Analysis Logic)
        ↓ 
Cost Estimation Dialog
        ↓
Backend SSE API (/api/threat-analysis/sse) ← v3.4
        ↓
SimplifiedThreatAnalyzer Service
  ├── Phase 1: Node-by-Node Analysis (with progress callbacks)
  ├── Phase 2: System-Level Consolidation  
  ├── Phase 3: MITRE ATT&CK Enrichment
  └── Phase 4: UI Formatting
        ↓
AIProviderManager (Ollama/Cloud AI)
        ↓
Threat Extraction & Parsing
        ↓
Result Storage (Server-side Map with TTL) ← v3.4
        ↓
Result Fetch API (/api/threat-analysis/result/:id) ← v3.4
        ↓
Node/Edge Updates with Threats
```

## Core Components

### 1. Frontend: ThreatAnalysisMainPanel.tsx

Container component providing tabbed interface:

```typescript
// Two main tabs:
// Tab 0: "Threat Analysis" - Contains ThreatAnalysisPanel
// Tab 1: "Analysis Settings" - Threat analysis logging and other settings

<Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
  <Tab label="Threat Analysis" icon={<Security />} />
  <Tab label="Analysis Settings" icon={<Settings />} />
</Tabs>
```

Key features:
- Tabbed interface for analysis and settings
- Simplified settings (removed SecOps features, automation toggles)
- Threat analysis logging configuration (Pro feature)

### 2. Frontend: ThreatAnalysisPanel.tsx

The main analysis UI component with two primary functions:

```typescript
// Two main analysis modes:
analyzeSelectedNodes() // Analyzes only user-selected components
analyzeEntireDiagram() // Analyzes all non-zone components

// Cost estimation flow:
1. estimateNodeByNodeTokens() // Calculate token usage
2. estimateNodeByNodeTime() // Calculate time estimate  
3. Show AnalysisCostDialog // User confirmation
4. Proceed with analysis if confirmed
```

Key features:
- Cost estimation with user confirmation before analysis
- Real-time progress tracking through phases
- System analysis report generation and display
- Threat analysis logging integration
- Batch processing with cancellation support

### 3. Backend: SimplifiedThreatAnalyzer.js

The core threat analysis service using a **node-by-node approach**:

#### Main Entry Point
```javascript
async analyzeThreatPaths(diagram, componentIds = [], analysisType = 'comprehensive', additionalContext = {}) {
  // Index the diagram for efficient querying
  this.indexer.indexDiagram(diagram);
  
  // Phase 1: Analyze each node individually
  const nodeAnalyses = await this.analyzeAllNodes(diagram, componentIds, additionalContext);
  
  // Phase 2: Consolidate and analyze system-level threats
  const systemAnalysis = await this.analyzeSystemLevel(nodeAnalyses, diagram, additionalContext);
  
  // Phase 3: Enrich with MITRE data
  const enrichedAnalysis = await this.enrichWithMitreData(nodeAnalyses, systemAnalysis, mitreValidator);
  
  // Phase 4: Format the response for the existing UI
  const formattedResponse = this.formatForUI(enrichedAnalysis, diagram);
  
  return formattedResponse;
}
```

#### Phase 1: Individual Node Analysis
```javascript
async analyzeAllNodes(diagram, componentIds, additionalContext) {
  const nodesToAnalyze = diagram.nodes.filter(node => {
    // Skip security zones
    if (node.type === 'securityZone') return false;
    // If specific components requested, filter to those
    if (componentIds.length > 0) return componentIds.includes(node.id);
    return true;
  });

  const nodeAnalyses = [];
  
  // Track progressive context for knowledge building
  const progressiveContext = {
    analyzedCount: 0,
    vulnerabilitiesFound: [],
    threatsIdentified: [],
    compromisedComponents: [],
    criticalFindings: []
  };

  // Analyze each node individually with progressive knowledge
  for (let i = 0; i < nodesToAnalyze.length; i++) {
    const node = nodesToAnalyze[i];
    
    // Emit progress update before analyzing node (v3.4)
    if (additionalContext.progressCallback) {
      additionalContext.progressCallback({
        phase: 'node_analysis',
        current: i + 1,
        total: nodesToAnalyze.length,
        nodeId: node.id,
        nodeLabel: node.data?.label || node.id,
        status: 'analyzing',
        message: `Analyzing ${node.data?.label || node.id}...`
      });
    }
    
    // Pass accumulated knowledge to each analysis
    const result = await this.analyzeNode(node, diagram, {
      ...additionalContext,
      progressiveContext,
      previousFindings: this.formatPreviousFindings(progressiveContext)
    });
    
    // Update progressive context with new findings
    this.updateProgressiveContext(progressiveContext, result);
    
    // Store results immediately for real-time UI updates
    this.updateNodeInDiagram(diagram, node, result);
    
    nodeAnalyses.push(result);
    progressiveContext.analyzedCount++;
  }

  return nodeAnalyses;
}
```

#### Individual Node Analysis
Each node is analyzed with comprehensive context including:
- Component details (type, zone, security level, technology stack)
- ALL security-related properties from any fields
- Incoming and outgoing connections with full edge data
- Connected component information
- **NEW in v3.3**: Progressive context from previously analyzed nodes including:
  - Vulnerabilities found in other components
  - Threats already identified in the system
  - Components that may be compromised
  - Critical findings that affect system security

##### Key Analysis Principles (v3.2)

The AI is instructed to:

**CVE Accuracy Requirements**:
1. Only report CVEs that actually exist in the NVD database
2. CVEs must be confirmed to affect the EXACT version specified
3. Never invent or guess CVE numbers
4. If unsure about a CVE, don't report it

**Focus on Observable Issues**:
1. Only report threats based on explicitly stated misconfigurations
2. Identify actually missing critical security features (not just undocumented ones)
3. Report specific version vulnerabilities that can be verified
4. Identify clear design flaws visible in the architecture

**Avoid Speculation**:
1. Do NOT report "potential" issues without evidence
2. Avoid hypothetical scenarios ("if X then Y could happen")
3. Skip generic risks that apply to any system
4. Don't flag issues based on missing documentation alone

**Concise Analysis**:
1. Only report significant, actionable issues
2. If a component is well-secured, acknowledge it
3. Keep descriptions brief and specific
4. System overview limited to 100 words

**Separated Recommendations**:
1. Actual threats/vulnerabilities go in main sections
2. Security control suggestions go in "recommendedControls"
3. Each node's controls shown only in that component's section
4. Maximum 5 system-wide recommendations

```javascript
async analyzeNode(node, diagram, additionalContext) {
  const nodeContext = this.buildNodeContext(node, diagram);
  
  const prompt = `Analyze this specific component for security threats and vulnerabilities.

COMPONENT DETAILS:
- Index Code: ${node.data?.indexCode || 'N/A'}
- Label: ${node.data?.label || node.id}
- Type: ${node.type}
- Zone: ${node.data?.zone || 'Unknown'}
- Security Level: ${node.data?.securityLevel || 'Standard'}
[... all component properties included ...]

SECURITY CONTROLS:
${node.data?.securityControls ? node.data.securityControls.join(', ') : 'None specified'}

INCOMING CONNECTIONS:
${nodeContext.incomingConnections.map(c => /* format with ALL edge properties */)}

OUTGOING CONNECTIONS:
${nodeContext.outgoingConnections.map(c => /* format with ALL edge properties */)}

ANALYSIS GUIDELINES:

Base your analysis on ALL the data provided above. Consider the complete context including:
- Component properties and configurations
- Security-related attributes (any field that implies security measures)
- Connections and their security properties
- The component's role in the overall system
- Knowledge from previously analyzed components (if any)

FOLLOW THIS LOGICAL FLOW:
1. First identify VULNERABILITIES - specific weaknesses in this component
2. Then determine what THREATS these vulnerabilities enable
3. Finally map to relevant MITRE ATT&CK techniques (TTPs)

Consider how vulnerabilities in other components might affect this one:
- Can compromised components attack this one?
- Does this component trust potentially vulnerable systems?
- Are there attack chains through the components analyzed so far?

THREAT CLASSIFICATION:
1. CRITICAL/HIGH Risk: Clear evidence of exploitable vulnerabilities or severe misconfigurations
2. MEDIUM Risk: Lack of documented controls where the component's role/data classification suggests they should exist
3. LOW Risk: Best practice improvements or documentation enhancements

KEY PRINCIPLES:
- Assess risk based on ALL security evidence present in any fields
- Consider the component's exposure, role, and data sensitivity
- If security controls are not defined or evident, RECOMMEND appropriate controls
- When recommending controls, be specific and practical

Return ONLY valid JSON...`;

  // System prompt emphasizes pragmatic, context-aware analysis
  const messages = [
    { 
      role: 'system', 
      content: 'You are a pragmatic cybersecurity expert. Analyze based on ALL provided data, not just specific fields. Consider the complete context to determine real risk. Acknowledge security measures wherever they appear in the data. Distinguish between actual vulnerabilities (HIGH risk) and areas for improvement (MEDIUM/LOW risk). Return ONLY valid JSON without any markdown formatting.' 
    },
    { role: 'user', content: prompt }
  ];
}
```

#### Phase 2: System-Level Analysis
The system-level analysis now focuses on discovering attack paths by chaining the vulnerabilities identified during node analysis:

```javascript
async analyzeSystemLevel(nodeAnalyses, diagram, additionalContext) {
  // Prepare comprehensive summary from all node analyses
  const allThreats = [];
  const allVulnerabilities = [];
  
  nodeAnalyses.forEach(analysis => {
    analysis.threats.forEach(threat => {
      allThreats.push({
        component: analysis.nodeLabel,
        componentId: analysis.nodeId,
        zone: analysis.nodeZone,
        indexCode: analysis.indexCode,
        ...threat
      });
    });
    
    // Collect vulnerabilities for attack path analysis
    if (analysis.vulnerabilities) {
      analysis.vulnerabilities.forEach(vuln => {
        allVulnerabilities.push({
          component: analysis.nodeLabel,
          componentId: analysis.nodeId,
          ...vuln
        });
      });
    }
  });

  // Generate Cypher graph for full system context
  const cypherGraph = generateEnhancedCypher(diagram);
  
  const prompt = `Based on the following component-level threat analysis and system architecture, provide comprehensive attack paths and recommendations.

=== SYSTEM ARCHITECTURE (Cypher Graph Format) ===
${cypherGraph}

=== IDENTIFIED THREATS BY COMPONENT ===
${allThreats.map((t, i) => /* format threat summary */)}

ANALYSIS APPROACH:
Review the component-level threats above and the complete system architecture to provide a holistic security assessment.

1. **System Overview**: Concise summary (2-3 paragraphs, max 150 words) covering:
   - What the system does and its architecture
   - Overall security posture based on ALL evidence in the data
   - Key findings from the analysis

2. **Attack Paths**: Chain the vulnerabilities identified in components:
   - Start with entry points (Internet-facing components, user access)
   - Follow trust relationships and data flows
   - Show how compromise of one component enables attacks on others
   - Focus on realistic, exploitable paths using the specific vulnerabilities found
   - Risk should reflect the actual severity of the vulnerabilities in the chain

3. **Recommendations**: Prioritized actions based on real risk:
   - Address actual vulnerabilities first (HIGH priority)
   - Recommend security controls for components lacking them (MEDIUM priority)
   - Suggest improvements where they add real security value
   - Be specific and actionable - include which controls to implement

Return ONLY valid JSON...`;

  // System prompt emphasizes balanced, risk-based analysis
  const messages = [
    { 
      role: 'system', 
      content: 'You are an experienced cybersecurity architect. Provide balanced analysis based on all available evidence. Recognize security measures wherever they appear in the data. Focus on real exploitable risks while acknowledging good security practices. Your recommendations should be practical and risk-based. Return ONLY valid JSON without any markdown formatting.' 
    },
    { role: 'user', content: prompt }
  ];
}
```

#### Phase 3: MITRE Enrichment
```javascript
async enrichWithMitreData(nodeAnalyses, systemAnalysis, mitreValidator) {
  // Enrich node threats with MITRE details
  const enrichedNodeAnalyses = nodeAnalyses.map(analysis => {
    const enrichedThreats = analysis.threats.map(threat => {
      const mitreDetails = [];
      if (threat.mitreTechniques) {
        threat.mitreTechniques.forEach(techniqueId => {
          const technique = mitreValidator.getTechnique(techniqueId);
          if (technique) {
            mitreDetails.push(technique);
          }
        });
      }
      return { ...threat, mitreDetails };
    });
    return { ...analysis, threats: enrichedThreats };
  });

  // Enrich TTP summary with full details
  const enrichedTtpSummary = {};
  Object.keys(systemAnalysis.ttpSummary || {}).forEach(techniqueId => {
    const technique = mitreValidator.getTechnique(techniqueId);
    if (technique) {
      enrichedTtpSummary[techniqueId] = {
        name: technique.name,
        description: technique.description,
        tactics: technique.tactics
      };
    }
  });

  return {
    nodeAnalyses: enrichedNodeAnalyses,
    systemAnalysis: { ...systemAnalysis, ttpSummary: enrichedTtpSummary }
  };
}
```

### 4. Backend API Endpoints

#### Result Storage (v3.4)

Server-side storage for analysis results:

```javascript
// Store for completed analysis results (with TTL)
const analysisResults = new Map();
const RESULT_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup expired results periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, result] of analysisResults.entries()) {
    if (now - result.timestamp > RESULT_TTL) {
      analysisResults.delete(id);
    }
  }
}, 60 * 1000); // Check every minute
```

#### SSE Endpoint: /api/threat-analysis/sse (v3.4)

Real-time progress streaming endpoint:

```javascript
app.post('/api/threat-analysis/sse', async (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none'); // Disable compression
  
  // Progress callback for real-time updates
  const progressCallback = (progress) => {
    res.write(`data: ${JSON.stringify({ 
      type: 'progress', 
      ...progress,
      timestamp: new Date().toISOString()
    })}\n\n`);
    res.flush();
  };

  // Perform analysis with progress callback
  const result = await threatAnalyzer.analyzeThreatPaths(
    diagram, 
    componentIds, 
    analysisType,
    { ...context, progressCallback }
  );
  
  // Store result server-side
  const resultId = `analysis-${Date.now()}`;
  analysisResults.set(resultId, {
    data: result,
    timestamp: Date.now()
  });
  
  // Send completion with result ID
  res.write(`data: ${JSON.stringify({ 
    type: 'complete', 
    resultId: resultId,
    message: 'Analysis complete. Fetch result using the resultId.'
  })}\n\n`);
  
  res.end();
});
```

#### Result Endpoint: /api/threat-analysis/result/:id (v3.4)

Fetch completed analysis results:

```javascript
app.get('/api/threat-analysis/result/:id', async (req, res) => {
  const { id } = req.params;
  const result = analysisResults.get(id);
  
  if (!result) {
    return res.status(404).json({ 
      success: false, 
      error: 'Analysis result not found or expired' 
    });
  }
  
  res.json({
    success: true,
    data: result.data,
    timestamp: result.timestamp
  });
});
```

#### Legacy Endpoint: /api/threat-analysis

Traditional non-streaming endpoint (still available):

```javascript
app.post('/api/threat-analysis', async (req, res) => {
  const { diagram, componentIds, analysisType, context } = req.body;
  
  // Initialize SimplifiedThreatAnalyzer with AI provider
  const threatAnalyzer = new SimplifiedThreatAnalyzer(aiManager);
  
  // Perform node-by-node analysis
  const result = await threatAnalyzer.analyzeThreatPaths(diagram, componentIds, analysisType, context);
  
  // Extract and structure response for UI
  res.json({
    success: true,
    analysis: {
      content: result.content,
      systemAnalysis: result.systemAnalysis,
      componentThreats: result.systemAnalysis.componentThreats,
      attackPaths: result.systemAnalysis.attackPaths,
      vulnerabilities: result.systemAnalysis.vulnerabilities,
      recommendations: result.systemAnalysis.recommendations
    },
    metadata: result.metadata
  });
});
```

## Analysis Flow

### 1. User Interaction
User selects components and clicks "Analyze Selected" or "Analyze Entire Diagram"

### 2. Cost Estimation
```javascript
// Calculate token and time estimates
const tokenEstimate = estimateNodeByNodeTokens(componentCount, edgeCount);
const timeEstimate = estimateNodeByNodeTime(componentCount, provider);

// Show confirmation dialog
setCostDialog({
  open: true,
  tokens: tokenEstimate.total,
  passes: componentCount + 1, // One per node + system analysis
  estimatedTime: timeEstimate.total,
  provider,
  model,
  onContinue: proceedWithAnalysis,
  onCancel: cancelAnalysis
});
```

### 3. Analysis Execution
```javascript
// Phase tracking in frontend
setProgress({
  total: componentCount + 2, // nodes + system analysis + enrichment
  completed: 0,
  current: 'Preparing analysis...',
  status: 'preparing',
  errors: []
});

// Cost dialog progress updates
setCostDialog(prev => ({ 
  ...prev,
  progress: {
    current: currentPhase,
    total: totalPhases,
    currentComponent: 'Analyzing node: Web Server',
    timeRemaining: estimatedSecondsRemaining,
    phase: 'node-analysis' | 'system-analysis' | 'enrichment'
  }
}));
```

### 4. Backend Processing
```javascript
// SimplifiedThreatAnalyzer processes in phases:

// Phase 1: Individual node analysis
for (let i = 0; i < nodesToAnalyze.length; i++) {
  const node = nodesToAnalyze[i];
  const result = await this.analyzeNode(node, diagram, additionalContext);
  nodeAnalyses.push(result);
}

// Phase 2: System analysis
const systemAnalysis = await this.analyzeSystemLevel(nodeAnalyses, diagram, additionalContext);

// Phase 3: MITRE enrichment  
const enrichedAnalysis = await this.enrichWithMitreData(nodeAnalyses, systemAnalysis, mitreValidator);

// Phase 4: UI formatting
const formattedResponse = this.formatForUI(enrichedAnalysis, diagram);
```

### 5. Results Processing

#### SSE Implementation (v3.4)
The frontend now uses Server-Sent Events for real-time progress updates:

```javascript
// Use fetch with readable stream for SSE-like behavior with POST
const response = await fetch(`${apiUrl}/api/threat-analysis/sse`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

// Process SSE stream
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const eventData = JSON.parse(line.slice(6));
      
      if (eventData.type === 'progress') {
        // Update progress UI
        setProgress({
          current: eventData.current,
          total: eventData.total,
          phase: eventData.phase,
          nodeLabel: eventData.nodeLabel
        });
      } else if (eventData.type === 'complete') {
        // Fetch complete result from separate endpoint
        const resultResponse = await fetch(
          `${apiUrl}/api/threat-analysis/result/${eventData.resultId}`
        );
        const result = await resultResponse.json();
        processAnalysisResult(result.data);
      }
    }
  }
}
```

#### Frontend Result Processing (v3.1)
The frontend properly extracts and uses the `diagram` field returned from the backend:

```javascript
// Extract the updated diagram with node-specific analysis
const returnedDiagram = systemResult.diagram;

// If we have an updated diagram from the backend, update our nodes with the analysis
if (returnedDiagram && returnedDiagram.nodes) {
  returnedDiagram.nodes.forEach((backendNode) => {
    const nodeIndex = updatedNodes.findIndex(n => n.id === backendNode.id);
    if (nodeIndex !== -1 && backendNode.data?.additionalContext) {
      // Update the node with the backend's additionalContext
      updatedNodes[nodeIndex] = {
        ...updatedNodes[nodeIndex],
        data: {
          ...updatedNodes[nodeIndex].data,
          additionalContext: backendNode.data.additionalContext
        }
      };
    }
  });
}

// Extract component-specific threats
const componentThreatsMap = systemResult.componentThreats || {};

// Update nodes with their threats and analysis
selectedNodeObjects.forEach(currentNode => {
  const threats = componentThreatsMap[currentNode.id] || [];
  // Get node-specific analysis from the returned diagram
  let nodeAnalysis = '';
  if (returnedDiagram && returnedDiagram.nodes) {
    const updatedNode = returnedDiagram.nodes.find(n => n.id === currentNode.id);
    if (updatedNode?.data?.additionalContext) {
      nodeAnalysis = updatedNode.data.additionalContext;
    }
  }
  
  // Update node with both securityContext and additionalContext
  updatedNodes[nodeIndex] = {
    ...node,
    data: {
      ...node.data,
      securityContext: { threats, securityPosture: {...} },
      additionalContext: nodeAnalysis // This populates the "Identified Threats" tab
    }
  };
});

// Store system analysis for report
setSystemAnalysis({
  systemOverview: systemResult.systemAnalysis?.systemOverview,
  componentThreats: componentThreatsMap,
  attackPaths: systemResult.systemAnalysis?.attackPaths,
  vulnerabilities: systemResult.systemAnalysis?.vulnerabilities,
  recommendations: systemResult.systemAnalysis?.recommendations,
  timestamp: new Date()
});
```

#### Backend Response Structure (v3.1)
The backend returns the updated diagram with node analysis:

```javascript
// server/index.js - threat analysis endpoint
res.json({ 
  success: true, 
  analysis: {
    systemAnalysis,
    componentThreats,
    attackPaths,
    vulnerabilities,
    recommendations,
    diagram: result.diagram, // Contains nodes with additionalContext populated
    metadata: result.metadata,
    content: result.content // For backward compatibility
  }
});
```

## Token Estimation and Cost Control

### Token Estimation
```javascript
// estimateNodeByNodeTokens() in utils/tokenEstimator.ts
export const estimateNodeByNodeTokens = (nodeCount: number, edgeCount: number) => {
  // Individual node analysis: ~150 tokens per node
  const perNodeTokens = 150;
  const nodeAnalysisTokens = nodeCount * perNodeTokens;
  
  // System analysis: ~500 base + 50 per node
  const systemAnalysisTokens = 500 + (nodeCount * 50);
  
  return {
    nodeAnalysis: nodeAnalysisTokens,
    systemAnalysis: systemAnalysisTokens, 
    total: nodeAnalysisTokens + systemAnalysisTokens
  };
};
```

### Time Estimation
```javascript
// estimateNodeByNodeTime() in utils/tokenEstimator.ts  
export const estimateNodeByNodeTime = (nodeCount: number, provider: string) => {
  // Time per node varies by provider
  const timePerNode = provider === 'local' ? 3 : 2; // seconds
  const systemAnalysisTime = provider === 'local' ? 15 : 10; // seconds
  
  // Phase 1: Node analysis
  const nodeAnalysisTime = nodeCount * timePerNode;
  
  // Phase 2: System analysis (fixed time)
  const systemAnalysis = systemAnalysisTime;
  
  // Add overhead
  const overhead = 3;
  const total = nodeAnalysisTime + systemAnalysis + overhead;
  
  return {
    nodeAnalysis: nodeAnalysisTime,
    systemAnalysis,
    total
  };
};
```

### Cost Dialog Flow
```javascript
// AnalysisCostDialog.tsx shows:
- Estimated tokens and API calls
- Estimated completion time
- Cost estimate (if configured)
- Real-time progress during analysis
- Component being analyzed
- Time remaining estimate
- Current phase (node analysis, system analysis, enrichment)
```

## Enhanced Cypher Graph Generation

The system generates enhanced Cypher format for system-level analysis:

```javascript
// generateEnhancedCypher() in utils/formatters.js
const generateEnhancedCypher = (diagram) => {
  const statements = [];
  
  // Create nodes with comprehensive properties
  diagram.nodes.forEach(node => {
    if (node.type === 'securityZone') return;
    
    const props = {
      id: node.id,
      indexCode: indexer.getNodeCode(node.id),
      label: node.data?.label,
      type: node.type,
      zone: node.data?.zone,
      // Include all security-relevant properties
      securityLevel: node.data?.securityLevel,
      dataClassification: node.data?.dataClassification,
      vendor: node.data?.vendor,
      version: node.data?.version,
      protocols: node.data?.protocols,
      securityControls: node.data?.securityControls
    };
    
    statements.push(`CREATE (${node.id}:${node.type} ${formatProps(props)})`);
  });
  
  // Create relationships with edge properties
  diagram.edges.forEach(edge => {
    const edgeCode = indexer.getEdgeCode(edge.id);
    const props = {
      edgeCode,
      protocol: edge.data?.protocol,
      encryption: edge.data?.encryption,
      authentication: edge.data?.authentication,
      // Include all connection security properties
    };
    
    statements.push(
      `MATCH (a {id:'${edge.source}'}), (b {id:'${edge.target}'}) ` +
      `CREATE (a)-[:CONNECTS ${formatProps(props)}]->(b)`
    );
  });
  
  return statements.join('\n');
};
```

This Cypher format provides the AI with:
- Complete system topology understanding
- Security zone boundaries and trust relationships  
- Component security properties and configurations
- Connection security attributes for attack path analysis
- Index codes for precise component referencing

## Response Parsing and Threat Extraction

### Threat Extraction Patterns (Updated for v3.0)

#### Pattern 1: Qualitative Risk Assessment
```javascript
const threatPattern = /THREAT:\s*([^|]+?)\s*\|\s*LIKELIHOOD:\s*(Almost Certain|Likely|Possible|Unlikely|Very Unlikely|Rare)\s*\|\s*IMPACT:\s*(Catastrophic|Severe|Major|Moderate|Minor|Negligible)\s*\|\s*RISK:\s*(Extreme|High|Medium|Minor|Sustainable)(?:\s*\|\s*MITRE:\s*([^\n]+))?/gi;
```

#### Pattern 2: Attack Path Extraction  
```javascript
const pathPattern = /PATH:\s*([^→]+?)\s*→\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*LIKELIHOOD:\s*(Almost Certain|Likely|Possible|Unlikely|Very Unlikely|Rare)\s*\|\s*IMPACT:\s*(Catastrophic|Severe|Major|Moderate|Minor|Negligible)\s*\|\s*RISK:\s*(Extreme|High|Medium|Minor|Sustainable)(?:\s*\|\s*MITRE:\s*([^\n]+))?/gi;
```

#### Pattern 3: Vulnerability Extraction
```javascript
const vulnPattern = /VULN:\s*([^|]+?)\s*\|\s*(?:CVE:\s*([^|]+?)\s*\|\s*)?(?:CVSS:\s*([^|]+?)\s*\|\s*)?AFFECTED:\s*([^|]+?)\s*\|\s*RISK:\s*(Extreme|High|Medium|Minor|Sustainable)/gi;
```

### Risk Matrix Implementation
```javascript
const riskMatrix = {
  'Almost Certain': { 'Catastrophic': 36, 'Severe': 30, 'Major': 24, 'Moderate': 18, 'Minor': 12, 'Negligible': 6 },
  'Likely': { 'Catastrophic': 30, 'Severe': 25, 'Major': 20, 'Moderate': 15, 'Minor': 10, 'Negligible': 5 },
  'Possible': { 'Catastrophic': 24, 'Severe': 20, 'Major': 16, 'Moderate': 12, 'Minor': 8, 'Negligible': 4 },
  'Unlikely': { 'Catastrophic': 18, 'Severe': 15, 'Major': 12, 'Moderate': 9, 'Minor': 6, 'Negligible': 3 },
  'Very Unlikely': { 'Catastrophic': 12, 'Severe': 10, 'Major': 8, 'Moderate': 6, 'Minor': 4, 'Negligible': 2 },
  'Rare': { 'Catastrophic': 6, 'Severe': 5, 'Major': 4, 'Moderate': 3, 'Minor': 2, 'Negligible': 1 }
};

// Risk level calculation:
// Extreme: 31-36, High: 24-30, Medium: 13-23, Minor: 5-12, Sustainable: 1-4
```

### Threat Data Structure
```javascript
{
  id: 'threat-nodeId-0',
  description: 'SQL Injection vulnerability in web application',
  severity: 'High',
  riskScore: 25,
  likelihood: 'Likely', 
  impact: 'Severe',
  risk: 'High',
  type: 'threat',
  componentId: 'web-server',
  componentCode: 'WEB-DMZ-001',
  mitreTechniques: ['T1190'],
  mitreDetails: [
    {
      id: 'T1190',
      name: 'Exploit Public-Facing Application',
      description: 'Adversaries may attempt to take advantage...',
      tactics: ['initial-access']
    }
  ]
}
```

## System Analysis Report

### Report Generation
```javascript
// formatAnalysisReport() in SimplifiedThreatAnalyzer 
formatAnalysisReport(enrichedAnalysis) {
  const { nodeAnalyses, systemAnalysis } = enrichedAnalysis;

  let report = `# Security Analysis Report

## SYSTEM_OVERVIEW
${systemAnalysis.systemOverview}

## COMPONENT_THREATS
`;

  // Group threats by component
  nodeAnalyses.forEach(analysis => {
    if (analysis.threats.length === 0) return;
    
    report += `
### ${analysis.nodeLabel} in ${analysis.nodeZone} Zone
`;
    
    analysis.threats.forEach(threat => {
      report += `THREAT: ${threat.description} | LIKELIHOOD: ${threat.likelihood} | IMPACT: ${threat.impact} | RISK: ${threat.risk} | MITRE: ${threat.mitreTechniques?.join(', ') || 'None'}
`;
    });
  });

  // Attack paths, TTP summary, vulnerabilities, recommendations...
  return report;
}
```

### UI Report Display
```javascript
// SystemAnalysisReport.tsx renders:
- Executive summary with risk breakdown
- Component security analysis by zone
- Attack path visualization  
- Vulnerability summary
- Prioritized recommendations
- MITRE ATT&CK technique mapping
- Clickable component navigation
```

## Architecture Decisions

### Progressive Multi-Pass Approach Benefits (v3.3)
1. **Knowledge Building**: Each component analyzed with accumulated knowledge from previous analyses
2. **Cognitive Optimization**: Breaks down complex analysis into focused tasks for quantized LLMs
3. **Real-time Updates**: Results stored immediately, enabling live UI updates
4. **Attack Path Discovery**: Progressive knowledge enables identification of multi-step attack chains
5. **Logical Flow**: Clear vulnerability → threat → TTP progression aids both AI and human understanding

### Node-by-Node Approach Benefits
1. **Focused Analysis**: Each component analyzed with full context of its connections
2. **Scalability**: Sequential processing manages cognitive load for local LLMs
3. **Consistency**: Every component gets comprehensive individual assessment
4. **Error Isolation**: Failed analysis of one component doesn't break entire process
5. **Progress Tracking**: Clear progress indication for user experience

### System-Level Consolidation Benefits  
1. **Attack Path Discovery**: Cross-component attack chains identified
2. **Risk Correlation**: Related threats across components consolidated
3. **Comprehensive Recommendations**: System-wide mitigation strategies
4. **MITRE Mapping**: Unified technique and tactic coverage analysis

### Edge Analysis Integration
- Edges analyzed as part of connected nodes' threat analysis
- Edge-specific threats stored on edge objects
- No separate threat panels for edges (information shown in context)
- Edge threats contribute to overall system security assessment

### Progressive Knowledge Building (v3.3)

#### How It Works
1. **First Node**: Analyzed with only its own context and connections
2. **Subsequent Nodes**: Receive summary of findings from all previously analyzed nodes
3. **Knowledge Accumulation**: Each analysis builds on previous discoveries
4. **Attack Chain Detection**: Later analyses can identify how earlier vulnerabilities enable attacks
5. **System Analysis**: Final pass connects all vulnerabilities into complete attack paths

#### Benefits for Local LLMs
- **Focused Tasks**: Each analysis has a clear, bounded scope
- **Reduced Cognitive Load**: Don't need to process entire system at once
- **Better Results**: Can identify complex attack chains through incremental analysis
- **Large Context Utilization**: Uses available context window for depth rather than breadth

#### Implementation Details

**Progressive Context Structure**:
```javascript
const progressiveContext = {
  analyzedCount: 0,
  vulnerabilitiesFound: [
    { component: 'Web Server', vulnerability: 'SQL Injection', severity: 'HIGH' }
  ],
  threatsIdentified: [
    { component: 'Database', threat: 'Data Exfiltration', riskLevel: 'HIGH' }
  ],
  compromisedComponents: ['Web Server'],
  criticalFindings: ['Default admin credentials on Database']
};
```

**Previous Findings Format**:
```javascript
formatPreviousFindings(progressiveContext) {
  if (progressiveContext.analyzedCount === 0) {
    return "This is the first component being analyzed.";
  }
  
  return `
PREVIOUS FINDINGS FROM ${progressiveContext.analyzedCount} COMPONENTS:

Vulnerabilities Found:
${progressiveContext.vulnerabilitiesFound.map(v => 
  `- ${v.component}: ${v.vulnerability} (${v.severity})`
).join('\n')}

Critical Security Issues:
${progressiveContext.criticalFindings.join('\n')}

Components That May Be Compromised:
${progressiveContext.compromisedComponents.join(', ')}
`;
}
```

**Immediate Result Storage**:
```javascript
updateNodeInDiagram(diagram, node, analysisResult) {
  const nodeIndex = diagram.nodes.findIndex(n => n.id === node.id);
  if (nodeIndex !== -1) {
    diagram.nodes[nodeIndex] = {
      ...diagram.nodes[nodeIndex],
      data: {
        ...diagram.nodes[nodeIndex].data,
        additionalContext: this.formatNodeAnalysis(analysisResult),
        lastAnalyzed: new Date().toISOString()
      }
    };
  }
}
```

### Context-Aware Analysis Principles (v3.1)

#### 1. Holistic Data Consideration
The AI analyzes ALL provided data, not just predefined fields:
- Component properties (any field can contain security-relevant information)
- Edge properties (encryption, protocols, authentication methods)
- Implicit security indicators (TLS versions, hardening flags, frameworks)
- Architectural context (zones, data flows, trust boundaries)

#### 2. Risk Classification Framework
Clear distinction between different types of findings:
- **CRITICAL/HIGH Risk**: Actual exploitable vulnerabilities
  - Known CVEs for specific versions
  - Explicit misconfigurations (e.g., default credentials)
  - Missing critical controls with no compensating measures
- **MEDIUM Risk**: Documentation gaps and missing controls
  - Component lacks explicit security controls but has implicit security
  - Controls expected based on component role/data classification
  - Best practices not fully implemented
- **LOW Risk**: Enhancement opportunities
  - Additional hardening recommendations
  - Documentation improvements
  - Defense-in-depth suggestions

#### 3. Security Control Recommendations
When controls are missing, the AI provides specific recommendations based on:
- **Component Type**: Different controls for databases vs web servers
- **Data Classification**: Higher controls for confidential data
- **Zone Placement**: Stricter controls for Internet-facing components
- **Industry Standards**: OWASP, CIS, NIST guidelines

Example recommendations:
- Database handling confidential data → encryption at rest, access logging, backup encryption
- Internet-facing web server → WAF, rate limiting, security headers, patch management
- Internal API → authentication, authorization, input validation, audit logging

#### 4. Balanced Reporting
The AI is instructed to:
- Acknowledge positive security measures first
- Distinguish between "needs documentation" vs "needs security fixes"
- Provide actionable, risk-based recommendations
- Avoid crying wolf about well-secured systems lacking documentation

## Error Handling and Resilience

### Individual Node Error Handling
```javascript
// Individual node failures don't stop entire analysis
for (let i = 0; i < nodesToAnalyze.length; i++) {
  const node = nodesToAnalyze[i];
  try {
    const result = await this.analyzeNode(node, diagram, additionalContext);
    nodeAnalyses.push(result);
  } catch (nodeError) {
    // Add error placeholder to maintain analysis continuity
    nodeAnalyses.push({
      nodeId: node.id,
      nodeLabel: node.data?.label || node.id,
      threats: [],
      vulnerabilities: [],
      error: nodeError.message
    });
  }
}
```

### Frontend Error Resilience
```javascript
// Progress tracking with error accumulation
setProgress(prev => ({
  ...prev,
  errors: [...prev.errors, errorMessage]
}));

// Analysis continues even with errors
if (progress.errors.length > 0) {
  // Display errors but allow viewing partial results
  <Alert severity="error">
    {progress.errors.length} error(s) occurred during analysis
  </Alert>
}
```

## Performance Optimizations

### 1. Sequential Processing
- Process nodes individually for accurate progress tracking
- Each node completes before the next begins
- Clear user feedback on which component is being analyzed

### 2. Efficient Context Building  
- DiagramIndexer caches component relationships
- Enhanced Cypher format reduces token usage
- Only relevant edge data included in node context

### 3. Selective Analysis
- Can analyze specific selected nodes only
- Automatic filtering of security zone containers
- Relationship analysis always included for comprehensive assessment

### 4. Memory Management
- Large responses processed incrementally
- Node and edge updates applied in batches
- Progress state reset on diagram changes

## Integration Points

### 1. Threat Analysis Logging (Pro Feature)
```javascript
// ThreatAnalysisLogger integration
if (threatAnalysisLogger.isEnabled()) {
  await threatAnalysisLogger.startAnalysis(nodeCount, edgeCount, settings);
  
  // Log individual node analyses
  await threatAnalysisLogger.logNodeAnalysis(node, threats, context);
  
  // Log completion with metrics
  await threatAnalysisLogger.completeAnalysis({
    totalThreats,
    totalVulnerabilities, 
    duration,
    nodesAnalyzed,
    edgesAnalyzed
  });
}
```

### 2. Diagram Persistence
- Threats saved in node/edge `securityContext`
- Analysis timestamps and metadata preserved
- Compatible with diagram export/import

### 3. Settings Integration
- Threat analysis logging configuration
- Token usage warnings and thresholds
- Provider-specific optimizations

## Debugging and Troubleshooting

### Debug Logging
```javascript
// SimplifiedThreatAnalyzer logging
logger.info(`[ThreatAnalyzer] Starting node-by-node analysis for ${diagram.nodes?.length || 0} nodes`);
logger.info(`[ThreatAnalyzer] Analyzing ${nodesToAnalyze.length} nodes individually`);
logger.info(`[ThreatAnalyzer] Completed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(nodesToAnalyze.length/batchSize)}`);

// Frontend logging  
console.info('[ThreatAnalysisPanel] Received AI analysis', {
  componentIds,
  threatCount: threats.length,
  hasSystemAnalysis: !!data.analysis?.systemAnalysis,
  componentCount: Object.keys(componentThreats).length
});
```

### Common Issues and Solutions

1. **Empty Threat Results**
   - Verify AI response contains structured JSON format
   - Check threat extraction patterns match AI output
   - Review individual node analysis prompts

2. **High Token Usage**
   - Enable cost estimation warnings
   - Use selective analysis for large diagrams
   - Progressive context summaries help manage token usage

3. **Analysis Timeouts**
   - Implement proper cancellation handling
   - Sequential processing prevents overwhelming local LLMs
   - Enable progress tracking for user feedback

4. **Inconsistent Results**
   - Verify node context building includes all edge data
   - Check security zone filtering consistency
   - Validate component code generation

5. **Multi-Pass Issues (v3.3)**
   - **Nodes not showing accumulated knowledge**: Check that `progressiveContext` is being passed correctly
   - **Results not appearing in UI immediately**: Verify `updateNodeInDiagram` is called after each analysis
   - **Attack paths missing**: Ensure system analysis receives all vulnerability data
   - **Local LLM struggles**: Reduce the summary detail in `formatPreviousFindings` for better cognitive load

6. **SSE Streaming Issues (v3.4)**
   - **Progress not updating**: Check SSE headers are set correctly, especially `Content-Encoding: none`
   - **Large results truncated**: Verify results are stored server-side and fetched via result endpoint
   - **Result not found**: Check retry logic in frontend and result TTL hasn't expired
   - **SSE connection drops**: Ensure keep-alive headers and socket settings are applied
   - **Progress jumping backwards**: Verify progress calculation logic increments properly

### Monitoring Points
- Individual node analysis success/failure rates
- Batch processing performance metrics  
- System analysis completion rates
- MITRE enrichment coverage
- Overall analysis duration and token usage

## Future Enhancements

1. **Advanced Analysis Features**
   - Dynamic analysis depth based on component criticality
   - Incremental analysis for diagram changes
   - Cross-diagram threat correlation

2. **Enhanced AI Capabilities**
   - Multi-model ensemble analysis
   - Specialized analysis prompts per component type
   - Automated threat hunting query generation

3. **Integration Improvements**
   - Real-time threat intelligence feeds
   - Automated compliance mapping
   - Integration with SIEM/SOAR platforms

4. **User Experience**
   - Analysis templates for common architectures
   - Threat trend analysis over time
   - Collaborative threat modeling features

## Threat Intelligence Import Integration

### Overview

The AI Threat Modeler supports manual threat intelligence import through the ThreatIntelPanel UI. This feature allows users to incorporate external threat data into their security analysis without requiring real-time API connections.

### Import Workflow

#### 1. Access Points
Users can access the threat intelligence import functionality through:
- **ThreatAnalysisPanel**: Click "Open Threat Intelligence Panel" button in the Intel tab
- **Direct Navigation**: Access ThreatIntelPanel when available in the interface

#### 2. Import Process
```typescript
// User workflow:
1. Opens ThreatIntelPanel from ThreatAnalysisPanel
2. Clicks "Import from File" button
3. Selects import mode via toggle:
   - Replace: Clears existing data before import
   - Append: Adds to existing threat intel
4. Selects file (.txt, .json, .csv)
5. Progress dialog shows:
   - Current stage (reading, processing, analyzing, completing)
   - Method used (AI-powered or pattern matching)
   - Progress bar with percentage
6. Data stored in AnalysisContext.importedThreatIntel
```

#### 3. Import Dialog Features
- **Progress Tracking**: Real-time updates during import
- **Method Indication**: Shows whether AI or fallback pattern matching is used
- **Auto-close**: Dialog closes automatically upon completion
- **Error Handling**: Displays errors if import fails

### Data Management

#### Import Modes
1. **Replace Mode**:
   - Clears all existing threat intelligence data
   - Imports new data as the sole source
   - Useful for switching between different threat datasets

2. **Append Mode**:
   - Preserves existing threat intelligence
   - Adds new data to current dataset
   - Useful for building comprehensive threat libraries

#### Data Structure
```typescript
// Stored in AnalysisContext
importedThreatIntel: {
  raw: string;              // Original imported text
  processed: {              // Extracted intelligence
    cves?: string;
    iocs?: string;
    campaigns?: string;
    // Additional fields from ThreatIntelExtractor
  };
  metadata: {
    totalImported: number;     // Total lines/entries imported
    relevantExtracted: number; // Relevant intel extracted
    importDate: string;        // ISO timestamp
    source: string;           // File name or source
  };
}
```

### Integration with Analysis

#### 1. Context Enrichment
When threat analysis is performed, the imported threat intelligence is included in the analysis context:

```typescript
const analysisContext: AnalysisContext = {
  diagram,
  messageHistory,
  customContext,
  importedThreatIntel, // Included automatically
  // ...
};
```

#### 2. AI Analysis Integration
The SimplifiedThreatAnalyzer can access imported threat intelligence through the additionalContext parameter:

```javascript
// In analyzeNode method
if (additionalContext.importedThreatIntel) {
  // Include threat intel in analysis prompt
  const threatIntelContext = formatThreatIntel(
    additionalContext.importedThreatIntel
  );
  prompt += `\n\nIMPORTED THREAT INTELLIGENCE:\n${threatIntelContext}`;
}
```

#### 3. Persistence
- Threat intelligence data persists with diagram saves
- Automatically restored when diagram is loaded
- Maintains association between diagrams and their threat context

### UI Components

#### ThreatIntelPanel Controls
```typescript
// Top control bar includes:
<Button component="label" htmlFor="threat-intel-file-input"
        variant="outlined" startIcon={<Upload />}>
  Import from File
</Button>

<Button onClick={handleClearIntel} variant="outlined"
        startIcon={<Trash2 />}>
  Clear All
</Button>

<Tooltip title={importMode === 'append'
  ? "New threat intelligence will be added to existing data"
  : "New threat intelligence will completely replace all existing data"}>
  <FormControlLabel
    control={<Switch checked={importMode === 'append'} />}
    label={importMode === 'append' ? 'Append to existing' : 'Replace existing'}
  />
</Tooltip>
```

#### Progress Dialog
```typescript
<Dialog open={importProgress.show}>
  <DialogTitle>
    Importing Threat Intelligence
    {importProgress.method && (
      <Chip label={importProgress.method === 'ai'
        ? 'AI-Powered Analysis'
        : 'Pattern Matching'} />
    )}
  </DialogTitle>
  <DialogContent>
    <Typography>{getStageMessage()}</Typography>
    <LinearProgress
      variant="determinate"
      value={importProgress.percentage}
    />
  </DialogContent>
</Dialog>
```

### Implementation Details

#### ThreatIntelExtractor Service
The ThreatIntelExtractor service handles the parsing and extraction of threat intelligence data:

1. **AI-Powered Extraction**: Uses configured AI provider to intelligently extract threat data
2. **Fallback Pattern Matching**: Uses regex patterns when AI is unavailable
3. **Format Support**: Handles various text formats including structured and unstructured data

#### State Management
Threat intelligence state is managed through the AnalysisContextProvider:

```typescript
const updateThreatIntel = (data: ThreatIntelData | null) => {
  dispatch({ type: 'UPDATE_THREAT_INTEL', payload: data });
};
```

### Best Practices

1. **File Formats**:
   - Use structured formats (JSON/CSV) for best results
   - Include CVE identifiers in standard format
   - Group related threats together

2. **Import Strategy**:
   - Use Replace mode when switching threat contexts
   - Use Append mode to build comprehensive threat libraries
   - Clear old data periodically to maintain relevance

3. **Analysis Integration**:
   - Import threat intel before running analysis
   - Update threat data when system architecture changes
   - Use specific threat intel for targeted analysis

### Future Enhancements

1. **Automated Import**: Schedule regular threat intel updates
2. **Source Integration**: Direct connection to threat feeds
3. **Filtering**: Import only relevant threats based on diagram
4. **Export Capability**: Share curated threat intelligence
## Threat Intel Context Integration (2025-09)

The analysis and chat paths now consume the user-imported Threat Intel context directly.

- Frontend (chat): AnalysisPanel appends an "=== IMPORTED THREAT INTELLIGENCE ===" section to `additionalContext` when intel is present.
- Backend formatters: Merge the client-provided `additionalContext` with server-generated context so the intel is preserved.
- Local LLM ordering: For local models (Ollama), the formatter defers TASK/ANSWER FORMAT until after all context (diagram + intel + other context) to improve utilization.
- SimplifiedThreatAnalyzer (API): Reads threat intel from one of:
  - `additionalContext.threatIntelText` (preformatted text)
  - `additionalContext.threatIntel` (structured object → formatted via `formatThreatIntelForAI`)
  - Extracted from the combined `additionalContext` (the "IMPORTED THREAT INTELLIGENCE" section)

This ensures the model sees both the diagram and the curated intel before instructions, improving relevance and adherence to imported CVEs/IOCs/actors.
