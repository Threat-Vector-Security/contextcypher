//diagramValidator.js
function validate(reqBody) {
  console.group('=== Diagram Validation ===');
  
  // Log initial request
  console.log('Validating Request:', {
    hasBody: !!reqBody,
    bodyKeys: reqBody ? Object.keys(reqBody) : [],
    timestamp: new Date().toISOString()
  });

  // Check if request body exists
  if (!reqBody) {
    console.error('Validation Failed: No request body');
    console.groupEnd();
    return { isValid: false, message: 'Request body is required' };
  }

  // Extract and log diagram presence
  const diagram = reqBody.diagram;
  console.log('Diagram Presence:', {
    hasDiagram: !!diagram,
    diagramKeys: diagram ? Object.keys(diagram) : [],
    hasNodes: !!diagram?.nodes,
    hasEdges: !!diagram?.edges
  });

  // Check if diagram exists
  if (!diagram) {
    console.error('Validation Failed: No diagram object');
    console.groupEnd();
    return { isValid: false, message: 'Diagram object is required' };
  }

  // Validate basic structure
  if (!diagram.nodes || !Array.isArray(diagram.nodes)) {
    console.error('Invalid nodes structure:', {
      diagramKeys: Object.keys(diagram),
      hasNodes: !!diagram.nodes,
      nodesType: typeof diagram.nodes
    });
    console.groupEnd();
    return { isValid: false, message: 'Diagram must have nodes array' };
  }

  if (!diagram.edges || !Array.isArray(diagram.edges)) {
    console.error('Invalid edges structure:', {
      diagramKeys: Object.keys(diagram),
      hasEdges: !!diagram.edges,
      edgesType: typeof diagram.edges
    });
    console.groupEnd();
    return { isValid: false, message: 'Diagram must have edges array' };
  }

  // Log detailed diagram structure
  console.log('Diagram Structure:', {
    nodes: diagram.nodes.map(node => ({
      id: node.id,
      type: node.type,
      hasData: !!node.data,
      dataProperties: node.data ? Object.keys(node.data) : [],
      securityProperties: {
        hasLevel: !!node.data?.securityLevel,
        hasZone: !!node.data?.zone,
        hasClassification: !!node.data?.dataClassification,
        hasControls: !!node.data?.securityControls
      }
    })),
    edges: diagram.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      hasData: !!edge.data,
      dataProperties: edge.data ? Object.keys(edge.data) : [],
      securityProperties: {
        hasProtocol: !!edge.data?.protocol,
        hasEncryption: !!edge.data?.encryption,
        hasLevel: !!edge.data?.securityLevel
      }
    })),
    metadata: diagram.metadata || {}
  });

  // Validate nodes
  const nodeValidationResults = diagram.nodes.map(node => ({
    id: node.id,
    isValid: !!(
      node.id && 
      node.type && 
      node.data && 
      typeof node.data.label === 'string'
    ),
    hasRequiredProps: {
      id: !!node.id,
      type: !!node.type,
      data: !!node.data,
      label: typeof node.data?.label === 'string'
    }
  }));

  const nodeValidation = nodeValidationResults.every(result => result.isValid);

  if (!nodeValidation) {
    console.error('Node Validation Failed:', {
      invalidNodes: nodeValidationResults.filter(r => !r.isValid)
    });
    console.groupEnd();
    return { isValid: false, message: 'Invalid node format' };
  }

  // Validate edges
  const edgeValidationResults = diagram.edges.map(edge => ({
    id: edge.id,
    isValid: !!(
      edge.id &&
      edge.source &&
      edge.target &&
      diagram.nodes.some(n => n.id === edge.source) &&
      diagram.nodes.some(n => n.id === edge.target)
    ),
    hasRequiredProps: {
      id: !!edge.id,
      source: !!edge.source,
      target: !!edge.target,
      validSource: diagram.nodes.some(n => n.id === edge.source),
      validTarget: diagram.nodes.some(n => n.id === edge.target)
    }
  }));

  const edgeValidation = edgeValidationResults.every(result => result.isValid);

  if (!edgeValidation) {
    console.error('Edge Validation Failed:', {
      invalidEdges: edgeValidationResults.filter(r => !r.isValid)
    });
    console.groupEnd();
    return { isValid: false, message: 'Invalid edge format or references' };
  }

  // Log validation success
  console.log('Validation Successful:', {
    nodeCount: diagram.nodes.length,
    edgeCount: diagram.edges.length,
    validNodes: nodeValidationResults.length,
    validEdges: edgeValidationResults.length,
    timestamp: new Date().toISOString()
  });

  console.groupEnd();
  return { 
    isValid: true,
    metadata: {
      nodeCount: diagram.nodes.length,
      edgeCount: diagram.edges.length,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = { validate };