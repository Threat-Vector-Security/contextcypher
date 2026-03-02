/**
 * Advanced threat intelligence filtering utilities
 * Provides precise component-based filtering for CVEs and threat data
 */

const logger = require('./logger-wrapper');

/**
 * Filter NVD JSON vulnerabilities by system components
 * Uses strict CPE and description matching for high relevance
 */
function filterNVDVulnerabilities(vulnerabilities, components) {
  // Build lookup structures for efficient matching
  const componentLookup = new Map();
  const vendorProductPairs = new Set();
  const productOnlySet = new Set();

  components.forEach(comp => {
    const key = `${comp.vendor}:${comp.product}`.toLowerCase();
    componentLookup.set(key, comp);

    if (comp.vendor && comp.vendor !== '*') {
      vendorProductPairs.add(key);
    }
    if (comp.product) {
      productOnlySet.add(comp.product.toLowerCase());
    }
  });

  // Filter vulnerabilities
  const filtered = vulnerabilities.filter(vuln => {
    const cve = vuln.cve || {};

    // 1. Check CPE configurations for exact matches (highest confidence)
    if (cve.configurations) {
      for (const config of cve.configurations) {
        if (config.nodes) {
          for (const node of config.nodes) {
            if (node.cpeMatch) {
              for (const cpeMatch of node.cpeMatch) {
                if (cpeMatch.vulnerable && cpeMatch.criteria) {
                  const criteria = cpeMatch.criteria.toLowerCase();
                  // CPE format: cpe:2.3:part:vendor:product:version:...
                  const cpeParts = criteria.split(':');
                  if (cpeParts.length >= 5) {
                    const cpeVendor = cpeParts[3];
                    const cpeProduct = cpeParts[4];
                    const cpeKey = `${cpeVendor}:${cpeProduct}`;

                    // Check for exact vendor:product match
                    if (vendorProductPairs.has(cpeKey)) {
                      return true;
                    }

                    // Check for product-only match for common products
                    if (productOnlySet.has(cpeProduct)) {
                      // Verify it's a real match by checking common products
                      const commonProducts = ['tomcat', 'mysql', 'nginx', 'apache', 'jenkins',
                                            'docker', 'elasticsearch', 'redis', 'postgresql'];
                      if (commonProducts.includes(cpeProduct)) {
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
    }

    // 2. Check descriptions for component matches (medium confidence)
    if (cve.descriptions) {
      const descText = cve.descriptions.map(d => (d.value || '').toLowerCase()).join(' ');

      // Look for vendor:product pairs in description
      for (const pair of vendorProductPairs) {
        const [vendor, product] = pair.split(':');
        // Both vendor and product should appear near each other
        const vendorIndex = descText.indexOf(vendor);
        const productIndex = descText.indexOf(product);
        if (vendorIndex >= 0 && productIndex >= 0 && Math.abs(vendorIndex - productIndex) < 50) {
          return true;
        }
      }

      // Check for specific product mentions with version context
      for (const product of productOnlySet) {
        if (product.length > 3) {
          // Look for product with version indicators nearby
          const productPattern = new RegExp(
            `\\b${product}\\b.{0,30}(\\d+\\.\\d+|version|before|through|prior to|affected|vulnerable)`,
            'i'
          );
          if (productPattern.test(descText)) {
            // Additional check: ensure it's not a false positive
            const falsePositiveTerms = ['not affected', 'not vulnerable', 'does not affect'];
            const contextStart = Math.max(0, descText.indexOf(product) - 20);
            const contextEnd = Math.min(descText.length, descText.indexOf(product) + product.length + 20);
            const context = descText.substring(contextStart, contextEnd);

            if (!falsePositiveTerms.some(term => context.includes(term))) {
              return true;
            }
          }
        }
      }
    }

    return false;
  });

  return filtered;
}

/**
 * Filter text-based threat intelligence by components
 * Uses context-aware matching for CVEs, IOCs, and threat actors
 */
function filterTextThreatIntel(content, components) {
  const lines = content.split('\n');
  const productSet = new Set();
  const vendorProductPairs = new Set();

  components.forEach(comp => {
    if (comp.product) {
      productSet.add(comp.product.toLowerCase());
    }
    if (comp.vendor && comp.vendor !== '*' && comp.product) {
      vendorProductPairs.add(`${comp.vendor.toLowerCase()}:${comp.product.toLowerCase()}`);
    }
  });

  const relevantLines = [];
  const contextWindow = 3; // Look at surrounding lines for context

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();
    let isRelevant = false;

    // CVE matching with context
    if (line.match(/CVE-\d{4}-\d+/)) {
      // Check current line and surrounding lines for component mentions
      const startIdx = Math.max(0, i - contextWindow);
      const endIdx = Math.min(lines.length - 1, i + contextWindow);

      for (let j = startIdx; j <= endIdx; j++) {
        const contextLine = lines[j].toLowerCase();

        // Check vendor:product pairs
        for (const pair of vendorProductPairs) {
          const [vendor, product] = pair.split(':');
          if (contextLine.includes(vendor) && contextLine.includes(product)) {
            isRelevant = true;
            break;
          }
        }

        // Check individual products
        if (!isRelevant) {
          for (const product of productSet) {
            if (product.length > 3 && contextLine.includes(product)) {
              isRelevant = true;
              break;
            }
          }
        }

        if (isRelevant) break;
      }
    }

    // IOC matching - only if associated with our components
    else if (line.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/) ||  // IP
             line.match(/[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}/) ||  // Domain
             line.match(/\b[a-f0-9]{32,64}\b/i)) {  // Hash

      // Check if any component is mentioned in the same line
      for (const product of productSet) {
        if (product.length > 3 && lineLower.includes(product)) {
          isRelevant = true;
          break;
        }
      }
    }

    // Threat actor matching - only if targeting our tech
    else if (line.match(/apt\d+|lazarus|cozy bear|fancy bear|fin\d+|ta\d+/i)) {
      // Must mention one of our technologies
      for (const product of productSet) {
        if (product.length > 3 && lineLower.includes(product)) {
          isRelevant = true;
          break;
        }
      }
    }

    if (isRelevant) {
      relevantLines.push(line);
    }
  }

  return relevantLines.join('\n');
}

/**
 * Main filtering function that handles both JSON and text content
 */
function filterThreatIntelligence(content, components) {
  // Try to parse as JSON first
  try {
    const jsonData = JSON.parse(content);
    if (jsonData.vulnerabilities && Array.isArray(jsonData.vulnerabilities)) {
      const filtered = filterNVDVulnerabilities(jsonData.vulnerabilities, components);

      logger.info('[ThreatIntelFilter] Filtered NVD JSON:', {
        original: jsonData.vulnerabilities.length,
        filtered: filtered.length,
        reduction: `${Math.round((1 - filtered.length / jsonData.vulnerabilities.length) * 100)}%`
      });

      return JSON.stringify({
        ...jsonData,
        vulnerabilities: filtered,
        _filterMetadata: {
          original_count: jsonData.vulnerabilities.length,
          filtered_count: filtered.length,
          matched_components: components.map(c => c.label || `${c.vendor}:${c.product}`)
        }
      });
    }
  } catch (e) {
    // Not JSON, continue with text filtering
  }

  // Filter as text
  const filtered = filterTextThreatIntel(content, components);
  const originalLines = content.split('\n').length;
  const filteredLines = filtered.split('\n').filter(l => l.trim()).length;

  logger.info('[ThreatIntelFilter] Filtered text content:', {
    originalLines,
    filteredLines,
    reduction: `${Math.round((1 - filteredLines / originalLines) * 100)}%`
  });

  return filtered;
}

module.exports = {
  filterThreatIntelligence,
  filterNVDVulnerabilities,
  filterTextThreatIntel
};