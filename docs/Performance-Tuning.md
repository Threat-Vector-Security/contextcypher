# ContextCypher Performance Tuning Guide

Use this guide to improve responsiveness for diagram rendering and AI generation.

## 1. Baseline First

Before tuning, capture a baseline:

- model name
- prompt size / context size
- first-token latency
- tokens per second
- memory usage

## 2. Hardware Priorities

1. Fast SSD
2. Enough RAM (8GB minimum, 16GB+ recommended for local AI)
3. GPU VRAM appropriate for selected model

## 3. Ollama Runtime Tuning

Key parameters:

- `num_gpu`: layers on GPU (`-1` = all)
- `num_thread`: CPU worker threads
- `num_batch`: token batch size
- keep-alive: model unload delay

Start conservative, then increase one parameter at a time.

## 4. Model Selection Strategy

- Smaller quantized models: faster startup and lower VRAM
- Larger models: better quality, slower inference
- Match model size to available VRAM to avoid swapping/OOM

## 5. Context And Prompt Strategy

- Keep prompts concise and structured
- Avoid oversized context where possible
- Reuse stable system instructions

Longer context windows increase memory use and latency.

## 6. Browser/UI Performance

- Keep browser hardware acceleration enabled
- Close heavy background tabs/apps
- Reduce extremely dense diagrams when editing

## 7. Port And Process Hygiene

If startup is slow because of port conflicts, run on a clean port:

```bash
PORT=3003 contextcypher
```

On Windows PowerShell:

```powershell
$env:PORT='3003'; contextcypher
```

## 8. Validate After Each Change

After each tuning step, record:

- first-token latency
- tokens/sec
- stability (errors/timeouts)

Keep only changes that improve both speed and stability.

## 9. Common Failure Modes

GPU out-of-memory:

- reduce model size
- reduce context size
- reduce `num_gpu` / batch size

Low throughput:

- verify Ollama uses GPU
- lower context size
- reduce concurrent workloads

Intermittent failures:

- increase request timeout
- lower concurrency
- check local logs and Ollama logs

## Related Docs

- [GPU Acceleration](./GPU-Acceleration.md)
- [Settings Guide](./Settings-Guide.md)
