# Requirements: Clipboard Preservation

## 1. Overview
**Goal**: Implement clipboard preservation feature to prevent transcriptions from overwriting the user's clipboard (Cmd+V), while maintaining automatic text insertion and providing a dedicated hotkey (Ctrl+V) to paste the last transcription.

**User Problem**: Currently, every transcription overwrites the clipboard, losing any previously copied content. Users want to preserve their Cmd+V clipboard while still getting automatic text insertion.

**Reference Implementation**: VoiceInk (https://github.com/Beingpax/VoiceInk)

## 2. Functional Requirements

### 2.1 Core Features

- **FR-1**: Preserve User Clipboard During Transcription
  - When a transcription is completed, save the current clipboard content before temporary modification
  - Copy transcription to clipboard temporarily (for automatic insertion)
  - Restore original clipboard content after insertion completes (0.6 second delay)
  - Original clipboard (Cmd+V) remains unchanged after restoration

- **FR-2**: Automatic Text Insertion (No Change)
  - Continue inserting transcribed text automatically into active application
  - Use existing Rust binary (whispo-rs) for text simulation
  - Maintain current behavior and functionality

- **FR-3**: Global Hotkey for Last Transcription Paste
  - Register global hotkey Ctrl+V (configurable in settings)
  - When triggered, paste the last transcription at cursor position
  - Use the same paste mechanism as automatic insertion
  - Does not affect or use system clipboard

- **FR-4**: Last Transcription Storage
  - Store last transcription in application state/memory
  - Update on every successful transcription
  - Accessible by hotkey paste function
  - Persist across application restarts (use existing history.json)

### 2.2 User Stories

**US-1**: As a user, I want to copy text with Cmd+C and have it remain in my clipboard even after using voice transcription, so that I can paste my previously copied content without losing it.

**US-2**: As a user, I want to press Ctrl+V to paste my last transcription anywhere, so that I can reuse transcriptions without re-recording.

**US-3**: As a user, I want transcriptions to be automatically inserted into the active app as they do now, so that my current workflow is not disrupted.

## 3. Technical Requirements

### 3.1 Performance
- Clipboard save/restore operation: < 50ms
- No noticeable delay in automatic text insertion
- Hotkey response time: < 100ms

### 3.2 Constraints
- Technology: Electron + Node.js (main process)
- Existing clipboard API: electron.clipboard
- Existing text insertion: whispo-rs binary
- No external dependencies required

### 3.3 Platform Support
- macOS: Full support
- Windows: Full support
- Same behavior on both platforms

### 3.4 Integration Points
- Modify: whispo/src/main/tipc.ts (createRecording function)
- Modify: whispo/src/main/keyboard.ts (add global hotkey listener)
- Modify: whispo/src/shared/types.ts (add config option)
- Add: New clipboard preservation module/utility

## 4. Acceptance Criteria

### AC-1: Clipboard Preservation
- Given user has text in clipboard (Cmd+C)
- When voice transcription completes and auto-inserts
- Then original clipboard content is restored after 0.6 seconds
- And Cmd+V pastes the original content, not the transcription

### AC-2: Automatic Insertion Still Works
- Given user completes a voice transcription
- When transcription finishes
- Then text is automatically inserted into active application
- And insertion happens immediately without user action

### AC-3: Ctrl+V Hotkey Functionality
- Given user has completed at least one transcription
- When user presses Ctrl+V in any application
- Then the last transcription is pasted at cursor position
- And system clipboard (Cmd+V) remains unchanged

### AC-4: Configuration Option
- Given user opens settings
- When user navigates to General settings
- Then user can see option to enable/disable clipboard preservation
- And changes apply immediately without restart

### AC-5: Persistence
- Given user closes and reopens Whispo
- When user presses Ctrl+V
- Then the last transcription from previous session is pasted
- And transcription is retrieved from history.json

## 5. Out of Scope

### Explicitly NOT included to prevent scope creep:
- Multiple transcription history hotkeys (only last transcription)
- Customizable delay timing (fixed 0.6 seconds)
- Clipboard format preservation beyond plain text
- Clipboard history UI/visualization
- Multiple clipboard slots or clipboard manager features
- Rich text or image clipboard preservation
- Cross-device clipboard sync

## 6. Configuration Schema

```typescript
Config {
  // Add new field
  preserveClipboard?: boolean  // default: true
  
  // Existing fields remain unchanged
  shortcut?: "hold-ctrl" | "ctrl-slash"
  hideDockIcon?: boolean
  sttProviderId?: STT_PROVIDER_ID
  // ... etc
}
```

## 7. Edge Cases

### EC-1: No Previous Clipboard Content
- When clipboard is empty before transcription
- Then skip save/restore (nothing to preserve)
- And proceed with normal flow

### EC-2: Clipboard Access Denied
- When clipboard access fails (permissions)
- Then log error and continue without preservation
- And still attempt automatic insertion

### EC-3: No Transcription Available
- When user presses Ctrl+V without any transcription history
- Then show notification "No transcription available"
- And do nothing

### EC-4: Ctrl+V Conflicts
- When another application uses Ctrl+V globally
- Then Whispo hotkey takes precedence (registered first)
- And provide option to change hotkey in settings

## 8. Reference Implementation Analysis

From VoiceInk (CursorPaster.swift):

```swift
// Key logic to replicate:
1. Save clipboard: savedContents = pasteboard.pasteboardItems
2. Copy transcription temporarily
3. Paste using Cmd+V simulation (existing writeText)
4. Delay 0.6s: DispatchQueue.main.asyncAfter(deadline: .now() + 0.6)
5. Restore: pasteboard.setData(savedContents)
```

Whispo equivalent:
```typescript
// In Node.js/Electron
const { clipboard } = require('electron')

// 1. Save
const savedClipboard = clipboard.readText()

// 2. Copy transcription
clipboard.writeText(transcript)

// 3. Paste (existing)
await writeText(transcript)

// 4. Restore after delay
setTimeout(() => {
  clipboard.writeText(savedClipboard)
}, 600)
```

## 9. Success Metrics

- User clipboard (Cmd+V) preserved 100% of the time after transcription
- Ctrl+V hotkey successfully pastes last transcription
- Zero complaints about lost clipboard content
- No performance degradation in transcription flow
- Configuration option accessible and functional
