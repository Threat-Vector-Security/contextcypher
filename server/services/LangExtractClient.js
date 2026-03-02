/**
 * LangExtract Client Service
 * Communicates with the Python LangExtract service for AI-powered threat intelligence extraction
 */

const axios = require('axios');
const logger = require('../utils/logger-wrapper');

class LangExtractClient {
  constructor() {
    this.baseUrl = process.env.LANGEXTRACT_URL || 'http://localhost:8001';
    this.timeout = 30000; // 30 second timeout
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Check if LangExtract service is available
   */
  async isAvailable() {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.warn('LangExtract service not available:', error.message);
      return false;
    }
  }

  /**
   * Extract structured threat intelligence from raw content
   * @param {string} rawContent - Raw threat intelligence content
   * @param {Object} diagramContext - Current diagram context
   * @param {Object} aiConfig - AI provider configuration
   * @param {number} maxTokens - Maximum tokens for response
   * @returns {Object} Extracted threat intelligence with relevance scores
   */
  async extractThreatIntelligence(rawContent, diagramContext, aiConfig, maxTokens = 2000) {
    try {
      const response = await this.client.post('/extract', {
        raw_content: rawContent,
        diagram_context: diagramContext,
        ai_config: aiConfig,
        max_tokens: maxTokens
      });

      return response.data;
    } catch (error) {
      logger.error('LangExtract extraction error:', error);
      
      // Return empty result on error
      return {
        extracted_intel: {},
        relevance_scores: {},
        source_attributions: {},
        metadata: {
          error: error.message,
          extraction_timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Process imported threat intelligence with LangExtract
   * @param {string} importedIntel - Raw imported threat intelligence
   * @param {Object} diagram - Diagram data
   * @param {Object} aiProvider - AI provider configuration
   * @returns {Object} Processed threat intelligence
   */
  async processImportedIntel(importedIntel, diagram, aiProvider) {
    try {
      // Check if service is available
      const available = await this.isAvailable();
      if (!available) {
        logger.warn('LangExtract service not available, falling back to basic parsing');
        return this.fallbackParsing(importedIntel);
      }

      // Prepare diagram context
      const diagramContext = {
        nodes: diagram.nodes || [],
        edges: diagram.edges || [],
        metadata: diagram.metadata || {}
      };

      // Extract intelligence using LangExtract
      const result = await this.extractThreatIntelligence(
        importedIntel,
        diagramContext,
        aiProvider,
        3000 // Higher token limit for imported content
      );

      // Transform to expected format
      return this.transformExtractedIntel(result);
    } catch (error) {
      logger.error('Error processing imported intel with LangExtract:', error);
      return this.fallbackParsing(importedIntel);
    }
  }

  /**
   * Transform LangExtract response to match expected format
   */
  transformExtractedIntel(langExtractResult) {
    const { extracted_intel, relevance_scores, source_attributions, metadata } = langExtractResult;
    
    // Map to expected threat intelligence structure
    const transformed = {
      recentCVEs: this.joinWithSources(
        extracted_intel.vulnerabilities || [],
        source_attributions.vulnerabilities || []
      ),
      knownIOCs: this.joinWithSources(
        extracted_intel.indicators_of_compromise || [],
        source_attributions.indicators_of_compromise || []
      ),
      threatActors: this.joinWithSources(
        extracted_intel.threat_actors || [],
        source_attributions.threat_actors || []
      ),
      campaignInfo: this.joinWithSources(
        extracted_intel.campaigns || [],
        source_attributions.campaigns || []
      ),
      attackPatterns: this.joinWithSources(
        extracted_intel.attack_patterns || [],
        source_attributions.attack_patterns || []
      ),
      mitigations: this.joinWithSources(
        extracted_intel.mitigations || [],
        source_attributions.mitigations || []
      ),
      intelligenceDate: metadata.extraction_timestamp || new Date().toISOString(),
      relevanceScores: relevance_scores,
      extractionMetadata: metadata
    };

    return transformed;
  }

  /**
   * Join extracted items with their source attributions
   */
  joinWithSources(items, sources) {
    if (!Array.isArray(items) || items.length === 0) {
      return '';
    }

    // If we have source attributions, include them
    if (Array.isArray(sources) && sources.length > 0) {
      return items.map((item, index) => {
        const source = sources[index];
        if (source) {
          return `${item} [Source: ${this.truncateSource(source)}]`;
        }
        return item;
      }).join('\n\n');
    }

    // Otherwise just join the items
    return items.join('\n\n');
  }

  /**
   * Truncate source text for display
   */
  truncateSource(source, maxLength = 50) {
    if (!source || typeof source !== 'string') {
      return '';
    }
    
    if (source.length <= maxLength) {
      return source;
    }
    
    return source.substring(0, maxLength) + '...';
  }

  /**
   * Pattern-based parsing for threat intelligence extraction
   * Primary method for reliable extraction of CVEs, IOCs, and threat actors
   */
  fallbackParsing(content) {
    logger.info('Using pattern-based parsing for threat intelligence extraction');
    
    // Basic pattern matching as fallback
    const cvePattern = /CVE-\d{4}-\d+/gi;
    const ipPattern = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const domainPattern = /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/gi;
    const sha256Pattern = /\b[a-f0-9]{64}\b/gi;
    const md5Pattern = /\b[a-f0-9]{32}\b/gi;
    
    const cves = content.match(cvePattern) || [];
    const ips = content.match(ipPattern) || [];
    const domains = content.match(domainPattern) || [];
    const sha256Hashes = content.match(sha256Pattern) || [];
    const md5Hashes = content.match(md5Pattern) || [];
    
    // Combine all IOCs
    const allIOCs = [
      ...ips.map(ip => `IP: ${ip}`),
      ...domains.map(domain => `Domain: ${domain}`),
      ...sha256Hashes.map(hash => `SHA256: ${hash}`),
      ...md5Hashes.map(hash => `MD5: ${hash}`)
    ];
    
    // Extract some basic threat actor patterns
    const threatActorPattern = /(?:apt|group|lazarus|cozy bear|fancy bear|carbanak|fin\d+)/gi;
    const threatActors = content.match(threatActorPattern) || [];
    
    return {
      recentCVEs: [...new Set(cves)].join('\n'),
      knownIOCs: [...new Set(allIOCs)].join('\n'),
      threatActors: [...new Set(threatActors)].join(', '),
      campaignInfo: '',
      attackPatterns: '',
      mitigations: '',
      intelligenceDate: new Date().toISOString(),
      relevanceScores: {},
      extractionMetadata: {
        method: 'pattern_matching',
        description: 'Pattern-based extraction for CVEs, IOCs, and threat actors',
        filtered_items: cves.length + allIOCs.length,
        total_items: cves.length + allIOCs.length + threatActors.length
      }
    };
  }
}

module.exports = LangExtractClient;