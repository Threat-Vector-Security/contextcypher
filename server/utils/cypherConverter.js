// Helper function to convert JSON response to Cypher format

const { getValidNodeTypes } = require('./nodeTypes');
const { getValidSecurityZones } = require('./securityZones');

// Use production-safe logger if available, fallback to standard logger
const logger = (() => {
    try {
        // Try to load production logger first
        return require('./logger-production');
    } catch (e) {
        // Fallback to standard logger
        return require('./logger-wrapper');
    }
})();

function escapeCypher(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function convertJsonToCypher(jsonData, generationType) {
  const lines = [];
  
  // Add system metadata
  lines.push(`CREATE (:SystemMetadata {generationType:'${generationType}', name:'${jsonData.systemName || 'System Architecture'}'})`);
  
  // Create a map of component names to IDs for connections
  const componentIdMap = new Map();
  let componentIndex = 1;
  let genericTypeCount = 0;
  let invalidTypes = [];
  
  // Add component nodes
  if (jsonData.components && Array.isArray(jsonData.components)) {
    jsonData.components.forEach(comp => {
      const id = `comp-${componentIndex}`;
      const varName = `c${componentIndex}`;
      componentIdMap.set(comp.name, { id, varName });
      
      // Ensure valid type and zone using dynamic values
      const validTypes = getValidNodeTypes();
      const validZones = getValidSecurityZones();
      
      // Strict type enforcement - no mapping, just validation
      const originalType = comp.type;
      const type = validTypes.includes(originalType) ? originalType : 'generic';
      
      // Track generic usage for logging
      if (type === 'generic') {
        genericTypeCount++;
        if (originalType && originalType !== 'generic') {
          invalidTypes.push(`${comp.name}: '${originalType}' → 'generic'`);
        }
      }
      
      // Extract zone name from descriptions like "DMZ Zone (Public Services)"
      let extractedZone = comp.zone;
      if (comp.zone) {
        // Handle patterns like "Internet Zone (Customer Facing)" or "DMZ Zone (Public Services)"
        const zoneMatch = comp.zone.match(/^(\w+)(?:\s+Zone)?(?:\s+\([^)]+\))?$/);
        if (zoneMatch) {
          extractedZone = zoneMatch[1];
        }
        // Also handle simple patterns with just parentheses
        if (extractedZone.includes('(')) {
          extractedZone = extractedZone.split('(')[0].trim();
        }
      }
      
      // Simple zone validation - no mapping
      const zone = validZones.includes(extractedZone) ? extractedZone : 'Internal';
      
      // Build properties string
      const props = [
        `id:'${id}'`,
        `label:'${escapeCypher(comp.name)}'`,
        `zone:'${zone}'`,
        `type:'${type}'`
      ];
      
      if (comp.description) {
        props.push(`description:'${escapeCypher(comp.description)}'`);
      }
      
      // Add metadata fields if provided
      if (comp.vendor) {
        props.push(`vendor:'${escapeCypher(comp.vendor)}'`);
      }
      if (comp.version) {
        props.push(`version:'${escapeCypher(comp.version)}'`);
      }
      if (comp.product) {
        props.push(`product:'${escapeCypher(comp.product)}'`);
      }
      if (comp.protocols && Array.isArray(comp.protocols) && comp.protocols.length > 0) {
        props.push(`protocols:'${escapeCypher(comp.protocols.join(','))}'`);
      }
      if (comp.securityControls && Array.isArray(comp.securityControls) && comp.securityControls.length > 0) {
        props.push(`securityControls:'${escapeCypher(comp.securityControls.join(','))}'`);
      }
      
      lines.push(`CREATE (${varName}:${type} {${props.join(', ')}})`);
      componentIndex++;
    });
  }
  
  // Log generic type usage
  if (genericTypeCount > 0) {
    const totalComponents = jsonData.components?.length || 0;
    const genericPercentage = totalComponents > 0 ? (genericTypeCount / totalComponents * 100).toFixed(1) : 0;
    logger.warn(`[DiagramGen] Generic type usage: ${genericTypeCount}/${totalComponents} (${genericPercentage}%) components`);
    if (invalidTypes.length > 0) {
      logger.warn(`[DiagramGen] Invalid types replaced with 'generic':\n${invalidTypes.join('\n')}`);
    }
  }
  
  // Add connections
  if (jsonData.connections && Array.isArray(jsonData.connections)) {
    jsonData.connections.forEach(conn => {
      const fromComp = componentIdMap.get(conn.from);
      const toComp = componentIdMap.get(conn.to);
      
      if (fromComp && toComp) {
        const label = conn.label || 'Connection';
        
        // Build edge properties
        const edgeProps = [`label:'${escapeCypher(label)}'`];
        
        if (conn.protocol) {
          edgeProps.push(`protocol:'${escapeCypher(conn.protocol)}'`);
        }
        if (conn.encryption) {
          edgeProps.push(`encryption:'${escapeCypher(conn.encryption)}'`);
        }
        
        lines.push(`MATCH (${fromComp.varName}), (${toComp.varName}) CREATE (${fromComp.varName})-[:CONNECTS {${edgeProps.join(', ')}}]->(${toComp.varName})`);
      }
    });
  }
  
  return lines.join('\n');
}

module.exports = {
  convertJsonToCypher
};