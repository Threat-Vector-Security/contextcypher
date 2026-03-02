# Ollama Context Window Configuration

This document explains how to configure and optimize Ollama's context window (token limit) in AI Threat Modeler for better performance with large diagrams and extended conversations.

## Overview

By default, Ollama models use an 8,192 token context window regardless of the model's actual capabilities. For example, Llama 3.1 supports up to 128,000 tokens, but Ollama defaults to only 8K. This limitation can cause issues when analyzing large threat models or maintaining long conversations.

AI Threat Modeler now provides an integrated UI to create custom Ollama models with expanded context windows based on your available system RAM.

## Understanding Context Windows

### What is a Context Window?

The context window (measured in tokens) determines how much information the AI model can "remember" during a conversation. This includes:
- Your current message
- The system prompt
- Your diagram data (nodes, connections, metadata)
- Custom context information
- Recent message history
- Any drawings or annotations

### Token Limits vs Output Tokens

It's important to understand the difference:
- **Context Window (`num_ctx`)**: Total amount of input the model can process
- **Max Output Tokens (`num_predict`)**: Maximum length of the model's response

## RAM Requirements

Larger context windows require more system RAM. Here are the approximate requirements:

| Context Size | RAM Required | Use Case |
|--------------|--------------|----------|
| 8K tokens (default) | ~6GB | Small diagrams, short conversations |
| 16K tokens | ~8GB | Medium diagrams, extended analysis |
| 32K tokens | ~12GB | Large diagrams, comprehensive reviews |
| 64K tokens | ~20GB | Very large systems, detailed documentation |
| 128K tokens | ~35GB | Enterprise architectures, full system analysis |

## How to Configure Context Window

### Step 1: Open Settings

1. Click the Settings icon in the top-right corner
2. Navigate to the "General" tab
3. Ensure "Local LLM (Ollama)" is selected as your AI Mode

### Step 2: Access Context Configuration

In the Local LLM Configuration section, you'll find the new "Ollama Context Window" panel.

### Step 3: View Current Context

The panel displays your current model's context size. Click "Refresh" to update this information.

### Step 4: Create Custom Model

1. **Select Context Size**: Choose from preset options or enter a custom value
   - Presets show estimated RAM requirements
   - Custom option allows any positive token count

2. **Model Name**: The system suggests a name like `llama3.1:32k-context`
   - You can customize this name
   - Use descriptive names to identify different configurations

3. **Create Model**: Click the button to create your custom model
   - This creates a new Ollama model variant
   - No additional disk space is used (shares base model weights)
   - The process is typically instant

### Step 5: Use Your Custom Model

Once created, your custom model automatically becomes active. The Settings panel will update to show the new model name.

## Real-Time Token Monitoring

The Analysis Panel now shows real-time token usage with your actual Ollama context:

- **Green**: Safe zone (0-60% of context)
- **Yellow**: Caution (60-80% of context)
- **Orange**: Warning (80-100% of context)
- **Red**: Over limit (>100% of context)

The token breakdown tooltip shows:
- Current Ollama context size (actual, not theoretical)
- Detailed breakdown of token usage
- Warning when approaching limits

## Technical Details

### How It Works

1. **Model Creation**: Uses Ollama's Modelfile syntax to create variants:
   ```
   FROM llama3.1:8b
   PARAMETER num_ctx 32768
   ```

2. **No Duplication**: Custom models share weights with the base model
   - Only configuration differs
   - No additional storage required

3. **API Integration**: The app queries Ollama's API to:
   - Get current model context (`/api/show`)
   - Create custom models (`/api/create`)
   - Validate configurations

### Performance Considerations

- **Inference Speed**: Larger contexts = slower processing
- **Memory Usage**: Scales linearly with context size
- **Quality**: No impact on model quality (same weights)

## Best Practices

### Choosing Context Size

1. **Start Conservative**: Begin with 16K or 32K tokens
2. **Monitor Usage**: Watch the token counter during typical use
3. **Scale Up**: Increase if you frequently hit limits
4. **Consider RAM**: Leave headroom for OS and other applications

### Optimizing Token Usage

1. **Clear History**: Use the clear history button to reduce tokens
2. **Focused Queries**: Ask specific questions rather than broad ones
3. **Manage Context**: Remove unnecessary custom context when not needed

### Managing Multiple Models

You can create multiple variants for different use cases:
- `llama3.1:8k-context` - Quick queries, fast responses
- `llama3.1:32k-context` - Standard analysis
- `llama3.1:128k-context` - Comprehensive reviews

Switch between them based on your current needs.

## Troubleshooting

### Model Creation Fails

- **Check Ollama Status**: Ensure Ollama is running
- **Verify Base Model**: Confirm the base model exists (`ollama list`)
- **RAM Availability**: Ensure sufficient free RAM

### Context Not Updating

- **Refresh**: Click the refresh button
- **Model Selection**: Verify the custom model is selected
- **Restart Ollama**: Sometimes required after creating models

### Performance Issues

- **Reduce Context**: Use smaller context for routine tasks
- **Close Other Apps**: Free up system RAM
- **Monitor Usage**: Use system monitor to check RAM usage

## FAQ

**Q: Will this affect my existing Ollama models?**
A: No, custom models are separate variants. Your original models remain unchanged.

**Q: Can I delete custom models?**
A: Yes, use `ollama rm model-name` in terminal.

**Q: Do custom models persist across sessions?**
A: Yes, they're saved in Ollama and available system-wide.

**Q: What happens if I exceed the context limit?**
A: The model will truncate older context, potentially losing important information. The UI warns you before this happens.

**Q: Can I use this with any Ollama model?**
A: Yes, this works with any model Ollama supports.

## Example Workflow

1. **Analyzing a Large System**:
   - Start with default 8K context
   - Notice token warning when loading diagram
   - Create 32K variant: `mistral:32k-context`
   - Continue analysis with expanded context

2. **Extended Threat Modeling Session**:
   - Create 64K variant for long conversations
   - Maintain full context across multiple analyses
   - Export findings without losing detail

3. **Quick Diagram Review**:
   - Use default 8K for fast responses
   - No need for large context
   - Optimal performance

## Future Enhancements

Planned improvements include:
- Automatic context size recommendations
- Per-diagram context preferences
- Context usage analytics
- Batch model creation
- Cloud model support

## Conclusion

The Ollama Context Window Configuration feature gives you fine-grained control over your AI assistant's memory capacity. By matching context size to your specific needs and available resources, you can optimize both performance and capability for your threat modeling workflows.