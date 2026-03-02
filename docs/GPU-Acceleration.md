# GPU Acceleration in Browser-Based ContextCypher

This guide covers GPU acceleration for running local LLMs with Ollama in the browser-based version of ContextCypher. The browser architecture provides native GPU acceleration through WebGL and WebGPU APIs for the UI, while Ollama handles GPU acceleration for AI inference.

## Overview

ContextCypher automatically detects and utilizes GPU acceleration when available through Ollama. This can provide 5-10x performance improvements over CPU-only inference.

## System Requirements

### Minimum Requirements
- **GPU**: NVIDIA GPU with Compute Capability 5.0+ (GTX 1050 Ti or newer)
- **Driver**: NVIDIA Driver version 531.0 or newer
- **VRAM**: Minimum 4GB (8GB+ recommended for larger models)
- **OS**: Windows 10/11 64-bit

### Recommended Specifications
- **GPU**: RTX 3060 or better (12GB+ VRAM)
- **Driver**: Latest NVIDIA Game Ready or Studio driver
- **VRAM**: 8-24GB depending on model size
- **System RAM**: 16GB+ (for model loading and context)

## GPU Compatibility

### Supported GPUs
| GPU Series | Compute Capability | VRAM | Recommended Models |
|------------|-------------------|------|-------------------|
| GTX 1050-1080 Ti | 6.1 | 4-11GB | 7B models |
| RTX 2060-2080 Ti | 7.5 | 6-11GB | 7B-13B models |
| RTX 3060-3090 | 8.6 | 12-24GB | 13B-30B models |
| RTX 4060-4090 | 8.9 | 8-24GB | 13B-70B models |
| RTX A4000-A6000 | 8.6 | 16-48GB | 30B-70B models |

## Checking GPU Status in Browser

### 1. Open Settings
- Access the application at http://localhost:3000
- Click the Settings icon (⚙️) in the top-right corner
- Navigate to the "General" tab
- Ensure "Local LLM (Ollama)" is selected

### 2. View GPU Status
The GPU Acceleration Status section shows:
- **GPU Detection**: Whether a compatible GPU is found
- **Active Status**: If GPU layers are loaded
- **Layer Distribution**: e.g., "35/35 layers on GPU"
- **Memory Usage**: Current VRAM utilization

### 3. Status Indicators
- 🟢 **Green (Active)**: GPU acceleration is working
- 🟡 **Yellow (Available)**: GPU detected but not in use
- 🔵 **Blue (CPU Only)**: No GPU detected, using CPU

## Enabling GPU Acceleration

### Method 1: Automatic Detection
Ollama automatically detects and uses available GPUs. No configuration needed for basic usage.

### Method 2: Force GPU Layers
When pulling a model, specify GPU layers:
```bash
ollama run llama3.1:8b --gpu-layers 35
```

### Method 3: Environment Variables
Set system environment variables:
```bash
# Windows Command Prompt
set CUDA_VISIBLE_DEVICES=0
set OLLAMA_GPU_MEMORY_FRACTION=0.9

# PowerShell
$env:CUDA_VISIBLE_DEVICES="0"
$env:OLLAMA_GPU_MEMORY_FRACTION="0.9"
```

## Performance Optimization

### 1. GPU Memory Fraction
Control how much GPU memory Ollama can use:
- Default: 0.9 (90% of VRAM)
- Conservative: 0.7-0.8 (leaves room for other apps)
- Maximum: 0.95 (dedicated GPU use)

Set in ContextCypher Settings → Performance Tuning

### 2. CPU Thread Optimization
Balance CPU/GPU workload:
- **0 (Auto)**: Let Ollama decide
- **4-8 threads**: Good for hybrid CPU/GPU
- **1-2 threads**: When fully GPU accelerated

### 3. Batch Size Tuning
Larger batches = better GPU utilization:
- **CPU**: 128-256 tokens
- **GPU**: 512-1024 tokens
- **High-end GPU**: 1024-2048 tokens

### 4. Advanced GPU Settings

The browser-based ContextCypher provides comprehensive GPU control through the Settings panel. These settings are stored in browser localStorage and synchronized with the backend server:

#### GPU Memory Overhead
- **What it does**: Reserves GPU memory (in MB) for other applications
- **Default**: 1024 MB (1 GB)
- **When to adjust**:
  - Increase if you run other GPU apps (games, video editing)
  - Decrease to 256-512 MB for dedicated AI workstation
  - Set to 2048+ MB if experiencing GPU out-of-memory errors

#### Parallel Requests
- **What it does**: Number of simultaneous model executions
- **Default**: 1
- **When to adjust**:
  - Keep at 1 for single-user desktop use
  - Increase to 2-4 for team/server deployments
  - Higher values require more VRAM (each uses full model size)

#### Max Loaded Models
- **What it does**: Maximum models kept in GPU memory
- **Default**: 1
- **When to adjust**:
  - Keep at 1 for limited VRAM (< 12GB)
  - Increase to 2-3 if switching between models frequently
  - Each loaded model consumes its full VRAM requirement

#### Model Keep Alive
- **What it does**: Time to keep models loaded after last use
- **Default**: '5m' (5 minutes)
- **Format**: Use 's' (seconds), 'm' (minutes), 'h' (hours)
- **When to adjust**:
  - Increase to '1h' or '24h' for frequent use
  - Decrease to '30s' or '1m' to free VRAM quickly
  - Set to '0' to unload immediately after use

#### GPU Layers
- **What it does**: Number of model layers to load on GPU
- **Default**: -1 (all layers)
- **When to adjust**:
  - Keep at -1 for full GPU acceleration
  - Reduce if model doesn't fit in VRAM
  - Example: Set to 20-30 for partial GPU loading

#### GPU Selection
- **What it does**: Choose specific GPU(s) to use
- **Options**:
  - Auto: Let system decide
  - GPU 0/1: Select specific GPU
  - Multi-GPU (0,1): Use multiple GPUs
- **When to adjust**:
  - Use specific GPU if you have multiple
  - Reserve one GPU for display/other tasks

### 5. Model Selection by VRAM

| VRAM | Recommended Models | Context Window |
|------|-------------------|----------------|
| 4GB | llama3.1:3b, mistral:7b-q4 | 8-16k |
| 8GB | llama3.1:8b, mistral:7b | 16-32k |
| 12GB | llama3.1:13b, mixtral:8x7b-q4 | 32-64k |
| 16GB+ | llama3.1:70b-q4, mixtral:8x7b | 64-128k |

## Real-Time Performance Monitoring

### Streaming Indicators
During generation, ContextCypher displays:
- **Connection Status**: "Connecting to Ollama..."
- **Model Loading**: "Loading model..."
- **Generation Speed**: "X.X tokens/sec"
- **Time to First Token**: Response latency

### Performance Metrics
- **Tokens/Second**: Higher is better (GPU: 20-100+, CPU: 1-10)
- **First Token Time**: Lower is better (<2s optimal)
- **Memory Usage**: Monitor to prevent OOM errors

## Troubleshooting

### GPU Not Detected

1. **Check NVIDIA Drivers**
   ```bash
   nvidia-smi
   ```
   Should show GPU info and driver version

2. **Verify CUDA Installation**
   ```bash
   nvcc --version
   ```
   Optional but recommended for best performance

3. **Restart Ollama**
   ```bash
   ollama serve
   ```

### GPU Available but Not Used

1. **Check Model Configuration**
   ```bash
   ollama show modelname --modelfile
   ```
   Look for `PARAMETER num_gpu` setting

2. **Pull Model with GPU Layers**
   ```bash
   ollama pull llama3.1:8b --gpu-layers -1
   ```
   -1 uses all available layers

3. **Memory Constraints**
   - Model may be too large for GPU
   - Try quantized versions (q4, q5)

### Performance Issues

1. **Low Token Generation Speed**
   - Reduce context window size
   - Use smaller/quantized models
   - Check for thermal throttling

2. **Out of Memory Errors**
   - Reduce GPU memory fraction
   - Use smaller batch sizes
   - Close other GPU applications

3. **Intermittent Performance**
   - Check GPU temperature
   - Ensure adequate cooling
   - Monitor for power throttling

## Applying Advanced GPU Settings

### Settings That Apply Immediately
These settings are sent directly to Ollama with each request:
- **GPU Layers** (num_gpu)
- **CPU Threads** (num_thread) 
- **Batch Size** (num_batch)

### Settings That Require Environment Variables
These settings must be set before starting Ollama:

```powershell
# Windows PowerShell Example
$env:OLLAMA_GPU_MEMORY_FRACTION="0.9"
$env:OLLAMA_GPU_OVERHEAD="1073741824"  # 1GB in bytes
$env:OLLAMA_NUM_PARALLEL="2"
$env:OLLAMA_MAX_LOADED_MODELS="2"
$env:OLLAMA_KEEP_ALIVE="30m"
$env:CUDA_VISIBLE_DEVICES="0"

# Then start Ollama
ollama serve
```

**Important**: ContextCypher shows the exact PowerShell commands to use based on your current settings in the Advanced GPU Settings section.

## Advanced Configuration

### Custom Model Creation with GPU Optimization
```modelfile
FROM llama3.1:8b
PARAMETER num_gpu 35
PARAMETER num_ctx 32768
PARAMETER num_batch 512
PARAMETER num_thread 4
```

### Multi-GPU Setup
```bash
# Use specific GPU
export CUDA_VISIBLE_DEVICES=0

# Use multiple GPUs
export CUDA_VISIBLE_DEVICES=0,1
```

### Performance Profiling
Enable detailed timing:
```bash
export OLLAMA_DEBUG=1
ollama run model --verbose
```

## Best Practices

### 1. Model Selection
- Choose models that fit comfortably in VRAM
- Leave 10-20% VRAM headroom
- Use quantized models for larger parameter counts

### 2. Context Management
- Start with smaller context windows
- Increase gradually based on needs
- Monitor token usage in real-time

### 3. System Configuration
- Disable Windows GPU scheduling
- Set GPU to "Prefer Maximum Performance"
- Ensure adequate system cooling

### 4. Regular Maintenance
- Update NVIDIA drivers monthly
- Keep Ollama updated
- Monitor GPU health/temperatures

## Benchmarking Your Setup

### Quick Test
1. Open ContextCypher
2. Load a medium complexity diagram
3. Request threat analysis
4. Monitor token generation speed

### Expected Performance

| Configuration | Tokens/Second | First Token |
|--------------|---------------|-------------|
| CPU Only | 1-5 | 5-15s |
| GTX 1660 | 10-20 | 2-5s |
| RTX 3060 | 20-40 | 1-3s |
| RTX 4090 | 50-100+ | <1s |

## Browser-Specific GPU Benefits

### UI Performance
- **ReactFlow Rendering**: Native browser GPU acceleration for smooth diagram interactions
- **Canvas Operations**: Hardware-accelerated drawing and animations
- **WebGL Support**: Enhanced performance for complex visualizations
- **No WebView2 Overhead**: Direct browser GPU access eliminates middleware bottlenecks

### AI Integration Features

#### Threat Analysis
- GPU acceleration significantly speeds up comprehensive threat analysis
- WebSocket streaming provides real-time updates in the browser
- Progress indicators show token generation speed

#### Diagram Generation
- Browser's GPU handles smooth ReactFlow rendering
- Ollama's GPU processes AI-assisted diagram creation
- Dual GPU utilization for optimal performance

#### Chat Interactions
- Near real-time responses with GPU acceleration
- Browser handles UI updates while Ollama processes AI
- Efficient memory usage with browser's built-in optimization

## Browser Architecture Advantages

### GPU Utilization
1. **Browser GPU**: Handles all UI rendering, animations, and visualizations
2. **Ollama GPU**: Dedicated to AI model inference
3. **Separation of Concerns**: No competition between UI and AI for GPU resources

### Performance Benefits
- Native browser GPU APIs (WebGL, WebGPU)
- Hardware-accelerated CSS transforms
- Efficient memory management
- No desktop wrapper overhead

### Development Benefits
- Browser DevTools GPU profiling
- Real-time performance monitoring
- Easy debugging of GPU-related issues

## Additional Resources

- [Ollama Documentation](https://ollama.ai/docs)
- [NVIDIA CUDA Toolkit](https://developer.nvidia.com/cuda-toolkit)
- [ContextCypher Settings Guide](./Settings-Guide.md)
- [Performance Tuning Guide](./Performance-Tuning.md)

## Browser-Specific Troubleshooting

### Browser GPU Issues
1. **Check WebGL Support**
   - Visit chrome://gpu or about:gpu in your browser
   - Ensure WebGL and Hardware Acceleration are enabled
   
2. **Browser Settings**
   - Chrome: Settings → System → Use hardware acceleration
   - Firefox: Settings → Performance → Use hardware acceleration
   
3. **Performance Monitoring**
   - Open Browser DevTools (F12)
   - Check Performance tab for GPU metrics
   - Monitor rendering performance

### Ollama GPU Issues
1. Check GPU status in Settings panel
2. Review Ollama logs: `%LOCALAPPDATA%\Ollama\logs`
3. Verify backend connection at http://localhost:3002
4. Check browser console for WebSocket errors

### Support Resources
- Browser GPU info: chrome://gpu or about:gpu
- WebGL test: https://get.webgl.org/
- Browser DevTools documentation
- ContextCypher GitHub issues