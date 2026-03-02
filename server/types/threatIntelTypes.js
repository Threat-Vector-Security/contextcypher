// server/types/threatIntelTypes.js

const SECURITY_SEVERITIES = {
    CRITICAL: 'CRITICAL',
    HIGH: 'HIGH',
    MODERATE: 'MODERATE',
    LOW: 'LOW',
    UNKNOWN: 'UNKNOWN'
  };
  
  const MITRE_TACTICS = {
    INITIAL_ACCESS: 'initial-access',
    EXECUTION: 'execution',
    PERSISTENCE: 'persistence',
    PRIVILEGE_ESCALATION: 'privilege-escalation',
    DEFENSE_EVASION: 'defense-evasion',
    CREDENTIAL_ACCESS: 'credential-access',
    DISCOVERY: 'discovery',
    LATERAL_MOVEMENT: 'lateral-movement',
    COLLECTION: 'collection',
    COMMAND_AND_CONTROL: 'command-and-control',
    EXFILTRATION: 'exfiltration',
    IMPACT: 'impact'
  };
  
  // We can keep the frontend types for TypeScript but use these structures in backend
  module.exports = {
    SECURITY_SEVERITIES,
    MITRE_TACTICS,
    
    // Helper validation functions
    isValidSeverity: (severity) => Object.values(SECURITY_SEVERITIES).includes(severity),
    isValidTactic: (tactic) => Object.values(MITRE_TACTICS).includes(tactic)
  };