// nodeTypes.js - Extract valid node types from SecurityTypes.ts
const fs = require('fs');
const path = require('path');

/**
 * Extract all valid SecurityNodeType values from SecurityTypes.ts
 * This ensures the server AI prompts always use the latest valid types
 */
function getValidNodeTypes() {
  try {
    const securityTypesPath = path.join(__dirname, '../../src/types/SecurityTypes.ts');
    const content = fs.readFileSync(securityTypesPath, 'utf8');
    
    const nodeTypes = new Set();
    
    // Extract all node type definitions using regex patterns
    const typeDefinitions = [
      /export type InfrastructureNodeType =\s*([^;]+);/s,
      /export type SecurityControlNodeType =\s*([^;]+);/s,
      /export type ApplicationNodeType =\s*([^;]+);/s,
      /export type CloudNodeType =\s*([^;]+);/s,
      /export type OTNodeType =\s*([^;]+);/s,
      /export type AINodeType =\s*([^;]+);/s,
      /export type CybercrimeNodeType =\s*([^;]+);/s,
      /export type PrivacyNodeType =\s*([^;]+);/s,
      /export type AppSecNodeType =\s*([^;]+);/s,
      /export type RedTeamNodeType =\s*([^;]+);/s,
      /export type SecOpsNodeType =\s*([^;]+);/s,
      /export type AWSNodeType =\s*([^;]+);/s,
      /export type AzureNodeType =\s*([^;]+);/s,
      /export type GCPNodeType =\s*([^;]+);/s,
      /export type IBMNodeType =\s*([^;]+);/s,
      /export type GenericNodeType = '([^']+)';/
    ];
    
    // Extract types from each definition
    typeDefinitions.forEach(regex => {
      const match = content.match(regex);
      if (match && match[1]) {
        const typeContent = match[1];
        // Extract individual quoted types
        const individualTypes = typeContent.match(/'[^']+'/g);
        if (individualTypes) {
          individualTypes.forEach(type => {
            const cleanType = type.replace(/'/g, '');
            nodeTypes.add(cleanType);
          });
        }
      }
    });
    
    // Manually add 'generic' since it's defined differently
    nodeTypes.add('generic');
    
    // Convert to sorted array
    const validTypes = Array.from(nodeTypes).sort();
    
    // Ensure we have the essential types
    const essentialTypes = ['server', 'database', 'firewall', 'generic'];
    essentialTypes.forEach(type => {
      if (!validTypes.includes(type)) {
        console.warn(`Warning: Essential node type '${type}' not found in SecurityTypes.ts`);
      }
    });
    
    return validTypes;
    
  } catch (error) {
    console.error('Error reading SecurityTypes.ts:', error);
    // Fallback to essential types if file read fails
    return [
      'server', 'database', 'firewall', 'loadBalancer', 'api', 'cache', 
      'messageBroker', 'storage', 'monitor', 'authServer', 'vpnGateway', 
      'waf', 'dns', 'ids', 'vault', 'generic'
    ];
  }
}

/**
 * Get a formatted string of valid node types for AI prompts
 */
function getValidNodeTypesString() {
  const types = getValidNodeTypes();
  return types.join(', ');
}

/**
 * Get commonly used node types for diagram generation
 */
function getCommonNodeTypes() {
  const allTypes = getValidNodeTypes();
  const commonTypes = [
    'server', 'database', 'firewall', 'loadBalancer', 'api', 'cache',
    'messageBroker', 'storage', 'monitor', 'authServer', 'vpnGateway',
    'waf', 'dns', 'ids', 'vault', 'generic', 'router', 'switch',
    'application', 'webServer', 'apiGateway', 'proxy', 'siem',
    'backup', 'logging'
  ];
  
  // Return only types that exist in SecurityTypes.ts
  return commonTypes.filter(type => allTypes.includes(type));
}

module.exports = {
  getValidNodeTypes,
  getValidNodeTypesString,
  getCommonNodeTypes
};