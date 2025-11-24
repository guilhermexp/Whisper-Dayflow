# Parakeet Performance Update (2024-12-16)

Changes implemented to improve the local Parakeet TDT v3 experience across platforms:

- **Warmup on startup**: When Parakeet is the default local model, we preload the recognizer with a short silent WAV to eliminate cold-start latency for the first real transcription.
- **CoreML on macOS (Apple Silicon)**: Sherpa now prefers `provider=coreml` on macOS arm64 and falls back to CPU automatically if unavailable. Thread count defaults to all cores minus one.
- **CPU fallback (Windows/Linux)**: Continues to use CPU, with the same thread strategy and recognizer cache including provider+threads for correct reuse.
- **Audio preprocessing aligned to reference app**: No normalization; VAD only for clips ≥20s with threshold 0.7.
- **UI cleanup**: Removed the warmup toggle; behavior is now automatic and default.
- **Tooling**: ESLint ignores build artifacts via flat config; legacy `.eslintignore` removed.

Observed results (macOS M-series):
- Warmup load: ~6–7s one-time at app start.
- Subsequent transcription: ~0.5s for ~3s of audio (CoreML).

Next recommended check: build production and smoke-test on Windows to confirm CPU fallback remains solid (no GPU dependencies). 
