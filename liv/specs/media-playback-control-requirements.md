# Media Playback Control Requirements Specification for Whispo

## 1. Executive Summary

This document specifies the requirements for implementing automatic media playback control in Whispo, inspired by VoiceInk's intelligent audio management system. The feature will automatically pause media playback (music, videos, podcasts, etc.) when recording starts and resume it when recording stops, providing a seamless user experience without manual intervention.

**Core Functionality:**
- Detect active media playback across all applications
- Automatically pause media when recording starts
- Automatically resume media when recording ends
- Preserve playback state and context
- Support major media players (Spotify, Apple Music, YouTube, etc.)
- Cross-platform compatibility (macOS, Windows, Linux)

**Design Philosophy:**
- **Intelligent**: Only pause media that was actually playing
- **Non-Intrusive**: Silent operation, no user prompts
- **Reliable**: Handle edge cases gracefully
- **Configurable**: User can enable/disable the feature
- **Respectful**: Resume only if app is still running

**Reference Implementation:** VoiceInk's `PlaybackController` using MediaRemoteAdapter (macOS framework)

---

## 2. Current State Analysis

### 2.1 Existing Whispo Behavior

**Current State:**
- No media playback detection
- No automatic pause/resume functionality
- Users must manually pause media before recording
- Background audio interferes with transcription quality
- Poor user experience for multitasking scenarios

**Pain Points:**
- Manual media control interrupts workflow
- Forgotten media continues playing (background noise in recordings)
- Users must switch between apps to pause/resume
- Inconsistent recording quality due to background audio

### 2.2 VoiceInk Reference Implementation

**Key Components:**
- `PlaybackController` class for media management
- `MediaRemoteAdapter` library (macOS private framework wrapper)
- Track info monitoring with callback system
- Bundle identifier tracking for app verification
- State persistence during recording session
- Graceful resume with validation checks

**Features:**
- Real-time media playback tracking
- Automatic pause on recording start
- Automatic resume on recording stop
- App lifecycle validation (verify app still running)
- User preference toggle (experimental feature)
- Support for all media players (Spotify, Music, YouTube, etc.)

---

## 3. Functional Requirements

### 3.1 Media Playback Detection

**REQ-DETECT-001**: WHEN the application starts THEN the system SHALL initialize media playback monitoring service

**REQ-DETECT-002**: WHEN media detection is enabled THEN the system SHALL continuously monitor for active media playback across all applications

**REQ-DETECT-003**: WHEN media playback state changes THEN the system SHALL update internal state with:
- Playing/paused status
- Media application bundle identifier
- Track information (title, artist, album)
- Playback position
- Timestamp of last state change

**REQ-DETECT-004**: WHEN multiple media sources are playing THEN the system SHALL track the primary/most recent media source

**REQ-DETECT-005**: WHEN media detection fails THEN the system SHALL log error and continue without blocking recording functionality

#### Platform-Specific Detection Methods

**macOS:**
- MediaRemote framework (private API wrapper)
- Now Playing Center API
- NSWorkspace running applications monitoring

**Windows:**
- Windows Media Control API (Windows 10+)
- System Media Transport Controls
- Process monitoring for known media apps

**Linux:**
- MPRIS (Media Player Remote Interfacing Specification)
- D-Bus monitoring
- PulseAudio/PipeWire sink monitoring

### 3.2 Automatic Pause on Recording Start

**REQ-PAUSE-001**: WHEN user starts recording THEN the system SHALL check if media is currently playing

**REQ-PAUSE-002**: WHEN media is playing AND pause feature is enabled THEN the system SHALL:
- Save current playback state
- Store media application bundle identifier
- Save playback position (if available)
- Send pause command to media player
- Set internal flag indicating pause was triggered by recording

**REQ-PAUSE-003**: WHEN media is not playing THEN the system SHALL skip pause operation and proceed with recording

**REQ-PAUSE-004**: WHEN pause command is sent THEN the system SHALL add small delay (50ms) to ensure state is synchronized

**REQ-PAUSE-005**: WHEN pause fails THEN the system SHALL log error but continue recording without blocking

**REQ-PAUSE-006**: WHEN multiple media sources are active THEN the system SHALL pause only the primary/active source

**REQ-PAUSE-007**: WHEN media is already paused THEN the system SHALL not send duplicate pause commands

### 3.3 Automatic Resume on Recording Stop

**REQ-RESUME-001**: WHEN user stops recording THEN the system SHALL check if media was paused by the recording session

**REQ-RESUME-002**: WHEN media was auto-paused AND resume feature is enabled THEN the system SHALL:
- Verify media application is still running
- Check current playback state
- Validate bundle identifier matches original
- Send play/resume command
- Clear internal pause state

**REQ-RESUME-003**: WHEN media application was closed during recording THEN the system SHALL skip resume operation

**REQ-RESUME-004**: WHEN media is already playing (user manually resumed) THEN the system SHALL skip resume operation

**REQ-RESUME-005**: WHEN media application bundle identifier changed THEN the system SHALL skip resume operation

**REQ-RESUME-006**: WHEN resume command is sent THEN the system SHALL add small delay (50ms) to ensure state is synchronized

**REQ-RESUME-007**: WHEN resume fails THEN the system SHALL log error and clear pause state silently

**REQ-RESUME-008**: WHEN recording is cancelled (Escape key) THEN the system SHALL still attempt to resume media

### 3.4 State Management

**REQ-STATE-001**: WHEN recording session is active THEN the system SHALL maintain:
- `wasPlayingWhenRecordingStarted` boolean flag
- `originalMediaAppBundleId` string identifier
- `lastKnownTrackInfo` object with media metadata
- `isMediaPlaying` current playback status

**REQ-STATE-002**: WHEN recording session ends THEN the system SHALL clear all session-specific state

**REQ-STATE-003**: WHEN application crashes during recording THEN next session SHALL start with clean state (no stale data)

**REQ-STATE-004**: WHEN state updates occur THEN the system SHALL handle updates atomically to prevent race conditions

### 3.5 Application Lifecycle Validation

**REQ-LIFECYCLE-001**: WHEN preparing to resume media THEN the system SHALL verify the original media application is still running

**REQ-LIFECYCLE-002**: WHEN verifying application status THEN the system SHALL:
- Query running processes/applications
- Match by bundle identifier (macOS) or process name (Windows/Linux)
- Confirm application is responsive (not crashed)

**REQ-LIFECYCLE-003**: WHEN media application is not found THEN the system SHALL skip resume operation and log warning

**REQ-LIFECYCLE-004**: WHEN media application is found but unresponsive THEN the system SHALL skip resume with timeout (1 second max)

### 3.6 User Configuration

**REQ-CONFIG-001**: WHEN accessing settings THEN the user SHALL see option to enable/disable automatic media pause

**REQ-CONFIG-002**: WHEN feature is disabled THEN the system SHALL:
- Stop media playback monitoring
- Skip all pause/resume operations
- Free monitoring resources
- Clear stored state

**REQ-CONFIG-003**: WHEN feature is enabled THEN the system SHALL:
- Start media playback monitoring
- Begin tracking playback state
- Initialize platform-specific controllers

**REQ-CONFIG-004**: WHEN configuration changes THEN the system SHALL apply changes immediately without restart

**REQ-CONFIG-005**: WHEN feature is marked experimental THEN the system SHALL:
- Show warning/badge in UI
- Require explicit user opt-in
- Provide feedback mechanism for issues

**REQ-CONFIG-006**: WHEN user preferences are saved THEN the system SHALL persist to config file

### 3.7 Supported Media Players

**REQ-PLAYERS-001**: WHEN detecting media players THEN the system SHALL support at minimum:

**macOS:**
- Apple Music / iTunes
- Spotify
- YouTube (web browsers)
- Safari (video playback)
- Chrome (video playback)
- Firefox (video playback)
- VLC
- QuickTime Player
- Podcasts app
- Any app using Now Playing Center

**Windows:**
- Spotify
- Windows Media Player
- Groove Music
- YouTube (web browsers)
- Chrome (video playback)
- Edge (video playback)
- Firefox (video playback)
- VLC
- iTunes
- Any app using Media Transport Controls

**Linux:**
- Spotify
- Rhythmbox
- VLC
- Audacious
- Clementine
- YouTube (web browsers)
- Chrome/Chromium (video playback)
- Firefox (video playback)
- Any MPRIS-compliant player

**REQ-PLAYERS-002**: WHEN new media player is encountered THEN the system SHALL attempt generic media control protocol

**REQ-PLAYERS-003**: WHEN media player doesn't support control protocol THEN the system SHALL log unsupported player and skip control

### 3.8 Error Handling and Edge Cases

**REQ-ERROR-001**: WHEN media control command fails THEN the system SHALL:
- Log detailed error information
- Continue recording without interruption
- Skip resume if pause failed
- Not show user-facing error (silent failure)

**REQ-ERROR-002**: WHEN permission error occurs THEN the system SHALL:
- Detect the specific permission issue
- Provide user instructions to grant permissions
- Disable feature until permissions granted
- Show appropriate UI messaging

**REQ-ERROR-003**: WHEN timeout occurs (>1 second) THEN the system SHALL:
- Cancel pending operation
- Log timeout event
- Continue with recording
- Clear stale state

**REQ-ERROR-004**: WHEN rapid start/stop recording occurs THEN the system SHALL:
- Debounce pause/resume commands
- Prevent command spam
- Track only final state
- Handle race conditions gracefully

**REQ-ERROR-005**: WHEN system is suspended/resumed THEN the system SHALL:
- Re-initialize media monitoring
- Verify state consistency
- Refresh running applications list
- Clear stale session data

### 3.9 Performance Requirements

**REQ-PERF-001**: WHEN monitoring media playback THEN the system SHALL consume < 0.5% CPU during idle

**REQ-PERF-002**: WHEN pause command is sent THEN the system SHALL complete within 100ms

**REQ-PERF-003**: WHEN resume command is sent THEN the system SHALL complete within 100ms

**REQ-PERF-004**: WHEN querying running applications THEN the system SHALL complete within 50ms

**REQ-PERF-005**: WHEN media state updates THEN the system SHALL process callbacks within 10ms

**REQ-PERF-006**: WHEN feature is disabled THEN the system SHALL release all monitoring resources immediately

### 3.10 Privacy and Security

**REQ-PRIVACY-001**: WHEN collecting media information THEN the system SHALL:
- Only access playback state (playing/paused)
- Only access application bundle identifier
- Not log media content or track titles (optional for debugging only)
- Not transmit media information to external services

**REQ-PRIVACY-002**: WHEN storing media state THEN the system SHALL:
- Keep data in memory only (no persistent storage of media info)
- Clear state when recording ends
- Not include media data in crash reports
- Not include media data in analytics

**REQ-PRIVACY-003**: WHEN accessing media controls THEN the system SHALL:
- Request necessary permissions explicitly
- Explain permission purpose to user
- Function gracefully if permissions denied
- Not re-prompt excessively

### 3.11 User Experience

**REQ-UX-001**: WHEN media is paused automatically THEN the user SHALL experience:
- Immediate pause (< 100ms latency)
- No visual popup or notification
- Silent operation
- Seamless transition to recording

**REQ-UX-002**: WHEN media is resumed automatically THEN the user SHALL experience:
- Immediate resume (< 100ms latency)
- No visual popup or notification
- Continuation from pause point (if supported)
- Seamless transition from recording

**REQ-UX-003**: WHEN feature is enabled for first time THEN the user SHALL see:
- Clear explanation of functionality
- Permission request dialogs (if needed)
- Test button to verify functionality
- Examples of supported media players

**REQ-UX-004**: WHEN troubleshooting THEN the user SHALL access:
- Logs showing pause/resume events
- List of detected media players
- Permission status indicators
- Test/diagnostic tools

---

## 4. Technical Architecture

### 4.1 Component Structure

```
MediaPlaybackController (Main Service)
├── PlatformMediaAdapter (Platform-specific interface)
│   ├── MacOSMediaAdapter (MediaRemote framework)
│   ├── WindowsMediaAdapter (Media Transport Controls)
│   └── LinuxMediaAdapter (MPRIS D-Bus)
├── PlaybackStateManager (State tracking)
├── ApplicationMonitor (Process/app lifecycle)
└── ConfigManager (User preferences)
```

### 4.2 Class Interfaces

**TypeScript (Main Process):**

```typescript
interface MediaPlaybackController {
  // Initialization
  initialize(): Promise<void>
  shutdown(): Promise<void>
  
  // Configuration
  setEnabled(enabled: boolean): void
  isEnabled(): boolean
  
  // Recording lifecycle hooks
  onRecordingStart(): Promise<void>
  onRecordingStop(): Promise<void>
  
  // State queries
  isMediaPlaying(): boolean
  getCurrentMediaInfo(): MediaInfo | null
}

interface MediaInfo {
  isPlaying: boolean
  bundleIdentifier: string
  title?: string
  artist?: string
  album?: string
  duration?: number
  position?: number
}

interface PlatformMediaAdapter {
  startMonitoring(): Promise<void>
  stopMonitoring(): Promise<void>
  pause(): Promise<boolean>
  play(): Promise<boolean>
  getCurrentTrack(): Promise<MediaInfo | null>
  isApplicationRunning(bundleId: string): Promise<boolean>
}
```

### 4.3 Platform-Specific Implementation

**macOS Implementation:**

Uses private MediaRemote framework wrapper (similar to MediaRemoteAdapter):

```typescript
class MacOSMediaAdapter implements PlatformMediaAdapter {
  private mediaRemoteLib: any
  private currentTrackInfo: MediaInfo | null = null
  
  async startMonitoring() {
    // Load MediaRemote.framework dynamically
    // Register for Now Playing notifications
    // Set up callback handlers
  }
  
  async pause() {
    // Send MRMediaRemoteSendCommand(kMRPause)
  }
  
  async play() {
    // Send MRMediaRemoteSendCommand(kMRPlay)
  }
}
```

**Windows Implementation:**

Uses Windows Runtime APIs:

```typescript
class WindowsMediaAdapter implements PlatformMediaAdapter {
  private smtcManager: any // GlobalSystemMediaTransportControlsSessionManager
  
  async startMonitoring() {
    // Initialize Windows.Media.Control APIs
    // Listen to CurrentSessionChanged events
  }
  
  async pause() {
    // Call TryPauseAsync() on current session
  }
  
  async play() {
    // Call TryPlayAsync() on current session
  }
}
```

**Linux Implementation:**

Uses MPRIS D-Bus protocol:

```typescript
class LinuxMediaAdapter implements PlatformMediaAdapter {
  private dbus: any
  private mprisInterfaces: Map<string, any>
  
  async startMonitoring() {
    // Connect to D-Bus session bus
    // Monitor org.mpris.MediaPlayer2.* interfaces
  }
  
  async pause() {
    // Call org.mpris.MediaPlayer2.Player.Pause
  }
  
  async play() {
    // Call org.mpris.MediaPlayer2.Player.Play
  }
}
```

### 4.4 Integration Points

**Recording Lifecycle Integration:**

```typescript
// In existing recording flow (main/tipc.ts or keyboard handler)

async function startRecording() {
  // Existing recording setup...
  
  // NEW: Pause media
  await mediaPlaybackController.onRecordingStart()
  
  // Continue with recording...
}

async function stopRecording() {
  // Existing recording teardown...
  
  // NEW: Resume media
  await mediaPlaybackController.onRecordingStop()
  
  // Continue with cleanup...
}
```

**IPC Interface:**

```typescript
// Add to tipc.ts router
export const router = {
  // ... existing procedures
  
  mediaControl: {
    isEnabled: publicProcedure
      .query(() => mediaPlaybackController.isEnabled()),
    
    setEnabled: publicProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ input }) => {
        mediaPlaybackController.setEnabled(input.enabled)
      }),
    
    getCurrentMedia: publicProcedure
      .query(() => mediaPlaybackController.getCurrentMediaInfo()),
    
    test: publicProcedure
      .mutation(async () => {
        // Test pause/resume functionality
        const wasPaused = await mediaPlaybackController.onRecordingStart()
        await new Promise(r => setTimeout(r, 2000))
        await mediaPlaybackController.onRecordingStop()
        return { success: wasPaused }
      }),
  }
}
```

---

## 5. UI Component Specifications

### 5.1 Settings UI

**File:** `src/renderer/src/pages/settings-general.tsx` (add section)

```tsx
<Card>
  <CardHeader>
    <CardTitle>Media Playback Control</CardTitle>
    <CardDescription>
      Automatically pause music and videos during recording
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label>Pause Media During Recording</Label>
        <Text variant="caption" color="secondary">
          Automatically pause Spotify, YouTube, and other media players
        </Text>
      </div>
      <Switch
        checked={config.isPauseMediaEnabled}
        onCheckedChange={(checked) => {
          saveConfig({ isPauseMediaEnabled: checked })
        }}
      />
    </div>
    
    {config.isPauseMediaEnabled && (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How it works</AlertTitle>
        <AlertDescription>
          When you start recording, Whispo will pause any playing media.
          When you stop recording, media will automatically resume if the
          app is still running.
        </AlertDescription>
      </Alert>
    )}
    
    {config.isPauseMediaEnabled && (
      <div className="space-y-2">
        <Label>Test Media Control</Label>
        <Button 
          variant="outline" 
          onClick={handleTestMediaControl}
          disabled={testing}
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Test Pause/Resume
            </>
          )}
        </Button>
        <Text variant="caption" color="secondary">
          Play some music and click to test the feature
        </Text>
      </div>
    )}
  </CardContent>
</Card>
```

### 5.2 Permission Request Dialog

**File:** `src/renderer/src/components/MediaPermissionDialog.tsx`

```tsx
<Dialog open={needsPermission} onOpenChange={setNeedsPermission}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Media Control Permission Required</DialogTitle>
      <DialogDescription>
        Whispo needs permission to control media playback
      </DialogDescription>
    </DialogHeader>
    
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Why is this needed?</AlertTitle>
        <AlertDescription>
          To automatically pause and resume your music/videos during recording,
          Whispo needs access to media controls.
        </AlertDescription>
      </Alert>
      
      {platform === 'darwin' && (
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Open System Settings → Privacy & Security</li>
          <li>Click "Automation"</li>
          <li>Find Whispo in the list</li>
          <li>Enable control for media apps (Music, Spotify, etc.)</li>
        </ol>
      )}
      
      {platform === 'win32' && (
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>This feature requires Windows 10 or later</li>
          <li>Media control permissions are granted automatically</li>
          <li>If it doesn't work, check Windows Privacy settings</li>
        </ol>
      )}
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={() => setNeedsPermission(false)}>
        Cancel
      </Button>
      <Button onClick={handleOpenSystemPreferences}>
        Open Settings
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 6. Implementation Examples

### 6.1 Core MediaPlaybackController

**File:** `src/main/services/media-playback-controller.ts`

```typescript
import { app } from 'electron'
import { MacOSMediaAdapter } from './adapters/macos-media-adapter'
import { WindowsMediaAdapter } from './adapters/windows-media-adapter'
import { LinuxMediaAdapter } from './adapters/linux-media-adapter'

export class MediaPlaybackController {
  private adapter: PlatformMediaAdapter | null = null
  private enabled: boolean = false
  
  // Session state
  private wasPlayingWhenRecordingStarted = false
  private originalMediaAppBundleId: string | null = null
  private lastKnownMediaInfo: MediaInfo | null = null
  
  async initialize() {
    // Load user preference
    const config = configStore.get()
    this.enabled = config.isPauseMediaEnabled ?? false
    
    // Initialize platform-specific adapter
    if (process.platform === 'darwin') {
      this.adapter = new MacOSMediaAdapter()
    } else if (process.platform === 'win32') {
      this.adapter = new WindowsMediaAdapter()
    } else if (process.platform === 'linux') {
      this.adapter = new LinuxMediaAdapter()
    }
    
    if (this.enabled && this.adapter) {
      await this.adapter.startMonitoring()
      this.setupCallbacks()
    }
  }
  
  private setupCallbacks() {
    if (!this.adapter) return
    
    this.adapter.onTrackInfoChanged = (info) => {
      this.lastKnownMediaInfo = info
    }
  }
  
  setEnabled(enabled: boolean) {
    this.enabled = enabled
    
    if (enabled && this.adapter) {
      this.adapter.startMonitoring()
    } else if (!enabled && this.adapter) {
      this.adapter.stopMonitoring()
      this.clearState()
    }
    
    // Persist to config
    const config = configStore.get()
    config.isPauseMediaEnabled = enabled
    configStore.save(config)
  }
  
  async onRecordingStart() {
    if (!this.enabled || !this.adapter) return
    
    // Check if media is currently playing
    const currentMedia = await this.adapter.getCurrentTrack()
    
    if (!currentMedia || !currentMedia.isPlaying) {
      return // Nothing playing, nothing to pause
    }
    
    // Save state
    this.wasPlayingWhenRecordingStarted = true
    this.originalMediaAppBundleId = currentMedia.bundleIdentifier
    
    // Small delay to ensure state is set
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Send pause command
    try {
      await this.adapter.pause()
      console.log('[MediaControl] Paused media:', currentMedia.bundleIdentifier)
    } catch (error) {
      console.error('[MediaControl] Failed to pause:', error)
      this.clearState()
    }
  }
  
  async onRecordingStop() {
    if (!this.enabled || !this.adapter) return
    
    const shouldResume = this.wasPlayingWhenRecordingStarted
    const originalBundleId = this.originalMediaAppBundleId
    
    // Clear state first
    this.clearState()
    
    if (!shouldResume || !originalBundleId) {
      return // Nothing to resume
    }
    
    // Verify app is still running
    const isRunning = await this.adapter.isApplicationRunning(originalBundleId)
    if (!isRunning) {
      console.log('[MediaControl] App closed, skipping resume:', originalBundleId)
      return
    }
    
    // Check current state
    const currentMedia = await this.adapter.getCurrentTrack()
    if (!currentMedia) {
      return
    }
    
    // Verify same app and still paused
    if (currentMedia.bundleIdentifier !== originalBundleId) {
      console.log('[MediaControl] Different app, skipping resume')
      return
    }
    
    if (currentMedia.isPlaying) {
      console.log('[MediaControl] Already playing, skipping resume')
      return
    }
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Send play command
    try {
      await this.adapter.play()
      console.log('[MediaControl] Resumed media:', originalBundleId)
    } catch (error) {
      console.error('[MediaControl] Failed to resume:', error)
    }
  }
  
  private clearState() {
    this.wasPlayingWhenRecordingStarted = false
    this.originalMediaAppBundleId = null
  }
  
  isEnabled() {
    return this.enabled
  }
  
  getCurrentMediaInfo() {
    return this.lastKnownMediaInfo
  }
  
  async shutdown() {
    if (this.adapter) {
      await this.adapter.stopMonitoring()
    }
  }
}

export const mediaPlaybackController = new MediaPlaybackController()
```

---

## 7. Platform Implementation Details

### 7.1 macOS - MediaRemote Framework

**Required Dependencies:**
- `@napi-rs/canvas` or similar for native module loading
- Objective-C bridge or direct C function calls via `ffi-napi`

**MediaRemote Functions to Access:**
```c
// From MediaRemote.framework (private)
void MRMediaRemoteRegisterForNowPlayingNotifications(dispatch_queue_t queue);
void MRMediaRemoteGetNowPlayingInfo(dispatch_queue_t queue, void (^block)(CFDictionaryRef));
void MRMediaRemoteSendCommand(MRMediaRemoteCommand command, NSDictionary *userInfo);

// Commands
kMRPlay = 0
kMRPause = 1
kMRTogglePlayPause = 2
```

**Implementation Approach:**
1. Use Node.js native addon to load MediaRemote.framework
2. Register for Now Playing notifications
3. Parse track info from callbacks
4. Send play/pause commands via MRMediaRemoteSendCommand

### 7.2 Windows - System Media Transport Controls

**Required Dependencies:**
- `node-windows-media-control` or custom native module
- Windows SDK 10.0.17134.0 or later

**Windows Runtime APIs:**
```csharp
// From Windows.Media.Control namespace
GlobalSystemMediaTransportControlsSessionManager
GlobalSystemMediaTransportControlsSession
GlobalSystemMediaTransportControlsSessionPlaybackInfo
```

**Implementation Approach:**
1. Import Windows Runtime APIs via Node addon
2. Get SessionManager instance
3. Subscribe to CurrentSessionChanged event
4. Call TryPauseAsync() / TryPlayAsync()

### 7.3 Linux - MPRIS D-Bus Protocol

**Required Dependencies:**
- `dbus` or `dbus-next` npm package
- D-Bus session bus access

**D-Bus Interface:**
```
Service: org.mpris.MediaPlayer2.*
Interface: org.mpris.MediaPlayer2.Player
Methods:
  - Play()
  - Pause()
  - PlayPause()
Properties:
  - PlaybackStatus (Playing, Paused, Stopped)
  - Metadata (dict with track info)
```

**Implementation Approach:**
1. Connect to session D-Bus
2. List all org.mpris.MediaPlayer2.* services
3. Monitor PropertiesChanged signals
4. Call Play/Pause methods via D-Bus

---

## 8. Implementation Checklist

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create MediaPlaybackController class
- [ ] Define PlatformMediaAdapter interface
- [ ] Implement state management
- [ ] Add configuration schema to Config type
- [ ] Create IPC procedures for media control
- [ ] Set up error handling framework

### Phase 2: Platform Adapters (Week 2-3)
- [ ] **macOS Adapter:**
  - [ ] Research MediaRemote framework access
  - [ ] Create native module or FFI bindings
  - [ ] Implement Now Playing notifications
  - [ ] Implement pause/play commands
  - [ ] Test with major apps (Music, Spotify)
- [ ] **Windows Adapter:**
  - [ ] Research Media Transport Controls
  - [ ] Create Windows Runtime bridge
  - [ ] Implement session monitoring
  - [ ] Implement pause/play commands
  - [ ] Test with major apps (Spotify, Chrome)
- [ ] **Linux Adapter:**
  - [ ] Install and test dbus package
  - [ ] Implement MPRIS monitoring
  - [ ] Implement D-Bus method calls
  - [ ] Test with MPRIS-compliant players

### Phase 3: Integration (Week 4)
- [ ] Integrate into recording start flow
- [ ] Integrate into recording stop flow
- [ ] Add permission checking
- [ ] Implement app lifecycle validation
- [ ] Handle edge cases (rapid start/stop, etc.)
- [ ] Add logging and diagnostics

### Phase 4: UI Implementation (Week 5)
- [ ] Add settings toggle UI
- [ ] Create permission dialog
- [ ] Add test button
- [ ] Implement status indicators
- [ ] Add help/documentation
- [ ] Create onboarding tooltip

### Phase 5: Testing (Week 6)
- [ ] Unit tests for core controller
- [ ] Integration tests per platform
- [ ] Test with 10+ media players
- [ ] Test edge cases
- [ ] Test performance impact
- [ ] User acceptance testing

### Phase 6: Documentation & Polish (Week 7)
- [ ] User guide documentation
- [ ] Troubleshooting guide
- [ ] Platform-specific setup guides
- [ ] Code documentation
- [ ] Release notes
- [ ] Known issues document

---

## 9. Testing Requirements

### 9.1 Functional Testing

**Test Case 1: Basic Pause/Resume**
1. Start playing music in Spotify
2. Start recording in Whispo
3. Verify: Music pauses within 100ms
4. Stop recording
5. Verify: Music resumes within 100ms

**Test Case 2: App Closed During Recording**
1. Start playing music
2. Start recording (music pauses)
3. Close music app
4. Stop recording
5. Verify: No errors, no resume attempt

**Test Case 3: Manual Resume During Recording**
1. Start playing music
2. Start recording (music pauses)
3. Manually resume music in player
4. Stop recording
5. Verify: Music continues playing (no duplicate play command)

**Test Case 4: Feature Disabled**
1. Disable feature in settings
2. Start playing music
3. Start recording
4. Verify: Music continues playing

**Test Case 5: No Media Playing**
1. Ensure no media is playing
2. Start recording
3. Stop recording
4. Verify: No errors, normal recording flow

### 9.2 Performance Testing

- CPU usage during monitoring: < 0.5%
- Memory usage: < 10MB
- Pause latency: < 100ms
- Resume latency: < 100ms
- No UI blocking during operations

### 9.3 Compatibility Testing

Test with these applications on each platform:

**macOS:**
- Apple Music
- Spotify
- YouTube (Safari, Chrome, Firefox)
- VLC
- QuickTime Player
- Podcasts

**Windows:**
- Spotify
- Windows Media Player
- YouTube (Edge, Chrome, Firefox)
- VLC
- iTunes

**Linux:**
- Spotify
- VLC
- Rhythmbox
- YouTube (Chrome, Firefox)

---

## 10. Known Limitations and Future Enhancements

### Known Limitations

1. **Private APIs (macOS):**
   - MediaRemote is private framework (may break in OS updates)
   - Alternative: Use AppleScript for some apps (slower, less reliable)

2. **Browser Detection:**
   - Cannot distinguish between YouTube tabs in same browser
   - Will pause all media in browser, not just one tab

3. **Multiple Media Sources:**
   - Currently only tracks single primary source
   - If multiple apps playing, behavior may be unpredictable

4. **Playback Position:**
   - Resume may not preserve exact playback position on all players
   - Depends on player implementation

### Future Enhancements

1. **Smart Pause Selection:**
   - Detect and pause only music/podcasts (not notifications)
   - Prioritize by media type

2. **Per-App Configuration:**
   - Allow user to whitelist/blacklist specific apps
   - Custom behavior per media player

3. **Volume Ducking Alternative:**
   - Instead of pause, lower volume to 10%
   - Resume volume after recording

4. **Multiple Source Handling:**
   - Pause all playing media sources
   - Resume all that were paused

5. **Browser Tab Detection:**
   - Use browser extensions for granular control
   - Pause only active tab

---

## 11. Success Metrics

### User Experience Metrics
- [ ] 90%+ of users enable the feature after trying it
- [ ] < 5% of users disable after enabling
- [ ] 95%+ successful pause operations
- [ ] 90%+ successful resume operations
- [ ] Zero user-reported recording failures due to feature

### Technical Metrics
- [ ] < 100ms pause latency (average)
- [ ] < 100ms resume latency (average)
- [ ] < 0.5% CPU usage during monitoring
- [ ] < 10MB memory overhead
- [ ] 99%+ uptime (no crashes)

### Quality Metrics
- [ ] Support for 10+ major media players per platform
- [ ] < 1% false positive pause (when nothing playing)
- [ ] < 1% failed resume (when should resume)
- [ ] Zero permission-related crashes

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Next Review:** Q2 2025  
**Owner:** Whispo Media Control Team