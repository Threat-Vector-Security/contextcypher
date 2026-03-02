/**
 * Model Response Processors
 * 
 * This file contains all response processor functions for different AI models.
 * Separated from modelProfiles.js to ensure proper bytecode compilation.
 * Functions are mapped by name and retrieved via getProcessor().
 * 
 */

const logger = require('./logger-wrapper');

/**
 * Response processor for gpt-oss models
 * Extracts JSON from response that may contain thinking text
 */
function gptOssProcessor(response) {
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return response.substring(firstBrace, lastBrace + 1);
  }
  return response;
}

/**
 * Response processor for claude-opus-4
 * Uses same simple extraction as gpt-oss
 */
function claudeOpus4Processor(response) {
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return response.substring(firstBrace, lastBrace + 1);
  }
  return response;
}

/**
 * Response processor for claude-opus-4 diagram generation
 * Removes any potential wrapper text from Cypher output
 */
function claudeOpus4DiagramProcessor(response) {
  const codeBlockMatch = response.match(/```(?:cypher|json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return '```cypher\n' + codeBlockMatch[1] + '\n```';
  }
  return response;
}

/**
 * Response processor for local LLM diagram generation
 * Extracts JSON from various response formats
 */
function localLLMDiagramProcessor(response) {
  try {
    // First try direct parse
    const parsed = JSON.parse(response);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Try to extract from code block
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        return JSON.stringify(parsed, null, 2);
      } catch (e2) {
        // Return original if can't parse
        return response;
      }
    }
    // Try to find JSON object in text
    const jsonMatch = response.match(/{[\s\S]*}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return JSON.stringify(parsed, null, 2);
      } catch (e3) {
        return response;
      }
    }
    return response;
  }
}

/**
 * Response processor for local LLM threat analysis
 * Handles various response formats from local models
 */
function localLLMThreatProcessor(response) {
  // Remove common prefixes that local models might add
  let cleaned = response;
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  
  // Remove common thinking patterns
  const thinkingPatterns = [
    /^.*?(?:Here is|Here's|I'll analyze|Let me analyze|Based on|The JSON).*?:\s*/i,
    /^.*?(?:json output|response|result|analysis).*?:\s*/i,
    /^.*?(?:```|{)/
  ];
  
  for (const pattern of thinkingPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index < 200) { // Only if pattern is near the start
      const jsonStart = Math.max(cleaned.indexOf('{'), 0);
      if (jsonStart > 0 && jsonStart < 200) {
        cleaned = cleaned.substring(jsonStart);
        break;
      }
    }
  }
  
  // Find JSON boundaries
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  // Try to parse and validate structure
  try {
    const parsed = JSON.parse(cleaned);
    
    // Ensure required fields exist
    if (!parsed.threats) parsed.threats = [];
    if (!parsed.vulnerabilities) parsed.vulnerabilities = [];
    if (!parsed.recommendedControls) parsed.recommendedControls = [];
    
    // For system analysis, ensure these fields exist
    if (!parsed.attackPaths) parsed.attackPaths = [];
    if (!parsed.recommendations) parsed.recommendations = [];
    if (!parsed.systemOverview && (parsed.attackPaths || parsed.recommendations)) {
      parsed.systemOverview = "System security analysis completed.";
    }
    
    return JSON.stringify(parsed);
  } catch (e) {
    logger.warn('Local LLM response parsing failed, returning cleaned text:', e.message);
    return cleaned;
  }
}

// Processor registry - maps processor names to functions
const processors = {
  'gptOssProcessor': gptOssProcessor,
  'claudeOpus4Processor': claudeOpus4Processor,
  'claudeOpus4DiagramProcessor': claudeOpus4DiagramProcessor,
  'localLLMDiagramProcessor': localLLMDiagramProcessor,
  'localLLMThreatProcessor': localLLMThreatProcessor
};

/**
 * Get a processor function by name
 * @param {string} processorName - The name of the processor
 * @returns {Function|null} The processor function or null if not found
 */
function getProcessor(processorName) {
  if (!processorName) return null;
  
  const processor = processors[processorName];
  if (!processor) {
    logger.warn(`Response processor '${processorName}' not found`);
    return null;
  }
  
  return processor;
}

module.exports = {
  getProcessor,
  // Export individual processors for direct use if needed
  gptOssProcessor,
  claudeOpus4Processor,
  claudeOpus4DiagramProcessor,
  localLLMDiagramProcessor,
  localLLMThreatProcessor
};