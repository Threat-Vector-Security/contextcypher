# Message History Compaction Architecture

## Executive Summary

The Message History Compaction system introduces intelligent compression and summarization of conversation history to maximize context retention within token limits. This transparent feature compresses older messages while preserving critical information, enabling longer conversations without losing important context.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Compaction Strategy](#compaction-strategy)
3. [Implementation Design](#implementation-design)
4. [Compaction Algorithms](#compaction-algorithms)
5. [User Experience](#user-experience)
6. [Performance Characteristics](#performance-characteristics)
7. [Integration with Dynamic Context](#integration-with-dynamic-context)

## Architecture Overview

### Design Principles

1. **Transparency**: Compaction occurs automatically without user intervention
2. **Intelligence**: Preserves critical information while removing redundancy
3. **Progressive**: Different compression levels based on message age and importance
4. **Reversible**: Option to view original messages when needed
5. **Efficient**: Minimal performance impact on chat experience

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               AnalysisPanel.tsx                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Message   │  │  Compaction │  │   Status    │  │  │
│  │  │   Display   │  │   Trigger   │  │  Indicator  │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ Compaction Request
┌────────────────────────▼────────────────────────────────────┐
│                  MessageCompactionService.js                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Message History Compaction Engine            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Message    │  │ Compression │  │  Semantic   │  │  │
│  │  │ Classifier  │  │  Levels     │  │ Summarizer  │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ AI-Powered Summarization
┌────────────────────────▼────────────────────────────────────┐
│             (Optional Python Service)                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Compression Agent Pool                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Summary    │  │   Key Point │  │  Context    │  │  │
│  │  │   Agent     │  │  Extractor  │  │  Merger     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Compaction Strategy

### Progressive Compression Levels

```javascript
const CompressionLevels = {
  NONE: 0,        // Last 2-3 messages: Keep full content
  LIGHT: 1,       // Recent messages (4-10): Remove formatting, examples
  MEDIUM: 2,      // Middle messages (11-30): Summarize to key points
  HEAVY: 3,       // Old messages (31-50): Single paragraph summary
  ULTRA: 4,       // Ancient messages (50+): Single sentence or topic only
};
```

### Message Importance Classification

```javascript
const MessageImportance = {
  CRITICAL: 5,    // Threat findings, security issues, decisions
  HIGH: 4,        // User questions, key analysis results
  MEDIUM: 3,      // Detailed explanations, recommendations
  LOW: 2,         // Confirmations, status updates
  MINIMAL: 1      // Greetings, acknowledgments
};
```

## Implementation Design

### 1. Compaction Service Extension

Implementation in `MessageCompactionService.js`:

```javascript
class MessageCompactionService {
  // ... existing code ...

  /**
   * Compact message history to fit within token budget
   * @param {Array} messageHistory - Original message history
   * @param {number} availableTokens - Token budget for history
   * @param {Object} options - Compaction options
   * @returns {Object} Compacted history with metadata
   */
  async compactMessageHistory(messageHistory, availableTokens, options = {}) {
    const {
      preserveRecent = 3,      // Always keep N recent messages uncompressed
      enableAISummary = true,  // Use AI for intelligent summarization
      compressionRatio = 0.3,  // Target compression ratio for old messages
      blockUI = false          // Whether to block UI during compaction
    } = options;

    // Phase 1: Classify messages by importance and age
    const classifiedMessages = this._classifyMessages(messageHistory);

    // Phase 2: Calculate compression strategy
    const compressionPlan = this._calculateCompressionPlan(
      classifiedMessages, 
      availableTokens
    );

    // Phase 3: Apply compression (potentially async with AI)
    if (enableAISummary && this._requiresAICompression(compressionPlan)) {
      return await this._performAICompression(classifiedMessages, compressionPlan);
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
        content.includes('risk score')) {
      return MessageImportance.CRITICAL;
    }
    
    // High: User questions and key analysis
    if (message.type === 'question' || 
        content.includes('analysis complete') ||
        content.includes('recommendation')) {
      return MessageImportance.HIGH;
    }
    
    // Medium: Detailed explanations
    if (content.length > 500 || content.includes('architecture')) {
      return MessageImportance.MEDIUM;
    }
    
    // Low: Status updates
    if (message.type === 'loading' || content.includes('processing')) {
      return MessageImportance.LOW;
    }
    
    return MessageImportance.MINIMAL;
  }

  /**
   * Perform AI-powered compression (optional if Python service available)
   */
  async _performAICompression(messages, compressionPlan) {
    try {
      // Group messages by compression level for batch processing
      const compressionGroups = this._groupByCompressionLevel(messages);
      
      // Send to Python service for intelligent compression (if available)
      const response = await axios.post(
        `${this.serviceUrl}/compress/messages`,
        {
          message_groups: compressionGroups,
          compression_plan: compressionPlan,
          preserve_context: true,
          model_config: this.modelConfig
        },
        { timeout: 15000 } // 15 second timeout for compression
      );

      if (response.data.success) {
        return {
          messages: response.data.compressed_messages,
          metadata: {
            originalCount: messages.length,
            compressedCount: response.data.compressed_messages.length,
            compressionRatio: response.data.compression_ratio,
            tokensSaved: response.data.tokens_saved
          }
        };
      }
    } catch (error) {
      logger.warn('AI compression failed, falling back to local compression:', error);
      return this._performLocalCompression(messages, compressionPlan);
    }
  }

  /**
   * Perform local compression without AI assistance
   */
  _performLocalCompression(messages, compressionPlan) {
    const compressed = messages.map(msg => {
      const level = msg.metadata.compressionLevel;
      
      if (level === CompressionLevels.NONE) {
        return msg;
      }
      
      let compressedContent = msg.content;
      
      switch (level) {
        case CompressionLevels.LIGHT:
          compressedContent = this._lightCompression(msg.content);
          break;
        case CompressionLevels.MEDIUM:
          compressedContent = this._mediumCompression(msg.content);
          break;
        case CompressionLevels.HEAVY:
          compressedContent = this._heavyCompression(msg.content);
          break;
        case CompressionLevels.ULTRA:
          compressedContent = this._ultraCompression(msg.content);
          break;
      }
      
      return {
        ...msg,
        content: compressedContent,
        metadata: {
          ...msg.metadata,
          compressed: true,
          originalLength: msg.content.length,
          compressedLength: compressedContent.length
        }
      };
    });

    return {
      messages: compressed,
      metadata: {
        compressionApplied: true,
        method: 'local'
      }
    };
  }

  /**
   * Light compression: Remove formatting and redundancy
   */
  _lightCompression(content) {
    // Remove markdown formatting
    let compressed = content.replace(/```[\s\S]*?```/g, '[code block]');
    // Remove excessive whitespace
    compressed = compressed.replace(/\n{3,}/g, '\n\n');
    // Remove example snippets
    compressed = compressed.replace(/Example:[\s\S]*?(?=\n\n)/g, '[example removed]');
    
    return compressed;
  }

  /**
   * Medium compression: Extract key points
   */
  _mediumCompression(content) {
    const lines = content.split('\n');
    const keyPoints = [];
    
    lines.forEach(line => {
      // Keep lines with important keywords
      if (line.includes('recommend') ||
          line.includes('found') ||
          line.includes('identified') ||
          line.includes('issue') ||
          line.includes('should') ||
          line.includes('must')) {
        keyPoints.push(line.trim());
      }
    });
    
    if (keyPoints.length === 0) {
      // Fallback: Take first and last sentences
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length > 2) {
        return `${sentences[0].trim()} [...] ${sentences[sentences.length - 1].trim()}`;
      }
    }
    
    return keyPoints.slice(0, 5).join('\n');
  }

  /**
   * Heavy compression: Single paragraph summary
   */
  _heavyCompression(content) {
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length === 0) return '[Message compressed]';
    
    // Take first sentence and any sentence with key terms
    const summary = [sentences[0]];
    
    sentences.slice(1).forEach(sentence => {
      if (sentence.includes('vulnerability') ||
          sentence.includes('threat') ||
          sentence.includes('recommend') ||
          sentence.includes('critical')) {
        summary.push(sentence);
      }
    });
    
    return summary.slice(0, 3).join(' ').trim();
  }

  /**
   * Ultra compression: Topic only
   */
  _ultraCompression(content) {
    // Extract main topic
    if (content.includes('threat')) return '[Threat analysis discussion]';
    if (content.includes('vulnerability')) return '[Vulnerability assessment]';
    if (content.includes('architecture')) return '[Architecture review]';
    if (content.includes('security')) return '[Security discussion]';
    
    // Fallback: First 50 characters
    return content.substring(0, 50) + '...';
  }
}
```

### 2. Frontend Integration

Update `AnalysisContextProvider.tsx`:

```typescript
interface CompactionState {
  isCompacting: boolean;
  lastCompactionTime: Date | null;
  compressionRatio: number;
  tokensSaved: number;
}

const calculateOptimalMessageHistory = async (
  messageHistory: ChatMessage[], 
  availableTokens: number, 
  reservedTokens: number,
  enableCompaction: boolean = true
): Promise<OptimalMessageHistory> => {
  const availableForHistory = Math.max(200, availableTokens - reservedTokens);
  
  // First try without compaction
  let result = calculateBasicHistory(messageHistory, availableForHistory);
  
  // If we're using less than 50% of available tokens, try compaction
  if (enableCompaction && result.tokenCount < availableForHistory * 0.5) {
    try {
      const compactionService = MessageCompactionService.getInstance();
      const compacted = await compactionService.compactMessageHistory(
        messageHistory,
        availableForHistory,
        {
          preserveRecent: 3,
          enableAISummary: true,
          compressionRatio: 0.3
        }
      );
      
      return {
        messages: compacted.messages,
        tokenCount: calculateTokens(compacted.messages),
        messageCount: compacted.messages.length,
        compressionApplied: true,
        metadata: compacted.metadata
      };
    } catch (error) {
      console.warn('Compaction failed, using uncompressed history:', error);
    }
  }
  
  return result;
};
```

### 3. UI Indicators

Add to `AnalysisPanel.tsx`:

```typescript
// Show compression indicator when active
{state.compressionActive && (
  <Box sx={{ 
    display: 'flex', 
    alignItems: 'center', 
    gap: 0.5,
    padding: '4px 8px',
    backgroundColor: alpha(theme.colors.info, 0.1),
    borderRadius: '4px',
    fontSize: '0.7rem'
  }}>
    <CircularProgress size={12} />
    <Typography variant="caption">
      Optimizing conversation history...
    </Typography>
  </Box>
)}

// Show compression stats in tooltip
{state.compressionStats && (
  <Tooltip title={
    <Box>
      <Typography variant="caption">
        Message History Optimization:
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        • Original: {state.compressionStats.originalMessages} messages
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        • Compressed: {state.compressionStats.compressedMessages} messages
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        • Tokens saved: {formatTokenCount(state.compressionStats.tokensSaved)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        • Compression ratio: {Math.round(state.compressionStats.ratio * 100)}%
      </Typography>
    </Box>
  }>
    <Chip
      size="small"
      icon={<CompressIcon size={12} />}
      label={`${Math.round(state.compressionStats.ratio * 100)}% compressed`}
      sx={{ fontSize: '0.7rem' }}
    />
  </Tooltip>
)}
```

## Compaction Algorithms

### 1. Semantic Deduplication

```python
class SemanticDeduplicator:
    """Remove redundant information across messages"""
    
    def deduplicate(self, messages: List[Message]) -> List[Message]:
        # Build semantic embeddings for each message
        embeddings = self._generate_embeddings(messages)
        
        # Find similar content clusters
        clusters = self._cluster_similar_content(embeddings)
        
        # Keep representative message from each cluster
        deduplicated = []
        for cluster in clusters:
            representative = self._select_representative(cluster)
            deduplicated.append(representative)
        
        return deduplicated
```

### 2. Key Point Extraction

```python
class KeyPointExtractor:
    """Extract critical information from messages"""
    
    def extract(self, message: str) -> str:
        # Identify key sentences using TextRank
        sentences = self._split_sentences(message)
        scores = self._calculate_textrank_scores(sentences)
        
        # Keep top-scoring sentences
        key_sentences = self._select_top_sentences(sentences, scores, n=3)
        
        # Preserve critical security terms
        if self._contains_security_terms(message):
            security_sentences = self._extract_security_sentences(sentences)
            key_sentences.extend(security_sentences)
        
        return ' '.join(key_sentences)
```

### 3. Conversation Summarization

```python
class ConversationSummarizer:
    """Generate summaries of conversation segments"""
    
    def summarize_thread(self, messages: List[Message]) -> str:
        # Group messages by topic
        topics = self._identify_topics(messages)
        
        # Generate summary for each topic
        summaries = []
        for topic, topic_messages in topics.items():
            summary = self._summarize_topic(topic, topic_messages)
            summaries.append(f"{topic}: {summary}")
        
        return '\n'.join(summaries)
```

## User Experience

### Transparent Operation

1. **Automatic Triggering**
   - Compaction occurs when approaching token limits
   - No user intervention required
   - Preserves ongoing conversation flow

2. **Visual Feedback**
   - Subtle indicator when compaction is active
   - Token savings displayed in UI
   - Compression statistics available on hover

3. **Message Preservation**
   - Recent messages always kept in full
   - Critical security findings never compressed
   - Option to view original messages

### Configuration Options

```typescript
interface CompactionSettings {
  enabled: boolean;                    // Enable/disable compaction
  preserveRecentCount: number;         // Number of recent messages to keep full
  useAISummarization: boolean;         // Use AI for intelligent compression
  compressionAggressiveness: 'low' | 'medium' | 'high';
  preserveUserMessages: boolean;       // Never compress user questions
  compactOnTokenThreshold: number;     // Trigger when using X% of tokens
}
```

## Performance Characteristics

### Compression Ratios

| Message Age | Compression Level | Typical Ratio | Token Savings |
|-------------|------------------|---------------|---------------|
| 1-3 messages | None | 100% | 0% |
| 4-10 messages | Light | 80% | 20% |
| 11-30 messages | Medium | 40% | 60% |
| 31-50 messages | Heavy | 20% | 80% |
| 50+ messages | Ultra | 5% | 95% |

### Performance Impact

- **Local compression**: < 50ms for 100 messages
- **AI compression**: 1-3 seconds (async, non-blocking)
- **Memory usage**: Negligible increase
- **Network overhead**: One additional API call when using AI

## Integration with Dynamic Context

### Token Budget Allocation

```javascript
const allocateTokensWithCompaction = (availableTokens) => {
  const budget = {
    systemPrompt: 200,
    diagram: Math.min(2000, availableTokens * 0.25),
    customContext: Math.min(1000, availableTokens * 0.15),
    messageHistory: availableTokens * 0.50,  // 50% for history with compaction
    reserve: availableTokens * 0.10
  };
  
  // With compaction, we can effectively fit 3-5x more message history
  const effectiveHistoryCapacity = budget.messageHistory * 3;
  
  return {
    ...budget,
    effectiveHistoryCapacity,
    compactionEnabled: true
  };
};
```

### Adaptive Compaction

The system adjusts compression aggressiveness based on:

1. **Available token window**: More aggressive with smaller models
2. **Conversation length**: Increases compression for longer chats
3. **Content importance**: Preserves critical security information
4. **User preferences**: Respects configuration settings

## Benefits

1. **Extended Conversations**: 3-5x longer conversation memory
2. **Context Preservation**: Critical information never lost
3. **Token Efficiency**: Optimal use of available capacity
4. **Seamless Experience**: Transparent to users
5. **Intelligent Compression**: AI-powered summarization

## Future Enhancements

1. **Embedding-based similarity**: Use vector embeddings for better deduplication
2. **User-controlled compression**: Manual compression triggers
3. **Compression preview**: Show before/after compression
4. **Selective expansion**: Expand compressed messages on demand
5. **Learning compression**: Adapt based on user interaction patterns

---

*Last Updated: January 2025*
*Version: 1.0*
*Compatible with: AI Threat Modeler v1.0+*