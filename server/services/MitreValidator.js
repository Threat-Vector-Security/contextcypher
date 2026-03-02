/**
 * MitreValidator - Validates and enriches MITRE ATT&CK technique references
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger-wrapper');

class MitreValidator {
  constructor() {
    this.techniques = new Map();
    this.initialized = false;
  }

  /**
   * Normalize technique IDs to canonical MITRE format
   * Examples:
   *  - t1190 -> T1190
   *  - T1190.2 -> T1190.002
   *  - T1190.002 -> T1190.002
   */
  normalizeTechniqueId(techniqueId) {
    if (!techniqueId || typeof techniqueId !== 'string') return techniqueId;
    const trimmed = techniqueId.trim();
    const match = trimmed.match(/^([tT])(\d{4})(?:\.(\d{1,3}))?$/);
    if (!match) {
      return trimmed.toUpperCase();
    }
    const base = match[2];
    const sub = match[3];
    if (sub === undefined) {
      return `T${base}`;
    }
    // Pad sub-technique to 3 digits as per MITRE canonical IDs
    const paddedSub = sub.padStart(3, '0');
    return `T${base}.${paddedSub}`;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Load MITRE ATT&CK data with robust path resolution across dev/prod
      const candidates = [
        path.join(__dirname, '../../public/data/security-knowledge-base/mitre-attack.json'),
        path.join(__dirname, '../../../public/data/security-knowledge-base/mitre-attack.json'),
        path.join(process.cwd(), 'public', 'data', 'security-knowledge-base', 'mitre-attack.json'),
        // If packaged (resources/server_dist), allow colocated data folder
        path.join(__dirname, '../data/security-knowledge-base/mitre-attack.json'),
        path.join(__dirname, '../../data/security-knowledge-base/mitre-attack.json')
      ];

      let mitreDataPath = null;
      for (const candidate of candidates) {
        try {
          await fs.access(candidate);
          mitreDataPath = candidate;
          break;
        } catch { /* try next */ }
      }

      if (!mitreDataPath) {
        throw new Error('MITRE data file not found in candidate paths');
      }

      const mitreData = JSON.parse(await fs.readFile(mitreDataPath, 'utf8'));
      
      // Build technique lookup map
      mitreData.techniques.forEach(technique => {
        this.techniques.set(technique.id, {
          id: technique.id,
          name: technique.name,
          description: technique.description,
          tactics: technique.tactics,
          platforms: technique.platforms
        });
      });

      this.initialized = true;
      logger.info(`[MitreValidator] Loaded ${this.techniques.size} MITRE techniques from: ${mitreDataPath}`);
    } catch (error) {
      logger.error('[MitreValidator] Failed to load MITRE data', error);
      // Continue without validation if file can't be loaded
      this.initialized = true;
    }
  }

  /**
   * Validate technique ID exists
   */
  isValidTechnique(techniqueId) {
    const normalized = this.normalizeTechniqueId(techniqueId);
    return this.techniques.has(normalized);
  }

  /**
   * Get technique details
   */
  getTechnique(techniqueId) {
    const normalized = this.normalizeTechniqueId(techniqueId);
    return this.techniques.get(normalized);
  }

  /**
   * Get common techniques for threat analysis
   */
  getCommonTechniques() {
    return [
      { id: 'T1190', name: 'Exploit Public-Facing Application' },
      { id: 'T1210', name: 'Exploitation of Remote Services' },
      { id: 'T1078', name: 'Valid Accounts' },
      { id: 'T1040', name: 'Network Sniffing' },
      { id: 'T1005', name: 'Data from Local System' },
      { id: 'T1059', name: 'Command and Scripting Interpreter' },
      { id: 'T1055', name: 'Process Injection' },
      { id: 'T1570', name: 'Lateral Tool Transfer' },
      { id: 'T1021', name: 'Remote Services' },
      { id: 'T1110', name: 'Brute Force' },
      { id: 'T1486', name: 'Data Encrypted for Impact' },
      { id: 'T1565', name: 'Data Manipulation' },
      { id: 'T1057', name: 'Process Discovery' },
      { id: 'T1083', name: 'File and Directory Discovery' },
      { id: 'T1046', name: 'Network Service Discovery' }
    ];
  }

  /**
   * Format technique reference for prompts
   */
  getTechniquePromptReference() {
    const common = this.getCommonTechniques();
    return common.map(t => `- ${t.id}: ${t.name}`).join('\n');
  }

  /**
   * Validate and correct technique references in content
   */
  validateContent(content) {
    // Find all technique references (T followed by 4 digits)
    // Accept 1-3 sub-tech digits, then normalize to 3
    const techniquePattern = /\bT\d{4}(?:\.\d{1,3})?\b/gi;
    const matches = content.match(techniquePattern) || [];
    
    const validTechniques = [];
    const invalidTechniques = [];

    matches.forEach(rawTech => {
      const normalized = this.normalizeTechniqueId(rawTech);
      if (this.isValidTechnique(normalized)) {
        validTechniques.push(normalized);
      } else {
        invalidTechniques.push(normalized);
      }
    });

    if (invalidTechniques.length > 0) {
      logger.warn(`[MitreValidator] Invalid techniques found: ${invalidTechniques.join(', ')}`);
    }

    return {
      valid: validTechniques,
      invalid: invalidTechniques,
      total: matches.length
    };
  }
}

// Singleton instance
let instance;

module.exports = {
  getInstance: async () => {
    if (!instance) {
      instance = new MitreValidator();
      await instance.initialize();
    }
    return instance;
  }
}; 