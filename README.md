# ADK Building Blocks - Live Streaming Application

A multimodal real-time streaming application built on Google's Agent Development Kit (ADK) with advanced message queuing, audio processing, and comprehensive debugging capabilities.

## Features

- < **Real-time Audio Streaming** - Bidirectional audio communication with the AI agent
- < **Video Streaming** - Webcam and screen sharing capabilities  
- = **Text Chat** - Real-time text-based conversation
- = **Message Queuing** - Advanced priority-based message handling with overflow protection
- = **Performance Monitoring** - Real-time queue health and transmission statistics
- = **Comprehensive Debugging** - Built-in tools for troubleshooting audio and connection issues

## Quick Start

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the Server**
   ```bash
   python main.py
   ```

3. **Open the Application**
   - Navigate to `http://localhost:8881/live`
   - Click the microphone button to start audio streaming
   - Use camera/screen share buttons for video streaming

## Debugging Tools

The application includes comprehensive debugging tools accessible via the browser console (F12  Console).

### = Quick Diagnostics

```javascript
// Quick status check
checkTransmission()
// Returns: " Transmitting: 150 audio messages sent" or error details

// Full system status
debugTransmission()
// Shows detailed connection, queue, and transmission statistics

// Monitor transmission for 30 seconds
monitorTransmission(30)
// Reports message rates and transmission activity
```

### < Audio Debugging

#### Volume Control
```javascript
// Adjust playback volume (0.0 to 1.0)
setPlaybackVolume(0.5)  // 50% volume
setPlaybackVolume(0.8)  // 80% volume
setPlaybackVolume(0.3)  // 30% volume
```

#### Audio Issue Diagnostics

The console automatically logs audio-related issues:

- **Sample Rate Mismatch**: `< Audio sample rates - Context: 48000Hz, Server: 24000Hz`
- **Network Gaps**: `< Audio gap detected: 348ms (packet #17)`
- **Adaptive Buffering**: `< Adaptive buffering: increased threshold to 275ms due to network gaps`
- **Buffer Management**: `< Starting playback with 320ms buffered (threshold: 250ms)`
- **Overflow Protection**: `< Audio buffer too full (1600ms), dropping packet to prevent delay`
- **Transmission Count**: `= AUDIO DIRECT: Sent 50 audio messages`

#### Common Audio Problems

| Problem | Console Message | Solution |
|---------|----------------|----------|
| **Slow/Fast Audio** | ` Sample rate mismatch!` | Sample rates don't match - this is normal and handled automatically |
| **Audio Gaps** | `< Audio gap detected: XYZms` | Network delays - system auto-adapts buffer size |
| **Audio Delays** | `< Audio buffer too full` | Poor network - system drops packets to maintain real-time |
| **Overlapping Audio** | Multiple scheduling messages | Fixed - single audio processing path |
| **Too Loud/Quiet** | No specific message | Use `setPlaybackVolume(0.5)` to adjust |
| **No Audio** | `L No audio messages transmitted` | Check microphone permissions and connection |

### = Transmission Statistics

Use `debugTransmission()` to get detailed statistics:

```javascript
{
  messagesSent: {
    audio: 245,      // Outbound audio messages
    video: 12,       // Video frames sent  
    text: 3,         // Text messages
    control: 1       // Control messages
  },
  isConnected: true,
  isRecording: true,
  wsReadyState: 1,   // WebSocket state (1 = OPEN)
  audioPacketsReceived: 89,    // Incoming audio packets
  lastAudioGap: 45,            // Time since last audio (ms)
  audioContextSampleRate: 48000 // Device sample rate
}
```

### = Connection Debugging

#### WebSocket States
- `0` - CONNECTING
- `1` - OPEN ( Good)
- `2` - CLOSING  
- `3` - CLOSED (L Problem)

#### Queue Health Monitoring

The system includes automatic queue health monitoring:

```javascript
// Queue status shows health of message processing
queueStatus: {
  enabled: true,
  connected: true,
  overallHealth: "healthy",  // healthy | degraded | critical
  outbound: {
    audio: { totalSize: 2, maxSize: 5, health: "healthy" },
    video: { totalSize: 0, maxSize: 2, health: "healthy" }
  }
}
```

### = Troubleshooting Common Issues

#### 1. **Microphone Not Working**
```javascript
checkTransmission()
```
- Look for: `= Not connected to server` or `< Not recording audio`
- Solution: Check browser permissions, refresh page

#### 2. **Audio Quality Issues**
```javascript
// Check for sample rate issues
debugTransmission()
// Look at audioContextSampleRate vs server rate (24000Hz)

// Adjust volume if too loud/quiet
setPlaybackVolume(0.4)
```

#### 3. **Connection Problems**
```javascript
// Monitor WebSocket connection
debugTransmission()
// Check wsReadyState (should be 1)
// Check isConnected (should be true)
```

#### 4. **Performance Issues**
```javascript
// Monitor message rates
monitorTransmission(15)
// Should show steady audio transmission (~22 messages/sec)

// Check queue health  
debugTransmission()
// overallHealth should be "healthy"
```

## Advanced Configuration

### Audio Settings

The application follows Google Live API specifications:

- **Input Sample Rate**: 16kHz (Live API native rate)
- **Output Sample Rate**: 24kHz (Live API output rate)  
- **Buffer Size**: 2048 samples
- **Channels**: Mono (1 channel)
- **Format**: 16-bit PCM, little-endian
- **MIME Type**: `audio/pcm;rate=16000` (includes sample rate)
- **Playback Buffering**: Adaptive continuous buffering (200-300ms)
- **Chunk Processing**: 20ms AudioContext scheduling
- **Gap Tolerance**: Automatic network delay compensation

### Queue Configuration

Message queues are optimized for real-time performance:

- **Audio Queue**: 5 messages max, 100ms rate limit
- **Video Queue**: 2 frames max, 1000ms rate limit  
- **Text Queue**: 50 messages max, no rate limit
- **Control Queue**: 20 messages max, urgent priority

### Volume and Audio Processing

The application includes several audio enhancements for clear playback:

- **Gain Control**: All incoming audio is adjusted to 70% of its original volume by default to ensure a comfortable listening level. This can be changed with the UI volume slider.
- **Soft Clipping**: Prevents harsh digital distortion by gently compressing audio signals that exceed 95% of the maximum volume.
- **Click Prevention**: A micro-fade is applied to the beginning and end of each audio chunk to prevent audible "clicks" during seamless playback.

## Development

### Adding Debug Functions

Debug functions are defined in `/static/live/debug-monitor.js` and automatically loaded.

### Audio Processing Pipeline

The application employs a sophisticated, real-time audio pipeline designed for low latency and resilience to network instability.

#### 🎤 Outbound Audio (Client to Server)

1.  **Capture:** Audio is captured from the microphone at the browser's native sample rate.
2.  **AudioWorklet Processing (`audio-processor.js`):** The raw audio stream is immediately passed to a dedicated `AudioWorklet` thread. This prevents audio processing from blocking the main UI thread.
3.  **Resampling & Formatting:** Inside the worklet, the audio is down-sampled to the 16kHz mono format required by the Live API and converted to 16-bit PCM samples.
4.  **Transmission (`audio-client.js`):** The 16-bit PCM audio chunks are Base64 encoded and sent over the WebSocket connection. For optimal latency, outbound audio currently bypasses the message queue system and is sent directly.

#### 🎧 Inbound Audio (Server to Client)

This part of the pipeline is engineered to handle network jitter and provide smooth playback.

1.  **Reception (`audio-client.js`):** The client receives 24kHz audio chunks from the server, encoded in Base64.
2.  **Gap Detection:** Upon receiving a packet, the client measures the time since the last packet arrived. If a significant delay ("gap") is detected, it signals that the network is unstable.
3.  **Adaptive Buffering:** Based on the detected network gaps, the client dynamically adjusts its buffer size (`adaptiveThreshold`). A more unstable network results in a larger buffer to prevent stuttering, at the cost of slightly higher latency.
4.  **Decoding & Buffering:** The Base64 data is decoded, and the audio samples are placed into a continuous playback buffer.
5.  **Gain Adjustment:** Before being buffered, the audio signal's volume is adjusted. By default, it's set to **70%** of the original volume to provide comfortable listening levels and prevent clipping. This can be further adjusted with the UI volume slider.
6.  **Scheduled Playback:** A high-precision scheduling loop (`scheduleNextChunk`) pulls audio from the buffer. It uses the browser's `AudioContext` clock to schedule playback of small audio chunks back-to-back, ensuring no audible gaps or clicks between them.
7.  **Buffer Safety:** If the network is too slow and the buffer runs empty (an "underrun"), the scheduler will pause playback until the buffer has been refilled to a safe level. This is the primary cause of audible "choppiness" and is a direct result of network instability. The console will log a "Buffer running low" message when this occurs.

### Queue System Architecture

```
Message  Priority Queue  Rate Limiting  WebSocket Send
WebSocket Receive  Processing Queue  Application Handler
```

## Troubleshooting Guide

### Step-by-Step Debugging

1. **Check Basic Connection**
   ```javascript
   checkTransmission()
   ```

2. **Monitor Transmission Activity**
   ```javascript
   monitorTransmission(10)
   ```

3. **Examine Detailed Status**
   ```javascript
   debugTransmission()
   ```

4. **Test Audio Controls**
   ```javascript
   setPlaybackVolume(0.5)
   ```

### Console Message Reference

| Icon | Message Type | Example | Meaning |
|------|-------------|---------|---------|
| = | Connection | `WebSocket connection established` | Successful server connection |
| = | Transmission | `AUDIO DIRECT: Sent 50 audio messages` | Outbound message counts |
| < | Audio | `Audio gap detected: 120ms` | Audio timing issues |
|  | Warning | `Sample rate mismatch!` | Configuration warnings |
| L | Error | `Failed to initialize audio` | Critical errors |
|  | Success | `Transmitting: 89 audio messages sent` | Successful operations |

## Architecture & Design

### 🏗️ Application Architecture

The `/static/live/` web application follows a modular, event-driven architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                     App Controller                          │
│              (Application Orchestrator)                    │
└─────┬───────────────────────────┬───────────────────────────┘
      │                           │
      ▼                           ▼
┌─────────────┐             ┌─────────────┐
│ UI Manager  │◄────────────┤State Manager│
│   (View)    │             │ (Observer)  │
└─────────────┘             └─────────────┘
      │                           ▲
      ▼                           │
┌─────────────┐             ┌─────────────┐
│Session Mgr  │             │   Config    │
│ (Lifecycle) │             │ (Settings)  │
└─────────────┘             └─────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│                 Multimodal Client                          │
│              (Communication Layer)                         │
└─────┬───────────────────────────┬───────────────────────────┘
      │                           │
      ▼                           ▼
┌─────────────┐             ┌─────────────┐
│Audio Client │             │Queue System │
│ (Audio I/O) │             │ (Buffering) │
└─────────────┘             └─────────────┘
      │                           │
      ▼                           ▼
┌─────────────┐             ┌─────────────┐
│AudioWorklet │             │   Metrics   │
│ (Processing)│             │ (Monitoring)│
└─────────────┘             └─────────────┘
```

### 📁 Module Structure

#### **Core Application Modules**

| Module | Responsibility | Key Features |
|--------|---------------|--------------|
| **`app-controller.js`** | Application orchestration and coordination | Event routing, initialization, lifecycle management |
| **`state-manager.js`** | Centralized state management with observer pattern | Reactive state updates, change notifications |
| **`ui-manager.js`** | DOM manipulation and user interface management | Event binding, visual updates, component states |
| **`session-manager.js`** | Session lifecycle and user management | Session IDs, connection state, user authentication |
| **`config.js`** | Application configuration and validation | Settings management, environment configuration |

#### **Communication Layer**

| Module | Responsibility | Key Features |
|--------|---------------|--------------|
| **`multimodal-client.js`** | Video/audio streaming coordination | Webcam, screen sharing, WebSocket management |
| **`audio-client.js`** | Audio processing and real-time communication | Microphone input, audio playback, WebSocket audio |
| **`audio-processor.js`** | Audio worklet for real-time processing | Low-latency audio capture, format conversion |

#### **Message Queue System**

| Module | Responsibility | Key Features |
|--------|---------------|--------------|
| **`message-queue-manager.js`** | Central queue coordination | Connection management, queue health monitoring |
| **`priority-queue.js`** | Outbound message prioritization | Rate limiting, overflow strategies, batching |
| **`processing-queue.js`** | Inbound message processing | Buffering, chunking, ordering, real-time processing |
| **`queue-metrics.js`** | Performance monitoring and health tracking | Throughput metrics, latency tracking, health assessment |

#### **Debugging & Utilities**

| Module | Responsibility | Key Features |
|--------|---------------|--------------|
| **`debug-monitor.js`** | Development and troubleshooting tools | Console utilities, transmission monitoring, status reporting |
| **`queue-debug.js`** | Queue system debugging interface | Real-time queue visualization, performance analysis |

### 🔄 Data Flow Architecture

#### **1. User Interaction Flow**
```
User Action → UI Manager → App Controller → Client Layer → WebSocket → Server
```

#### **2. State Management Flow**
```
State Change → State Manager → Observers → UI Components → Visual Update
```

#### **3. Audio Processing Pipeline**
```
Microphone (16kHz) → AudioWorklet → Base64 Encoding → WebSocket → Server
Server → WebSocket → Continuous Buffer (24kHz) → AudioContext Scheduling → Speakers
```

#### **4. Message Queue Flow**
```
Message → Priority Assignment → Rate Limiting → Overflow Handling → WebSocket Send
WebSocket Receive → Processing Queue → Buffering/Chunking → Application Handler
```

### 🎯 Design Patterns

#### **1. Observer Pattern (State Management)**
- **StateManager** maintains application state
- Components subscribe to state changes
- Automatic UI updates on state modifications

```javascript
// Subscribe to state changes
this.stateManager.subscribe('recording', (state) => {
    this.updateMicButton(state);
});
```

#### **2. Command Pattern (Event Handling)**
- **AppController** orchestrates all user actions
- Clear separation between UI events and business logic
- Centralized event routing and handling

```javascript
// Event delegation pattern
this.uiManager.setupEventListeners({
    onMicClick: () => this.handleMicClick(),
    onVolumeChange: (volume) => this.handleVolumeChange(volume)
});
```

#### **3. Strategy Pattern (Queue Management)**
- Different overflow strategies for different message types
- Configurable processing modes (immediate, buffered, chunked)
- Adaptive connection quality handling

```javascript
// Different strategies for different queue types
overflowStrategy: {
    audio: 'DROP_OLDEST',    // Real-time audio
    video: 'REPLACE_NEWEST', // Latest frame only
    text: 'FAIL_SEND'        // Don't drop user input
}
```

#### **4. Module Pattern (ES6 Modules)**
- Clear encapsulation and dependency management
- Explicit imports/exports for better maintainability
- Tree-shaking and bundling optimization

### ⚡ Performance Architecture

#### **Real-time Optimizations**
- **Direct Audio Path**: Incoming audio bypasses queue system for minimum latency
- **AudioWorklet**: Low-latency audio processing in dedicated thread
- **Continuous Buffering**: AudioContext scheduling for seamless playback
- **Adaptive Buffering**: Dynamic buffer sizing based on network conditions (200-300ms)
- **Gap Detection**: Automatic detection and compensation for network delays
- **Chunk-based Processing**: 20ms audio chunks for smooth real-time streaming
- **Overflow Protection**: Smart packet dropping to prevent audio delay buildup
- **Priority Queues**: Critical messages (audio) get higher priority
- **Rate Limiting**: Prevents overwhelming the connection

#### **Memory Management**
- **Audio Context Pooling**: LRU cache for audio contexts
- **Queue Size Limits**: Configurable memory bounds per queue type
- **Garbage Collection**: Automatic cleanup of old messages and contexts

#### **Connection Resilience**
- **Automatic Reconnection**: Exponential backoff retry logic
- **Offline Buffering**: Messages queued when connection lost
- **Quality Adaptation**: Automatic rate adjustment based on connection quality

### 🔧 Configuration Architecture

#### **Hierarchical Configuration**
```javascript
CONFIG = {
    queue: {
        audio: { maxSize: 5, rateLimitMs: 100 },
        video: { maxSize: 2, rateLimitMs: 1000 }
    },
    audio: { sampleRate: 22000, bufferSize: 2048 },
    debug: { enableQueueLogging: false }
}
```

#### **Runtime Configuration**
- **Environment Detection**: Automatic WebSocket URL generation
- **Validation**: Configuration validation on startup
- **Hot Updates**: Some settings can be changed at runtime

### 🛡️ Error Handling Architecture

#### **Multi-Level Error Boundaries**
1. **Component Level**: Try-catch in individual methods
2. **Module Level**: Error boundaries between modules
3. **Queue Level**: Fallback to direct communication
4. **Connection Level**: Automatic reconnection and recovery

#### **Graceful Degradation**
- **Queue Failure**: Falls back to direct WebSocket communication
- **Audio Failure**: Continues with text-only communication
- **Connection Loss**: Buffers messages for later delivery

### 📊 Monitoring Architecture

#### **Real-time Metrics**
- **Message Throughput**: Messages per second by type
- **Queue Health**: Depth, drop rate, processing latency
- **Connection Quality**: Latency, packet loss, connection state
- **Audio Quality**: Sample rate matching, adaptive gap detection, overflow protection

#### **Debug Interface**
- **Console Commands**: `debugTransmission()`, `monitorTransmission()`
- **Visual Indicators**: Queue health, connection status, audio activity
- **Performance Logs**: Automatic logging of performance issues

### 🎨 UI Architecture

#### **Responsive Design**
- **Mobile-first**: Tailwind CSS responsive utilities
- **Grayscale Theme**: Consistent color scheme with CSS custom properties
- **Component States**: Visual feedback for all interactive elements

#### **Accessibility Features**
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: Semantic HTML and ARIA labels
- **High Contrast**: Clear visual hierarchy and focus indicators

### 🔒 Security Considerations

#### **Input Validation**
- **Message Sanitization**: All WebSocket messages validated
- **Configuration Bounds**: Limits on queue sizes and rates
- **URL Validation**: WebSocket URL construction with validation

#### **Resource Protection**
- **Memory Limits**: Configurable bounds on queue and buffer sizes
- **Rate Limiting**: Protection against message flooding
- **Timeout Management**: Automatic cleanup of stale resources

This architecture provides a scalable, maintainable, and performant foundation for real-time multimodal communication with built-in debugging, monitoring, and error recovery capabilities.

## License

This project is part of the Google Agent Development Kit ecosystem.