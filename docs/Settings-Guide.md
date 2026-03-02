# ContextCypher Settings Guide

This guide documents key settings for local and npm-installed ContextCypher deployments.

## Open Settings

1. Start ContextCypher.
2. Click the gear icon.
3. Configure provider, model, and performance options.

## AI Provider Settings

### Local (Ollama)

- Recommended for offline and private analysis.
- Base URL default: `http://localhost:11434`
- Choose a locally available model (for example `llama3.2`).

### Cloud Providers

- OpenAI
- Anthropic
- Google Gemini

For cloud providers, add API keys in Settings and validate with a test request.

## Model And Generation Settings

Common controls:

- Temperature
- Max tokens
- Context window
- Timeout and retry behavior

Use lower temperature for deterministic security outputs and higher temperature for ideation.

## GPU And Performance Settings

ContextCypher can pass performance settings to Ollama request options.

Common settings:

- GPU layers (`num_gpu`)
- CPU threads (`num_thread`)
- Batch size (`num_batch`)
- Keep-alive duration
- Parallel request limits

See [Performance Tuning Guide](./Performance-Tuning.md) for detailed tuning and validation steps.

## Security And Data Settings

- Prefer local provider for sensitive models.
- Keep sanitization enabled for exported or shared data.
- Review environment-specific app secrets before production deployment.

## Network And Port Settings

Default preferred server port is `3001`.

Custom port examples:

```bash
# macOS/Linux
PORT=3003 contextcypher
```

```powershell
# Windows PowerShell
$env:PORT='3003'; contextcypher
```

## Troubleshooting Settings

If settings appear stale:

1. restart ContextCypher
2. re-open Settings and re-save
3. verify backend is reachable
4. check logs for validation errors

## Related Docs

- [GPU Acceleration](./GPU-Acceleration.md)
- [Performance Tuning Guide](./Performance-Tuning.md)
- [Backend Architecture](./Backend-Architecture.md)
