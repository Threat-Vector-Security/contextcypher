/**
 * SimplifiedThreatAnalyzer - Node-by-node threat analysis with system consolidation
 * Analyzes each node individually then consolidates for attack paths and recommendations
 * Updated: Added diagram context for local LLMs to fix gpt-oss integration
 */

const logger = require('../utils/logger-wrapper');
const DiagramIndexReader = require('./DiagramIndexReader');
const { formatPromptForProvider, generateEnhancedCypher } = require('../utils/formatters');
const { sanitizeText } = require('../utils/sanitization');
const MitreValidator = require('./MitreValidator');
const { getEndpointProfile } = require('../config/modelProfiles');
const { getProcessor } = require('../utils/modelResponseProcessors');
const LangExtractClient = require('./LangExtractClient');
const webSearchConfig = require('../config/webSearchConfig');
const { shouldSearchComponent, buildSearchQuery } = webSearchConfig;

// Helper to sanitise prompts when using public providers
function maybeSanitise(content, provider) {
  return provider === 'local' ? content : sanitizeText(content);
}

class SimplifiedThreatAnalyzer {
  constructor(aiProviderManager) {
    this.aiProviderManager = aiProviderManager;
    this.indexer = new DiagramIndexReader();
    this.langExtractClient = new LangExtractClient();
    
    // Configuration for retry logic
    this.retryConfig = {
      maxRetries: 2,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
      timeout: 180000 // 180 seconds (3 minutes) per component for complex analyses with web search
    };
  }
  
  /**
   * Generate AI response with retry logic and timeout
   */
  async generateWithRetry(messages, componentLabel = 'component', additionalOptions = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Calculate delay for this attempt (exponential backoff)
        const delay = attempt === 0 ? 0 : 
          Math.min(
            this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelayMs
          );
        
        if (delay > 0) {
          logger.info(`[ThreatAnalyzer] Retry attempt ${attempt} after ${delay}ms delay for ${componentLabel}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.retryConfig.timeout);
        
        try {
          // Make the request with timeout
          // Only pass maxTokens for local providers
          const options = {
            signal: controller.signal,
            temperature: this.aiProviderManager.localLLMConfig?.temperature,
            requireJsonFormat: true, // For threat analysis, we need JSON format
            isThreatAnalysis: true,  // Mark this as threat analysis for special handling
            ...additionalOptions      // Include web search options if provided
          };
          
          // Only include maxTokens for local providers
          const currentProvider = this.aiProviderManager.getCurrentProvider();
          if (currentProvider === 'local') {
            options.maxTokens = this.aiProviderManager.localLLMConfig?.maxTokens;
          }
          
          const response = await this.aiProviderManager.generateResponse(messages, options);
          
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          
          // Check if it was a timeout
          if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            throw new Error(`Analysis timeout after ${this.retryConfig.timeout / 1000} seconds`);
          }
          throw error;
        }
      } catch (error) {
        lastError = error;
        logger.error(`[ThreatAnalyzer] Attempt ${attempt + 1} failed for ${componentLabel}:`, error.message);
        
        // Don't retry on certain errors
        if (error.message?.includes('cancelled by user') || 
            error.message?.includes('No AI provider configured')) {
          throw error;
        }
      }
    }
    
    // All retries failed
    throw new Error(`Failed after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Process imported threat intelligence using LangExtract
   */
  async processImportedThreatIntel(importedIntel, diagram) {
    try {
      // Get current AI provider configuration
      const currentProvider = this.aiProviderManager.getCurrentProvider();
      const currentModel = this.aiProviderManager.getCurrentModel();
      const apiKey = this.aiProviderManager.apiKey;
      const baseURL = this.aiProviderManager.baseURL;
      
      // Create AI config for LangExtract
      const aiConfig = {
        provider: currentProvider,
        model: currentModel,
        apiKey: apiKey,
        baseURL: baseURL,
        temperature: this.aiProviderManager.localLLMConfig?.temperature || 0.7,
        maxTokens: this.aiProviderManager.localLLMConfig?.maxTokens || 4000
      };
      
      // Process with LangExtract
      const processed = await this.langExtractClient.processImportedIntel(
        importedIntel,
        diagram,
        aiConfig
      );
      
      logger.info('[ThreatAnalyzer] Processed imported threat intel with LangExtract:', {
        hasRecentCVEs: !!processed.recentCVEs,
        hasKnownIOCs: !!processed.knownIOCs,
        hasThreatActors: !!processed.threatActors,
        hasCampaignInfo: !!processed.campaignInfo,
        hasRelevanceScores: !!processed.relevanceScores
      });
      
      return processed;
    } catch (error) {
      logger.error('[ThreatAnalyzer] Failed to process imported threat intel:', error);
      // Return empty result on error
      return {
        recentCVEs: '',
        knownIOCs: '',
        threatActors: '',
        campaignInfo: '',
        attackPatterns: '',
        mitigations: '',
        intelligenceDate: new Date().toISOString()
      };
    }
  }

  /**
   * Main entry point - analyzes diagram using node-by-node approach
   * Returns data in the format expected by the existing UI
   */
  async analyzeThreatPaths(diagram, componentIds = [], analysisType = 'comprehensive', additionalContext = {}) {
    const analysisId = additionalContext.analysisId || `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    logger.info(`[ThreatAnalyzer] ========== STARTING ANALYSIS ${analysisId} ==========`);
    
    // Log current provider info
    const currentProvider = this.aiProviderManager.getCurrentProvider();
    const currentModel = this.aiProviderManager.getCurrentModel();
    logger.info(`[ThreatAnalyzer] Current AI Provider: ${currentProvider}, Model: ${currentModel}`);
    
    try {
      // Index the diagram for efficient querying
      this.indexer.indexDiagram(diagram);
      
      // Initialize MITRE validator
      const mitreValidator = await MitreValidator.getInstance();
      
      // Process imported threat intelligence if available
      if (additionalContext.importedThreatIntel?.raw) {
        logger.info('[ThreatAnalyzer] Processing imported threat intelligence with LangExtract');
        const processedIntel = await this.processImportedThreatIntel(
          additionalContext.importedThreatIntel.raw,
          diagram
        );
        
        // Merge processed intel into targetedAnalysis if in targeted mode
        if (additionalContext.targetedMode && additionalContext.targetedAnalysis) {
          additionalContext.targetedAnalysis.threatIntelligence = {
            ...additionalContext.targetedAnalysis.threatIntelligence,
            ...processedIntel,
            rawIntelligence: additionalContext.importedThreatIntel.raw
          };
        } else {
          // Add as custom context if not in targeted mode
          const intelContext = `
IMPORTED THREAT INTELLIGENCE:
${processedIntel.recentCVEs ? `Recent CVEs: ${processedIntel.recentCVEs}` : ''}
${processedIntel.knownIOCs ? `Known IOCs: ${processedIntel.knownIOCs}` : ''}
${processedIntel.threatActors ? `Threat Actors: ${processedIntel.threatActors}` : ''}
${processedIntel.campaignInfo ? `Campaign Info: ${processedIntel.campaignInfo}` : ''}
${processedIntel.attackPatterns ? `Attack Patterns: ${processedIntel.attackPatterns}` : ''}
`;
          additionalContext.customContext = additionalContext.customContext || {};
          additionalContext.customContext.content = (additionalContext.customContext.content || '') + '\n\n' + intelContext;
        }
      }
      
      logger.info(`[ThreatAnalyzer] ${analysisId}: Starting node-by-node analysis for ${diagram.nodes?.length || 0} nodes`);
      logger.info(`[ThreatAnalyzer] ${analysisId}: Custom context available: ${!!additionalContext.customContext}, length: ${additionalContext.customContext?.content?.length || 0}`);
      
      // Phase 1: Analyze each node individually
      const nodeAnalyses = await this.analyzeAllNodes(diagram, componentIds, additionalContext);
      
      // Phase 2: Consolidate and analyze system-level threats
      if (additionalContext.progressCallback) {
        additionalContext.progressCallback({
          phase: 'system_analysis',
          status: 'analyzing',
          message: 'Analyzing system-level threats and attack paths...'
        });
      }
      const systemAnalysis = await this.analyzeSystemLevel(nodeAnalyses, diagram, additionalContext);
      
      if (additionalContext.progressCallback) {
        additionalContext.progressCallback({
          phase: 'system_analysis',
          status: 'completed',
          message: 'System-level analysis completed',
          attackPathsFound: systemAnalysis.attackPaths?.length || 0
        });
      }
      
      // Phase 3: Enrich with MITRE data
      if (additionalContext.progressCallback) {
        additionalContext.progressCallback({
          phase: 'mitre_enrichment',
          status: 'analyzing',
          message: 'Enriching with MITRE ATT&CK framework data...'
        });
      }
      const enrichedAnalysis = await this.enrichWithMitreData(nodeAnalyses, systemAnalysis, mitreValidator);
      
      if (additionalContext.progressCallback) {
        additionalContext.progressCallback({
          phase: 'mitre_enrichment',
          status: 'completed',
          message: 'MITRE enrichment completed'
        });
      }
      
      // Phase 4: Format the response for the existing UI
      const formattedResponse = this.formatForUI(enrichedAnalysis, diagram, additionalContext);
      
      return formattedResponse;
    } catch (error) {
      logger.error('[ThreatAnalyzer] Analysis failed:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Analyze all nodes individually
   */
  async analyzeAllNodes(diagram, componentIds, additionalContext) {
    const analysisId = additionalContext.analysisId || 'unknown';
    const nodesToAnalyze = diagram.nodes.filter(node => {
      // Skip security zones and drawing nodes (but NOT DFD trust boundaries)
      if (node.type === 'securityZone' || 
          node.type === 'freehand' || 
          node.type === 'shape' || 
          node.type === 'textAnnotation') return false;
      // If specific components requested, filter to those
      if (componentIds.length > 0) return componentIds.includes(node.id);
      return true;
    });

    // In targeted mode, sort nodes to prioritize those matching focus areas
    if (additionalContext.targetedMode && additionalContext.targetedAnalysis?.focusAreas) {
      const focusAreas = additionalContext.targetedAnalysis.focusAreas.toLowerCase();
      nodesToAnalyze.sort((a, b) => {
        const aLabel = (a.data?.label || '').toLowerCase();
        const aType = (a.type || '').toLowerCase();
        const aDesc = (a.data?.description || '').toLowerCase();
        const aVendor = (a.data?.vendor || '').toLowerCase();
        const aProduct = (a.data?.product || '').toLowerCase();
        
        const bLabel = (b.data?.label || '').toLowerCase();
        const bType = (b.type || '').toLowerCase();
        const bDesc = (b.data?.description || '').toLowerCase();
        const bVendor = (b.data?.vendor || '').toLowerCase();
        const bProduct = (b.data?.product || '').toLowerCase();
        
        // Check if node A matches focus areas
        const aMatches = focusAreas.includes(aLabel) || 
                        focusAreas.includes(aType) ||
                        focusAreas.includes(aVendor) ||
                        focusAreas.includes(aProduct) ||
                        (aDesc && focusAreas.split(',').some(area => aDesc.includes(area.trim())));
        
        // Check if node B matches focus areas
        const bMatches = focusAreas.includes(bLabel) || 
                        focusAreas.includes(bType) ||
                        focusAreas.includes(bVendor) ||
                        focusAreas.includes(bProduct) ||
                        (bDesc && focusAreas.split(',').some(area => bDesc.includes(area.trim())));
        
        // Prioritize matching nodes
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
      
      logger.info(`[ThreatAnalyzer] ${analysisId}: Prioritized nodes based on focus areas: ${additionalContext.targetedAnalysis.focusAreas}`);
    }

    logger.info(`[ThreatAnalyzer] ${analysisId}: Analyzing ${nodesToAnalyze.length} nodes individually`);
    logger.info(`[ThreatAnalyzer] ${analysisId}: Component filter details:`, {
      componentIds,
      componentIdsLength: componentIds.length,
      allNodeIds: diagram.nodes.map(n => ({ id: n.id, label: n.data?.label, type: n.type })),
      filteredNodeIds: nodesToAnalyze.map(n => n.id),
      nodesToAnalyzeDetails: nodesToAnalyze.map(n => ({ id: n.id, label: n.data?.label, type: n.type }))
    });

    const nodeAnalyses = [];
    const analysisSession = additionalContext?.analysisSession;
    
    // Progressive threat tracking for multi-pass analysis
    const progressiveContext = {
      analyzedCount: 0,
      vulnerabilitiesFound: [],
      threatsIdentified: [],
      compromisedComponents: [],
      criticalFindings: []
    };

    // Analyze each node individually with progressive context
    for (let i = 0; i < nodesToAnalyze.length; i++) {
      const node = nodesToAnalyze[i];
      
      // Check for cancellation before analyzing each node
      if (analysisSession?.cancelled) {
        logger.info(`[ThreatAnalyzer] Analysis cancelled at node ${i + 1}/${nodesToAnalyze.length}`);
        throw new Error('Analysis cancelled by user');
      }
      
      try {
        logger.info(`[ThreatAnalyzer] Analyzing node ${i + 1}/${nodesToAnalyze.length}: ${node.data?.label || node.id} (ID: ${node.id})`);
        
        // Emit progress update before analyzing node
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
        
        // Build enhanced context with previous findings
        const enhancedContext = {
          ...additionalContext,
          progressiveFindings: progressiveContext,
          currentIndex: i,
          totalNodes: nodesToAnalyze.length
        };
        
        const result = await this.analyzeNode(node, diagram, enhancedContext);
        
        logger.info(`[ThreatAnalyzer] Analysis result for ${node.id}:`, {
          nodeId: result.nodeId,
          nodeLabel: result.nodeLabel,
          threatsCount: result.threats?.length || 0,
          vulnerabilitiesCount: result.vulnerabilities?.length || 0,
          hasError: !!result.error
        });
        
        // Update progressive context with findings
        progressiveContext.analyzedCount++;
        
        // Track vulnerabilities
        result.vulnerabilities?.forEach(vuln => {
          progressiveContext.vulnerabilitiesFound.push({
            component: node.data?.label || node.id,
            zone: node.data?.zone,
            vulnerability: vuln.description,
            severity: vuln.severity,
            cve: vuln.cve
          });
        });
        
        // Track threats
        result.threats?.forEach(threat => {
          progressiveContext.threatsIdentified.push({
            component: node.data?.label || node.id,
            zone: node.data?.zone,
            threat: threat.description,
            risk: threat.risk,
            mitreTechniques: threat.mitreTechniques || []
          });
          
          // Mark component as compromised if high risk
          if (threat.risk === 'High' || threat.risk === 'Extreme') {
            progressiveContext.compromisedComponents.push({
              id: node.id,
              label: node.data?.label || node.id,
              zone: node.data?.zone
            });
          }
        });
        
        // Track critical findings
        if (result.vulnerabilities?.some(v => v.severity === 'Critical') || 
            result.threats?.some(t => t.risk === 'Extreme')) {
          progressiveContext.criticalFindings.push({
            component: node.data?.label || node.id,
            zone: node.data?.zone,
            summary: `Critical issues found: ${result.vulnerabilities?.filter(v => v.severity === 'Critical').length || 0} vulnerabilities, ${result.threats?.filter(t => t.risk === 'Extreme').length || 0} extreme threats`
          });
        }
        
        nodeAnalyses.push(result);
        
        // CRITICAL: Update the diagram immediately with this node's analysis
        this.updateNodeInDiagram(diagram, node, result);
        
        // Emit progress update after node is analyzed
        if (additionalContext.progressCallback) {
          additionalContext.progressCallback({
            phase: 'node_analysis',
            current: i + 1,
            total: nodesToAnalyze.length,
            nodeId: node.id,
            nodeLabel: node.data?.label || node.id,
            status: 'completed',
            message: `Completed analysis of ${node.data?.label || node.id}`,
            threatsFound: result.threats?.length || 0,
            vulnerabilitiesFound: result.vulnerabilities?.length || 0
          });
        }
        
      } catch (nodeError) {
        // Re-throw cancellation errors
        if (nodeError.message === 'Analysis cancelled by user') {
          throw nodeError;
        }
        
        logger.error(`[ThreatAnalyzer] Failed to analyze node ${node.id}:`, nodeError);
        nodeAnalyses.push({
          nodeId: node.id,
          nodeLabel: node.data?.label || node.id,
          nodeType: node.type,
          nodeZone: node.data?.zone || 'Unknown',
          threats: [],
          vulnerabilities: [],
          error: nodeError.message
        });
      }
    }

    return nodeAnalyses;
  }
  
  /**
   * Helper method to update node in diagram with analysis results
   */
  updateNodeInDiagram(diagram, node, analysisResult) {
    const nodeToUpdate = diagram.nodes.find(n => n.id === node.id);
    if (nodeToUpdate) {
      const detailedAnalysis = this.formatNodeAnalysisText(analysisResult);
      
      nodeToUpdate.data = {
        ...nodeToUpdate.data,
        additionalContext: detailedAnalysis,
        securityContext: {
          threats: analysisResult.threats || [],
          vulnerabilities: analysisResult.vulnerabilities || [],
          recommendedControls: analysisResult.recommendedControls || []
        }
      };
      
      logger.info(`[ThreatAnalyzer] Updated node ${node.id} in diagram with analysis results`);
    }
  }

  /**
   * Analyze a single node for threats and vulnerabilities
   */
  async analyzeNode(node, diagram, additionalContext) {
    const nodeContext = this.buildNodeContext(node, diagram);
    const isDFDNode = node.type.startsWith('dfd');
    
    // Determine if web search should be enabled for this node
    const currentProvider = this.aiProviderManager.getCurrentProvider();
    const enableWebSearch = currentProvider === 'anthropic' && 
                           additionalContext.enableWebSearch !== false &&
                           shouldSearchComponent(node.data, node.data?.zone);
    
    // Build progressive findings summary if available
    let progressiveFindingsSection = '';
    if (additionalContext.progressiveFindings && additionalContext.progressiveFindings.analyzedCount > 0) {
      const findings = additionalContext.progressiveFindings;
      progressiveFindingsSection = `

ANALYSIS PROGRESS:
You are analyzing component ${additionalContext.currentIndex + 1} of ${additionalContext.totalNodes}.
${findings.analyzedCount} components have been analyzed so far.

${findings.vulnerabilitiesFound.length > 0 ? `VULNERABILITIES FOUND IN OTHER COMPONENTS:
${findings.vulnerabilitiesFound.slice(-5).map(v => 
  `- ${v.component} (${v.zone}): ${v.vulnerability} [${v.severity}]${v.cve !== 'N/A' ? ` - ${v.cve}` : ''}`
).join('\n')}` : ''}

${findings.threatsIdentified.length > 0 ? `
THREATS IDENTIFIED IN OTHER COMPONENTS:
${findings.threatsIdentified.slice(-5).map(t => 
  `- ${t.component} (${t.zone}): ${t.threat} [${t.risk}]`
).join('\n')}` : ''}

${findings.compromisedComponents.length > 0 ? `
HIGH-RISK COMPONENTS IDENTIFIED:
${findings.compromisedComponents.map(c => `- ${c.label} (${c.zone})`).join('\n')}` : ''}

IMPORTANT: Consider how vulnerabilities in other components might create attack chains with this component.`;
    }
    
    // Check if this component matches focus areas in targeted mode
    let focusAreaMatch = false;
    if (additionalContext.targetedMode && additionalContext.targetedAnalysis?.focusAreas) {
      const focusAreas = additionalContext.targetedAnalysis.focusAreas.toLowerCase();
      const nodeLabel = (node.data?.label || '').toLowerCase();
      const nodeType = (node.type || '').toLowerCase();
      const nodeDesc = (node.data?.description || '').toLowerCase();
      const nodeVendor = (node.data?.vendor || '').toLowerCase();
      const nodeProduct = (node.data?.product || '').toLowerCase();
      
      focusAreaMatch = focusAreas.includes(nodeLabel) || 
                      focusAreas.includes(nodeType) ||
                      focusAreas.includes(nodeVendor) ||
                      focusAreas.includes(nodeProduct) ||
                      (nodeDesc && focusAreas.split(',').some(area => nodeDesc.includes(area.trim())));
    }
    
    // Add DFD-specific context
    let dfdContext = '';
    if (node.type.startsWith('dfd')) {
      dfdContext = '\n\nDFD THREAT MODELING CONTEXT:\n';
      
      switch(node.type) {
        case 'dfdActor':
          dfdContext += `This is a DFD External Entity representing ${node.data?.actorType || 'an external system'}.
Trust Level: ${node.data?.trustLevel || 'untrusted'}
${node.data?.authentication ? `Authentication: ${node.data.authentication}` : ''}

For external entities, focus on:
- Spoofing threats (can the entity be impersonated?)
- Elevation of privilege (can it gain unauthorized access?)
- Input validation issues from this source`;
          break;
          
        case 'dfdProcess':
          dfdContext += `This is a DFD Process representing ${node.data?.processType || 'a processing element'}.

For processes, analyze all STRIDE categories:
- Spoofing: Authentication weaknesses
- Tampering: Input validation and integrity checks
- Repudiation: Logging and audit trails
- Information Disclosure: Data exposure risks
- Denial of Service: Resource exhaustion
- Elevation of Privilege: Authorization flaws`;
          break;
          
        case 'dfdDataStore':
          dfdContext += `This is a DFD Data Store of type: ${node.data?.storeType || 'database'}.
Encryption: ${node.data?.encryption || 'not specified'}
${node.data?.backupStrategy ? `Backup Strategy: ${node.data.backupStrategy}` : ''}

For data stores, focus on:
- Tampering: Data integrity and unauthorized modification
- Information Disclosure: Encryption at rest and access controls
- Denial of Service: Availability and backup/recovery
- Repudiation: Audit logging of data access`;
          break;
          
        case 'dfdTrustBoundary':
          dfdContext += `This is a DFD Trust Boundary of type: ${node.data?.boundaryType || 'network'}.
${node.data?.fromZone && node.data?.toZone ? `Boundary between: ${node.data.fromZone} → ${node.data.toZone}` : ''}
${node.data?.controlsAtBoundary ? `Controls at boundary: ${node.data.controlsAtBoundary.join(', ')}` : ''}

For trust boundaries, analyze:
- All data crossing this boundary
- Authentication/authorization requirements
- Input validation and sanitization
- Protocol security and encryption needs`;
          break;
      }
    }
    
    // Add DFD categorization context for non-DFD nodes
    if (!isDFDNode && node.data?.dfdCategory) {
      dfdContext += `\n\nThis component has been categorized for DFD threat modeling as: ${node.data.dfdCategory}`;
      if (node.data?.dfdType) {
        dfdContext += ` (${node.data.dfdType})`;
      }
      
      switch (node.data.dfdCategory) {
        case 'actor':
          dfdContext += `\nAs an actor/external entity, analyze for:
- Authentication bypass and spoofing risks
- Input validation from this untrusted source
- Potential for privilege escalation`;
          break;
        case 'process':
          dfdContext += `\nAs a process, analyze all STRIDE categories:
- Authentication and authorization controls
- Input validation and data integrity
- Logging and non-repudiation
- Information disclosure vulnerabilities`;
          break;
        case 'dataStore':
          dfdContext += `\nAs a data store, focus on:
- Data encryption at rest and in transit
- Access control and authentication
- Backup and recovery capabilities
- Audit logging and monitoring`;
          break;
        case 'trustBoundary':
          dfdContext += `\nAs a trust boundary, examine:
- All data flows crossing this boundary
- Authentication and authorization requirements
- Protocol security and encryption`;
          break;
      }
    }
    
    const prompt = `Analyze this specific component for security threats and vulnerabilities.
${focusAreaMatch ? '\n⚠️ PRIORITY COMPONENT: This component matches the threat actor focus areas! Analyze it THOROUGHLY! ⚠️\n' : ''}
COMPONENT DETAILS:
- Index Code: ${node.data?.indexCode || 'N/A'}
- Label: ${node.data?.label || node.id}
- Type: ${node.type}
- Zone: ${node.data?.zone || 'Unknown'}
- Security Level: ${node.data?.securityLevel || 'Standard'}
- Data Classification: ${node.data?.dataClassification || 'Internal'}
${node.data?.description ? `- Description: ${node.data.description}` : ''}
${node.data?.vendor ? `- Vendor: ${node.data.vendor}` : ''}
${node.data?.product ? `- Product: ${node.data.product}` : ''}
${node.data?.version ? `- Version: ${node.data.version}` : ''}
${node.data?.technology ? `- Technology: ${node.data.technology}` : ''}
${node.data?.patchLevel ? `- Patch Level: ${node.data.patchLevel}` : ''}
${node.data?.protocols ? `- Protocols: ${node.data.protocols.join(', ')}` : ''}
${node.data?.portRange ? `- Ports: ${node.data.portRange}` : ''}${node.data?.dfdCategory ? `
- DFD Category: ${node.data.dfdCategory}` : ''}${node.data?.dfdType ? `
- DFD Type: ${node.data.dfdType}` : ''}${node.data?.actorType ? `
- Actor Type: ${node.data.actorType}` : ''}${node.data?.processType ? `
- Process Type: ${node.data.processType}` : ''}${node.data?.storeType ? `
- Storage Type: ${node.data.storeType}` : ''}${node.data?.boundaryType ? `
- Boundary Type: ${node.data.boundaryType}` : ''}${node.data?.trustLevel ? `
- Trust Level: ${node.data.trustLevel}` : ''}${node.data?.authentication ? `
- Authentication: ${node.data.authentication}` : ''}${node.data?.encryption ? `
- Encryption: ${node.data.encryption}` : ''}${node.data?.backupStrategy ? `
- Backup Strategy: ${node.data.backupStrategy}` : ''}${node.data?.fromZone ? `
- From Zone: ${node.data.fromZone}` : ''}${node.data?.toZone ? `
- To Zone: ${node.data.toZone}` : ''}${node.data?.controlsAtBoundary && Array.isArray(node.data.controlsAtBoundary) ? `
- Controls at Boundary: ${node.data.controlsAtBoundary.join(', ')}` : ''}

${/* Include any additional node data fields not explicitly listed above */
  Object.keys(node.data || {})
    .filter(key => {
      const skipFields = ['label', 'indexCode', 'zone', 'securityLevel', 'dataClassification', 
                         'description', 'vendor', 'product', 'version', 'technology', 'patchLevel', 
                         'protocols', 'portRange', 'dfdCategory', 'dfdType', 'actorType', 
                         'processType', 'storeType', 'boundaryType', 'trustLevel', 'authentication', 
                         'encryption', 'backupStrategy', 'fromZone', 'toZone', 'controlsAtBoundary',
                         'securityControls', 'components', 'icon', 'shape'];
      return !skipFields.includes(key) && node.data[key] !== undefined && node.data[key] !== null && node.data[key] !== '';
    })
    .map(key => {
      const value = Array.isArray(node.data[key]) ? node.data[key].join(', ') : node.data[key];
      const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim();
      return `- ${displayKey}: ${value}`;
    })
    .join('\n')
}${dfdContext}

SECURITY CONTROLS:
${node.data?.securityControls ? node.data.securityControls.join(', ') : 'None specified'}

${node.data?.components ? `INSTALLED COMPONENTS:
${node.data.components.map(c => `- ${c.name} ${c.version}`).join('\n')}` : ''}

INCOMING CONNECTIONS:
${nodeContext.incomingConnections.length > 0 ? nodeContext.incomingConnections.map(c => {
  const fields = [];
  fields.push(`From: ${c.sourceLabel} (${c.sourceZone || 'Unknown Zone'})`);
  
  // Add all edge data fields dynamically
  const skipFields = ['edgeId', 'edgeCode', 'sourceId', 'sourceLabel', 'sourceType', 'sourceZone', 'targetId', 'targetLabel', 'targetType', 'targetZone'];
  Object.keys(c).forEach(key => {
    if (!skipFields.includes(key) && c[key] !== undefined && c[key] !== null && c[key] !== '') {
      const value = Array.isArray(c[key]) ? c[key].join(', ') : c[key];
      // Capitalize the key for display
      const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim();
      fields.push(`${displayKey}: ${value}`);
    }
  });
  
  fields.push(`[${c.edgeCode}]`);
  return `- ${fields.join(' | ')}`;
}).join('\n') : 'None'}

OUTGOING CONNECTIONS:
${nodeContext.outgoingConnections.length > 0 ? nodeContext.outgoingConnections.map(c => {
  const fields = [];
  fields.push(`To: ${c.targetLabel} (${c.targetZone || 'Unknown Zone'})`);
  
  // Add all edge data fields dynamically
  const skipFields = ['edgeId', 'edgeCode', 'sourceId', 'sourceLabel', 'sourceType', 'sourceZone', 'targetId', 'targetLabel', 'targetType', 'targetZone'];
  Object.keys(c).forEach(key => {
    if (!skipFields.includes(key) && c[key] !== undefined && c[key] !== null && c[key] !== '') {
      const value = Array.isArray(c[key]) ? c[key].join(', ') : c[key];
      // Capitalize the key for display
      const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim();
      fields.push(`${displayKey}: ${value}`);
    }
  });
  
  fields.push(`[${c.edgeCode}]`);
  return `- ${fields.join(' | ')}`;
}).join('\n') : 'None'}
${progressiveFindingsSection}

${additionalContext.customContext ? `ADDITIONAL CONTEXT:
${additionalContext.customContext.content}` : ''}

${additionalContext.targetedMode && additionalContext.targetedAnalysis ? `
========== TARGETED THREAT ANALYSIS MODE ==========
This is a TARGETED analysis focusing on specific threat actors and scenarios.

THREAT ACTORS:
${additionalContext.targetedAnalysis.threatActors}

KNOWN TTPs (Tactics, Techniques, and Procedures):
${additionalContext.targetedAnalysis.ttps}

KNOWN VULNERABILITIES TO CHECK:
${additionalContext.targetedAnalysis.vulnerabilities}

FOCUS AREAS:
${additionalContext.targetedAnalysis.focusAreas}

${additionalContext.targetedAnalysis.scenarioDescription ? `SCENARIO DESCRIPTION:
${additionalContext.targetedAnalysis.scenarioDescription}` : ''}

${additionalContext.targetedAnalysis.threatIntelligence ? `
THREAT INTELLIGENCE:
${additionalContext.targetedAnalysis.threatIntelligence.rawIntelligence ? `
Recent Intelligence Reports:
${additionalContext.targetedAnalysis.threatIntelligence.rawIntelligence}` : ''}
${additionalContext.targetedAnalysis.threatIntelligence.recentCVEs ? `
Recent CVEs to Consider:
${additionalContext.targetedAnalysis.threatIntelligence.recentCVEs}` : ''}
${additionalContext.targetedAnalysis.threatIntelligence.knownIOCs ? `
Known IOCs (Indicators of Compromise):
${additionalContext.targetedAnalysis.threatIntelligence.knownIOCs}` : ''}
${additionalContext.targetedAnalysis.threatIntelligence.campaignInfo ? `
Active Campaign Information:
${additionalContext.targetedAnalysis.threatIntelligence.campaignInfo}` : ''}
${additionalContext.targetedAnalysis.threatIntelligence.intelligenceDate ? `
Intelligence Date: ${additionalContext.targetedAnalysis.threatIntelligence.intelligenceDate}` : ''}` : ''}

IMPORTANT: Focus your analysis on how the specified threat actors could exploit this component using their known TTPs and the vulnerabilities mentioned. Consider how this component relates to the focus areas. If threat intelligence is provided, prioritize checking for the specific CVEs, IOCs, and campaign-related indicators mentioned.

TARGETED ANALYSIS REQUIREMENTS:
1. **Check EVERY component property against the "KNOWN VULNERABILITIES TO CHECK" list above**
2. **Evaluate if this component matches any "FOCUS AREAS" - if yes, analyze it MORE thoroughly**
3. **Apply the threat actor's TTPs to identify exploitation methods they would use**
4. **Even if no traditional CVEs exist, identify configuration weaknesses the threat actor would exploit**

For example, if analyzing against Scattered Spider:
- Check for phone-based MFA, SMS codes, or voice authentication (they exploit these)
- Look for help desk access to reset credentials (their primary attack vector)
- Identify any BYOD policies or personal device usage
- Check for shared accounts or long rotation periods
- Look for social engineering vulnerabilities in processes

REMEMBER: Threat actors exploit configuration weaknesses and process vulnerabilities, not just CVEs!
===================================================
` : ''}

ANALYSIS APPROACH - FOLLOW THIS EXACT ORDER:

1. **First, identify VULNERABILITIES** (technical weaknesses):
   - Known CVEs affecting the specific versions listed
   - Misconfigurations explicitly stated in the data
   - Missing critical security controls for this component type
   - Weak or default configurations mentioned
   ${additionalContext.targetedMode ? `- **TARGETED CHECK**: Specifically look for the vulnerabilities listed in "KNOWN VULNERABILITIES TO CHECK"
   - **TARGETED CHECK**: Identify ANY weakness that matches the threat actor's known exploitation methods` : ''}

2. **Then, determine what THREATS these vulnerabilities enable**:
   - For each vulnerability, describe how it could be exploited
   - Consider the component's connections and zone placement
   - Think about attack chains with previously identified vulnerabilities
   - Assign likelihood based on ease of exploitation
   - Assign impact based on what could be compromised
   ${additionalContext.targetedMode ? `- **TARGETED CHECK**: Apply the threat actor's specific TTPs to this component
   - **TARGETED CHECK**: Consider how this component fits into the threat actor's known attack patterns` : ''}

3. **Map each threat to MITRE ATT&CK techniques**:
   - Use appropriate technique IDs (T####)
   - Focus on techniques that match the specific threat
   ${additionalContext.targetedMode ? `- **TARGETED CHECK**: Prioritize using the TTPs listed in "KNOWN TTPs" section above
   - **TARGETED CHECK**: Map to the threat actor's documented techniques when applicable` : ''}

4. **Finally, suggest CONTROLS to mitigate the vulnerabilities**:
   - Specific patches or updates for CVEs
   - Configuration changes to fix misconfigurations
   - Additional security controls to add defense-in-depth

CRITICAL REQUIREMENTS:
- A vulnerability is a WEAKNESS (e.g., "outdated Apache version with CVE-2021-44228")
- A threat is HOW that weakness could be EXPLOITED (e.g., "Remote code execution via Log4j vulnerability")
- Only report CVEs that actually exist and affect the exact versions specified
- If a component appears well-secured, it's OK to return empty arrays

THREAT CLASSIFICATION:
- HIGH Risk: Easily exploitable vulnerabilities with severe impact
- MEDIUM Risk: Moderate vulnerabilities or those requiring some effort to exploit
- LOW Risk: Minor issues or those requiring significant effort to exploit

YOUR FOCUSED TASK:
Analyze ONLY ${node.data?.label || node.id} for vulnerabilities, then determine what threats they enable.
Do NOT analyze the entire system - focus only on this component.

Return ONLY valid JSON in this format:
{
  "vulnerabilities": [
    {
      "description": "Specific vulnerability description",
      "cve": "CVE-YYYY-NNNNN if applicable, otherwise N/A",
      "cvss": 0.0,
      "severity": "Critical|High|Medium|Low"
    }
  ],
  "threats": [
    {
      "description": "How the vulnerability could be exploited",
      "likelihood": "Almost Certain|Likely|Possible|Unlikely|Very Unlikely|Rare",
      "impact": "Catastrophic|Severe|Major|Moderate|Minor|Negligible", 
      "risk": "Extreme|High|Medium|Minor|Sustainable",
      "mitreTechniques": ["T1190", "T1078"],
      "basedOnVulnerability": "Reference which vulnerability enables this threat"
    }
  ],
  "recommendedControls": [
    {
      "control": "Specific security control name",
      "description": "Why this control would prevent/mitigate the vulnerability",
      "priority": "High|Medium|Low",
      "mitigates": "Reference which vulnerability this control addresses"
    }
  ]
}`;

    try {
      const provider = this.aiProviderManager.getCurrentProvider();
      const currentModel = this.aiProviderManager.getCurrentModel();
      
      // Get model-specific profile for threat analysis
      const modelProfile = getEndpointProfile(currentModel, 'threatAnalysis');
      const isFoundationSec = currentModel && currentModel.includes('foundation-sec'); // Keep for backward compatibility
      
      // Check if it's a local provider - ONLY check provider type, not model name for public providers
      const isLocalProvider = provider === 'local';
      
      // Enhanced logging for debugging
      logger.info(`[ThreatAnalyzer] Provider detection:`, {
        provider,
        currentModel,
        isLocalProvider,
        hasModelProfile: !!modelProfile,
        responseProcessor: modelProfile?.responseProcessor
      });
      
      // Enhanced system prompt with strict JSON formatting
      let systemPrompt = 'You are a pragmatic cybersecurity expert. CRITICAL REQUIREMENTS:\n\n1. **CVEs must be real and verified** - Only report CVEs that:\n   - Actually exist in the NVD database\n   - Are confirmed to affect the EXACT version specified\n   - Have been publicly disclosed\n   - Never invent or guess CVE numbers\n\n2. **Focus on observable issues** - Only report:\n   - Explicitly stated misconfigurations in the data\n   - Actually missing critical security features (not just undocumented)\n   - Specific version vulnerabilities that can be verified\n   - Clear design flaws visible in the architecture\n\n3. **Avoid speculation** - Do NOT report:\n   - "Potential" issues without evidence\n   - Hypothetical scenarios ("if X then Y could happen")\n   - Generic risks that apply to any system\n   - Issues based on missing documentation alone\n   - Dependency vulnerabilities without specific confirmed CVEs\n   - Theoretical attack paths that require unproven vulnerabilities\n\nIf a component appears well-secured based on the data, return empty arrays - do NOT create fake observations.\n\nIMPORTANT OUTPUT REQUIREMENTS:\n1. Return ONLY valid JSON without any markdown formatting\n2. Do NOT include any explanatory text before or after the JSON\n3. Do NOT include your thinking process or reasoning\n4. Start your response with { and end with }\n5. Ensure the JSON is valid and properly formatted';
      
      // Simplify system prompt for local LLMs
      if (isLocalProvider) {
        systemPrompt = 'You are a cybersecurity expert analyzing system components for threats.\n\nRULES:\n1. Only report real CVEs that affect the exact versions specified\n2. Only report actual misconfigurations or missing security features\n3. Do not speculate or report hypothetical issues\n4. If no issues found, return empty arrays\n\nOUTPUT: Return ONLY a JSON object. No explanations. No markdown. Start with { and end with }';
      }
      
      // Apply model-specific system prompt additions
      if (modelProfile && modelProfile.systemPromptAdditions) {
        systemPrompt += modelProfile.systemPromptAdditions;
      }
      
      // Add web search guidance if enabled
      if (enableWebSearch) {
        const searchQuery = buildSearchQuery(node.data, 'vulnerability');
        systemPrompt += `\n\nWEB SEARCH ENABLED: You can search for current threat intelligence about this component.
        
SEARCH GUIDANCE:
- Search for "${searchQuery}" to find recent vulnerabilities
- Look for CVEs specific to ${node.data?.vendor || 'the vendor'} ${node.data?.product || 'product'} ${node.data?.version || ''}
- Check for zero-day vulnerabilities or recent exploits
- Verify CVE numbers against official databases
- Include source citations for any findings

IMPORTANT: All web search findings must include the source URL for verification.`;
      }
      
      // Add JSON example if required by the model profile
      if (modelProfile && modelProfile.requiresJsonExample && modelProfile.jsonExample) {
        systemPrompt += `\n\nIMPORTANT for JSON formatting: You MUST return a JSON object with this EXACT structure:\n${JSON.stringify(modelProfile.jsonExample, null, 2)}\n\nThe response must be ONLY the JSON object - no text before or after. Each array can be empty [] if no items exist. Ensure all JSON keys are exactly as shown: "threats", "vulnerabilities", "recommendedControls".\n\nGUIDANCE ON CATEGORIZATION:\n- "threats": Active security risks that can be exploited (e.g., default passwords, misconfigurations, exposed services)\n- "vulnerabilities": Known CVEs and software flaws\n- Put exploitable issues in BOTH threats and vulnerabilities when appropriate`;
      } else if (isLocalProvider) {
        // Simplified JSON example for local LLMs
        const simpleExample = {
          threats: [{
            description: "Example threat description",
            likelihood: "High",
            impact: "Major",
            risk: "High",
            mitreTechniques: ["T1078"]
          }],
          vulnerabilities: [{
            description: "Example vulnerability",
            cve: "CVE-2021-12345",
            cvss: 7.5,
            severity: "High"
          }],
          recommendedControls: [{
            control: "Example control",
            description: "How it helps",
            priority: "High"
          }]
        };
        systemPrompt += `\n\nJSON FORMAT:\n${JSON.stringify(simpleExample, null, 2)}\n\nReturn ONLY JSON like above. Empty arrays [] if no issues found.`;
      }
      
      // For local LLMs, we need to include the diagram context in the system message
      let messages;
      if (isLocalProvider) {
        // Get the full Cypher diagram representation
        const cypherDiagram = generateEnhancedCypher(diagram);
        
        // Model-specific handling is now done through profiles above
        
        // For local LLMs, include the diagram context in the system message
        messages = [
          { 
            role: 'system', 
            content: systemPrompt + '\n\n=== VISUAL DIAGRAM STRUCTURE ===\n' + cypherDiagram + '\n=== END DIAGRAM ==='
          },
          { role: 'user', content: maybeSanitise(prompt, provider) }
        ];
        
        logger.info('[ThreatAnalyzer] Using local LLM - added diagram context to system message');
      } else {
        // For cloud providers, use the standard format
        messages = [
          { 
            role: 'system', 
            content: systemPrompt
          },
          { role: 'user', content: maybeSanitise(prompt, provider) }
        ];
      }
      
      // Pass web search configuration if enabled
      const generateOptions = {
        enableWebSearch: enableWebSearch,
        maxSearches: 3  // Limit searches per component
      };

      logger.info(`[ThreatAnalyzer] Starting AI analysis for node ${node.id}`, {
        provider: provider,
        model: currentModel,
        enableWebSearch: enableWebSearch,
        nodeLabel: node.data?.label || node.id
      });

      let response;
      try {
        response = await this.generateWithRetry(messages, node.data?.label || node.id, generateOptions);
      } catch (error) {
        logger.error(`[ThreatAnalyzer] AI analysis failed for node ${node.id}:`, {
          error: error.message,
          provider: provider,
          model: currentModel,
          nodeLabel: node.data?.label || node.id,
          stack: error.stack
        });
        throw error;
      }

      // Log raw response for debugging
      logger.info(`[ThreatAnalyzer] Raw AI response for ${node.id}:`, {
        responseType: typeof response,
        responseLength: JSON.stringify(response).length,
        responsePreview: JSON.stringify(response).substring(0, 500)
      });
      
      // Extract content string from response (handles different provider formats)
      let content;
      if (typeof response === 'string') {
        content = response;
      } else if (response?.content) {
        // Handle standardized response format from aiProviders.js
        content = response.content;
      } else if (response?.choices?.[0]?.message?.content) {
        // Fallback for direct OpenAI format
        content = response.choices[0].message.content;
      } else {
        content = JSON.stringify(response);
      }
      
      // Parse JSON response
      let analysis;
      try {
        // Remove any markdown formatting if present
        let jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Apply model-specific response processor if available
        const modelProfile = getEndpointProfile(currentModel, 'threatAnalysis');
        if (modelProfile && modelProfile.responseProcessor) {
          const processor = getProcessor(modelProfile.responseProcessor);
          if (processor) {
            logger.info(`[ThreatAnalyzer] Applying response processor for model: ${currentModel}`);
            jsonStr = processor(jsonStr);
          }
        }
        
        analysis = JSON.parse(jsonStr);
        
        // Log parsed analysis for debugging Foundation-Sec issues
        if (isFoundationSec) {
          logger.info(`[ThreatAnalyzer] Foundation-Sec parsed analysis:`, {
            nodeId: node.id,
            hasThreats: Array.isArray(analysis.threats),
            threatsCount: analysis.threats?.length || 0,
            hasVulnerabilities: Array.isArray(analysis.vulnerabilities),
            vulnerabilitiesCount: analysis.vulnerabilities?.length || 0,
            sampleThreat: analysis.threats?.[0] || 'none',
            sampleVuln: analysis.vulnerabilities?.[0] || 'none'
          });
        }
      } catch (parseError) {
        logger.error(`[ThreatAnalyzer] Failed to parse JSON for node ${node.id}:`, parseError);
        logger.error(`[ThreatAnalyzer] Raw response: ${content}`);
        
        // Enhanced logging for debugging
        const debugInfo = {
          model: currentModel,
          provider: provider,
          isLocalProvider,
          contentLength: content?.length,
          contentPreview: content?.substring(0, 500),
          contentType: typeof content,
          startsWithBrace: content?.trim().startsWith('{'),
          endsWithBrace: content?.trim().endsWith('}'),
          hasNewlines: content?.includes('\n'),
          containsThinking: content?.toLowerCase().includes('thinking') || content?.toLowerCase().includes('let me'),
          hasCodeBlock: content?.includes('```'),
          firstBraceIndex: content?.indexOf('{'),
          lastBraceIndex: content?.lastIndexOf('}')
        };
        
        logger.error('[ThreatAnalyzer] JSON parse error details:', debugInfo);
        
        // Try to extract JSON from response
        if (isLocalProvider) {
          logger.info('[ThreatAnalyzer] Attempting to extract JSON from local LLM response');
          try {
            // Remove any markdown code blocks
            let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            
            // Find JSON boundaries
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
              analysis = JSON.parse(jsonStr);
              logger.info('[ThreatAnalyzer] Successfully extracted JSON from local LLM response');
            }
          } catch (extractError) {
            logger.error('[ThreatAnalyzer] Failed to extract JSON from local LLM response:', extractError.message);
          }
        }
        
        // Fallback structure only if analysis is still null
        if (!analysis) {
          logger.warn('[ThreatAnalyzer] Using fallback empty structure for analysis');
          analysis = {
            threats: [],
            vulnerabilities: [],
            recommendedControls: []
          };
        }
      }

      // Validate and clean the analysis object
      if (!analysis || typeof analysis !== 'object') {
        analysis = { threats: [], vulnerabilities: [], recommendedControls: [] };
      }
      
      // Ensure arrays exist and filter out invalid entries
      analysis.threats = Array.isArray(analysis.threats) ? 
        analysis.threats.filter(t => t && typeof t.description === 'string') : [];
      analysis.vulnerabilities = Array.isArray(analysis.vulnerabilities) ? 
        analysis.vulnerabilities.filter(v => v && typeof v.description === 'string') : [];
      analysis.recommendedControls = Array.isArray(analysis.recommendedControls) ? 
        analysis.recommendedControls.filter(c => c && typeof c.control === 'string') : [];

      // Post-process vulnerabilities if configured in model profile
      const nodeModelProfile = getEndpointProfile(currentModel, 'threatAnalysis');
      if (nodeModelProfile && nodeModelProfile.postProcessVulnerabilities && analysis.vulnerabilities && analysis.vulnerabilities.length > 0) {
        logger.info(`[ThreatAnalyzer] Foundation-Sec post-processing for node ${node.id}`);
        
        // Check if threats array is empty but vulnerabilities exist
        if (!analysis.threats || analysis.threats.length === 0) {
          analysis.threats = [];
          
          // Convert high-severity vulnerabilities to threats
          analysis.vulnerabilities.forEach(vuln => {
            if (vuln && vuln.description && (vuln.severity === 'Critical' || vuln.severity === 'High' || vuln.cvss >= 7.0)) {
              const threat = {
                description: vuln.description,
                likelihood: vuln.cvss >= 9.0 ? 'Likely' : 'Possible',
                impact: vuln.severity === 'Critical' ? 'Severe' : 'Major',
                risk: vuln.severity === 'Critical' ? 'High' : 'Medium',
                mitreTechniques: ['T1190'] // Default to exploit public-facing application
              };
              analysis.threats.push(threat);
              logger.info(`[ThreatAnalyzer] Converted vulnerability to threat: ${vuln.description}`);
            }
          });
        }
        
        // Also check for explicit vulnerability indicators in the description
        const description = node.data?.description?.toLowerCase() || '';
        const hasDefaultPassword = description.includes('default') && (description.includes('password') || description.includes('credential'));
        const hasRemoteDebug = description.includes('remote debugging') || description.includes('debug port');
        const hasHardcodedCreds = description.includes('hard-coded') || description.includes('hardcoded');
        
        if (hasDefaultPassword || hasRemoteDebug || hasHardcodedCreds) {
          const configThreat = {
            description: hasDefaultPassword ? 'Default credentials configured' : 
                        hasRemoteDebug ? 'Remote debugging enabled' : 
                        'Hardcoded credentials present',
            likelihood: 'Likely',
            impact: 'Major',
            risk: 'High',
            mitreTechniques: hasDefaultPassword ? ['T1078'] : ['T1505'] // Valid accounts or Server Software Component
          };
          
          // Check if this threat already exists
          const exists = analysis.threats.some(t => 
            t && t.description && (
              t.description.toLowerCase().includes('default') || 
              t.description.toLowerCase().includes('debug') ||
              t.description.toLowerCase().includes('hardcoded')
            )
          );
          
          if (!exists) {
            analysis.threats.push(configThreat);
            logger.info(`[ThreatAnalyzer] Added configuration-based threat: ${configThreat.description}`);
          }
        }
      }
      
      return {
        nodeId: node.id,
        nodeLabel: node.data?.label || node.id,
        nodeType: node.type,
        nodeZone: node.data?.zone || 'Unknown',
        indexCode: node.data?.indexCode || 'N/A',
        threats: analysis.threats || [],
        vulnerabilities: analysis.vulnerabilities || [],
        recommendedControls: analysis.recommendedControls || []
      };
    } catch (error) {
      logger.error(`[ThreatAnalyzer] Failed to analyze node ${node.id}:`, error);
      return {
        nodeId: node.id,
        nodeLabel: node.data?.label || node.id,
        nodeType: node.type,
        nodeZone: node.data?.zone || 'Unknown',
        indexCode: node.data?.indexCode || 'N/A',
        threats: [],
        vulnerabilities: [],
        recommendedControls: [],
        error: error.message
      };
    }
  }

  /**
   * Build context for a specific node including all edge data
   */
  buildNodeContext(node, diagram) {
    const incomingConnections = [];
    const outgoingConnections = [];

    diagram.edges?.forEach(edge => {
      if (edge.target === node.id) {
        const sourceNode = diagram.nodes.find(n => n.id === edge.source);
        if (sourceNode && sourceNode.type !== 'securityZone' && 
            sourceNode.type !== 'freehand' && 
            sourceNode.type !== 'shape' && 
            sourceNode.type !== 'textAnnotation') {
          incomingConnections.push({
            edgeId: edge.id,
            edgeCode: this.indexer.getEdgeCode(edge.id) || edge.id,
            sourceId: edge.source,
            sourceLabel: sourceNode.data?.label || sourceNode.id,
            sourceType: sourceNode.type,
            sourceZone: sourceNode.data?.zone,
            // Include ALL edge data fields without assumptions
            ...edge.data
          });
        }
      } else if (edge.source === node.id) {
        const targetNode = diagram.nodes.find(n => n.id === edge.target);
        if (targetNode && targetNode.type !== 'securityZone' && 
            targetNode.type !== 'freehand' && 
            targetNode.type !== 'shape' && 
            targetNode.type !== 'textAnnotation') {
          outgoingConnections.push({
            edgeId: edge.id,
            edgeCode: this.indexer.getEdgeCode(edge.id) || edge.id,
            targetId: edge.target,
            targetLabel: targetNode.data?.label || targetNode.id,
            targetType: targetNode.type,
            targetZone: targetNode.data?.zone,
            // Include ALL edge data fields without assumptions
            ...edge.data
          });
        }
      }
    });

    return {
      incomingConnections,
      outgoingConnections
    };
  }

  /**
   * Phase 2: Analyze system-level threats, attack paths, and recommendations
   */
  async analyzeSystemLevel(nodeAnalyses, diagram, additionalContext) {
    // Prepare comprehensive summaries
    const allVulnerabilities = [];
    const allThreats = [];
    const componentSummary = [];
    
    nodeAnalyses.forEach(analysis => {
      // Track vulnerabilities
      analysis.vulnerabilities?.forEach(vuln => {
        allVulnerabilities.push({
          component: analysis.nodeLabel,
          componentId: analysis.nodeId,
          zone: analysis.nodeZone,
          indexCode: analysis.indexCode,
          ...vuln
        });
      });
      
      // Track threats
      analysis.threats?.forEach(threat => {
        allThreats.push({
          component: analysis.nodeLabel,
          componentId: analysis.nodeId,
          zone: analysis.nodeZone,
          indexCode: analysis.indexCode,
          ...threat
        });
      });
      
      // Build component summary
      if (analysis.vulnerabilities?.length > 0 || analysis.threats?.length > 0) {
        componentSummary.push({
          component: analysis.nodeLabel,
          zone: analysis.nodeZone,
          vulnerabilities: analysis.vulnerabilities?.length || 0,
          threats: analysis.threats?.length || 0,
          criticalVulns: analysis.vulnerabilities?.filter(v => v.severity === 'Critical').length || 0,
          highRiskThreats: analysis.threats?.filter(t => t.risk === 'High' || t.risk === 'Extreme').length || 0
        });
      }
    });

    // Build edge information for attack path analysis
    const edgeInfo = diagram.edges?.map(edge => {
      const source = diagram.nodes.find(n => n.id === edge.source);
      const target = diagram.nodes.find(n => n.id === edge.target);
      return {
        edgeCode: this.indexer.getEdgeCode(edge.id),
        from: source?.data?.label || edge.source,
        to: target?.data?.label || edge.target,
        protocol: edge.data?.protocol || 'unknown',
        encryption: edge.data?.encryption || 'not specified'
      };
    }).filter(e => e) || [];

    // Generate Cypher graph for full system context
    const cypherGraph = generateEnhancedCypher(diagram);
    
    // Check if we have any threats to work with
    const hasThreats = allThreats.length > 0;
    const hasVulnerabilities = allVulnerabilities.length > 0;
    
    let prompt;
    if (hasThreats || hasVulnerabilities) {
      // Standard prompt when issues are found
      prompt = `You are now performing the FINAL system-level analysis. Your task is to identify ATTACK PATHS by chaining the vulnerabilities and threats identified in individual components.

=== ANALYSIS SUMMARY ===
Total components analyzed: ${nodeAnalyses.length}
Components with issues: ${componentSummary.length}
Total vulnerabilities found: ${allVulnerabilities.length}
Total threats identified: ${allThreats.length}

=== VULNERABILITIES BY COMPONENT ===
${allVulnerabilities.map((v, i) => 
  `${i+1}. ${v.component} (${v.zone} Zone) [${v.indexCode}]:
   - Vulnerability: ${v.description}
   - Severity: ${v.severity}${v.cve !== 'N/A' ? `
   - CVE: ${v.cve}` : ''}${v.cvss ? `
   - CVSS: ${v.cvss}` : ''}`
).join('\n\n')}

=== THREATS ENABLED BY VULNERABILITIES ===
${allThreats.map((t, i) => 
  `${i+1}. ${t.component} (${t.zone} Zone) [${t.indexCode}]:
   - Threat: ${t.description}
   - Risk: ${t.risk}
   - Likelihood: ${t.likelihood}
   - Impact: ${t.impact}
   - MITRE: ${t.mitreTechniques?.join(', ') || 'None'}${t.basedOnVulnerability ? `
   - Based on: ${t.basedOnVulnerability}` : ''}`
).join('\n\n')}

=== SYSTEM ARCHITECTURE (Cypher Graph Format) ===
${cypherGraph}

=== EDGE REFERENCE ===
${edgeInfo.map(e => 
  `- [${e.edgeCode}]: ${e.from} → ${e.to} (${e.protocol}, ${e.encryption})`
).join('\n')}

YOUR FOCUSED TASK - ATTACK PATH DISCOVERY:

1. **System Overview** (MAX 150 words):
   - Brief description of what the system does
   - Overall security assessment based on findings
   - Highlight the most critical issue if any

2. **Attack Paths** (ONLY chain existing vulnerabilities):
   - Identify 3-5 most likely attack paths
   - Each path MUST use vulnerabilities/threats identified above
   - Format: Entry Point → Pivot → Target
   - Include which specific vulnerabilities are exploited at each step
   - DO NOT create theoretical paths - only use confirmed issues

3. **Recommendations** (Fix the actual vulnerabilities):
   - Prioritize fixing Critical/High vulnerabilities first
   - Group similar fixes (e.g., "Update all Apache servers to 2.4.54+")
   - Maximum 5 recommendations
   - Be specific: mention exact versions, patches, or configurations

REMEMBER: You are NOT re-analyzing components. You are ONLY:
- Summarizing the overall security posture
- Finding paths between already-identified vulnerabilities
- Recommending fixes for confirmed issues`;
    } else {
      // Alternative prompt for secure systems with no identified threats
      prompt = `Based on the system architecture analysis, provide a security assessment for this well-configured system.

=== SYSTEM ARCHITECTURE (Cypher Graph Format) ===
The complete system architecture is shown below in Cypher format. This provides full visibility of:
- All components with their properties (vendor, version, protocols, security controls, etc.)
- All connections with their security attributes (encryption, authentication, protocols)
- Security zones and trust boundaries
- Component relationships and data flows

${cypherGraph}

=== THREAT ANALYSIS RESULT ===
Component-level analysis found no significant exploitable vulnerabilities or misconfigurations.
This indicates the system has been configured with good security practices.

${additionalContext.customContext ? `=== ADDITIONAL CONTEXT ===
${additionalContext.customContext.content}` : ''}

${additionalContext.targetedMode && additionalContext.targetedAnalysis ? `
========== TARGETED THREAT ANALYSIS MODE ==========
This is a TARGETED system-level analysis focusing on specific threat actors and scenarios.

THREAT ACTORS:
${additionalContext.targetedAnalysis.threatActors}

KNOWN TTPs (Tactics, Techniques, and Procedures):
${additionalContext.targetedAnalysis.ttps}

KNOWN VULNERABILITIES TO CHECK:
${additionalContext.targetedAnalysis.vulnerabilities}

FOCUS AREAS:
${additionalContext.targetedAnalysis.focusAreas}

${additionalContext.targetedAnalysis.scenarioDescription ? `SCENARIO DESCRIPTION:
${additionalContext.targetedAnalysis.scenarioDescription}` : ''}

${additionalContext.targetedAnalysis.threatIntelligence ? `
THREAT INTELLIGENCE:
${additionalContext.targetedAnalysis.threatIntelligence.rawIntelligence ? `
Recent Intelligence Reports:
${additionalContext.targetedAnalysis.threatIntelligence.rawIntelligence}` : ''}
${additionalContext.targetedAnalysis.threatIntelligence.recentCVEs ? `
Recent CVEs to Consider:
${additionalContext.targetedAnalysis.threatIntelligence.recentCVEs}` : ''}
${additionalContext.targetedAnalysis.threatIntelligence.knownIOCs ? `
Known IOCs (Indicators of Compromise):
${additionalContext.targetedAnalysis.threatIntelligence.knownIOCs}` : ''}
${additionalContext.targetedAnalysis.threatIntelligence.campaignInfo ? `
Active Campaign Information:
${additionalContext.targetedAnalysis.threatIntelligence.campaignInfo}` : ''}
${additionalContext.targetedAnalysis.threatIntelligence.intelligenceDate ? `
Intelligence Date: ${additionalContext.targetedAnalysis.threatIntelligence.intelligenceDate}` : ''}` : ''}

IMPORTANT: Create attack paths specifically showing how these threat actors would exploit the system using their known TTPs. Focus on the vulnerabilities and areas specified. If threat intelligence is provided, incorporate the specific CVEs, IOCs, and campaign tactics into your attack path analysis.
===================================================
` : ''}

ANALYSIS REQUIREMENTS:

1. **System Overview** (MAX 150 words):
   - What the system is and its purpose based on the architecture
   - Acknowledge the strong security posture evidenced by lack of major vulnerabilities
   - Highlight key security features observed in the architecture

2. **Attack Paths**: 
   - Since no exploitable vulnerabilities were identified, state: "No exploitable attack paths identified due to strong security configuration"

3. **Recommendations**:
   - Focus on security best practices and defense-in-depth improvements
   - Suggest monitoring, auditing, and maintenance practices
   - Maximum 5 recommendations for continuous security improvement
   - Avoid suggesting fixes for non-existent vulnerabilities

IMPORTANT: This system appears well-secured. Focus on acknowledging good security practices while suggesting proactive improvements.`;
    }

    // Define the JSON format template
    const jsonFormat = `Return ONLY valid JSON in this format:
{
  "attackPaths": [
    {
      "description": "Concise attack description referencing actual components and verified vulnerabilities",
      "path": ["Component Label 1", "Component Label 2", "Component Label 3"],
      "nodeCodes": ["WEB-DMZ-001", "APP-INT-002", "DB-RES-003"] /* Index codes from Cypher CREATE statements */,
      "edgeCodes": ["WEB-DMZ-001-right-to-APP-INT-002-left"] /* Edge codes from CONNECTS relationships */,
      "exploitedThreats": ["Reference specific threats from above by number"],
      "likelihood": "Almost Certain|Likely|Possible|Unlikely|Very Unlikely|Rare",
      "impact": "Catastrophic|Severe|Major|Moderate|Minor|Negligible",
      "risk": "Extreme|High|Medium|Minor|Sustainable",
      "mitreTechniques": ["T1190", "T1078", "T1005"]
    }
  ],
  "recommendations": [
    {
      "priority": "EXTREME|HIGH|MEDIUM|MINOR|SUSTAINABLE",
      "action": "Specific mitigation action",
      "affectedComponents": ["Component names"],
      "rationale": "Why this is important"
    }
  ],
  "systemOverview": "Brief 2-3 paragraph summary of: 1) What the system is and its purpose, 2) Key findings from the analysis, 3) Overall security posture. Keep it concise - no more than 150 words."
}`;
    
    // Add the JSON format instruction to the prompt
    prompt += '\n\n' + jsonFormat;

    try {
      const provider = this.aiProviderManager.getCurrentProvider();
      const currentModel = this.aiProviderManager.getCurrentModel();
      
      // Get model-specific profile for threat analysis
      const modelProfile = getEndpointProfile(currentModel, 'threatAnalysis');
      const isFoundationSec = currentModel && currentModel.includes('foundation-sec'); // Keep for backward compatibility
      
      // Check if it's a local provider - ONLY check provider type, not model name for public providers
      const isLocalProvider = provider === 'local';
      
      // Enable web search for system-level analysis if using Anthropic
      const enableSystemWebSearch = provider === 'anthropic' && 
                                   additionalContext.enableWebSearch !== false;
      
      // Enhanced logging for debugging
      logger.info(`[ThreatAnalyzer] Provider detection:`, {
        provider,
        currentModel,
        isLocalProvider,
        hasModelProfile: !!modelProfile,
        responseProcessor: modelProfile?.responseProcessor,
        enableSystemWebSearch
      });
      
      // Enhanced system prompt for system-level analysis
      let systemPrompt = 'You are a pragmatic security architect reviewing a small test system. CRITICAL REQUIREMENTS:\n\n1. **CVEs must be real and verified** - Only use CVEs that:\n   - Actually exist in the NVD database\n   - Are confirmed to affect the EXACT version specified\n   - Have been publicly disclosed\n   - Never invent or guess CVE numbers\n\n2. **Focus on observable issues** - Only create attack paths based on:\n   - Explicitly stated misconfigurations from the analysis\n   - Actually verified vulnerabilities (real CVEs)\n   - Clear design flaws visible in the architecture\n   - NOT missing documentation or potential issues\n\n3. **Avoid speculation** - Do NOT create:\n   - "Potential" attack paths without verified vulnerabilities\n   - Hypothetical scenarios ("if X then Y could happen")\n   - Generic attack paths that apply to any system\n   - Paths based on missing documentation alone\n   - Theoretical vulnerabilities without specific CVEs\n\nONLY include attack paths that chain actual verified vulnerabilities identified in the component analysis. If no real vulnerabilities exist, state "No exploitable attack paths identified". If the system is well-secured, acknowledge this. Return ONLY valid JSON without any markdown formatting.';
      
      // Apply model-specific system analysis additions
      if (modelProfile && modelProfile.systemAnalysisAdditions) {
        systemPrompt += modelProfile.systemAnalysisAdditions;
      }
      
      // Add web search guidance for system-level analysis
      if (enableSystemWebSearch) {
        systemPrompt += `\n\nWEB SEARCH ENABLED: You can search for current threat intelligence about the system components and attack patterns.
        
SEARCH GUIDANCE:
- Search for recent attack campaigns targeting similar architectures
- Look for exploit chains that combine multiple vulnerabilities
- Search for MITRE ATT&CK techniques relevant to the identified threats
- Verify any threat actor TTPs against recent intelligence
- Check for industry-specific threats based on the system type

IMPORTANT: All web search findings must include the source URL for verification.`;
      }
      
      // Add JSON example if required by the model profile
      if (modelProfile && modelProfile.systemAnalysisExample) {
        systemPrompt += `\n\nIMPORTANT for JSON formatting: You MUST return a JSON object with this EXACT structure:\n${JSON.stringify(modelProfile.systemAnalysisExample, null, 2)}\n\nThe response must be ONLY the JSON object - no text before or after. Arrays can be empty [] if no items exist. The systemOverview is a string (max 150 words). Ensure all JSON keys match exactly as shown.\n\nNOTE: If vulnerabilities were identified in the component analysis (even if threats array was empty), you should still create attack paths based on those vulnerabilities. Consider high-severity CVEs as exploitable for attack path purposes.`;
      }
      
      // Enhanced logging for system analysis
      logger.info(`[ThreatAnalyzer] System analysis provider detection:`, {
        provider,
        currentModel,
        isLocalProvider,
        hasModelProfile: !!modelProfile,
        systemAnalysisAdditions: !!modelProfile?.systemAnalysisAdditions
      });
      
      // Simplify system prompt for local LLMs
      if (isLocalProvider) {
        systemPrompt = 'You are a security architect analyzing system attack paths.\n\nRULES:\n1. Only create attack paths using actual vulnerabilities found\n2. Do not speculate or create theoretical attacks\n3. If no vulnerabilities exist, say so clearly\n\nOUTPUT: Return ONLY a JSON object. No explanations. No markdown. Start with { and end with }';
        
        // Add simplified JSON example for local LLMs
        const simpleSystemExample = {
          attackPaths: [{
            description: "Attack path description",
            path: ["Component A", "Component B"],
            likelihood: "High",
            impact: "Major",
            risk: "High",
            mitreTechniques: ["T1078"]
          }],
          recommendations: [{
            priority: "HIGH",
            action: "Fix specific issue",
            affectedComponents: ["Component A"],
            rationale: "Security improvement"
          }],
          systemOverview: "Brief system security summary"
        };
        systemPrompt += `\n\nJSON FORMAT:\n${JSON.stringify(simpleSystemExample, null, 2)}\n\nReturn ONLY JSON like above. Empty arrays [] if no attack paths found.`;
        logger.info('[ThreatAnalyzer] Using simplified system prompt for local LLM');
      }
      
      // For local LLMs, we need to include the diagram context in the system message
      let messages;
      if (isLocalProvider) {
        // Get the full Cypher diagram representation for system analysis
        const cypherDiagram = generateEnhancedCypher(diagram);
        
        // Model-specific handling is now done through profiles above
        
        // For local LLMs, include the diagram context in the system message
        messages = [
          { 
            role: 'system', 
            content: systemPrompt + '\n\n=== VISUAL DIAGRAM STRUCTURE ===\n' + cypherDiagram + '\n=== END DIAGRAM ==='
          },
          { role: 'user', content: maybeSanitise(prompt, provider) }
        ];
        
        logger.info('[ThreatAnalyzer] Using local LLM for system analysis - added diagram context to system message');
      } else {
        // For cloud providers, use the standard format
        messages = [
          { 
            role: 'system', 
            content: systemPrompt
          },
          { role: 'user', content: maybeSanitise(prompt, provider) }
        ];
      }
      
      const systemAnalysisOptions = {
        enableWebSearch: enableSystemWebSearch,
        maxSearches: 5  // Allow more searches for system-level analysis
      };
      
      const response = await this.generateWithRetry(messages, 'System-Level Analysis', systemAnalysisOptions);
      
      // Extract content string from response (handles different provider formats)
      let content;
      if (typeof response === 'string') {
        content = response;
      } else if (response?.content) {
        // Handle standardized response format from aiProviders.js
        content = response.content;
      } else if (response?.choices?.[0]?.message?.content) {
        // Fallback for direct OpenAI format
        content = response.choices[0].message.content;
      } else {
        content = JSON.stringify(response);
      }
      
      // Parse JSON response
      let analysis;
      try {
        // Log the raw content for debugging
        logger.info('[ThreatAnalyzer] Raw system analysis response:', {
          contentLength: content?.length,
          first500Chars: content?.substring(0, 500),
          last500Chars: content?.substring(Math.max(0, content.length - 500)),
          containsJSON: content?.includes('"attackPaths"'),
          startsWithBrace: content?.trim().startsWith('{'),
          endsWithBrace: content?.trim().endsWith('}')
        });
        
        // Remove any markdown formatting if present
        let jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Apply model-specific response processor if available
        const systemModelProfile = getEndpointProfile(currentModel, 'threatAnalysis');
        if (systemModelProfile && systemModelProfile.responseProcessor) {
          const processor = getProcessor(systemModelProfile.responseProcessor);
          if (processor) {
            logger.info(`[ThreatAnalyzer] Applying response processor for system analysis: ${currentModel}`);
            jsonStr = processor(jsonStr);
          }
        }
        
        // Log the cleaned JSON string
        logger.info('[ThreatAnalyzer] Cleaned JSON string:', {
          jsonLength: jsonStr?.length,
          first200Chars: jsonStr?.substring(0, 200),
          isValidStart: jsonStr?.trim().startsWith('{'),
          isValidEnd: jsonStr?.trim().endsWith('}')
        });
        
        analysis = JSON.parse(jsonStr);
      } catch (parseError) {
        logger.error('[ThreatAnalyzer] Failed to parse system analysis JSON:', parseError);
        
        // Enhanced logging for debugging
        const debugInfo = {
          model: currentModel,
          provider: provider,
          contentLength: content?.length,
          contentPreview: content?.substring(0, 500),
          contentType: typeof content,
          startsWithBrace: content?.trim().startsWith('{'),
          endsWithBrace: content?.trim().endsWith('}'),
          containsThinking: content?.toLowerCase().includes('thinking') || content?.toLowerCase().includes('let me')
        };
        
        logger.error('[ThreatAnalyzer] System analysis JSON parse error details:', debugInfo);
        // Generate fallback system overview based on diagram structure
        const systemOverview = this.generateFallbackSystemOverview(diagram, allThreats.length);
        
        // Generate fallback attack paths based on vulnerabilities found
        const fallbackAttackPaths = this.generateFallbackAttackPaths(allVulnerabilities, allThreats, diagram);
        const fallbackRecommendations = this.generateFallbackRecommendations(allVulnerabilities, allThreats);
        
        analysis = {
          systemOverview,
          attackPaths: fallbackAttackPaths,
          recommendations: fallbackRecommendations
        };
      }

      return analysis;
    } catch (error) {
      logger.error('[ThreatAnalyzer] System-level analysis failed:', error);
      // Generate fallback system overview even on complete failure
      const systemOverview = this.generateFallbackSystemOverview(diagram, allThreats.length);
      
      // Generate fallback attack paths based on vulnerabilities found
      const fallbackAttackPaths = this.generateFallbackAttackPaths(allVulnerabilities, allThreats, diagram);
      const fallbackRecommendations = this.generateFallbackRecommendations(allVulnerabilities, allThreats);
      
      return {
        systemOverview,
        attackPaths: fallbackAttackPaths,
        recommendations: fallbackRecommendations,
        error: error.message
      };
    }
  }

  /**
   * Generate a fallback system overview based on diagram structure when AI analysis fails
   */
  generateFallbackSystemOverview(diagram, threatCount) {
    try {
      const nodes = diagram.nodes || [];
      const componentNodes = nodes.filter(n => n.type !== 'securityZone');
      const zones = [...new Set(componentNodes.map(n => n.data?.zone).filter(z => z))];
      
      const componentTypes = {};
      componentNodes.forEach(node => {
        const type = node.type || 'unknown';
        componentTypes[type] = (componentTypes[type] || 0) + 1;
      });
      
      const typeDescriptions = Object.entries(componentTypes)
        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
        .join(', ');
      
      let overview = `This system consists of ${componentNodes.length} components distributed across ${zones.length} security zones: ${zones.join(', ')}. `;
      overview += `The architecture includes ${typeDescriptions}. `;
      
      if (threatCount === 0) {
        overview += `Component-level analysis found no significant security vulnerabilities, indicating good security configuration. `;
        overview += `The system appears to follow security best practices with proper zone segmentation and component hardening.`;
      } else {
        overview += `Analysis identified ${threatCount} potential security concerns that should be addressed to improve the overall security posture.`;
      }
      
      return overview;
    } catch (error) {
      logger.error('[ThreatAnalyzer] Failed to generate fallback overview:', error);
      return `System architecture analysis could not be completed. Manual review of the ${diagram.nodes?.length || 0} components is recommended.`;
    }
  }

  /**
   * Generate fallback attack paths based on identified vulnerabilities
   */
  generateFallbackAttackPaths(vulnerabilities, threats, diagram) {
    try {
      if (!vulnerabilities || vulnerabilities.length === 0) {
        return [];
      }

      const attackPaths = [];
      const edges = diagram.edges || [];
      
      // Group vulnerabilities by severity
      const criticalVulns = vulnerabilities.filter(v => v.severity === 'Critical' || v.severity === 'High');
      const otherVulns = vulnerabilities.filter(v => v.severity !== 'Critical' && v.severity !== 'High');
      
      // Create attack paths for critical vulnerabilities first
      if (criticalVulns.length > 0) {
        // Find entry points (components in DMZ or external zones)
        const entryPoints = criticalVulns.filter(v => 
          v.zone === 'DMZ' || v.zone === 'External' || v.zone === 'Public'
        );
        
        // Find targets (databases or sensitive components)
        const targets = vulnerabilities.filter(v => 
          v.component.toLowerCase().includes('database') || 
          v.component.toLowerCase().includes('db') ||
          v.dataClassification === 'Confidential'
        );
        
        if (entryPoints.length > 0 && targets.length > 0) {
          // Create a path from entry to target
          const entry = entryPoints[0];
          const target = targets[0];
          
          // Find intermediate components
          const intermediates = vulnerabilities.filter(v => 
            v.zone !== entry.zone && v.zone !== target.zone
          );
          
          const path = [entry.component];
          if (intermediates.length > 0) {
            path.push(intermediates[0].component);
          }
          if (target.component !== entry.component) {
            path.push(target.component);
          }
          
          attackPaths.push({
            description: `Attacker exploits ${entry.description} to gain initial access, then ${target.description} to compromise sensitive data`,
            path: path,
            nodeCodes: [entry.indexCode, intermediates[0]?.indexCode, target.indexCode].filter(Boolean),
            edgeCodes: [], // Would need to calculate from edges
            exploitedThreats: [`${entry.description}`, `${target.description}`],
            likelihood: 'Likely',
            impact: 'Major',
            risk: 'High',
            mitreTechniques: [...(entry.mitreTechniques || []), ...(target.mitreTechniques || [])]
          });
        }
      }
      
      // If no critical paths, create paths based on any vulnerabilities
      if (attackPaths.length === 0 && vulnerabilities.length >= 2) {
        const path = vulnerabilities.slice(0, 3).map(v => v.component);
        attackPaths.push({
          description: `Chain of vulnerabilities allows progressive compromise through ${path.join(' → ')}`,
          path: path,
          nodeCodes: vulnerabilities.slice(0, 3).map(v => v.indexCode),
          edgeCodes: [],
          exploitedThreats: vulnerabilities.slice(0, 3).map(v => v.description),
          likelihood: 'Possible',
          impact: 'Moderate',
          risk: 'Medium',
          mitreTechniques: vulnerabilities.slice(0, 3).flatMap(v => v.mitreTechniques || [])
        });
      }
      
      return attackPaths;
    } catch (error) {
      logger.error('[ThreatAnalyzer] Failed to generate fallback attack paths:', error);
      return [];
    }
  }

  /**
   * Generate fallback recommendations based on vulnerabilities
   */
  generateFallbackRecommendations(vulnerabilities, threats) {
    try {
      const recommendations = [];
      const seen = new Set();
      
      // Group by type of issue
      const defaultCreds = vulnerabilities.filter(v => 
        v.description.toLowerCase().includes('default') && 
        v.description.toLowerCase().includes('password')
      );
      
      const outdatedSoftware = vulnerabilities.filter(v => 
        v.description.toLowerCase().includes('outdated') || 
        v.description.toLowerCase().includes('old version')
      );
      
      const unencrypted = vulnerabilities.filter(v => 
        v.description.toLowerCase().includes('unencrypted') || 
        v.description.toLowerCase().includes('plain text')
      );
      
      // Add recommendations for each type
      if (defaultCreds.length > 0 && !seen.has('creds')) {
        seen.add('creds');
        recommendations.push({
          priority: 'HIGH',
          action: 'Change all default credentials immediately',
          affectedComponents: defaultCreds.map(v => v.component),
          rationale: 'Default credentials are easily exploited and often the first target of attackers'
        });
      }
      
      if (outdatedSoftware.length > 0 && !seen.has('updates')) {
        seen.add('updates');
        recommendations.push({
          priority: 'HIGH',
          action: 'Update all outdated software to latest stable versions',
          affectedComponents: outdatedSoftware.map(v => v.component),
          rationale: 'Outdated software contains known vulnerabilities that are actively exploited'
        });
      }
      
      if (unencrypted.length > 0 && !seen.has('encryption')) {
        seen.add('encryption');
        recommendations.push({
          priority: 'MEDIUM',
          action: 'Implement encryption for all sensitive data in transit',
          affectedComponents: unencrypted.map(v => v.component),
          rationale: 'Unencrypted communications can be intercepted and modified by attackers'
        });
      }
      
      // Add generic recommendations if needed
      if (recommendations.length === 0 && vulnerabilities.length > 0) {
        recommendations.push({
          priority: 'HIGH',
          action: 'Address identified vulnerabilities based on severity',
          affectedComponents: ['All vulnerable components'],
          rationale: 'Multiple security issues identified that require immediate attention'
        });
      }
      
      // Add monitoring recommendation
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Implement security monitoring and alerting',
        affectedComponents: ['All components'],
        rationale: 'Continuous monitoring helps detect and respond to security incidents'
      });
      
      return recommendations.slice(0, 5); // Limit to 5 recommendations
    } catch (error) {
      logger.error('[ThreatAnalyzer] Failed to generate fallback recommendations:', error);
      return [{
        priority: 'HIGH',
        action: 'Perform comprehensive security review',
        affectedComponents: ['All components'],
        rationale: 'Analysis incomplete - manual review required'
      }];
    }
  }

  /**
   * Phase 3: Enrich analysis with MITRE ATT&CK data
   */
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
        return {
          ...threat,
          mitreDetails
        };
      });

      return {
        ...analysis,
        threats: enrichedThreats
      };
    });

    // Collect ALL MITRE techniques from the analysis
    const allTechniques = new Set();
    
    // From node analyses
    nodeAnalyses.forEach(analysis => {
      analysis.threats.forEach(threat => {
        if (threat.mitreTechniques) {
          threat.mitreTechniques.forEach(t => allTechniques.add(t));
        }
      });
    });
    
    // From attack paths
    if (systemAnalysis.attackPaths) {
      systemAnalysis.attackPaths.forEach(path => {
        if (path.mitreTechniques) {
          path.mitreTechniques.forEach(t => allTechniques.add(t));
        }
      });
    }
    
    // Skip system TTP summary - only use techniques actually identified in threats and attack paths
    // This prevents the AI from adding extra techniques that weren't in the actual analysis
    
    // Enrich all techniques with full details
    const enrichedTtpSummary = {};
    allTechniques.forEach(techniqueId => {
      const technique = mitreValidator.getTechnique(techniqueId);
      if (technique) {
        enrichedTtpSummary[techniqueId] = {
          name: technique.name,
          description: technique.description,
          tactics: technique.tactics,
          platforms: technique.platforms
        };
      } else {
        // For techniques not in our database, use what the AI provided
        enrichedTtpSummary[techniqueId] = {
          name: systemAnalysis.ttpSummary?.[techniqueId] || techniqueId,
          description: 'Technique details not found in MITRE database',
          tactics: []
        };
      }
    });

    return {
      nodeAnalyses: enrichedNodeAnalyses,
      systemAnalysis: {
        ...systemAnalysis,
        ttpSummary: enrichedTtpSummary
      }
    };
  }

  /**
   * Format the complete analysis for the UI
   * This matches the expected structure from the existing implementation
   */
  formatForUI(enrichedAnalysis, diagram, additionalContext = {}) {
    const { nodeAnalyses, systemAnalysis } = enrichedAnalysis;
    
    // Build componentThreats map keyed by node ID (not index code)
    const componentThreats = {};
    nodeAnalyses.forEach(analysis => {
      if (analysis.threats.length > 0) {
        componentThreats[analysis.nodeId] = analysis.threats.map((threat, index) => ({
          id: `threat-${analysis.nodeId}-${index}`,
          ...threat,
          mitreTechniques: threat.mitreTechniques || []
        }));
      }
    });
    
    // Build analyzedComponents list to track all components that were analyzed
    const analyzedComponents = nodeAnalyses.map(analysis => ({
      nodeId: analysis.nodeId,
      nodeLabel: analysis.nodeLabel,
      indexCode: analysis.indexCode,
      threatsCount: analysis.threats.length,
      vulnerabilitiesCount: analysis.vulnerabilities?.length || 0,
      hasAnalysis: true
    }));

    // Update nodes with their analysis results for NodeEditor display
    diagram.nodes.forEach(node => {
      const analysis = nodeAnalyses.find(a => a.nodeId === node.id);
      if (analysis) {
        // Format the detailed analysis text for the "Identified Threats" tab
        const detailedAnalysis = this.formatNodeAnalysisText(analysis);
        
        // Log the additionalContext length being set
        logger.info(`[ThreatAnalyzer] Setting additionalContext for node ${node.id}: ${detailedAnalysis.length} chars`);
        
        node.data = {
          ...node.data,
          additionalContext: detailedAnalysis,
          securityContext: {
            threats: analysis.threats.map((threat, index) => ({
              id: `threat-${node.id}-${index}`,
              ...threat
            })),
            vulnerabilities: analysis.vulnerabilities || [],
            recommendedControls: analysis.recommendedControls || []
          }
        };
      }
    });
    
    // Format the markdown content
    const content = this.formatAnalysisReport(enrichedAnalysis);
    
    return {
      content,
      diagram, // Return the updated diagram with nodes containing their additionalContext
      systemAnalysis: {
        systemOverview: systemAnalysis.systemOverview, // Keep as systemOverview, not overview
        componentThreats,
        analyzedComponents, // Include the list of all analyzed components
        attackPaths: systemAnalysis.attackPaths || [],
        vulnerabilities: this.extractAllVulnerabilities(nodeAnalyses),
        recommendations: systemAnalysis.recommendations || [],
        ttpSummary: systemAnalysis.ttpSummary || {}, // Include the enriched TTP summary
        overallRiskAssessment: this.calculateOverallRisk(systemAnalysis.attackPaths),
        timestamp: new Date(),
        // Include targeted analysis information if present
        isTargetedAnalysis: !!additionalContext.targetedMode,
        targetedAnalysis: additionalContext.targetedMode ? additionalContext.targetedAnalysis : undefined
      },
      metadata: {
        analysisType: 'node-by-node',
        timestamp: new Date().toISOString(),
        provider: this.aiProviderManager.currentProvider,
        model: this.aiProviderManager.currentModel,
        nodesAnalyzed: nodeAnalyses.length,
        totalThreats: nodeAnalyses.reduce((sum, n) => sum + n.threats.length, 0),
        totalVulnerabilities: nodeAnalyses.reduce((sum, n) => sum + (n.vulnerabilities?.length || 0), 0)
      }
    };
  }

  /**
   * Format node analysis as readable text for the UI
   * This is specifically for the "Identified Threats" tab in NodeEditor
   * Recommended controls are stored separately and not shown in this tab
   */
  formatNodeAnalysisText(analysis) {
    let text = '';
    
    if (analysis.threats.length > 0) {
      text += `IDENTIFIED THREATS:
`;
      analysis.threats.forEach((threat, i) => {
        text += `
${i + 1}. ${threat.description}
   Likelihood: ${threat.likelihood}
   Impact: ${threat.impact}
   Risk: ${threat.risk}`;
        if (threat.mitreTechniques?.length > 0) {
          text += `
   MITRE Techniques: ${threat.mitreTechniques.join(', ')}`;
        }
        if (threat.mitreDetails?.length > 0) {
          text += '\n   TTP Overview:';
          threat.mitreDetails.forEach(technique => {
            text += `
     • ${technique.id} - ${technique.name}`;
            if (technique.tactics?.length > 0) {
              text += ` [${technique.tactics.join(', ')}]`;
            }
          });
        }
        text += '\n';
      });
    }
    
    if (analysis.vulnerabilities?.length > 0) {
      text += `
VULNERABILITIES:
`;
      analysis.vulnerabilities.forEach((vuln, i) => {
        text += `
${i + 1}. ${vuln.description}`;
        if (vuln.cve && vuln.cve !== 'N/A') text += `
   CVE: ${vuln.cve}`;
        if (vuln.cvss) text += `
   CVSS: ${vuln.cvss}`;
        text += `
   Severity: ${vuln.severity}
`;
      });
    }
    
    // NOTE: Recommended controls are intentionally NOT included here
    // They are stored separately in the node's data and should be displayed
    // in a different UI section (not in the "Identified Threats" tab)
    
    // Only show a message if there are no threats or vulnerabilities
    if (analysis.threats.length === 0 && (!analysis.vulnerabilities || analysis.vulnerabilities.length === 0)) {
      text = 'No significant security threats or vulnerabilities identified for this component.';
      
      // Add note about recommended controls if they exist
      if (analysis.recommendedControls?.length > 0) {
        text += '\n\nNote: Security enhancement recommendations are available in the analysis report.';
      }
    }
    
    // Log the text length for debugging
    logger.info(`[ThreatAnalyzer] formatNodeAnalysisText generated text of length: ${text.length} for node: ${analysis.nodeLabel}`);
    
    return text;
  }

  /**
   * Extract all vulnerabilities from node analyses
   */
  extractAllVulnerabilities(nodeAnalyses) {
    const vulnerabilities = [];
    nodeAnalyses.forEach(analysis => {
      if (analysis.vulnerabilities) {
        analysis.vulnerabilities.forEach((vuln, index) => {
          vulnerabilities.push({
            id: `vuln-${analysis.nodeId}-${index}`,
            ...vuln,
            affectedComponents: [analysis.nodeLabel],
            type: 'vulnerability'
          });
        });
      }
    });
    return vulnerabilities;
  }

  /**
   * Calculate overall risk based on attack paths
   */
  calculateOverallRisk(attackPaths) {
    if (!attackPaths || attackPaths.length === 0) {
      return {
        likelihood: 'Unlikely',
        impact: 'Minor',
        risk: 'Minor',
        justification: 'No significant attack paths identified'
      };
    }
    
    // Find the highest risk attack path
    let highestRisk = 'Minor';
    let highestLikelihood = 'Unlikely';
    let highestImpact = 'Minor';
    
    const riskLevels = ['Sustainable', 'Minor', 'Medium', 'High', 'Extreme'];
    const likelihoodLevels = ['Rare', 'Very Unlikely', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];
    const impactLevels = ['Negligible', 'Minor', 'Moderate', 'Major', 'Severe', 'Catastrophic'];
    
    attackPaths.forEach(path => {
      if (riskLevels.indexOf(path.risk) > riskLevels.indexOf(highestRisk)) {
        highestRisk = path.risk;
        highestLikelihood = path.likelihood;
        highestImpact = path.impact;
      }
    });
    
    return {
      likelihood: highestLikelihood,
      impact: highestImpact,
      risk: highestRisk,
      justification: `Based on ${attackPaths.length} identified attack paths, with the highest risk path having ${highestLikelihood.toLowerCase()} likelihood and ${highestImpact.toLowerCase()} impact.`
    };
  }

  /**
   * Format the complete analysis report
   */
  formatAnalysisReport(enrichedAnalysis) {
    const { nodeAnalyses, systemAnalysis } = enrichedAnalysis;

    let report = `# Security Analysis Report

## SYSTEM_OVERVIEW
${systemAnalysis.systemOverview}

## COMPONENT_THREATS
`;

    // Group threats by component
    nodeAnalyses.forEach(analysis => {
      if (analysis.threats.length === 0 && analysis.vulnerabilities.length === 0 && (!analysis.recommendedControls || analysis.recommendedControls.length === 0)) return;
      
      report += `
### ${analysis.nodeLabel} in ${analysis.nodeZone} Zone
`;
      
      if (analysis.threats.length > 0) {
        report += `#### Threats\n`;
        analysis.threats.forEach(threat => {
          report += `THREAT: ${threat.description} | LIKELIHOOD: ${threat.likelihood} | IMPACT: ${threat.impact} | RISK: ${threat.risk} | MITRE: ${threat.mitreTechniques?.join(', ') || 'None'}
`;
        });
      }
      
      if (analysis.vulnerabilities?.length > 0) {
        report += `\n#### Vulnerabilities\n`;
        analysis.vulnerabilities.forEach(vuln => {
          report += `VULN: ${vuln.description} | CVE: ${vuln.cve || 'N/A'} | CVSS: ${vuln.cvss || 'N/A'} | SEVERITY: ${vuln.severity}
`;
        });
      }
      
      if (analysis.recommendedControls?.length > 0) {
        report += `\n#### Recommended Security Controls\n`;
        analysis.recommendedControls.forEach(control => {
          report += `CONTROL: ${control.control} | ${control.description} | PRIORITY: ${control.priority}
`;
        });
      }
    });

    // Attack paths
    report += `
## ATTACK_PATHS
`;
    systemAnalysis.attackPaths?.forEach((path, index) => {
      report += `
### Attack Path ${index + 1}
**Route:** ${path.path.join(' → ')}
**Description:** ${path.description}
**Likelihood:** ${path.likelihood} | **Impact:** ${path.impact} | **Risk:** ${path.risk}
**MITRE Techniques:** ${path.mitreTechniques.join(', ')}
**Edge Codes:** ${path.edgeCodes?.join(', ') || 'N/A'}
`;
    });

    // TTP Summary is now built from actual techniques, shown in UI

    // MITRE techniques are collected from actual analysis and shown in UI

    // Vulnerabilities
    report += `
## VULNERABILITIES
`;
    let vulnIndex = 1;
    nodeAnalyses.forEach(analysis => {
      analysis.vulnerabilities?.forEach(vuln => {
        report += `
### Vulnerability ${vulnIndex++}
**Component:** ${analysis.nodeLabel} (${analysis.nodeZone})
**Description:** ${vuln.description}
**CVE:** ${vuln.cve || 'N/A'} | **CVSS:** ${vuln.cvss || 'N/A'} | **Severity:** ${vuln.severity || 'Unknown'}
`;
      });
    });

    // Recommendations
    report += `
## RECOMMENDATIONS
`;
    systemAnalysis.recommendations?.forEach((rec, index) => {
      report += `
### ${index + 1}. ${rec.action}
**Priority:** ${rec.priority}
**Affected Components:** ${rec.affectedComponents?.join(', ') || 'System-wide'}
**Rationale:** ${rec.rationale || 'Security best practice'}
`;
    });

    // Overall Risk Assessment
    const overallRisk = this.calculateOverallRisk(systemAnalysis.attackPaths);
    report += `
## OVERALL_RISK_ASSESSMENT
LIKELIHOOD: ${overallRisk.likelihood}
IMPACT: ${overallRisk.impact}
RISK: ${overallRisk.risk}
JUSTIFICATION: ${overallRisk.justification}
`;

    // MITRE technique details are shown in the UI with full formatting

    // Log the report length for debugging truncation issue
    logger.info(`[ThreatAnalyzer] formatAnalysisReport generated report of length: ${report.length}`);
    if (report.length > 10000) {
      logger.warn(`[ThreatAnalyzer] Large report generated: ${report.length} characters`);
    }

    return report;
  }
}

module.exports = SimplifiedThreatAnalyzer;