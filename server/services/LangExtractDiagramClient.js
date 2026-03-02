const axios = require('axios');
const logger = require('../utils/logger-wrapper');

/**
 * Client for LangExtract diagram structure extraction
 */
class LangExtractDiagramClient {
  constructor() {
    this.baseUrl = process.env.LANGEXTRACT_URL || 'http://localhost:8001';
    this.timeout = parseInt(process.env.LANGEXTRACT_TIMEOUT || '30000', 10);
  }

  /**
   * Extract structured diagram data from AI response
   * @param {string} aiResponse - Raw AI response text
   * @param {Object} context - Context about the diagram request
   * @returns {Promise<Object|null>} Extracted diagram structure or null on failure
   */
  async extractDiagramStructure(aiResponse, context = {}) {
    try {
      logger.info('[LangExtractDiagram] Attempting structured extraction');
      
      const response = await axios.post(
        `${this.baseUrl}/api/diagram/extract`,
        {
          ai_response: aiResponse,
          context: context,
          provider: this.getConfiguredProvider()
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        logger.info('[LangExtractDiagram] Successfully extracted diagram structure');
        logger.info(`[LangExtractDiagram] Components: ${response.data.diagram.components.length}, Connections: ${response.data.diagram.connections.length}`);
        
        // Transform to ReactFlow format
        return this.transformToReactFlowFormat(response.data.diagram, response.data);
      } else {
        logger.warn('[LangExtractDiagram] Extraction returned success=false');
        return null;
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.warn('[LangExtractDiagram] Service not available, falling back to regex parsing');
      } else {
        logger.error(`[LangExtractDiagram] Extraction failed: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Get the configured AI provider from environment or default
   * @returns {string} Provider name
   */
  getConfiguredProvider() {
    // This should match the provider configuration in SimplifiedThreatAnalyzer
    return process.env.AI_PROVIDER || 'ollama';
  }

  /**
   * Transform LangExtract output to ReactFlow node/edge format
   * @param {Object} diagram - Extracted diagram structure
   * @param {Object} extractionData - Full extraction response with metadata
   * @returns {Object} ReactFlow compatible format
   */
  transformToReactFlowFormat(diagram, extractionData) {
    const nodeTypeMap = {
      'cloud-service': 'cloudService',
      'server': 'server',
      'client-device': 'clientDevice',
      'web-app': 'webApp',
      'api': 'api',
      'database': 'database',
      'firewall': 'firewall',
      'load-balancer': 'loadBalancer',
      'external-service': 'externalService',
      'mobile-app': 'mobileApp',
      'iot-device': 'iotDevice',
      'container': 'container',
      'microservice': 'microservice',
      'queue': 'queue',
      'cache': 'cache',
      'storage': 'storage',
      'browser': 'browser',
      'desktop-app': 'desktopApp',
      'network': 'network',
      'security-zone': 'securityZone'
    };

    // Transform components to nodes
    const nodes = diagram.components.map(comp => {
      const node = {
        id: comp.id,
        type: nodeTypeMap[comp.type] || 'genericNode',
        position: comp.position || this.calculatePosition(comp.id, diagram.components.indexOf(comp)),
        data: {
          label: comp.label,
          zone: comp.zone || this.inferZone(comp.type),
          isAIGenerated: true,
          confidence: extractionData.confidence_scores?.[`component_${comp.id}`] || 0.8
        }
      };

      // Add additional metadata
      if (comp.ports && comp.ports.length > 0) {
        node.data.ports = comp.ports;
      }
      if (comp.protocols && comp.protocols.length > 0) {
        node.data.protocols = comp.protocols;
      }
      if (comp.metadata) {
        node.data = { ...node.data, ...comp.metadata };
      }

      return node;
    });

    // Transform connections to edges
    const edges = diagram.connections.map(conn => {
      const edge = {
        id: conn.id,
        source: conn.source,
        target: conn.target,
        type: 'smoothstep',
        animated: conn.encrypted || false,
        data: {
          isAIGenerated: true,
          confidence: extractionData.confidence_scores?.[`connection_${conn.id}`] || 0.8
        }
      };

      // Build edge label
      const labelParts = [];
      if (conn.label) labelParts.push(conn.label);
      if (conn.protocol) labelParts.push(conn.protocol);
      if (conn.port) labelParts.push(`:${conn.port}`);
      
      if (labelParts.length > 0) {
        edge.label = labelParts.join(' ');
      }

      // Add additional metadata
      if (conn.dataFlow) {
        edge.data.dataFlow = conn.dataFlow;
      }
      if (conn.authentication) {
        edge.data.authentication = conn.authentication;
      }
      if (conn.bidirectional) {
        edge.markerEnd = { type: 'arrowclosed' };
        edge.markerStart = { type: 'arrowclosed' };
      } else {
        edge.markerEnd = { type: 'arrowclosed' };
      }

      return edge;
    });

    // Construct metadata
    const metadata = {
      ...diagram.metadata,
      title: diagram.title,
      description: diagram.description,
      architectureType: diagram.architecture_type,
      deploymentModel: diagram.deployment_model,
      securityControls: diagram.security_controls,
      complianceFrameworks: diagram.compliance_frameworks,
      extractionMetadata: extractionData.extraction_metadata,
      sourceAttributions: extractionData.source_attributions
    };

    return { nodes, edges, metadata };
  }

  /**
   * Calculate position for a component if not specified
   * @param {string} id - Component ID
   * @param {number} index - Component index
   * @returns {Object} Position object with x and y coordinates
   */
  calculatePosition(id, index) {
    // Use a simple grid layout
    const columns = 4;
    const spacing = 250;
    const row = Math.floor(index / columns);
    const col = index % columns;
    
    return {
      x: col * spacing + 100,
      y: row * spacing + 100
    };
  }

  /**
   * Infer security zone based on component type
   * @param {string} type - Component type
   * @returns {string} Inferred security zone
   */
  inferZone(type) {
    const externalTypes = ['external-service', 'browser', 'mobile-app', 'iot-device', 'client-device'];
    const dmzTypes = ['firewall', 'load-balancer', 'web-app', 'api', 'gateway', 'cdn'];
    const trustedTypes = ['database', 'cache', 'queue', 'storage'];
    
    if (externalTypes.includes(type)) return 'External';
    if (dmzTypes.includes(type)) return 'DMZ';
    if (trustedTypes.includes(type)) return 'Trusted';
    return 'Internal';
  }

  /**
   * Validate extraction result
   * @param {Object} result - Extraction result
   * @returns {boolean} Whether result is valid
   */
  validateExtraction(result) {
    if (!result || !result.nodes || !result.edges) {
      return false;
    }
    
    // Ensure at least one node
    if (result.nodes.length === 0) {
      logger.warn('[LangExtractDiagram] No components extracted');
      return false;
    }
    
    // Validate node structure
    for (const node of result.nodes) {
      if (!node.id || !node.type || !node.position) {
        logger.warn(`[LangExtractDiagram] Invalid node structure: ${JSON.stringify(node)}`);
        return false;
      }
    }
    
    // Validate edge structure
    for (const edge of result.edges) {
      if (!edge.id || !edge.source || !edge.target) {
        logger.warn(`[LangExtractDiagram] Invalid edge structure: ${JSON.stringify(edge)}`);
        return false;
      }
    }
    
    return true;
  }
}

module.exports = LangExtractDiagramClient;