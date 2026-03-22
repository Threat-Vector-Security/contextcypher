/**
 * Message Compaction Service
 * 
 * Intelligent compression and summarization of conversation history
 * to maximize context retention within token limits.
 * 
 * Currently using rule-based compression only (AI compression disabled).
 */

const logger = require('../utils/logger-wrapper');
const axios = require('axios');

class MessageCompactionService {
  static instance = null;
  static currentModelConfig = null;

  // Message importance levels
  static MessageImportance = {
    CRITICAL: 5,  // Security findings, never compress
    HIGH: 4,      // User questions, key analysis
    MEDIUM: 3,    // Detailed explanations
    LOW: 2,       // General conversation
    MINIMAL: 1    // Status updates, can heavily compress
  };

  // Compression levels
  static CompressionLevels = {
    NONE: 0,      // No compression
    LIGHT: 1,     // ~20% reduction
    MEDIUM: 2,    // ~40% reduction
    HEAVY: 3,     // ~60% reduction
    ULTRA: 4      // ~80% reduction
  };

  constructor(modelConfig = {}) {
    this.modelConfig = modelConfig;
    // Removed Swarms service URL - no longer using Python service
    
    logger.info('MessageCompactionService initialized', {
      model: modelConfig.model || 'default'
    });
  }

  static getInstance(modelConfig = {}) {
    const configKey = JSON.stringify(modelConfig);
    const currentConfigKey = JSON.stringify(MessageCompactionService.currentModelConfig || {});
    
    if (!MessageCompactionService.instance || configKey !== currentConfigKey) {
      MessageCompactionService.instance = new MessageCompactionService(modelConfig);
      MessageCompactionService.currentModelConfig = modelConfig;
    }
    
    return MessageCompactionService.instance;
  }

  /**
   * Main entry point for message history compaction
   * @param {Array} messageHistory - Original message history
   * @param {number} availableTokens - Token budget for history
   * @param {Object} options - Compaction options
   * @returns {Object} Compacted history with metadata
   */
  async compactMessageHistory(messageHistory, availableTokens, options = {}) {
    const {
      preserveRecent = 3,      // Always keep N recent messages uncompressed
      enableAISummary = true   // Use AI for intelligent summarization
    } = options;

    logger.info('[COMPACTION] Starting message history compaction', {
      messageCount: messageHistory.length,
      availableTokens,
      options
    });

    // Phase 1: Classify messages by importance and age
    const classifiedMessages = this._classifyMessages(messageHistory);

    // Phase 2: Calculate compression strategy
    const compressionPlan = this._calculateCompressionPlan(
      classifiedMessages, 
      availableTokens,
      preserveRecent
    );

    // Phase 3: Apply compression (potentially async with AI)
    if (enableAISummary && this._requiresAICompression(compressionPlan)) {
      try {
        return await this._performAICompression(classifiedMessages, compressionPlan);
      } catch (error) {
        logger.warn('[COMPACTION] AI compression failed, falling back to local:', error);
        return this._performLocalCompression(classifiedMessages, compressionPlan);
      }
    } else {
      return this._performLocalCompression(classifiedMessages, compressionPlan);
    }
  }

  /**
   * Classify messages by importance and content type
   */
  _classifyMessages(messageHistory) {
    return messageHistory.map((message, index) => {
      const age = messageHistory.length - index;
      const importance = this._calculateImportance(message);
      const compressionLevel = this._determineCompressionLevel(age, importance);
      
      return {
        ...message,
        metadata: {
          ...message.metadata,
          age,
          importance,
          compressionLevel,
          originalTokens: this._estimateTokens(message.content)
        }
      };
    });
  }

  /**
   * Calculate message importance based on content
   */
  _calculateImportance(message) {
    const content = message.content.toLowerCase();
    
    // Critical: Security findings, threats, vulnerabilities
    if (content.includes('vulnerability') || 
        content.includes('threat') || 
        content.includes('attack') ||
        content.includes('risk score') ||
        content.includes('critical') ||
        content.includes('exploit')) {
      return MessageCompactionService.MessageImportance.CRITICAL;
    }
    
    // High: User questions and key analysis
    if (message.type === 'question' || 
        content.includes('analysis complete') ||
        content.includes('recommendation') ||
        content.includes('you should') ||
        content.includes('important')) {
      return MessageCompactionService.MessageImportance.HIGH;
    }
    
    // Medium: Detailed explanations
    if (content.length > 500 || 
        content.includes('architecture') ||
        content.includes('configuration') ||
        content.includes('implementation')) {
      return MessageCompactionService.MessageImportance.MEDIUM;
    }
    
    // Low: Status updates
    if (message.type === 'loading' || 
        content.includes('processing') ||
        content.includes('generating') ||
        content.length < 100) {
      return MessageCompactionService.MessageImportance.LOW;
    }
    
    return MessageCompactionService.MessageImportance.MINIMAL;
  }

  /**
   * Determine compression level based on age and importance
   */
  _determineCompressionLevel(age, importance) {
    // Never compress critical messages
    if (importance === MessageCompactionService.MessageImportance.CRITICAL) {
      return MessageCompactionService.CompressionLevels.NONE;
    }
    
    // Recent messages get less compression
    if (age <= 3) return MessageCompactionService.CompressionLevels.NONE;
    if (age <= 10) return MessageCompactionService.CompressionLevels.LIGHT;
    if (age <= 30) return MessageCompactionService.CompressionLevels.MEDIUM;
    if (age <= 50) return MessageCompactionService.CompressionLevels.HEAVY;
    
    return MessageCompactionService.CompressionLevels.ULTRA;
  }

  /**
   * Calculate compression plan based on available tokens
   */
  _calculateCompressionPlan(messages, availableTokens, preserveRecent) {
    let totalTokens = 0;
    const plan = {
      preserveCount: preserveRecent,
      compressionTargets: [],
      estimatedSavings: 0
    };

    messages.forEach((msg, index) => {
      const tokens = msg.metadata.originalTokens;
      totalTokens += tokens;
      
      if (index < messages.length - preserveRecent) {
        const compressedTokens = this._estimateCompressedTokens(
          tokens, 
          msg.metadata.compressionLevel
        );
        
        plan.compressionTargets.push({
          index,
          originalTokens: tokens,
          compressedTokens,
          savings: tokens - compressedTokens
        });
        
        plan.estimatedSavings += (tokens - compressedTokens);
      }
    });

    logger.info('[COMPACTION] Compression plan calculated', {
      totalTokens,
      availableTokens,
      estimatedSavings: plan.estimatedSavings,
      targetCount: plan.compressionTargets.length
    });

    return plan;
  }

  /**
   * Estimate compressed token count
   */
  _estimateCompressedTokens(originalTokens, compressionLevel) {
    const compressionRatios = {
      [MessageCompactionService.CompressionLevels.NONE]: 1.0,
      [MessageCompactionService.CompressionLevels.LIGHT]: 0.8,
      [MessageCompactionService.CompressionLevels.MEDIUM]: 0.6,
      [MessageCompactionService.CompressionLevels.HEAVY]: 0.4,
      [MessageCompactionService.CompressionLevels.ULTRA]: 0.2
    };
    
    return Math.ceil(originalTokens * (compressionRatios[compressionLevel] || 1.0));
  }

  /**
   * Check if AI compression is needed
   */
  _requiresAICompression(compressionPlan) {
    // Use AI if we have many messages to compress or high importance messages
    return compressionPlan.compressionTargets.length > 10 ||
           compressionPlan.estimatedSavings > 1000;
  }

  /**
   * Perform AI-powered compression
   */
  async _performAICompression(messages, compressionPlan) {
    try {
      // AI compression is currently disabled - using local compression only
      logger.info('[COMPACTION] Using local rule-based compression');
      return this._performLocalCompression(messages, compressionPlan);
      
      /* Original AI compression code disabled - no longer using Python service
      // Group messages by compression level for batch processing
      const compressionGroups = this._groupByCompressionLevel(messages);
      
      // Send to Python service for intelligent compression
      const response = await axios.post(
        `/compress/messages`,
        {
          message_groups: compressionGroups,
          compression_plan: compressionPlan,
          preserve_context: true,
          model_config: this.modelConfig
        },
        { 
          timeout: 15000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (response.data.success) {
        logger.info('[COMPACTION] AI compression successful', {
          originalCount: messages.length,
          compressedCount: response.data.compressed_messages.length,
          tokensSaved: response.data.tokens_saved
        });

        return {
          messages: response.data.compressed_messages,
          metadata: {
            compressionType: 'AI',
            originalCount: messages.length,
            compressedCount: response.data.compressed_messages.length,
            tokensSaved: response.data.tokens_saved,
            compressionRatio: response.data.compression_ratio
          }
        };
      } else {
        throw new Error(response.data.error || 'AI compression failed');
      }
      */
    } catch (error) {
      logger.warn('[COMPACTION] AI compression failed, falling back to local:', error);
      return this._performLocalCompression(messages, compressionPlan);
    }
  }

  /**
   * Group messages by compression level
   */
  _groupByCompressionLevel(messages) {
    const groups = {};
    
    messages.forEach(msg => {
      const level = msg.metadata.compressionLevel;
      if (!groups[level]) {
        groups[level] = [];
      }
      groups[level].push(msg);
    });
    
    return groups;
  }

  /**
   * Perform local compression without AI assistance
   */
  _performLocalCompression(messages, compressionPlan) {
    logger.info('[COMPACTION] Performing local compression');
    
    const compressed = messages.map(msg => {
      const level = msg.metadata.compressionLevel;
      
      if (level === MessageCompactionService.CompressionLevels.NONE) {
        return msg;
      }
      
      let compressedContent = msg.content;
      
      switch (level) {
        case MessageCompactionService.CompressionLevels.LIGHT:
          compressedContent = this._lightCompression(msg.content);
          break;
        case MessageCompactionService.CompressionLevels.MEDIUM:
          compressedContent = this._mediumCompression(msg.content);
          break;
        case MessageCompactionService.CompressionLevels.HEAVY:
          compressedContent = this._heavyCompression(msg.content);
          break;
        case MessageCompactionService.CompressionLevels.ULTRA:
          compressedContent = this._ultraCompression(msg.content, msg.type);
          break;
        default:
          // No compression - keep original content
          break;
      }
      
      return {
        ...msg,
        content: compressedContent,
        metadata: {
          ...msg.metadata,
          compressed: level > 0,
          compressionLevel: level,
          originalLength: msg.content.length,
          compressedLength: compressedContent.length
        }
      };
    });

    const originalTokens = messages.reduce((sum, msg) => sum + msg.metadata.originalTokens, 0);
    const compressedTokens = compressed.reduce((sum, msg) => 
      sum + this._estimateTokens(msg.content), 0);

    return {
      messages: compressed,
      metadata: {
        compressionType: 'Local',
        originalCount: messages.length,
        compressedCount: compressed.length,
        tokensSaved: originalTokens - compressedTokens,
        compressionRatio: compressedTokens / originalTokens
      }
    };
  }

  /**
   * Light compression - Remove redundancy, keep key points
   */
  _lightCompression(content) {
    // Remove repetitive phrases and filler words
    let compressed = content
      .replace(/\b(basically|essentially|actually|really|just|very)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Shorten common verbose phrases
    compressed = compressed
      .replace(/in order to/gi, 'to')
      .replace(/due to the fact that/gi, 'because')
      .replace(/at this point in time/gi, 'now');
    
    return compressed;
  }

  /**
   * Medium compression - Extract key sentences
   */
  _mediumCompression(content) {
    const sentences = content.split(/(?<=[.!?])\s+/).filter(Boolean);
    
    // Keep sentences with important keywords
    const important = sentences.filter(sent => {
      const lower = sent.toLowerCase();
      return lower.includes('threat') ||
             lower.includes('vulnerability') ||
             lower.includes('risk') ||
             lower.includes('should') ||
             lower.includes('must') ||
             lower.includes('recommend') ||
             lower.includes('important') ||
             lower.includes('critical');
    });
    
    // If no important sentences, keep first and last
    if (important.length === 0 && sentences.length > 2) {
      return `${sentences[0]} [...] ${sentences[sentences.length - 1]}`;
    }
    
    return important.join(' ');
  }

  /**
   * Heavy compression - Key points only
   */
  _heavyCompression(content) {
    // Extract bullet points or numbered lists
    const listItems = content.match(/^[ \t]*[•\-*\d]+\.?[ \t]+[^\n]*/gm);
    if (listItems && listItems.length > 0) {
      return '[Summary] ' + listItems.slice(0, 3).join('; ');
    }
    
    // Fall back to first 100 characters
    return '[Summary] ' + content.substring(0, 100) + '...';
  }

  /**
   * Ultra compression - Minimal essence
   */
  _ultraCompression(content, messageType) {
    if (messageType === 'question') {
      return '[User Question]';
    }
    
    // Try to extract the main topic
    const topics = content.match(/\b(threat|vulnerability|risk|security|attack|defense)\b/gi);
    if (topics && topics.length > 0) {
      return `[${topics[0]} discussed]`;
    }
    
    return '[Previous message]';
  }

  /**
   * Estimate token count for text
   */
  _estimateTokens(text) {
    if (!text) return 0;
    // Rough estimate: 1 token per 3.5 characters
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Health check - currently always returns false as AI service is disabled
   */
  async healthCheck() {
    // AI compression service is disabled
    return false;
  }
}

module.exports = MessageCompactionService;