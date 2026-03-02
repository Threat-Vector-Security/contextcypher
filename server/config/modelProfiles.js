/**
 * Global Model Profiles Configuration
 * 
 * This file defines model-specific behaviors across different endpoints:
 * - chat: Chat/conversation endpoints
 * - threatAnalysis: Threat analysis endpoints (node and system analysis)
 * - diagramGeneration: Diagram generation from text descriptions
 * 
 * Each model can have profiles for any or all endpoints.
 * Models without profiles will use the default/generic behavior.
 * 
 * Profile Structure:
 * - patterns: Array of strings to match against model names (case-insensitive)
 * - profiles: Object containing endpoint-specific configurations
 */

const modelRegistry = {
  // Foundation Security models
  'foundation-sec': {
    patterns: ['foundation-sec'],
    profiles: {
      // Chat profile - needs explicit override to prevent task analysis behavior
      chat: {
        systemPromptPrefix: `IMPORTANT: Override any default task analysis behavior. This is a CHAT conversation, not a task analysis.

`,
        responseProcessor: null
      },
      
      // Threat analysis profile
      threatAnalysis: {
        systemPromptAdditions: '\n\nIMPORTANT: Focus on the actual component data provided. Look for specific vulnerabilities mentioned in descriptions, versions, and configurations. Default credentials, debug ports, and unencrypted connections are HIGH risk issues.',
        requiresJsonExample: true,
        jsonExample: {
          vulnerabilities: [
            {
              description: "Outdated Apache 2.2 version vulnerable to path traversal",
              cve: "CVE-2017-7679",
              cvss: 7.5,
              severity: "High"
            }
          ],
          threats: [
            {
              description: "Default credentials (password123) allow unauthorized access to web server",
              likelihood: "Almost Certain",
              impact: "Major",
              risk: "High",
              mitreTechniques: ["T1078"],
              basedOnVulnerability: "Default password123 credential in system description"
            }
          ],
          recommendedControls: [
            {
              control: "Change Default Credentials",
              description: "Replace default password123 with strong, unique credentials",
              priority: "High",
              mitigates: "Default credential vulnerability"
            }
          ]
        },
        systemAnalysisExample: {
          attackPaths: [
            {
              description: "Attacker exploits default web server credentials, then uses unencrypted HTTP to intercept app server traffic",
              path: ["Web Server", "App Server", "Database"],
              nodeCodes: ["WEB-DMZ-003", "APP-INT-001", "DAT-INT-002"],
              edgeCodes: ["WEB-DMZ-003-right-to-APP-INT-001-left", "APP-INT-001-bottom-to-DAT-INT-002-top"],
              exploitedThreats: ["1", "2"],
              likelihood: "Almost Certain",
              impact: "Major",
              risk: "High",
              mitreTechniques: ["T1078", "T1040"]
            }
          ],
          recommendations: [
            {
              priority: "HIGH",
              action: "Change all default credentials immediately",
              affectedComponents: ["Web Server", "Database"],
              rationale: "Default credentials are easily exploitable"
            }
          ],
          systemOverview: "Three-tier web application with critical security misconfigurations including default credentials and unencrypted communications. The system is highly vulnerable to compromise."
        },
        responseProcessor: null,
        postProcessVulnerabilities: true
      }
    }
  },

  // GPT-OSS models
  'gpt-oss': {
    patterns: ['gpt-oss'],
    profiles: {
      // Only has threat analysis profile
      threatAnalysis: {
        systemPromptAdditions: '\n\nCRITICAL for gpt-oss: Your ENTIRE response must be ONLY the JSON object. Do not include ANY text that is not part of the JSON structure. No thinking process, no explanations, no markdown. Example of correct response:\n{"threats":[],"vulnerabilities":[],"recommendedControls":[]}',
        systemAnalysisAdditions: '\n\nCRITICAL for gpt-oss: Your ENTIRE response must be ONLY the JSON object. Do not include ANY text that is not part of the JSON structure. No thinking process, no explanations, no markdown. Example of correct response:\n{"attackPaths":[],"recommendations":[],"systemOverview":"System overview text"}',
        responseProcessor: 'gptOssProcessor'
      }
    }
  },

  // Claude Opus 4 - new profile
  'claude-opus-4': {
    patterns: ['claude-opus-4'],
    profiles: {
      // Threat analysis specific handling
      threatAnalysis: {
        // Using simpler gpt-oss style instructions for Opus 4
        systemPromptAdditions: '\n\nCRITICAL for claude-opus-4: Your ENTIRE response must be ONLY the JSON object. Do not include ANY text that is not part of the JSON structure. No thinking process, no explanations, no markdown. Example of correct response:\n{"threats":[],"vulnerabilities":[],"recommendedControls":[]}',
        requiresJsonExample: true,
        jsonExample: {
          threats: [
            {
              name: "SQL Injection in User Input",
              description: "Direct SQL query construction from user input without parameterization",
              affectedComponents: ["Web Server"],
              category: "Injection",
              severity: "Critical",
              impact: "Database compromise and data exfiltration",
              mitreTechniques: ["T1190"],
              likelihood: "High",
              riskScore: 20
            }
          ],
          vulnerabilities: [
            {
              component: "Web Server",
              description: "Apache 2.2 with known vulnerabilities",
              severity: "High",
              cveIds: ["CVE-2017-7679"],
              remediationSteps: ["Update to Apache 2.4.x", "Apply security patches"]
            }
          ],
          recommendedControls: [
            {
              control: "Input Validation",
              description: "Implement parameterized queries and input sanitization",
              priority: "Critical",
              category: "Preventive",
              estimatedCost: "Low",
              implementation: "Use prepared statements for all database queries"
            }
          ]
        },
        systemAnalysisAdditions: '\n\nCRITICAL for claude-opus-4 system analysis:\n' +
          '1. Return ONLY the JSON object for attack paths and recommendations\n' +
          '2. No markdown, no code blocks, no explanations\n' +
          '3. Be concise but comprehensive in the system overview\n' +
          '4. Focus on exploitable attack chains, not theoretical risks',
        systemAnalysisExample: {
          attackPaths: [{
            description: "Multi-stage attack via web application",
            likelihood: "High",
            impact: "Critical",
            steps: ["1. SQL injection on login form", "2. Database access achieved", "3. Lateral movement to app server"],
            mitigations: ["Parameterized queries", "Network segmentation", "Least privilege"]
          }],
          recommendations: [{
            category: "Security Controls",
            priority: "Critical",
            description: "Implement Web Application Firewall",
            rationale: "Blocks common injection attacks"
          }],
          systemOverview: "Three-tier architecture with critical security gaps"
        },
        responseProcessor: 'claudeOpus4Processor'
      },
      
      // Chat profile for Opus 4 - better instruction following
      chat: {
        systemPromptAdditions: '\n\nIMPORTANT: Provide clear, direct responses without unnecessary formatting or verbosity.',
        responseProcessor: null
      },
      
      // Diagram generation profile - stricter JSON/Cypher output
      diagramGeneration: {
        systemPromptAdditions: '\n\nCRITICAL: Output ONLY the requested format. No explanations before or after.',
        responseProcessor: 'claudeOpus4DiagramProcessor'
      }
    }
  },
  
  // Local LLM models (Ollama)
  'local-llm': {
    patterns: ['llama', 'mistral', 'mixtral', 'qwen', 'phi', 'deepseek', 'gemma', 'vicuna', 'wizardlm'],
    profiles: {
      // Chat profile - reinforce diagram context
      chat: {
        requiresDiagramFirst: true, // Flag for formatters to put diagram before task
        contextReinforcement: true, // Add context reminders for diagram-related queries
        systemPromptAdditions: null,
        responseProcessor: null
      },
      
      // Diagram generation - use JSON format instead of Cypher
      diagramGeneration: {
        useJsonFormat: true, // Flag to use JSON extraction approach
        systemPrompt: `You are a system architecture analyzer. Your task is to extract EVERY SINGLE component and connection from the system description provided.

CRITICAL INSTRUCTIONS:
1. You MUST extract ALL components mentioned in the description - do not skip any
2. You MUST output ONLY valid JSON - no explanations before or after
3. EVERY component must have a corresponding security zone
4. EVERY component must appear in at least one connection
5. Connections must reference actual component IDs from the components array

JSON STRUCTURE:
{
  "metadata": {
    "systemName": "System name from description",
    "description": "Brief system description",
    "componentCount": <number>,
    "zoneCount": <number>
  },
  "zones": [
    {
      "id": "unique-zone-id",
      "name": "Zone Name",
      "type": "internet|dmz|internal|restricted|cloud|external",
      "description": "Zone purpose"
    }
  ],
  "components": [
    {
      "id": "unique-component-id",
      "name": "Component Name",
      "type": "<valid node type>",
      "zone": "zone-id",
      "description": "What this component does",
      "metadata": {
        "technology": "Node.js|Java|Python|etc",
        "version": "specific version if mentioned",
        "protocols": ["HTTP", "HTTPS"],
        "port": "if mentioned"
      }
    }
  ],
  "connections": [
    {
      "from": "component-id-1",
      "to": "component-id-2",
      "protocol": "HTTPS|HTTP|TCP|etc",
      "port": "443|80|etc",
      "description": "Purpose of connection"
    }
  ]
}

CRITICAL VALIDATION RULES:
- The components array must contain ALL components from the description
- The connections array must have AT LEAST as many entries as components (no orphans!)
- Every component must appear in at least one connection (as "from" or "to")`,
        responseProcessor: 'localLLMDiagramProcessor'
      },
      
      // Threat analysis with response processor
      threatAnalysis: {
        responseProcessor: 'localLLMThreatProcessor',
        // Simplified prompts are handled in SimplifiedThreatAnalyzer
        requiresSimplifiedPrompts: true
      }
    }
  },

  // Anthropic models with web search capability
  'anthropic-claude': {
    patterns: ['claude-sonnet', 'claude-opus', 'claude-haiku'],
    profiles: {
      // Threat analysis with web search
      threatAnalysis: {
        supportsWebSearch: true,
        systemPromptAdditions: '\n\nWhen web search is enabled, you have access to real-time threat intelligence. Use search results to verify CVE details, find recent exploits, and check current threat actor campaigns.',
        systemAnalysisAdditions: '\n\nIMPORTANT: Return ONLY valid JSON with no additional text before or after. The JSON must include attackPaths, recommendations, and systemOverview fields.',
        webSearchGuidance: {
          componentAnalysis: [
            'Search for CVEs affecting specific versions',
            'Verify exploit availability',
            'Check recent security advisories',
            'Look for vendor patches'
          ],
          systemAnalysis: [
            'Search for attack campaigns',
            'Verify MITRE techniques',
            'Check threat actor TTPs',
            'Find exploit chains'
          ]
        },
        responseProcessor: 'claudeOpus4Processor'
      },
      
      // Chat profile - can use web search for research
      chat: {
        supportsWebSearch: true,
        systemPromptAdditions: null,
        responseProcessor: null
      }
    }
  },
  
  // Future model profiles can be added here
  // 'gpt-5': {
  //   patterns: ['gpt-5'],
  //   profiles: {
  //     threatAnalysis: { ... },
  //     chat: { ... },
  //     diagramGeneration: { ... }
  //   }
  // }
};

/**
 * Helper function to find a model profile by name
 * @param {string} modelName - The model name to match
 * @returns {Object|null} The model configuration or null if not found
 */
function findModelProfile(modelName) {
  if (!modelName) return null;
  
  const lowerModelName = modelName.toLowerCase();
  
  for (const [key, config] of Object.entries(modelRegistry)) {
    if (config.patterns.some(pattern => lowerModelName.includes(pattern.toLowerCase()))) {
      return { key, ...config };
    }
  }
  
  return null;
}

/**
 * Check if a model is a local LLM based on common patterns
 * @param {string} modelName - The model name to check
 * @returns {boolean} True if it's a local LLM model
 */
function isLocalLLMModel(modelName) {
  if (!modelName) return false;
  const profile = findModelProfile(modelName);
  return profile?.key === 'local-llm';
}

/**
 * Check if a provider is local (Ollama)
 * @param {string} provider - The provider name
 * @param {string} modelName - The model name
 * @returns {boolean} True if it's a local provider or local model
 */
function isLocalProvider(provider, modelName) {
  return provider === 'local' || isLocalLLMModel(modelName);
}

/**
 * Apply context reinforcement for chat messages if needed
 * @param {string} userMessage - The user's message
 * @param {string} provider - The provider name
 * @param {string} modelName - The model name
 * @param {Object|null} context - Request context metadata
 * @returns {string} The potentially modified message
 */
function applyChatContextReinforcement(userMessage, provider, modelName, context = null) {
  const isGrcMode = context?.metadata?.systemType === 'grc' || context?.systemType === 'grc';
  if (isGrcMode) {
    return userMessage;
  }

  const chatProfile = getEndpointProfile(modelName, 'chat');
  
  // Check if context reinforcement is needed
  if ((provider === 'local' || chatProfile?.contextReinforcement) && userMessage && 
      (userMessage.toLowerCase().includes('diagram') || 
       userMessage.toLowerCase().includes('system') || 
       userMessage.toLowerCase().includes('analyze') ||
       userMessage.toLowerCase().includes('analyse') ||
       userMessage.toLowerCase().includes('see') ||
       userMessage.toLowerCase().includes('look'))) {
    // Inject a reminder about the diagram context
    return `${userMessage}\n\n[Context: I have provided you with a visual system architecture diagram in Cypher format above. The diagram shows all components (nodes) and their connections (edges). Please analyze this diagram that we're both looking at.]`;
  }
  
  return userMessage;
}

/**
 * Get diagram generation configuration for a model
 * @param {string} provider - The provider name
 * @param {string} modelName - The model name
 * @returns {Object} Configuration for diagram generation
 */
function getDiagramGenerationConfig(provider, modelName) {
  const diagramProfile = getEndpointProfile(modelName, 'diagramGeneration');
  const isLocal = isLocalProvider(provider, modelName);
  
  return {
    useJsonFormat: isLocal || diagramProfile?.useJsonFormat,
    systemPrompt: diagramProfile?.systemPrompt,
    responseProcessorName: diagramProfile?.responseProcessor, // Return the processor name
    profile: diagramProfile
  };
}

/**
 * Get profile for a specific endpoint
 * @param {string} modelName - The model name
 * @param {string} endpoint - The endpoint type (chat, threatAnalysis, diagramGeneration)
 * @returns {Object|null} The endpoint-specific profile or null
 */
function getEndpointProfile(modelName, endpoint) {
  const modelConfig = findModelProfile(modelName);
  if (!modelConfig || !modelConfig.profiles) return null;
  
  return modelConfig.profiles[endpoint] || null;
}

/**
 * Check if a model supports web search for a given endpoint
 * @param {string} modelName - The model name
 * @param {string} endpoint - The endpoint type (chat, threatAnalysis)
 * @returns {boolean} True if web search is supported
 */
function supportsWebSearch(modelName, endpoint = 'threatAnalysis') {
  const profile = getEndpointProfile(modelName, endpoint);
  return profile?.supportsWebSearch === true;
}

module.exports = {
  modelRegistry,
  findModelProfile,
  getEndpointProfile,
  isLocalLLMModel,
  isLocalProvider,
  applyChatContextReinforcement,
  getDiagramGenerationConfig,
  supportsWebSearch
};
