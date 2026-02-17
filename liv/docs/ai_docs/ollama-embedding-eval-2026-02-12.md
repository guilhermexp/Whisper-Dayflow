# Ollama Embedding Evaluation (2026-02-12)

## Environment
- Host: local machine (macOS)
- Ollama: `0.15.5`
- Installed embedding model: `qwen3-embedding:0.6b`

## Local checks
- `ollama list` shows `qwen3-embedding:0.6b` installed (`639 MB`)
- Direct `/api/embed` call latency measured around `~1.18s` for a short input using local Ollama server

## Recommendation
1. Default embedding model: `qwen3-embedding:0.6b`
- Lowest resource footprint
- Good default for background semantic indexing
- Best option when app is running continuously on user workstation

2. Optional upgrade model: `qwen3-embedding:4b`
- Better quality for semantic retrieval
- Higher memory/CPU usage
- Keep as opt-in download in settings

## Product decision
- Keep OpenAI as fallback provider
- Prefer Ollama embeddings when provider is set to `ollama`
- Expose model download/selection in Settings to reduce API costs with controlled local resource usage

## References
- Ollama `/api/embed`: https://docs.ollama.com/api/embed
- Ollama `/api/pull`: https://docs.ollama.com/api/pull
- Qwen 0.6B GGUF model card: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF
