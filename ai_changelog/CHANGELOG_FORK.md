# Changelog (Fork)

## Unreleased

### Added
- Local model management system from `specs/local-models-management-requirements.md`, including the new Models settings view with default model summary, recommended/local/custom filters, preference toggles, custom-provider CRUD, and download/import actions with live progress + metadata cards (`src/renderer/src/pages/settings-models.tsx`, `src/renderer/src/components/models/*`).
- Model registry + download pipeline that catalogs shipped GGML builds, streams Hugging Face downloads with progress/ETA, tracks imported `.bin` files, and exposes TIPC/query hooks for import/delete/set-default/reveal flows (`src/main/model-manager.ts`, `src/main/tipc.ts`, `src/shared/models/{catalog,types}.ts`, `src/renderer/src/lib/query-client.ts`).
- Local transcription end-to-end: Recorder now emits mono 16 kHz WAV blobs, the main process resolves downloaded local models and spawns the enhanced `whispo-rs transcribe` command (whisper-rs powered) to run GGML files offline with abort + logging support (`src/renderer/src/lib/recorder.ts`, `src/main/{tipc.ts,local-transcriber.ts,native-binary.ts}`, `whispo-rs/src/main.rs`, `whispo-rs/Cargo.toml`).
- Console logging now annotates each transcription with the STT model/provider (cloud or default local) so debug logs show exactly which engine produced the text (`src/main/tipc.ts`).
- `Instant Ctrl` and `Fn Key (push-to-talk)` shortcut options in Settings (`src/renderer/src/pages/settings-general.tsx`, `src/shared/types.ts`).
- Dedicated Fn-key flow in the keyboard listener and hint toast overlay rendered outside the panel (`src/main/keyboard.ts`, `src/main/hint-window.ts`).
- Graceful cancelation handling when ESC aborts a transcription, including AbortController wiring in `createRecording` and state reset in the renderer (`src/main/tipc.ts`, `src/renderer/src/pages/panel.tsx`).
- New `cancelTranscription` IPC endpoint+docs (`src/main/tipc.ts`, `src/shared/data-model.ts`).

### Changed
- Setting a default local model now automatically switches the STT provider to that engine, and a migration updates existing configs so they stop falling back to OpenAI when a local default exists (`src/main/tipc.ts`, `src/main/config.ts`).
- Fixed regression where the migration kept forcing the STT provider back to a local model even after manually selecting a cloud provider; we now only auto-fill the provider when it was previously empty (`src/main/config.ts`).
- Recorder/export pipeline now converts microphone captures into mono 16 kHz WAV files to feed both cloud APIs and the local whisper engine, with legacy `.webm` playback/deletion fallbacks for existing history (`src/renderer/src/lib/recorder.ts`, `src/main/{tipc.ts,serve.ts}`).
- Panel UI now displays a spinner overlay only during transcription and no longer renders the ESC hint inside the capsule (`src/renderer/src/pages/panel.tsx`).
- `postProcessTranscript` accepts an AbortSignal and respects cancelation (`src/main/llm.ts`).
- Quickstart docs updated with the shortcut matrix (`quickstart.md`, `ai_docs/quickstart.md`).
- Reinitialized Git repository under `whispo/` to ensure a clean fork baseline.

### Fixed
- Multiple Electron instances no longer needed for cancelation; ESC double-press now aborts without error popups.
- Clipboard preservation & push-to-talk state resets after cancelation to prevent stuck shortcuts.
