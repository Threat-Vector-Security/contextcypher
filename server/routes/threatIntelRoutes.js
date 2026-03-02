/**
 * Threat Intelligence Routes
 * Handles threat intelligence extraction using LangExtract
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger-wrapper');
const LangExtractClient = require('../services/LangExtractClient');
const { filterThreatIntelligence } = require('../utils/threatIntelFilter');

// Extract component information from diagram nodes
function extractComponentInfo(nodes) {
  const components = [];

  nodes.forEach(node => {
    const data = node.data || {};
    if (data.vendor || data.product || data.technology || data.components) {
      // Extract main component info
      if (data.vendor && data.product) {
        components.push({
          vendor: data.vendor.toLowerCase(),
          product: data.product.toLowerCase(),
          version: data.version || '*',
          label: data.label || node.type
        });
      }

      // Extract nested components (like Log4j, Struts, etc.)
      if (data.components && Array.isArray(data.components)) {
        data.components.forEach(comp => {
          if (comp.name) {
            const [product, version] = comp.name.toLowerCase().split(/\s+/);
            components.push({
              vendor: '*',
              product: product,
              version: comp.version || version || '*',
              label: comp.name
            });
          }
        });
      }

      // Extract technology info
      if (data.technology) {
        const techMatch = data.technology.match(/(\w+)\s*([\d.]+)?/);
        if (techMatch) {
          components.push({
            vendor: '*',
            product: techMatch[1].toLowerCase(),
            version: techMatch[2] || '*',
            label: data.technology
          });
        }
      }
    }
  });

  return components;
}

/**
 * Filter threat intelligence based on system components
 * Uses precise matching for CVEs and other threat data
 */
function filterThreatIntelByComponents(content, nodes) {
  const components = extractComponentInfo(nodes);

  logger.info('[ThreatIntelRoutes] Filtering threat intel for components:', {
    count: components.length,
    components: components.map(c => `${c.vendor}:${c.product}`)
  });

  // Build search terms from components
  const searchTerms = new Set();
  components.forEach(comp => {
    // Add vendor names
    if (comp.vendor && comp.vendor !== '*') {
      searchTerms.add(comp.vendor.toLowerCase());
    }
    // Add product names
    if (comp.product) {
      searchTerms.add(comp.product.toLowerCase());
      // Add common variations
      if (comp.product.includes('-')) {
        searchTerms.add(comp.product.replace(/-/g, ' ').toLowerCase());
        searchTerms.add(comp.product.replace(/-/g, '_').toLowerCase());
      }
    }
  });

  // Add some common technology keywords that might not be in vendor/product
  const techKeywords = new Set();
  nodes.forEach(node => {
    const label = (node.data?.label || '').toLowerCase();
    // Common technologies
    ['apache', 'tomcat', 'mysql', 'nginx', 'docker', 'kubernetes', 'redis', 'mongodb',
     'postgresql', 'jenkins', 'gitlab', 'php', 'java', 'python', 'node', 'react',
     'windows', 'linux', 'ubuntu', 'debian', 'centos', 'rhel'].forEach(tech => {
      if (label.includes(tech)) {
        techKeywords.add(tech);
      }
    });
  });

  // Combine all search terms
  const allSearchTerms = [...searchTerms, ...techKeywords];

  if (allSearchTerms.length === 0) {
    logger.warn('[ThreatIntelRoutes] No components found for filtering, returning all data');
    return content;
  }

  // For NVD JSON data, parse and filter
  try {
    const jsonData = JSON.parse(content);
    if (jsonData.vulnerabilities) {
      const filtered = jsonData.vulnerabilities.filter(vuln => {
        const vulnText = JSON.stringify(vuln).toLowerCase();
        return allSearchTerms.some(term => vulnText.includes(term));
      });

      logger.info('[ThreatIntelRoutes] Filtered NVD data:', {
        original: jsonData.vulnerabilities.length,
        filtered: filtered.length,
        searchTerms: allSearchTerms
      });

      return JSON.stringify({ ...jsonData, vulnerabilities: filtered });
    }
  } catch (e) {
    // Not JSON, continue with text filtering
  }

  // For text content, filter lines containing relevant terms
  const lines = content.split('\n');
  const relevantLines = lines.filter(line => {
    const lineLower = line.toLowerCase();
    // Keep lines with CVE IDs that mention our components
    if (line.match(/CVE-\d{4}-\d+/)) {
      return allSearchTerms.some(term => lineLower.includes(term));
    }
    // Keep lines with IPs, domains, hashes if they're in a relevant context
    if (line.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/) ||
        line.match(/[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}/) ||
        line.match(/\b[a-f0-9]{32,64}\b/i)) {
      // Check if the line or surrounding context mentions our components
      return allSearchTerms.some(term => lineLower.includes(term));
    }
    // Keep threat actor lines if they mention targeting our tech
    if (line.match(/apt|lazarus|cozy bear|fancy bear|fin\d+/i)) {
      return allSearchTerms.some(term => lineLower.includes(term));
    }
    return false;
  });

  const filteredContent = relevantLines.join('\n');

  logger.info('[ThreatIntelRoutes] Filtered content:', {
    originalLines: lines.length,
    filteredLines: relevantLines.length
  });

  return filteredContent;
}

// COMMENTED OUT: CPE matching for AI-based filtering - keeping for potential future use
/*
// Check if a CVE configuration matches any of our components
function matchesCPE(configurations, components) {
  if (!configurations || !configurations.length) return false;

  for (const config of configurations) {
    if (config.nodes) {
      for (const node of config.nodes) {
        if (node.cpeMatch) {
          for (const cpeMatch of node.cpeMatch) {
            if (cpeMatch.vulnerable && cpeMatch.criteria) {
              // Parse CPE string: cpe:2.3:part:vendor:product:version:...
              const cpeParts = cpeMatch.criteria.split(':');
              if (cpeParts.length >= 5) {
                const cpeVendor = cpeParts[3].toLowerCase();
                const cpeProduct = cpeParts[4].toLowerCase();
                const cpeVersion = cpeParts[5] || '*';

                // Check against our components
                for (const comp of components) {
                  // Product match is most important
                  if (comp.product === cpeProduct ||
                      cpeProduct.includes(comp.product) ||
                      comp.product.includes(cpeProduct)) {
                    // If vendor matches or is wildcard, it's a match
                    if (comp.vendor === '*' || comp.vendor === cpeVendor || cpeVendor === '*') {
                      return true;
                    }
                  }

                  // Special cases for common components
                  if ((comp.product === 'tomcat' && cpeProduct === 'tomcat') ||
                      (comp.product === 'mysql' && cpeProduct === 'mysql') ||
                      (comp.product === 'log4j' && cpeProduct.includes('log4j')) ||
                      (comp.product === 'struts' && cpeProduct === 'struts') ||
                      (comp.product === 'spring' && cpeProduct.includes('spring'))) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return false;
}
*/

// COMMENTED OUT: NVD filtering for AI-based processing - keeping for potential future use
/*
// Filter NVD vulnerabilities by system components
function filterNVDByComponents(nvdData, nodes) {
  const components = extractComponentInfo(nodes);

  logger.info('[ThreatIntelRoutes] Extracted components:', {
    count: components.length,
    components: components.map(c => `${c.vendor}:${c.product}:${c.version}`)
  });

  if (!nvdData.vulnerabilities || !Array.isArray(nvdData.vulnerabilities)) {
    return { ...nvdData, vulnerabilities: [] };
  }

  const filteredVulnerabilities = nvdData.vulnerabilities.filter(vuln => {
    if (!vuln.cve || !vuln.cve.configurations) return false;
    return matchesCPE(vuln.cve.configurations, components);
  });

  return {
    ...nvdData,
    vulnerabilities: filteredVulnerabilities
  };
}
*/

// Initialize LangExtract client
const langExtractClient = new LangExtractClient();

/**
 * POST /api/threat-intel/extract
 * Extract structured threat intelligence from raw content
 */
router.post('/extract', async (req, res) => {
  try {
    const { rawContent, diagram } = req.body;

    if (!rawContent) {
      return res.status(400).json({ success: false, error: 'Raw content is required' });
    }

    if (!diagram || !diagram.nodes) {
      return res.status(400).json({ success: false, error: 'Diagram data is required' });
    }

    logger.info('[ThreatIntelRoutes] Processing threat intelligence extraction (pattern-matching mode)', {
      contentLength: rawContent.length,
      nodeCount: diagram.nodes.length
    });

    // COMMENTED OUT: AI-based NVD pre-processing - keeping for potential future use
    // Currently using pattern matching as primary method for reliability
    /*
    try {
      if (rawContent.includes('"format" : "NVD_CVE"') || rawContent.includes('"format": "NVD_CVE"')) {
        isNVDData = true;
        logger.info('[ThreatIntelRoutes] Detected NVD JSON format, pre-processing...');

        const nvdData = JSON.parse(rawContent);
        const relevantCVEs = filterNVDByComponents(nvdData, diagram.nodes);

        logger.info('[ThreatIntelRoutes] NVD pre-processing complete', {
          totalCVEs: nvdData.vulnerabilities?.length || 0,
          filteredCVEs: relevantCVEs.vulnerabilities?.length || 0
        });

        processedContent = JSON.stringify(relevantCVEs, null, 2);
      }
    } catch (parseError) {
      logger.warn('[ThreatIntelRoutes] Failed to pre-process NVD data:', parseError);
      // Continue with original content if parsing fails
    }
    */

    // Pattern matching as primary method
    logger.info('[ThreatIntelRoutes] Using pattern matching for threat intelligence extraction');

    // Extract components for filtering
    const components = extractComponentInfo(diagram.nodes);

    // Filter the content based on system components first
    const filteredContent = filterThreatIntelligence(rawContent, components);

    // Use pattern matching on the filtered content
    logger.info('[ThreatIntelRoutes] Using pattern matching on filtered content');
    let extractedIntel = langExtractClient.fallbackParsing(filteredContent);

    // Update extraction metadata to reflect filtering
    const originalCount = rawContent.match(/CVE-\d{4}-\d+/gi)?.length || 0;
    const filteredCount = extractedIntel.recentCVEs ? extractedIntel.recentCVEs.split('\n').filter(line => line.trim()).length : 0;

    // Check if filtered content has metadata
    let filterMetadata = {};
    try {
      const parsedFiltered = JSON.parse(filteredContent);
      if (parsedFiltered._filterMetadata) {
        filterMetadata = parsedFiltered._filterMetadata;
      }
    } catch (e) {
      // Not JSON, use basic counts
    }

    extractedIntel.extractionMetadata = {
      ...extractedIntel.extractionMetadata,
      filtering: 'advanced-component-based',
      original_items: filterMetadata.original_count || originalCount,
      filtered_items: filterMetadata.filtered_count || filteredCount,
      filter_reduction: originalCount > 0 ? Math.round((1 - filteredCount / originalCount) * 100) : 0,
      matched_components: filterMetadata.matched_components || components.map(c => c.label),
      message: `Filtered ${filterMetadata.original_count || originalCount} items down to ${filterMetadata.filtered_count || filteredCount} relevant ones based on system components`
    };

    // Removed legacy AI-based extraction and caching paths – simplified per new design

    logger.info('[ThreatIntelRoutes] Extraction completed', {
      method: 'pattern_matching',
      originalSize: rawContent.length,
      hasRecentCVEs: !!extractedIntel.recentCVEs,
      hasKnownIOCs: !!extractedIntel.knownIOCs,
      hasThreatActors: !!extractedIntel.threatActors,
      cveCount: extractedIntel.recentCVEs ? extractedIntel.recentCVEs.split('\n').filter(line => line.trim()).length : 0,
      iocCount: extractedIntel.knownIOCs ? extractedIntel.knownIOCs.split('\n').filter(line => line.trim()).length : 0
    });

    res.json({
      success: true,
      extractedIntel
    });
    
  } catch (error) {
    logger.error('[ThreatIntelRoutes] Extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract threat intelligence'
    });
  }
});

module.exports = router;
