/**
 * Web Search Configuration for Anthropic AI Integration
 * 
 * Defines allowed domains for threat intelligence gathering and search parameters
 * for the Anthropic web search API when analyzing system diagrams.
 */

const webSearchConfig = {
  // Enable/disable web search globally
  enabled: true,
  
  // Maximum number of searches per analysis
  defaultMaxSearches: 5,
  
  // Search timeout in milliseconds
  searchTimeout: 30000,
  
  // Allowed CTI (Cyber Threat Intelligence) domains
  allowedDomains: {
    // Primary Vulnerability Databases
    vulnerabilityDatabases: [
      'nvd.nist.gov',              // National Vulnerability Database
      'cve.mitre.org',             // MITRE CVE database
      'cvedetails.com',            // CVE details and statistics
      'vulndb.cyberriskanalytics.com', // VulnDB
      'osv.dev',                   // Google's Open Source Vulnerabilities
      'snyk.io',                   // Snyk vulnerability database
      'security.snyk.io'           // Snyk security advisories
    ],
    
    // Threat Intelligence Platforms
    threatIntelligence: [
      'attack.mitre.org',          // MITRE ATT&CK framework
      'otx.alienvault.com',        // AlienVault Open Threat Exchange
      'cisa.gov',                  // CISA advisories and alerts
      'us-cert.cisa.gov',          // US-CERT vulnerability notes
      'cert.org',                  // CERT Coordination Center
      'ic3.gov',                   // FBI Internet Crime Complaint Center
      'cyber.dhs.gov'              // DHS Cybersecurity
    ],
    
    // Security Vendor Intelligence
    securityVendors: [
      'securelist.com',            // Kaspersky research
      'blog.talosintelligence.com', // Cisco Talos
      'research.checkpoint.com',    // Check Point Research
      'unit42.paloaltonetworks.com', // Unit 42 research
      'mandiant.com',              // Mandiant threat research
      'crowdstrike.com/blog',      // CrowdStrike intelligence
      'sentinelone.com/labs',      // SentinelOne Labs
      'trendmicro.com/vinfo',      // Trend Micro
      'symantec-enterprise-blogs.security.com', // Broadcom (Symantec)
      'mcafee.com/blogs',          // McAfee/Trellix
      'f-secure.com/en/business/solutions/threat-intelligence', // F-Secure
      'sophos.com/en-us/labs',     // Sophos Labs
      'fortinet.com/blog/threat-research' // FortiGuard Labs
    ],
    
    // Exploit and PoC Resources
    exploitResources: [
      'exploit-db.com',            // Exploit Database
      'packetstormsecurity.com',   // Packet Storm
      'rapid7.com/db',             // Rapid7 Vulnerability & Exploit Database
      'zerodayinitiative.com',     // Zero Day Initiative
      'exploitalert.com'           // Exploit Alert
    ],
    
    // Security News and Analysis
    securityNews: [
      'threatpost.com',            // Threat intelligence news
      'securityweek.com',          // Security news and analysis
      'bleepingcomputer.com',      // Technical security coverage
      'thehackernews.com',         // Security news
      'krebsonsecurity.com',       // Brian Krebs security research
      'darkreading.com',           // Dark Reading
      'infosecurity-magazine.com', // Infosecurity Magazine
      'securityaffairs.com',       // Security Affairs
      'cyberscoop.com'             // CyberScoop
      // Removed zdnet.com as it's not accessible to Anthropic's web search
    ],
    
    // GitHub Security
    githubSecurity: [
      'github.com/advisories',     // GitHub Security Advisories
      'github.blog/category/security' // GitHub Security Blog
    ],
    
    // Cloud Provider Security
    cloudProviders: [
      'aws.amazon.com/security/security-bulletins', // AWS Security
      'msrc.microsoft.com',        // Microsoft Security Response Center
      'cloud.google.com/security/bulletins', // Google Cloud Security
      'security.oracle.com',       // Oracle Security Alerts
      'kb.vmware.com/security'     // VMware Security Advisories
    ],
    
    // Industry-Specific Resources
    industrySpecific: [
      'ics-cert.us-cert.gov',      // Industrial Control Systems
      'fda.gov/medical-devices/digital-health', // Medical Device Security
      'nerc.com',                  // Energy sector (NERC)
      'fsisac.com'                 // Financial Services ISAC
    ]
  },
  
  // Search query templates for different scenarios
  searchTemplates: {
    // For specific CVE lookup
    cveSearch: (cveId) => `${cveId} vulnerability details severity CVSS`,
    
    // For component vulnerability search
    componentVuln: (vendor, product, version) => 
      `"${vendor} ${product}" ${version ? `"${version}"` : ''} vulnerability CVE critical high`,
    
    // For recent threats
    recentThreats: (component) => 
      `"${component}" vulnerability 2024 zero-day exploit critical`,
    
    // For MITRE ATT&CK techniques
    mitreSearch: (technique) => 
      `MITRE ATT&CK ${technique} real-world usage examples`,
    
    // For threat actor research
    threatActor: (actor) => 
      `"${actor}" threat actor TTPs targets campaigns 2024`,
    
    // For exploit availability
    exploitSearch: (cve) => 
      `${cve} exploit PoC proof-of-concept metasploit`,
    
    // For patch/mitigation info
    mitigationSearch: (vendor, product) => 
      `"${vendor} ${product}" security patch advisory mitigation`
  },
  
  // Context enhancement rules
  searchTriggers: {
    // Trigger search when these conditions are met
    versionSpecified: true,      // Component has specific version
    criticalComponent: true,     // Component marked as critical
    internetFacing: true,        // Component in DMZ or internet zone
    knownVulnerable: true,       // Component has known vulnerabilities
    missingPatches: true,        // Component patch level is outdated
    defaultCredentials: true,    // Component uses default credentials
    unencrypted: true,          // Connection is unencrypted
    
    // Component types that always trigger search
    alwaysSearchComponents: [
      'web server',
      'application server',
      'database',
      'firewall',
      'load balancer',
      'api gateway',
      'authentication service',
      'vpn server'
    ]
  },
  
  // Response processing
  resultProcessing: {
    maxResultsPerSearch: 5,      // Maximum results to include per search
    includeCitations: true,      // Always include source citations
    summarizeResults: true,      // Summarize long results
    deduplicateFindings: true,   // Remove duplicate vulnerabilities
    prioritizeBySeverity: true,  // Sort by CVSS score
    
    // Severity thresholds
    severityLevels: {
      critical: 9.0,   // CVSS >= 9.0
      high: 7.0,       // CVSS >= 7.0
      medium: 4.0,     // CVSS >= 4.0
      low: 0.0         // CVSS >= 0.0
    }
  },
  
  // Rate limiting
  rateLimiting: {
    maxSearchesPerMinute: 20,
    maxSearchesPerHour: 200,
    maxSearchesPerDay: 1000
  }
};

/**
 * Get all allowed domains as a flat array
 */
function getAllowedDomains() {
  return Object.values(webSearchConfig.allowedDomains).flat();
}

/**
 * Check if a domain is allowed
 */
function isDomainAllowed(domain) {
  const allowedList = getAllowedDomains();
  return allowedList.some(allowed => 
    domain === allowed || domain.endsWith(`.${allowed}`)
  );
}

/**
 * Get domains by category
 */
function getDomainsByCategory(category) {
  return webSearchConfig.allowedDomains[category] || [];
}

/**
 * Build search query based on component info
 */
function buildSearchQuery(component, searchType = 'vulnerability') {
  const { vendor, product, version, technology } = component;
  
  switch (searchType) {
    case 'vulnerability':
      return webSearchConfig.searchTemplates.componentVuln(
        vendor || technology || 'unknown',
        product || component.label || 'component',
        version
      );
    
    case 'recent':
      return webSearchConfig.searchTemplates.recentThreats(
        product || technology || component.label
      );
    
    case 'exploit':
      if (component.cve) {
        return webSearchConfig.searchTemplates.exploitSearch(component.cve);
      }
      return null;
    
    case 'mitigation':
      return webSearchConfig.searchTemplates.mitigationSearch(
        vendor || technology || 'vendor',
        product || component.label || 'product'
      );
    
    default:
      return null;
  }
}

/**
 * Determine if a component should trigger web search
 */
function shouldSearchComponent(component, zone) {
  const triggers = webSearchConfig.searchTriggers;
  
  // Check specific conditions
  if (component.version && triggers.versionSpecified) return true;
  if (component.securityLevel === 'critical' && triggers.criticalComponent) return true;
  if ((zone === 'dmz' || zone === 'internet') && triggers.internetFacing) return true;
  if (component.vulnerabilities?.length > 0 && triggers.knownVulnerable) return true;
  if (component.patchLevel === 'outdated' && triggers.missingPatches) return true;
  if (component.hasDefaultCredentials && triggers.defaultCredentials) return true;
  
  // Check component type
  const componentType = (component.type || component.label || '').toLowerCase();
  return triggers.alwaysSearchComponents.some(type => 
    componentType.includes(type)
  );
}

module.exports = webSearchConfig;
module.exports.getAllowedDomains = getAllowedDomains;
module.exports.isDomainAllowed = isDomainAllowed;
module.exports.getDomainsByCategory = getDomainsByCategory;
module.exports.buildSearchQuery = buildSearchQuery;
module.exports.shouldSearchComponent = shouldSearchComponent;