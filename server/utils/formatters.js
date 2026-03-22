// server/utils/formatters.js
const logger = require('../utils/logger-wrapper');
const { MODEL_TOKEN_LIMITS, TOKEN_TO_CHAR_RATIO } = require('./modelConstants');
const DiagramIndexReader = require('../services/DiagramIndexReader');
const MessageCompactionService = require('../services/MessageCompactionService');
const { getEndpointProfile, isLocalLLMModel } = require('../config/modelProfiles');

function escapeCypher(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Helper: produce legend lines "CODE : Label (Zone)" for every non-zone node
function buildLegend(diagram, indexer) {
  if (!diagram) return '';
  return diagram.nodes
    .filter(n => n.type !== 'securityZone')
    .map(n => {
      const code = indexer.nodeToCode.get(n.id) || n.id;
      const label = n.data?.label || n.id;
      const zone  = n.data?.zone  || 'Unknown';
      return `${code.padEnd(15)} : ${label} (${zone})`;
    })
    .join('\n');
}

// Helper: produce legend lines for edges "ECODE : Label (Protocol)"
function buildConnectionLegend(diagram, indexer) {
  if (!diagram || !diagram.edges) return '';
  return diagram.edges
    .map(e => {
      const code = indexer.edgeToCode.get(e.id) || e.id;
      const label = e.data?.label || `Conn ${e.id}`;
      const prot  = e.data?.protocol || 'unknown';
      const srcZone = diagram.nodes.find(n=> n.id===e.source)?.data?.zone || 'Unk';
      const tgtZone = diagram.nodes.find(n=> n.id===e.target)?.data?.zone || 'Unk';
      return `${code.padEnd(25)} : ${label} (${srcZone}→${tgtZone}, ${prot})`;
    })
    .join('\n');
}

// Chat system prompt - for general conversation
const CHAT_SYSTEM_PROMPT = `You are **ContextCypher**, the built-in AI assistant inside the "AI-Threat-Modeler" desktop application.

• You and the user are looking at the *same* visual diagram (rendered below in Cypher format when available).
• You're a knowledgeable cybersecurity expert who can discuss threats, architecture, and security concepts.
• Respond naturally and conversationally, adapting your tone to the user's question.
• When discussing the diagram, reference specific components by their labels or index codes.
• Be helpful, informative, and engaging - not just focused on formal threat analysis.

CRITICAL FORMATTING RULES:
- DO NOT use asterisks (*) or hashtags (#) for any formatting
- DO NOT use **bold**, *italic*, or any markdown syntax  
- DO NOT use ## headers or ### subheaders
- Use plain text with simple bullet points (•) only
- Write section titles as plain text on their own lines
- Keep all formatting minimal and clean
- Never use **, *, ###, ##, or # symbols for emphasis

Write naturally without markdown decorations.

CRITICAL ACCURACY REQUIREMENTS:
- ALWAYS use the EXACT version numbers provided in the diagram (e.g., Apache 2.4.29, PHP 7.1.2)
- NEVER obfuscate, generalize, or change version numbers (don't say "Apache 2.x" when "2.4.29" is specified)
- Only report CVE numbers that ACTUALLY exist and affect the EXACT versions specified
- If you're unsure about a CVE, state that explicitly rather than inventing one
- Maintain absolute precision with technical details for security credibility
- When components list specific versions, always refer to them with their complete version number`;

// Analysis system prompt - for diagram analysis
const ANALYSIS_SYSTEM_PROMPT = `You are **ContextCypher**, the AI assistant in the "AI-Threat-Modeler" application, performing security analysis.

Your task: Analyze the provided system diagram and identify security threats, vulnerabilities, and recommendations.

Focus areas:
• Architecture and component analysis
• Security boundaries and trust zones  
• Data flow and access patterns
• Potential attack vectors and threats
• Vulnerability identification
• Risk assessment and prioritization
• Mitigation strategies and recommendations

CRITICAL FORMATTING RULES:
- DO NOT use asterisks (*) or hashtags (#) for any formatting
- DO NOT use **bold**, *italic*, or any markdown syntax
- DO NOT use ## headers or ### subheaders  
- Use plain text with simple bullet points (•) only
- Write section titles as plain text on their own lines
- Keep all formatting minimal and clean
- Never use **, *, ###, ##, or # symbols for emphasis

Provide clear, actionable security analysis in plain text format.

CRITICAL ACCURACY REQUIREMENTS:
- ALWAYS use the EXACT version numbers provided in the diagram (e.g., Apache 2.4.29, PHP 7.1.2)
- NEVER obfuscate, generalize, or change version numbers (don't say "Apache 2.x" when "2.4.29" is specified)
- Only report CVE numbers that ACTUALLY exist and affect the EXACT versions specified
- If you're unsure about a CVE, state that explicitly rather than inventing one
- Maintain absolute precision with technical details for security credibility
- When components list specific versions, always refer to them with their complete version number`;

// Web search capability prompt addition
const WEB_SEARCH_PROMPT = `

WEB SEARCH CAPABILITY:
You have access to real-time web search for current threat intelligence and MUST use it proactively when needed.

AUTOMATIC SEARCH TRIGGERS - You MUST automatically search the web when:
• User mentions specific CVE numbers or asks about vulnerabilities
• Discussing components with version numbers (search for known vulnerabilities)
• User asks about "recent", "current", "latest", or "new" threats/vulnerabilities
• Analyzing specific software/hardware that may have known security issues
• User requests threat analysis or security assessment
• Any question that would benefit from information newer than your training data

SEARCH FOR:
• Current CVEs and vulnerability information for specific versions
• Recent security incidents and breach reports
• Threat actor campaigns and TTPs
• Security advisories and patches
• Real-time threat intelligence
• Known exploits for identified vulnerabilities

IMPORTANT: Since your training data has a cutoff date, you should PROACTIVELY search for current security information rather than relying on potentially outdated knowledge. Always search when discussing specific software versions or when the user's question implies they need current information.`;

/**
 * Detect if this is a threat analysis request or regular chat
 */
function isThreatAnalysisRequest(message, context) {
    // Check if this is explicitly diagram generation
    if (context?.isDiagramGeneration === true) {
        return false; // Never use threat analysis for diagram generation
    }
    
    // First check if this is explicitly flagged as NOT a threat analysis (chat endpoint)
    if (context?.isChatEndpoint === true) {
        // For chat endpoint, only use threat analysis format if explicitly requested
        const threatKeywords = [
            'threat analysis', 'analyze threats', 'analyse threats', 'security analysis',
            'vulnerability assessment', 'attack paths', 'risk assessment',
            'threat model', 'security threats', 'identify threats'
        ];
        
        const messageText = (message || '').toLowerCase();
        return threatKeywords.some(keyword => messageText.includes(keyword.toLowerCase()));
    }
    
    // Check if this is coming from the threat analysis endpoint
    const isThreatAnalysisEndpoint = context?.isThreatAnalysisEndpoint === true;
    
    // Check if this is coming from the analyze endpoint  
    const isAnalyzeEndpoint = context?.isAnalyzeEndpoint === true;
    
    // Default to threat analysis for analyze endpoint or threat analysis endpoint
    return isThreatAnalysisEndpoint || isAnalyzeEndpoint;
}

function isDiagramFocusedRequest(message) {
    const text = (message || '').toLowerCase();
    if (!text) return false;

    const diagramKeywords = [
        'diagram',
        'component',
        'components',
        'node',
        'nodes',
        'edge',
        'edges',
        'connection',
        'connections',
        'architecture',
        'topology',
        'cypher',
        'zone',
        'zones',
        'data flow',
        'network flow'
    ];

    return diagramKeywords.some(keyword => text.includes(keyword));
}

/**
 * Convert diagram (nodes/edges) into compact Cypher graph format with index codes
 * This ensures the LLM gets full context about the diagram structure
 */
function generateEnhancedCypher(diagram) {
    if (!diagram || !Array.isArray(diagram.nodes)) return '';

    const lines = [];
    const indexer = new DiagramIndexReader();
    
    // Index the diagram to get stable reference codes
    indexer.indexDiagram(diagram);
    
    // Process nodes with index codes
    const processedNodes = new Set();
    diagram.nodes.forEach(node => {
        // Skip duplicates
        if (processedNodes.has(node.id)) {
            logger.warn(`Skipping duplicate node: ${node.id}`);
            return;
        }
        processedNodes.add(node.id);
        
        const indexCode = indexer.nodeToCode.get(node.id);
        const nodeType = `${node.type.charAt(0).toUpperCase()}${node.type.slice(1)}`;
        const props = {
            id: node.id,
            indexCode: indexCode || 'UNKNOWN',
            label: escapeCypher(node.data?.label || node.id)
        };

        // Add all node data fields
        if (node.type !== 'securityZone') {
            // Core security properties
            props.zone = node.data?.zone || 'Unknown';
            props.securityLevel = node.data?.securityLevel || 'Standard';
            props.dataClassification = node.data?.dataClassification || 'Internal';

            // Include ALL other properties from node.data
            const fieldsToInclude = [
                'description', 'vendor', 'product', 'version', 'technology',
                'patchLevel', 'portRange', 'additionalContext',
                // DFD-specific fields for user-defined types
                'actorType', 'processType', 'storeType', 'boundaryType',
                // DFD categorization for enhanced threat modeling
                'dfdCategory', 'dfdType'
            ];

            fieldsToInclude.forEach(field => {
                if (node.data?.[field]) {
                    props[field] = escapeCypher(String(node.data[field]));
                }
            });
            
            // Handle array fields
            if (node.data?.protocols?.length) {
                props.protocols = node.data.protocols.join(',');
            }
            if (node.data?.securityControls?.length) {
                props.securityControls = node.data.securityControls.join(',');
            }
            if (node.data?.components?.length) {
                props.components = node.data.components
                    .map(c => `${c.name}:${c.version}`)
                    .join(';');
            }
        } else {
            // Security zone properties
            props.zoneType = node.data?.zoneType || 'Unknown';
            if (node.data?.description) {
                props.description = escapeCypher(node.data.description);
            }
        }

        const propsStr = Object.entries(props)
            .map(([k, v]) => `${k}:'${v}'`)
            .join(',');

        lines.push(`CREATE (:${nodeType}:SecurityNode {${propsStr}})`);
    });

    // Add edge creation with index codes and directionality
    if (diagram.edges?.length > 0) {
        lines.push('\n// Network Connections - showing data flow direction with ->');
        lines.push('// Each edge has: label (user-defined text), indexCode (system-generated reference)');
    }
    
    diagram.edges?.forEach(edge => {
        const edgeCode = indexer.edgeToCode.get(edge.id);
        const relType = edge.data?.protocol ? 
            `CONNECTS_${edge.data.protocol.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}` : 
            'CONNECTS_TO';
        
        // Always put label and indexCode first for clarity
        // NEW: include source/target zones for better filtering
        const sourceNodeObj = diagram.nodes.find(n => n.id === edge.source);
        const targetNodeObj = diagram.nodes.find(n => n.id === edge.target);
        const sourceZone = sourceNodeObj?.data?.zone || 'Unknown';
        const targetZone = targetNodeObj?.data?.zone || 'Unknown';
        
        const props = {
            id: edge.id,
            label: edge.data?.label || `Connection ${edge.id}`,
            indexCode: edgeCode || 'UNKNOWN',
            protocol: edge.data?.protocol || 'unknown',
            encryption: edge.data?.encryption || 'none',
            sourceZone,
            targetZone
        };
        
        // Include ALL other edge data fields
        if (edge.data) {
            const skipFields = ['id', 'label', 'indexCode', 'protocol', 'encryption', 'sourceHandle', 'targetHandle', 'type', 'style', 'animated'];
            Object.keys(edge.data).forEach(key => {
                if (!skipFields.includes(key) && edge.data[key] !== null && edge.data[key] !== undefined) {
                    if (Array.isArray(edge.data[key])) {
                        props[key] = edge.data[key].join(',');
                    } else {
                        props[key] = escapeCypher(String(edge.data[key]));
                    }
                }
            });
        }
        
        const propsStr = Object.entries(props)
            .map(([k, v]) => `${k}:'${v}'`)
            .join(',');
        
        // Show clear directionality with ->
        lines.push(`MATCH (source {id:'${edge.source}'}), (target {id:'${edge.target}'}) CREATE (source)-[:${relType} {${propsStr}}]->(target)`);
    });

    return lines.join('\n');
}

/**
 * Format additional context with node/edge references
 */
function formatAdditionalContext(context, indexer, options = {}) {
    const sections = [];
    const includeCustomContext = options.includeCustomContext !== false;
    
    // Format node-specific additional context
    if (context.diagram?.nodes) {
        const nodeContexts = context.diagram.nodes
            .filter(node => node.data?.additionalContext?.trim())
            .map(node => {
                const nodeCode = indexer.nodeToCode.get(node.id);
                return `[${nodeCode}] ${node.data.label || node.id}:\n${node.data.additionalContext}`;
            });
        
        if (nodeContexts.length > 0) {
            sections.push('=== COMPONENT-SPECIFIC CONTEXT ===\n' + nodeContexts.join('\n\n'));
        }
    }
    
    // Format edge-specific additional context
    if (context.diagram?.edges) {
        const edgeContexts = context.diagram.edges
            .filter(edge => edge.data?.additionalContext?.trim())
            .map(edge => {
                const edgeCode = indexer.edgeToCode.get(edge.id);
                const edgeLabel = edge.data?.label || `Connection ${edge.id}`;
                return `[${edgeCode}] ${edgeLabel}:\n${edge.data.additionalContext}`;
            });
        
        if (edgeContexts.length > 0) {
            sections.push('=== CONNECTION-SPECIFIC CONTEXT ===\n' + edgeContexts.join('\n\n'));
        }
    }
    
    // Include custom context
    if (includeCustomContext && context.customContext) {
        const content = typeof context.customContext === 'string' 
            ? context.customContext 
            : context.customContext.content || '';
        if (content.trim()) {
            sections.push('=== CUSTOM SYSTEM CONTEXT ===\n' + content);
        }
    }
    
    // Include drawings if present
    if (context.drawings?.length > 0) {
        const drawingDescriptions = context.drawings
            .map(drawing => `Drawing ${drawing.id}: ${drawing.description || 'No description'}`)
            .join('\n');
        sections.push('=== DIAGRAM ANNOTATIONS ===\n' + drawingDescriptions);
    }
    
    return sections.join('\n\n');
}

/**
 * Compact message history using MessageCompactionService
 */
async function compactMessageHistory(messageHistory, availableTokens, settings) {
    if (!messageHistory || messageHistory.length === 0) {
        return { messages: [], metadata: {} };
    }
    
    try {
        const compactionService = MessageCompactionService.getInstance();
        const compacted = await compactionService.compactMessageHistory(
            messageHistory,
            availableTokens,
            {
                preserveRecent: 3,
                enableAISummary: settings?.api?.llmMode === 'local',
                compressionRatio: 0.3
            }
        );
        
        return compacted;
    } catch (error) {
        logger.warn('Message compaction failed:', error);
        // Return uncompacted history
        return {
            messages: messageHistory,
            metadata: { compressionApplied: false }
        };
    }
}

/**
 * Build complete prompt with all context
 */
function buildCompletePrompt(userMessage, context, cypherGraph, additionalContext, compactedHistory) {
    const sections = [];
    
    // Determine which system prompt to use
    const isThreatAnalysis = isThreatAnalysisRequest(userMessage, context);
    const isGrcMode = context?.metadata?.systemType === 'grc' || context?.systemType === 'grc';
    const includeDiagramContext = Boolean(cypherGraph) &&
        (!isGrcMode || isThreatAnalysis || isDiagramFocusedRequest(userMessage));
    
    // Get model-specific profile
    const modelName = context?.model || '';
    const endpoint = isThreatAnalysis ? 'threatAnalysis' : 'chat';
    const modelProfile = getEndpointProfile(modelName, endpoint);
    
    // Check if this is a local LLM
    const isLocalLLM = context?.isLocalLLM || isLocalLLMModel(modelName);
    
    // Get the appropriate system prompt
    let systemPrompt = isThreatAnalysis ? ANALYSIS_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;
    
    // Add web search capability if enabled
    if (context?.metadata?.enableChatWebSearch || context?.enableWebSearch) {
        systemPrompt += WEB_SEARCH_PROMPT;
    }
    
    // Apply model-specific prompt modifications
    if (modelProfile) {
        if (modelProfile.systemPromptPrefix) {
            systemPrompt = modelProfile.systemPromptPrefix + systemPrompt;
        }
        if (modelProfile.systemPromptAdditions) {
            systemPrompt += modelProfile.systemPromptAdditions;
        }
    }

    // Add GRC-specific prompt addition if in GRC mode
    if (isGrcMode) {
        systemPrompt += `\n\nGRC MODULE MODE:
You are currently operating in the Governance, Risk, and Compliance (GRC) module.
Prioritize records from the "GRC WORKSPACE CONTEXT" section as the primary source for GRC questions.
Use diagram/component metadata only when the user explicitly asks for diagram or component analysis.`;
    }

    // Precompute node collections if diagram present (for optional overview)
    let componentNodes = [];
    let zoneNodes = [];
    if (context.diagram) {
        componentNodes = context.diagram.nodes.filter(n => n.type !== 'securityZone');
        zoneNodes = context.diagram.nodes.filter(n => n.type === 'securityZone');
    }

    const orientation = includeDiagramContext && context.diagram
        ? `Nodes: ${componentNodes.length}, Edges: ${context.diagram.edges?.length || 0}, Zones: ${zoneNodes.map(z=>z.data?.zoneType||z.id).join(', ')}`
        : '';

    let taskSection;
    if (isThreatAnalysis) {
        taskSection = `=== TASK ===
User: ${userMessage}

${orientation}

You already have full visibility of the diagram (provided below in Cypher format). Start your analysis immediately – do NOT ask the user to provide the diagram again.`;
    } else {
        taskSection = `=== TASK ===
User: ${userMessage}

${orientation ? `Context: ${orientation}` : ''}

    ${includeDiagramContext ? 'The system diagram is provided below in Cypher format for reference.' : ''}`;
    }

    // Add system prompt first
    sections.push(systemPrompt);

    if (isGrcMode) {
        sections.push(`=== ACTIVE MODULE CONTEXT ===
The user is currently working inside the GRC module.
Use GRC workspace records as the primary source of truth for GRC questions.
Only pivot to raw diagram component metadata when the user explicitly asks for diagram/component analysis.`);
    }
    
    // We want local LLMs to receive ALL context before instructions (task)
    let deferTaskUntilEnd = false;
    if ((isLocalLLM || modelProfile?.requiresDiagramFirst) && includeDiagramContext) {
        logger.info('Local LLM detected – deferring TASK until after full context');
        deferTaskUntilEnd = true;
        // Provide the visual diagram structure early
        sections.push(`=== VISUAL DIAGRAM STRUCTURE ===
  Below is the system architecture diagram in Cypher format. This represents the visual network/security diagram that both you and the user can see:
  
  IMPORTANT: This is the diagram context you need to analyze. Each node is a component (server, database, firewall, etc.) and each edge is a connection between components.
  
  ${cypherGraph}
  
  You are looking at this same diagram as the user.`);
    } else {
        // For cloud providers, keep instructions before heavy context
        sections.push(taskSection);
        // Only provide structured format immediately for threat analysis requests (cloud)
        if (isThreatAnalysis) {
            const answerFormat = `=== ANSWER FORMAT ===
 1. SYSTEM_OVERVIEW – 1–2 concise paragraphs.
 2. COMPONENT_THREATS – one subsection per component label (use exact labels).
 3. ATTACK_PATHS – PATH: A → B → C | description | MITRE IDs | risk.
 4. TOP_RECOMMENDATIONS – ordered list (max 5).`;
            sections.push(answerFormat);
        }
    }

    if (isGrcMode && additionalContext) {
        sections.push(additionalContext);
    }

    // After instructions, include optional high-level overview & context heavy sections

    if (context.diagram && includeDiagramContext) {
        sections.push(`=== SYSTEM OVERVIEW ===
Total Components: ${componentNodes.length} nodes across ${zoneNodes.length} security zones
Total Connections: ${context.diagram.edges?.length || 0} edges`);
    }

    // Add legends after overview so they don’t separate instructions from diagram context
    const legendIndexer = new DiagramIndexReader();
    if (context.diagram) legendIndexer.indexDiagram(context.diagram);
    const legend = buildLegend(context.diagram, legendIndexer);
    if (includeDiagramContext && legend) {
      sections.push(`=== DIAGRAM LEGEND ===\n${legend}`);
    }

    const connectionLegend = buildConnectionLegend(context.diagram, legendIndexer);
    if (includeDiagramContext && connectionLegend) {
      sections.push(`=== CONNECTION LEGEND ===\n${connectionLegend}`);
    }

    // Add Cypher graph (heavy) after legends - but only if not already added
    if (includeDiagramContext && !(isLocalLLM || modelProfile?.requiresDiagramFirst)) {
        sections.push(`=== VISUAL DIAGRAM STRUCTURE ===
  Below is the system architecture diagram in Cypher format. This represents the visual network/security diagram that both you and the user can see:
  
  IMPORTANT: When the user asks you to "analyze the diagram" or "look at the system", they are referring to this visual representation below. Each node is a component (server, database, firewall, etc.) and each edge is a connection between components.
  
  ${cypherGraph}
  
  You are looking at this same diagram as the user. Please analyze it as if you can see the visual representation.`);
    }
    
    // Add additional context with node/edge references
    if (!isGrcMode && additionalContext) {
        sections.push(additionalContext);
    }
    
    // Add threat intelligence if available
    if (context.threatIntel) {
        sections.push(formatThreatIntelForAI(context.threatIntel));
    }
    
    // Add conversation history
    if (compactedHistory.messages && compactedHistory.messages.length > 0) {
        const historySection = compactedHistory.messages
            .map(msg => {
                const role = msg.type === 'question' ? 'User' : 'Assistant';
                return `${role}: ${msg.content}`;
            })
            .join('\n');
        
        sections.push(`=== CONVERSATION HISTORY ===
 ${compactedHistory.metadata?.compressionApplied ? '[Some older messages have been compressed to save space]' : ''}
 ${historySection}`);
    }
    
    // Add diagram changes if available
    if (context.diagramChanges?.length > 0) {
        const changes = context.diagramChanges.map(change => `- ${change}`).join('\n');
        sections.push(`=== RECENT SYSTEM CHANGES ===
 The following changes have been made to the system architecture:
 ${changes}
 
 Consider these changes and their security implications in your analysis.`);
    }
    
    // For local LLMs: now provide TASK and ANSWER FORMAT at the very end (after all context)
    if (deferTaskUntilEnd) {
        sections.push(taskSection);
        if (isThreatAnalysis) {
            const answerFormat = `=== ANSWER FORMAT ===
 1. SYSTEM_OVERVIEW – 1–2 concise paragraphs.
 2. COMPONENT_THREATS – one subsection per component label (use exact labels).
 3. ATTACK_PATHS – PATH: A → B → C | description | MITRE IDs | risk.
 4. TOP_RECOMMENDATIONS – ordered list (max 5).`;
            sections.push(answerFormat);
        }
    }

    return sections.join('\n\n');
}

function stripLegacyDiagramSections(additionalContext) {
    if (typeof additionalContext !== 'string' || !additionalContext.trim()) {
        return '';
    }

    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const legacyHeaders = [
        '=== ATTACK SURFACE ANALYSIS ===',
        '=== DIAGRAM STRUCTURE (Cypher Graph Format) ===',
        '=== SYSTEM ARCHITECTURE (Cypher Graph Format) ===',
        '=== VISUAL DIAGRAM STRUCTURE ==='
    ];

    let sanitized = additionalContext;
    legacyHeaders.forEach((header) => {
        const sectionPattern = new RegExp(
            `(?:^|\\n)\\s*${escapeRegExp(header)}[\\s\\S]*?(?=\\n\\s*===\\s*[^\\n]+\\s*===|$)`,
            'gi'
        );
        sanitized = sanitized.replace(sectionPattern, '\n');
    });

    return sanitized.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Main formatting function - direct and simplified
 */
const formatPromptForProvider = ({ diagram, threatIntel, context, message }) => {
    logger.info('formatPromptForProvider - Direct formatting mode', {
        hasDiagram: !!diagram,
        hasThreatIntel: !!threatIntel,
        hasContext: !!context,
        messageLength: message?.length
    });

    try {
        // Create indexer for the diagram
        const indexer = new DiagramIndexReader();
        if (diagram) {
            indexer.indexDiagram(diagram);
        }
        
        // Generate enhanced Cypher with index codes
        const cypherGraph = diagram ? generateEnhancedCypher(diagram) : '';
        
        // Merge any provided additionalContext from client with generated context.
        // Legacy clients may include full Cypher context here; server now owns diagram formatting.
        const providedAdditional = stripLegacyDiagramSections(context?.additionalContext || '');
        const isGrcMode = context?.metadata?.systemType === 'grc' || context?.systemType === 'grc';
        const generatedAdditional = isGrcMode
            ? ''
            : formatAdditionalContext(
                { ...context, diagram },
                indexer,
                {
                    includeCustomContext: !isGrcMode
                }
            );
        const additionalContext = [providedAdditional, generatedAdditional]
            .filter(Boolean)
            .join('\n\n');
        
        logger.info(`buildCompletePrompt with additionalContext length: ${additionalContext?.length || 0}`);
        
        // Build complete prompt - no optimization, just direct formatting
        const prompt = buildCompletePrompt(
            message,
            { ...context, diagram, threatIntel },
            cypherGraph,
            additionalContext,
            { messages: context?.messageHistory || [], metadata: {} }
        );
        
        logger.info('Direct formatting complete', {
            promptLength: prompt.length,
            hasCypher: cypherGraph.length > 0,
            hasAdditionalContext: additionalContext.length > 0
        });
        
        return prompt;
    } catch (error) {
        logger.error('Error in formatPromptForProvider:', error);
        
        // Fallback prompt
        return `${CHAT_SYSTEM_PROMPT}\n\nUser: ${message}\n\n(Note: Operating with reduced context due to formatting error)`;
    }
};

/**
 * Format context for AI model - now uses direct formatting
 */
const formatContext = async (diagram, message, context = {}, modelConfig = {}) => {
    logger.info('formatContext - Using direct formatting', {
        model: modelConfig?.model || 'unknown',
        hasDiagram: !!diagram
    });
    
    // Calculate available tokens for message history
    const modelTokens = MODEL_TOKEN_LIMITS[modelConfig?.model?.toLowerCase()] || 4096;
    const availableForHistory = Math.floor(modelTokens * 0.4); // 40% for history
    
    // Compact message history if needed
    const compactedHistory = await compactMessageHistory(
        context.messageHistory || [],
        availableForHistory,
        modelConfig
    );
    
    // Use the new direct formatting
    const prompt = formatPromptForProvider({
        diagram,
        threatIntel: context.threatIntel,
        context: {
            ...context,
            messageHistory: compactedHistory.messages
        },
        message
    });
    
    return prompt;
};

/**
 * Format dynamic context - now redirects to direct formatting
 */
const formatDynamicContext = async (diagram, message, context = {}, modelConfig = {}, threatIntel = null) => {
    logger.info('formatDynamicContext - Redirecting to direct formatting');
    
    const prompt = await formatContext(
        diagram, 
        message, 
        { ...context, threatIntel }, 
        modelConfig
    );
    
    return { 
        prompt, 
        detailContextUsed: true // Always true now since we include everything
    };
};

/**
 * Parse analysis mode from message
 */
const parseAnalysisMode = (message, modelConfig) => {
    let analysisMode = 'comprehensive';
    let cleanedMessage = message;
    
    if (message.includes('[threat-analysis]')) {
        analysisMode = 'threat_analysis';
        cleanedMessage = message.replace('[threat-analysis]', '').trim();
    } else if (message.includes('[vulnerability-assessment]')) {
        analysisMode = 'vulnerability_assessment';
        cleanedMessage = message.replace('[vulnerability-assessment]', '').trim();
    } else if (message.includes('[compliance-review]')) {
        analysisMode = 'compliance_review';
        cleanedMessage = message.replace('[compliance-review]', '').trim();
    }
    
    return { analysisMode, cleanedMessage };
};

/**
 * Format threat intelligence for AI
 */
const formatThreatIntelForAI = (threatIntel) => {
    if (!threatIntel || Object.keys(threatIntel).length === 0) {
        return '';
    }
    
    let formatted = '=== THREAT INTELLIGENCE SUMMARY ===\n';
    
    if (threatIntel.threatActors?.length > 0) {
        formatted += '\nActive Threat Actors:\n';
        threatIntel.threatActors.forEach(actor => {
            formatted += `- ${actor.name}: ${actor.description}\n`;
            if (actor.tactics?.length > 0) {
                formatted += `  Tactics: ${actor.tactics.join(', ')}\n`;
            }
        });
    }
    
    if (threatIntel.vulnerabilities?.length > 0) {
        formatted += '\nRelevant Vulnerabilities:\n';
        threatIntel.vulnerabilities.forEach(vuln => {
            formatted += `- ${vuln.id}: ${vuln.description}\n`;
            if (vuln.affectedComponents) {
                formatted += `  Affects: ${vuln.affectedComponents.join(', ')}\n`;
            }
            if (vuln.cvss) {
                formatted += `  CVSS: ${vuln.cvss}\n`;
            }
        });
    }
    
    if (threatIntel.attackPatterns?.length > 0) {
        formatted += '\nKnown Attack Patterns:\n';
        threatIntel.attackPatterns.forEach(pattern => {
            formatted += `- ${pattern.name}: ${pattern.description}\n`;
            if (pattern.mitreTechnique) {
                formatted += `  MITRE ATT&CK: ${pattern.mitreTechnique}\n`;
            }
        });
    }
    
    return formatted;
};

/**
 * Format AI response into standardized structure
 */
const formatAIResponse = (response, provider, model, context) => {
    logger.info('formatAIResponse called for provider:', provider);

    let content = '';
    let metadata = {
        provider: provider || 'unknown',
        model: model || 'unknown',
        timestamp: new Date().toISOString()
    };

    // Extract content based on response structure
    if (response?.choices && response.choices[0]?.message?.content) {
        content = response.choices[0].message.content;
    } else if (response?.response) {
        content = response.response;
    } else if (response?.content) {
        content = response.content;
    } else if (typeof response === 'string') {
        content = response;
    } else {
        logger.warn('Unknown response format:', response);
        content = JSON.stringify(response);
    }

    if (response?.metadata) {
        metadata = { ...metadata, ...response.metadata };
    }

    // Check if this is a diagram generation response
    const isDiagramGeneration = content.includes('```cypher') && 
                               content.includes('CREATE (:SystemMetadata') &&
                               content.includes('CREATE (:');
    
    if (isDiagramGeneration) {
        logger.info('Detected diagram generation response - preserving code blocks');
        // For diagram generation, don't sanitize markdown to preserve code blocks
        return {
            choices: [{
                message: {
                    content: content,
                    role: 'assistant'
                }
            }],
            metadata: {
                ...metadata,
                isDiagramGeneration: true
            }
        };
    }

    // Log markdown cleaning for debugging
    const originalLength = content.length;
    const hasMarkdown = content.includes('**') || content.includes('##') || content.includes('*');
    const hasEmojis = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|🚨|⚠️|✅|🔒|🌐|📊|💡/u.test(content);
    
    if (hasMarkdown) {
        // Log specific markdown patterns found before sanitization
        const boldPatterns = content.match(/\*\*[^*]+\*\*/g) || [];
        const italicPatterns = content.match(/\*[^*\n]+\*/g) || [];
        logger.info(`Markdown patterns found - Bold: ${boldPatterns.length}, Italic: ${italicPatterns.length}`);
        if (boldPatterns.length > 0) {
            logger.info(`Bold examples: ${boldPatterns.slice(0, 3).join(', ')}`);
        }
    }
    
    // Strip markdown emphasis for cleaner copy-paste
    const sanitized = sanitizeMarkdown(content);
    
    // Check if sanitization was effective
    const stillHasMarkdown = sanitized.includes('**') || sanitized.includes('##');
    
    if (hasMarkdown || hasEmojis) {
        const cleaningTypes = [];
        if (hasMarkdown) cleaningTypes.push('markdown');
        if (hasEmojis) cleaningTypes.push('emojis');
        logger.info(`Response cleaned: ${originalLength} → ${sanitized.length} chars, removed ${cleaningTypes.join(' and ')}`);
        
        if (stillHasMarkdown) {
            logger.warn('Markdown still detected after sanitization!');
            const remainingBold = sanitized.match(/\*\*[^*]+\*\*/g) || [];
            if (remainingBold.length > 0) {
                logger.warn(`Remaining bold patterns: ${remainingBold.slice(0, 3).join(', ')}`);
            }
        }
    }

    return {
        choices: [{
            message: {
                content: sanitized,
                role: 'assistant'
            }
        }],
        metadata: metadata
    };
};

/**
 * Get maximum prompt length based on model
 */
const getMaxPromptLength = (modelName) => {
    const lowerModel = (modelName || '').toLowerCase();
    const modelTokens = MODEL_TOKEN_LIMITS[lowerModel] || 4096;
    return Math.floor(modelTokens * TOKEN_TO_CHAR_RATIO);
};

/**
 * Format messages array for AI model
 */
const formatMessages = (messages, modelName) => {
    const maxLength = getMaxPromptLength(modelName);
    let totalLength = 0;
    const formattedMessages = [];
    
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
        formattedMessages.push(systemMessage);
        totalLength += systemMessage.content.length;
    }
    
    const otherMessages = messages.filter(m => m.role !== 'system').reverse();
    
    for (const msg of otherMessages) {
        if (totalLength + msg.content.length <= maxLength) {
            formattedMessages.unshift(msg);
            totalLength += msg.content.length;
        } else {
            const remainingSpace = maxLength - totalLength;
            if (remainingSpace > 100) {
                formattedMessages.unshift({
                    ...msg,
                    content: msg.content.substring(0, remainingSpace) + '... (truncated)'
                });
            }
            break;
        }
    }
    
    return formattedMessages;
};

// Sanitize markdown asterisks/bold markers so end users get plain text
function sanitizeMarkdown(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Log what we're working with
  console.log('=== SANITIZE MARKDOWN DEBUG ===');
  console.log('Input length:', text.length);
  console.log('Has **:', text.includes('**'));
  console.log('Sample bold patterns:', (text.match(/\*\*[^*]+?\*\*/g) || []).slice(0, 3));
  
  let result = text
    // Remove ALL forms of header markdown first
    .replace(/^#{1,6}\s*\*\*(.*?)\*\*\s*$/gm, '$1') // ## **Title** → Title
    .replace(/^#{1,6}\s*(.*?)$/gm, '$1') // ## Title → Title
    
    // Convert bullet asterisks to proper bullets FIRST (before removing other asterisks)
    .replace(/^\s*\*\s+/gm, '• ') // Convert * bullets to •
    
    // Remove ALL asterisk formatting patterns - much more aggressive approach
    .replace(/\*\*\*.*?\*\*\*/g, (match) => {
      console.log('Removing triple asterisks:', match);
      return match.replace(/\*\*\*/g, '');
    })
    .replace(/\*\*.*?\*\*/g, (match) => {
      console.log('Removing double asterisks:', match);
      return match.replace(/\*\*/g, '');
    })
    .replace(/\*([^*\n]*?)\*/g, (match, content) => {
      console.log('Removing single asterisks:', match);
      return content;
    })
    
    // Final cleanup - remove any remaining asterisks that aren't part of bullets
    .replace(/(?<!^|\s)\*+(?!\s|$)/g, '') // Remove asterisks not at word boundaries
    .replace(/\*{2,}/g, '') // Remove multiple asterisks
    .replace(/([a-zA-Z])\*+([a-zA-Z])/g, '$1$2'); // Remove asterisks between letters
    
     console.log('Output has **:', result.includes('**'));
   console.log('Characters changed:', text.length - result.length);
   console.log('=== END SANITIZE DEBUG ===');
   
   result = result
     // Remove emojis - common ones used in security analysis
    .replace(/🚨|⚠️|✅|🔒|🌐|📊|💡|🎯|🔥|⭐|📈|📉|🛡️|⚡|🚀|💯|❌|✨|🔑|💻|🖥️|📱|🌍|🌎|🌏|🔧|⚙️|🎉|👍|👎|😊|😢|😡|🤔|💭|📝|📋|📊|📈|📉|🎨|🎯|💎|🏆|🎪|🎭|🎸|🎵|🎶|🎤|🎧|🎬|📽️|🎮|🕹️|🎲/g, '')
    
    // Remove any remaining single emojis (broader Unicode emoji ranges)
    .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    
    // Clean up bullet points and lists
    .replace(/^[\s]*[-+][\s]*\*\*(.*?)\*\*:?\s*/gm, '• $1: ') // - **Item**: → • Item:
    .replace(/^[\s]*[-+]\s*/gm, '• ') // Normalize all bullets to •
    
    // Remove code blocks and inline code
    .replace(/```[\s\S]*?```/g, (match) => {
      // Extract just the code content without the ```
      return match.replace(/```(\w+)?\n?/g, '').replace(/```$/g, '');
    })
    .replace(/`([^`]+)`/g, '$1') // `code` → code
    
    // Remove links but keep the text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    
    // Clean up excessive spacing and normalize line breaks
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Max 2 consecutive line breaks
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .replace(/([.!?])\s*\n\s*/g, '$1\n\n') // Add proper spacing after sentences
    
    // Final cleanup: remove any remaining double spaces
    .replace(/\s{2,}/g, ' ');
    
  return result;
}

module.exports = {
    formatContext,
    formatMessages,
    getMaxPromptLength,
    formatDynamicContext,
    parseAnalysisMode,
    formatThreatIntelForAI,
    formatPromptForProvider,
    formatAIResponse,
    generateEnhancedCypher,
    SECURITY_ANALYSIS_PROMPT: ANALYSIS_SYSTEM_PROMPT,
    CHAT_SYSTEM_PROMPT: CHAT_SYSTEM_PROMPT
};
