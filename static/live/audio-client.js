/**
 * Audio processing client for bidirectional audio AI communication
 * Enhanced with message queuing system
 */

import { MessageQueueManager } from './message-queue-manager.js';
import { CONFIG } from './config.js';

// Ensure CONFIG is available
if (typeof CONFIG === 'undefined') {
    console.error('CONFIG not available, queue system will be disabled');
}

export class AudioClient {
    constructor(serverUrl = 'ws://localhost:8882') {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.recorder = null;
        this.audioContext = null;
        this.isConnected = false;
        this.isRecording = false;
        this.isModelSpeaking = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.sessionId = null;

        // Callbacks
        this.onReady = () => { };
        this.onAudioReceived = () => { };
        this.onAudioSent = () => { }; // New callback for when we send audio
        this.onTextReceived = () => { };
        this.onTurnComplete = () => { };
        this.onError = () => { };
        this.onInterrupted = () => { };
        this.onSessionIdReceived = (sessionId) => { };

        // Audio playback with proper buffering (old queue system removed)
        this.gainNode = null; // For volume control
        
        // Continuous audio buffering for smooth playback
        this.audioBuffer = new Float32Array(0); // Accumulator for audio data
        this.bufferThreshold = 4800; // ~200ms at 24kHz (increased for gap tolerance)
        this.maxBufferSize = 48000; // ~2 seconds at 24kHz (increased buffer size)
        
        // Separate contexts for input (16kHz) and output (24kHz)
        this.recordingAudioContext = null; // For microphone input at 16kHz
        this.playbackAudioContext = null;  // For speaker output at 24kHz
        this.isBuffering = true;
        
        // Gap detection and adaptive buffering
        this.avgGapSize = 0;
        this.gapCount = 0;
        this.adaptiveThreshold = 2400; // Dynamic threshold based on network conditions
        this.lastGapLogTime = 0; // Rate limit gap logging
        this.largeGapCount = 0; // Track large gaps for diagnostics
        
        // AudioContext-based scheduling (precise timing)
        this.nextScheduledTime = 0;
        this.playbackSources = []; // Track active sources for cleanup
        this.chunkSize = 480; // 20ms chunks at 24kHz for smooth playback

        // Message queue manager with error boundary
        try {
            // Check if CONFIG is available and properly structured
            if (typeof CONFIG === 'undefined' || !CONFIG.queue) {
                console.warn('CONFIG not available or incomplete, disabling queue system');
                this.queueManager = null;
            } else {
                // Convert CONFIG.queue structure to MessageQueueManager expected format
                const queueConfig = {
                    enabled: CONFIG.queue.global?.enabled !== false,
                    debugMode: CONFIG.debug?.enableQueueLogging || false,
                    maxMemoryMb: CONFIG.queue.global?.maxMemoryMb || 50,
                    healthCheckIntervalMs: CONFIG.queue.global?.healthCheckIntervalMs || 5000,
                    autoTuning: CONFIG.queue.global?.autoTuning !== false,
                    // Flatten audio config
                    audioMaxSize: CONFIG.queue.audio?.outbound?.maxSize || 100,
                    audioRateLimitMs: CONFIG.queue.audio?.outbound?.rateLimitMs || 23,
                    audioBufferMs: CONFIG.queue.audio?.inbound?.bufferSizeMs || 200,
                    // Flatten video config
                    videoRateLimitMs: CONFIG.queue.video?.outbound?.rateLimitMs || 1000,
                    // Flatten text config
                    textChunkTimeout: CONFIG.queue.text?.inbound?.chunkTimeout || 500
                };
                
                this.queueManager = new MessageQueueManager(queueConfig);
                this._setupQueueHandlers();
                console.log('Queue manager initialized successfully');
            }
        } catch (error) {
            console.error('Failed to initialize queue manager:', error);
            this.queueManager = null; // Fallback to direct WebSocket communication
        }

        // Clean up any existing audioContexts
        if (window.existingAudioContexts) {
            window.existingAudioContexts.forEach(ctx => {
                try {
                    ctx.close();
                } catch (e) {
                    console.error("Error closing existing audio context:", e);
                }
            });
        }

        // Keep track of audio contexts created
        window.existingAudioContexts = window.existingAudioContexts || [];
        
        // Initialize audio context tracking
        this.initializeAudioContextTracking();
        
        // Message tracking for debugging
        this.messagesSent = {
            audio: 0,
            video: 0, 
            text: 0,
            control: 0
        };
        
        // Audio initialization state
        this.isInitializingAudio = false;
        
        // Audio packet tracking
        this.audioPacketsReceived = 0;
        this.lastAudioTime = 0;
    }

    /**
     * Setup queue handlers for sending and receiving messages
     */
    _setupQueueHandlers() {
        if (!this.queueManager) return;
        
        // Handle outbound messages (sending to server)
        this.queueManager.onSend = async (messageType, data, options) => {
            try {
                return await this._sendDirectToWebSocket(messageType, data, options);
            } catch (error) {
                console.error(`Error sending ${messageType} message:`, error);
                return false;
            }
        };

        // Handle inbound messages (processing received messages)
        this.queueManager.onReceive = async (messageType, data, metadata) => {
            try {
                return await this._processInboundMessage(messageType, data, metadata);
            } catch (error) {
                console.error(`Error processing ${messageType} message:`, error);
                throw error; // Re-throw to allow queue to handle retry logic
            }
        };

        // Handle queue errors
        this.queueManager.onError = (queueType, error) => {
            console.error(`Queue error in ${queueType}:`, error);
            if (this.onError) {
                this.onError(error);
            }
        };

        // Handle queue health changes
        this.queueManager.onHealthChange = (health, status) => {
            if (health === 'critical') {
                console.warn('Queue health critical:', status);
                // Could implement fallback to direct communication here
            }
        };
    }

    /**
     * Send message directly to WebSocket (used by queue manager)
     */
    async _sendDirectToWebSocket(messageType, data, options) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`Cannot send ${messageType} message: WebSocket not open`);
            return false;
        }

        try {
            // Convert queue data format to WebSocket message format
            let message;
            if (typeof data === 'object' && data.mime_type) {
                // Already in correct format
                message = data;
            } else {
                // Convert based on message type
                switch (messageType) {
                    case 'audio':
                        message = {
                            mime_type: 'audio/pcm;rate=16000',
                            data: data
                        };
                        break;
                    case 'video':
                        message = {
                            mime_type: 'image/jpeg',
                            data: data.data || data,
                            mode: data.mode || 'webcam'
                        };
                        break;
                    case 'text':
                        message = {
                            mime_type: 'text/plain',
                            data: data
                        };
                        break;
                    case 'control':
                        message = data; // Control messages should already be formatted
                        break;
                    default:
                        message = data;
                }
            }

            this.ws.send(JSON.stringify(message));
            this.messagesSent[messageType] = (this.messagesSent[messageType] || 0) + 1;
            
            // Log periodically to avoid spam, but show we're sending
            if (messageType === 'audio' && this.messagesSent[messageType] % 50 === 0) {
                console.log(`📤 AUDIO: Sent ${this.messagesSent[messageType]} audio messages`);
            } else if (messageType !== 'audio') {
                console.log(`📤 SENT ${messageType} message:`, message.mime_type, 
                           message.data?.substring ? message.data.substring(0, 50) + '...' : `${message.data?.length || 0} bytes`);
            }
            return true;
        } catch (error) {
            console.error(`Error sending ${messageType} message:`, error);
            return false;
        }
    }

    /**
     * Process inbound message from queue system
     */
    async _processInboundMessage(messageType, data, metadata) {
        try {
            switch (messageType) {
                case 'audio':
                    // Audio is processed directly in WebSocket handler to prevent double processing
                    console.warn('Audio message received through queue - this should not happen for real-time audio');
                    break;
                    
                case 'text':
                    const role = metadata.role || 'model';
                    this.onTextReceived(data, role);
                    break;
                    
                case 'video':
                    // Handle inbound video (for future features like model-generated images)
                    if (this.onVideoReceived) {
                        this.onVideoReceived(data, metadata);
                    }
                    break;
                    
                case 'control':
                    // Handle control messages (if needed)
                    console.log('Control message processed:', data);
                    break;
                    
                default:
                    console.warn(`Unknown inbound message type: ${messageType}`);
            }
            
            return data;
        } catch (error) {
            console.error(`Error processing ${messageType} message:`, error);
            throw error;
        }
    }

    // Connect to the WebSocket server
    async connect() {
        // Close existing connection if any
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {
                console.error("Error closing WebSocket:", e);
            }
        }

        // Reset reconnect attempts if this is a new connection
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            this.reconnectAttempts = 0;
        }

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);

                const connectionTimeout = setTimeout(() => {
                    if (!this.isConnected) {
                        console.error('WebSocket connection timed out');
                        this.tryReconnect();
                        reject(new Error('Connection timeout'));
                    }
                }, 5000);

                this.ws.onopen = () => {
                    console.log('🔗 WebSocket connection established to:', this.serverUrl);
                    clearTimeout(connectionTimeout);
                    this.reconnectAttempts = 0; // Reset on successful connection
                    if (this.queueManager) {
                        this.queueManager.setConnectionState(true, 'good');
                    }
                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket connection closed:', event.code, event.reason);
                    this.isConnected = false;
                    if (this.queueManager) {
                        this.queueManager.setConnectionState(false, 'offline');
                    }

                    // Try to reconnect if it wasn't a normal closure
                    if (event.code !== 1000 && event.code !== 1001) {
                        this.tryReconnect();
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    clearTimeout(connectionTimeout);
                    this.onError(error);
                    reject(error);
                };

                this.ws.onmessage = async (event) => {
                    try {
                        // Log raw message data to help debug (truncated)
                        const truncatedData = event.data.length > 50 ? event.data.substring(0, 50) + '...' : event.data;
                        console.log('Raw WebSocket message received:', truncatedData);

                        const message = JSON.parse(event.data);

                        if (message.mime_type === 'application/json' && message.event === 'session_info') {
                            this.sessionId = message.data.session_id;
                            this.onSessionIdReceived(this.sessionId);
                            this.isConnected = true;
                            this.onReady();
                            resolve();
                        }
                        else if (message.mime_type === 'audio/pcm') {
                            // Track audio packets for gap detection
                            this.audioPacketsReceived++;
                            const now = Date.now();
                            
                            // Check for potential packet loss and adapt buffering
                            if (this.lastAudioTime > 0) {
                                const gap = now - this.lastAudioTime;
                                if (gap > 100) {
                                    // Rate limit gap logging to prevent spam
                                    const shouldLog = (now - this.lastGapLogTime) > 2000; // Max once per 2 seconds
                                    
                                    // Track gap statistics for adaptive buffering
                                    this.gapCount++;
                                    this.avgGapSize = (this.avgGapSize * (this.gapCount - 1) + gap) / this.gapCount;
                                    
                                    // Categorize gaps for better diagnostics
                                    if (gap > 5000) { // Large gaps > 5 seconds
                                        this.largeGapCount++;
                                        if (shouldLog) {
                                            console.warn(`🎵 Large audio gap: ${Math.round(gap/1000)}s (packet #${this.audioPacketsReceived}) - server/network issue`);
                                            this.lastGapLogTime = now;
                                        }
                                    } else if (gap > 500) { // Medium gaps 0.5-5s
                                        if (shouldLog) {
                                            console.warn(`🎵 Audio gap: ${gap}ms (packet #${this.audioPacketsReceived}) - network delay`);
                                            this.lastGapLogTime = now;
                                        }
                                    } else if (shouldLog && gap > 200) { // Small gaps 200-500ms (less frequent logging)
                                        console.log(`🎵 Minor gap: ${gap}ms (packet #${this.audioPacketsReceived})`);
                                        this.lastGapLogTime = now;
                                    }
                                    
                                    // Adapt buffer threshold based on network conditions
                                    if (gap > 200 && this.avgGapSize > 150) {
                                        this.adaptiveThreshold = Math.min(7200, this.avgGapSize * 24); // Up to 300ms buffer
                                        if (shouldLog) {
                                            console.log(`🎵 Adaptive buffering: increased threshold to ${Math.round(this.adaptiveThreshold/24)}ms (avg gap: ${Math.round(this.avgGapSize)}ms)`);
                                        }
                                    }
                                }
                            }
                            this.lastAudioTime = now;
                            
                            // Process incoming audio directly (single path to prevent overlapping)
                            try {
                                this.onAudioReceived(message.data);
                                await this.playAudio(message.data);
                            } catch (error) {
                                console.error('Error processing audio message:', error);
                            }
                        }
                        else if (message.mime_type === 'text/plain') {
                            // Process text through queue system
                            try {
                                if (this.queueManager) {
                                    await this.queueManager.receive('text', message.data, {
                                        role: message.role || 'model',
                                        contentType: 'text/plain',
                                        timestamp: Date.now()
                                    });
                                } else {
                                    // Fallback to direct processing
                                    const role = message.role || 'model';
                                    this.onTextReceived(message.data, role);
                                }
                            } catch (error) {
                                console.error('Error processing text message:', error);
                                // Fallback to direct processing
                                const role = message.role || 'model';
                                this.onTextReceived(message.data, role);
                            }
                        }
                        else if (message.mime_type === 'image/jpeg') {
                            // Process video through queue system (if needed for future features)
                            try {
                                if (this.queueManager) {
                                    await this.queueManager.receive('video', message.data, {
                                        contentType: 'image/jpeg',
                                        mode: message.mode || 'unknown',
                                        timestamp: Date.now()
                                    });
                                } else {
                                    // Fallback - video processing not critical for current features
                                    console.log('Video message received but queue unavailable');
                                }
                            } catch (error) {
                                console.error('Error processing video message:', error);
                                // Video processing failures are non-critical
                            }
                        }
                        else if (message.turn_complete) {
                            // Model is done speaking
                            this.isModelSpeaking = false;
                            this.onTurnComplete();
                        }
                        else if (message.interrupted) {
                            // Response was interrupted
                            this.isModelSpeaking = false;
                            this.onInterrupted(message.data);
                        }
                        else if (message.error) {
                            // Handle server error
                            this.onError(message.error);
                        }
                    } catch (error) {
                        console.error('Error processing message:', error);
                    }
                };
            } catch (error) {
                console.error('Error creating WebSocket:', error);
                reject(error);
            }
        });
    }

    // Try to reconnect with exponential backoff
    async tryReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const backoffTime = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

        console.log(`Attempting to reconnect in ${backoffTime}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(async () => {
            try {
                await this.connect();
                console.log('Reconnected successfully');
            } catch (error) {
                console.error('Reconnection failed:', error);
            }
        }, backoffTime);
    }

    // Initialize the audio context and recorder using AudioWorklet
    async initializeAudio() {
        // Prevent concurrent initialization
        if (this.isInitializingAudio) {
            console.log('Audio initialization already in progress, waiting...');
            // Wait for current initialization to complete
            while (this.isInitializingAudio) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.recorder !== null;
        }
        
        this.isInitializingAudio = true;
        
        try {
            console.log('Requesting microphone access...');
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Microphone access granted');

            // Create recording context if needed (16kHz for input)
            if (!this.recordingAudioContext || this.recordingAudioContext.state === 'closed') {
                console.log("Creating new recording audio context with AudioWorklet");
                // Use 16kHz for input to match Live API native rate
                this.recordingAudioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 16000 // Live API native input rate
                });
                console.log('Recording AudioContext created with sample rate:', this.recordingAudioContext.sampleRate);

                // Track this context for cleanup
                this.trackAudioContext(this.recordingAudioContext);
                
                // Keep reference for backward compatibility
                this.audioContext = this.recordingAudioContext;

                // Load the AudioWorklet module
                try {
                    console.log('Loading AudioWorklet module...');
                    const workletUrl = `${window.location.origin}/static/live/audio-processor.js`;
                    console.log('Worklet URL:', workletUrl);
                    await this.recordingAudioContext.audioWorklet.addModule(workletUrl);
                    console.log('AudioWorklet module loaded successfully');
                } catch (workletError) {
                    console.warn('AudioWorklet failed to load:', workletError);
                    throw new Error('AudioWorklet initialization failed: ' + workletError.message);
                }
            }

            // Create MediaStreamSource
            console.log('Creating MediaStreamSource...');
            const source = this.recordingAudioContext.createMediaStreamSource(stream);
            console.log('MediaStreamSource created');

            // Create AudioWorkletNode
            console.log('Creating AudioWorkletNode...');
            const workletNode = new AudioWorkletNode(this.recordingAudioContext, 'audio-processor-worklet');
            console.log('AudioWorkletNode created');

            // Handle messages from the worklet with error handling
            workletNode.port.onmessage = (event) => {
                try {
                    const { type, data, error } = event.data;

                    if (type === 'error') {
                        console.error('AudioWorklet error:', error);
                        this.onError(new Error('AudioWorklet: ' + error));
                        return;
                    }

                    if (type === 'audio-data' && this.isConnected && this.isRecording) {
                        // Convert Int16Array to Uint8Array for transmission
                        const audioBuffer = new Uint8Array(data.buffer);
                        const base64Audio = this._arrayBufferToBase64(audioBuffer);

                        // Check if there's significant audio activity
                        const int16Array = new Int16Array(data.buffer);
                        const hasSignificantAudio = this._detectAudioActivity(int16Array);

                        // For now, bypass queue system for audio to avoid overflow issues
                        // Direct WebSocket send for better real-time performance
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            try {
                                this.ws.send(JSON.stringify({
                                    mime_type: 'audio/pcm;rate=16000',
                                    data: base64Audio
                                }));
                                this.messagesSent.audio = (this.messagesSent.audio || 0) + 1;
                                
                                // Log occasionally to show we're sending
                                if (this.messagesSent.audio % 50 === 0) {
                                    console.log(`📤 AUDIO DIRECT: Sent ${this.messagesSent.audio} audio messages`);
                                }
                            } catch (error) {
                                console.error('Direct audio WebSocket send failed:', error);
                            }
                        }

                        // Trigger callback with audio activity status
                        this.onAudioSent(hasSignificantAudio);
                    }
                } catch (error) {
                    console.error('Error handling AudioWorklet message:', error);
                    this.onError(error);
                }
            };

            // Connect the audio nodes
            source.connect(workletNode);
            // Note: AudioWorkletNode doesn't need to be connected to destination for processing

            this.recorder = {
                source: source,
                workletNode: workletNode,
                stream: stream
            };

            return true;
        } catch (error) {
            console.error('Error initializing audio:', error);
            this.onError(error);
            return false;
        } finally {
            this.isInitializingAudio = false;
        }
    }

    // Start recording audio
    async startRecording() {
        console.log('AudioClient.startRecording() called');
        
        if (!this.recorder) {
            console.log('No recorder found, initializing audio...');
            const initialized = await this.initializeAudio();
            if (!initialized) {
                console.error('Failed to initialize audio');
                return false;
            }
        }

        if (!this.isConnected) {
            console.log('Not connected, attempting to connect...');
            try {
                await this.connect();
            } catch (error) {
                console.error('Failed to connect to server:', error);
                return false;
            }
        }

        this.isRecording = true;

        // Start recording in the worklet
        if (this.recorder.workletNode) {
            console.log('Sending start-recording message to worklet');
            this.recorder.workletNode.port.postMessage({ type: 'start-recording' });
        } else {
            console.error('No worklet node available for recording');
            return false;
        }

        console.log('Recording started successfully');
        return true;
    }

    // Stop recording audio
    stopRecording() {
        this.isRecording = false;

        // Stop recording in the worklet
        if (this.recorder && this.recorder.workletNode) {
            this.recorder.workletNode.port.postMessage({ type: 'stop-recording' });
        }
    }

    // Decode and buffer received audio
    async playAudio(base64Audio) {
        try {
            // Decode the base64 audio data
            const audioData = this._base64ToArrayBuffer(base64Audio);

            // Create playback context if needed (24kHz for output)
            if (!this.playbackAudioContext || this.playbackAudioContext.state === 'closed') {
                this.playbackAudioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000 // Use 24kHz for playback to match server output
                });

                // Track this context for cleanup
                window.existingAudioContexts.push(this.playbackAudioContext);
                
                // Update main reference for backward compatibility
                this.audioContext = this.playbackAudioContext;

                // Limit the number of contexts we track to avoid memory issues
                if (window.existingAudioContexts.length > 5) {
                    const oldContext = window.existingAudioContexts.shift();
                    try {
                        if (oldContext && oldContext !== this.playbackAudioContext && oldContext !== this.recordingAudioContext && oldContext.state !== 'closed') {
                            oldContext.close();
                        }
                    } catch (e) {
                        console.error("Error closing old audio context:", e);
                    }
                }
            }

            // Resume playback context if suspended
            if (this.playbackAudioContext.state === 'suspended') {
                await this.playbackAudioContext.resume();
            }
            
            // Create gain node for volume control if not exists
            if (!this.gainNode) {
                this.gainNode = this.playbackAudioContext.createGain();
                this.gainNode.gain.setValueAtTime(0.7, this.playbackAudioContext.currentTime); // Set to 70% volume
                this.gainNode.connect(this.playbackAudioContext.destination);
            }

            // Add audio data to buffer instead of immediate playback
            this.addToAudioBuffer(audioData);

            // Set flag to indicate model is speaking
            this.isModelSpeaking = true;
        } catch (error) {
            console.error('Error processing audio:', error);
        }
    }

    // Add audio data to continuous buffer for smooth playback
    addToAudioBuffer(audioData) {
        try {
            // Skip buffering if we're too far behind (prevent audio buildup)
            if (this.audioBuffer.length > this.maxBufferSize * 0.8) {
                console.warn(`🎵 Audio buffer too full (${Math.round(this.audioBuffer.length/24)}ms), dropping packet to prevent delay`);
                return;
            }
            
            // Convert Int16Array to Float32Array
            const int16Array = new Int16Array(audioData);
            const float32Array = new Float32Array(int16Array.length);
            
            // Convert with proper scaling and soft limiting
            for (let i = 0; i < int16Array.length; i++) {
                let sample = int16Array[i] / 32768.0;
                // Soft clipping
                if (sample > 0.95) sample = 0.95;
                else if (sample < -0.95) sample = -0.95;
                float32Array[i] = sample;
            }

            // Expand buffer and append new data
            const newBuffer = new Float32Array(this.audioBuffer.length + float32Array.length);
            newBuffer.set(this.audioBuffer, 0);
            newBuffer.set(float32Array, this.audioBuffer.length);
            this.audioBuffer = newBuffer;

            // Prevent buffer from growing too large
            if (this.audioBuffer.length > this.maxBufferSize) {
                const excess = this.audioBuffer.length - this.maxBufferSize;
                this.audioBuffer = this.audioBuffer.slice(excess);
                console.warn(`🎵 Audio buffer trimmed by ${excess} samples to prevent overflow`);
            }

            // Start playback if we have enough buffered data (use adaptive threshold)
            const currentThreshold = Math.max(this.bufferThreshold, this.adaptiveThreshold);
            if (this.isBuffering && this.audioBuffer.length >= currentThreshold) {
                const bufferMs = Math.round((this.audioBuffer.length / 24000) * 1000); // Output is 24kHz
                console.log(`🎵 Starting playback with ${bufferMs}ms buffered (threshold: ${Math.round(currentThreshold/24)}ms)`);
                this.isBuffering = false;
                this.startContinuousPlayback();
            }

        } catch (error) {
            console.error('Error adding to audio buffer:', error);
        }
    }

    // Start continuous audio playback using AudioContext scheduling
    startContinuousPlayback() {
        // Ensure we don't start multiple playback loops
        if (this.nextScheduledTime > this.playbackAudioContext.currentTime) {
            console.log(`🎵 Playback already scheduled, continuing from ${this.nextScheduledTime.toFixed(3)}`);
            this.scheduleNextChunk();
            return;
        }
        
        // Initialize scheduled timeline
        this.nextScheduledTime = this.playbackAudioContext.currentTime + 0.05; // Start 50ms from now
        console.log(`🎵 Starting continuous playback at time ${this.nextScheduledTime.toFixed(3)}`);
        
        // Begin the scheduling loop
        this.scheduleNextChunk();
    }

    // Schedule audio chunks using precise AudioContext timing
    scheduleNextChunk() {
        // Check if we have enough data to continue (use adaptive threshold for rebuffering)
        const rebufferThreshold = Math.max(this.chunkSize * 2, this.adaptiveThreshold / 2);
        if (this.audioBuffer.length < rebufferThreshold) {
            if (!this.isBuffering) {
                const bufferMs = Math.round((this.audioBuffer.length / 24000) * 1000);
                console.log(`🎵 Buffer running low (${bufferMs}ms), switching to buffering mode`);
                this.isBuffering = true;
            }
            
            // If we have any data left, schedule it, otherwise wait for more
            if (this.audioBuffer.length > 0) {
                const remainingData = this.audioBuffer.slice(0);
                this.audioBuffer = new Float32Array(0);
                this.scheduleAudioChunk(remainingData);
            }
            
            // Check again with adaptive timing based on network conditions
            const checkDelay = this.avgGapSize > 200 ? 100 : 50; // Slower polling for poor networks
            setTimeout(() => {
                if (this.audioBuffer.length >= rebufferThreshold || 
                   (this.audioBuffer.length > 0 && !this.isBuffering)) {
                    this.scheduleNextChunk();
                }
            }, checkDelay);
            return;
        }

        // Extract chunk from buffer
        const chunkData = this.audioBuffer.slice(0, this.chunkSize);
        this.audioBuffer = this.audioBuffer.slice(this.chunkSize);

        // Schedule this chunk
        this.scheduleAudioChunk(chunkData);

        // Continue scheduling if we have more data and not in buffering mode
        if (this.audioBuffer.length > 0 && !this.isBuffering) {
            // Schedule next chunk immediately (no setTimeout!)
            this.scheduleNextChunk();
        }
    }

    // Schedule a single audio chunk with precise timing
    scheduleAudioChunk(chunkData) {
        try {
            // Apply gentle fade to prevent clicks (smaller fade for 20ms chunks)
            const fadeLength = Math.min(24, chunkData.length / 8); // ~1ms fade
            for (let i = 0; i < fadeLength; i++) {
                const fadeRatio = i / fadeLength;
                chunkData[i] *= fadeRatio; // Fade in
                
                const endIndex = chunkData.length - 1 - i;
                if (endIndex > fadeLength) {
                    chunkData[endIndex] *= fadeRatio; // Fade out
                }
            }

            // Create AudioBuffer using playback context
            const audioBuffer = this.playbackAudioContext.createBuffer(1, chunkData.length, this.playbackAudioContext.sampleRate);
            audioBuffer.getChannelData(0).set(chunkData);

            // Create and configure source
            const source = this.playbackAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.gainNode);

            // Schedule with precise AudioContext timing
            const scheduleTime = this.nextScheduledTime;
            const chunkDuration = chunkData.length / this.playbackAudioContext.sampleRate;
            
            source.start(scheduleTime);
            
            // Track source for cleanup
            this.playbackSources.push(source);
            
            // Clean up old sources
            source.onended = () => {
                const index = this.playbackSources.indexOf(source);
                if (index > -1) {
                    this.playbackSources.splice(index, 1);
                }
                source.disconnect();
            };

            // Update next scheduled time (seamless continuation)
            this.nextScheduledTime += chunkDuration;

            // Debug logging (occasionally)
            if (this.playbackSources.length === 1) {
                console.log(`🎵 Scheduled chunk at ${scheduleTime.toFixed(3)}s, duration: ${(chunkDuration * 1000).toFixed(1)}ms`);
            }

        } catch (error) {
            console.error('Error scheduling audio chunk:', error);
        }
    }


    // Interrupt current playback
    interrupt() {
        this.isModelSpeaking = false;

        // Stop all active audio sources
        for (const source of this.playbackSources) {
            try {
                source.onended = null; // Remove event listener
                source.stop();
                source.disconnect();
            } catch (e) {
                // Ignore errors if already stopped
            }
        }
        this.playbackSources = [];

        // Clear audio buffer and reset state
        this.audioBuffer = new Float32Array(0);
        this.isBuffering = true;
        this.nextScheduledTime = 0;
        
        // Reset adaptive buffering statistics
        this.avgGapSize = 0;
        this.gapCount = 0;
        this.largeGapCount = 0;
        this.adaptiveThreshold = 2400; // Reset to default
        this.lastGapLogTime = 0;
        
        console.log('🔇 Audio playback interrupted and buffers cleared');
    }

    // Cleanup resources
    close() {
        this.stopRecording();

        // Reset session ID
        this.sessionId = null;

        // Stop any audio playback
        this.interrupt();
        this.isModelSpeaking = false;

        // Clean up recorder
        if (this.recorder) {
            try {
                this.recorder.stream.getTracks().forEach(track => track.stop());
                this.recorder.source.disconnect();
                if (this.recorder.workletNode) {
                    this.recorder.workletNode.disconnect();
                }
                this.recorder = null;
            } catch (e) {
                console.error("Error cleaning up recorder:", e);
            }
        }

        // Close audio contexts and remove from tracking
        if (this.recordingAudioContext && this.recordingAudioContext.state !== 'closed') {
            try {
                this.untrackAudioContext(this.recordingAudioContext);
                this.recordingAudioContext.close().catch(e => console.error("Error closing recording context:", e));
            } catch (e) {
                console.error("Error closing recording context:", e);
            }
        }
        
        if (this.playbackAudioContext && this.playbackAudioContext.state !== 'closed') {
            try {
                this.untrackAudioContext(this.playbackAudioContext);
                this.playbackAudioContext.close().catch(e => console.error("Error closing playback context:", e));
            } catch (e) {
                console.error("Error closing playback context:", e);
            }
        }

        // Close WebSocket
        if (this.ws) {
            try {
                if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.close();
                }
                this.ws = null;
            } catch (e) {
                console.error("Error closing WebSocket:", e);
            }
        }

        this.isConnected = false;
    }

    // Utility: Convert ArrayBuffer to Base64
    _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Utility: Convert Base64 to ArrayBuffer
    _base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Initialize audio context tracking with LRU cleanup
     */
    initializeAudioContextTracking() {
        // Initialize global tracking if not exists
        if (!window.audioContextManager) {
            window.audioContextManager = {
                contexts: [],
                maxContexts: 5,

                add(context) {
                    // Remove context if already tracked
                    this.remove(context);

                    // Add to front of list
                    this.contexts.unshift(context);

                    // Cleanup old contexts if over limit
                    while (this.contexts.length > this.maxContexts) {
                        const oldContext = this.contexts.pop();
                        try {
                            if (oldContext && oldContext.state !== 'closed') {
                                oldContext.close();
                            }
                        } catch (e) {
                            console.error('Error closing old audio context:', e);
                        }
                    }
                },

                remove(context) {
                    const index = this.contexts.indexOf(context);
                    if (index > -1) {
                        this.contexts.splice(index, 1);
                    }
                },

                cleanup() {
                    this.contexts.forEach(ctx => {
                        try {
                            if (ctx && ctx.state !== 'closed') {
                                ctx.close();
                            }
                        } catch (e) {
                            console.error('Error closing audio context during cleanup:', e);
                        }
                    });
                    this.contexts = [];
                }
            };
        }
    }

    /**
     * Track audio context with LRU management
     */
    trackAudioContext(context) {
        if (window.audioContextManager) {
            window.audioContextManager.add(context);
        }
    }

    /**
     * Remove audio context from tracking
     */
    untrackAudioContext(context) {
        if (window.audioContextManager) {
            window.audioContextManager.remove(context);
        }
    }

    /**
     * Detect if there's significant audio activity in the buffer
     * @param {Int16Array} audioData - The audio data to analyze
     * @returns {boolean} True if significant audio detected
     */
    _detectAudioActivity(audioData) {
        const threshold = 500; // Adjust this value to change sensitivity
        let sumSquares = 0;

        // Calculate RMS (Root Mean Square) for volume detection
        for (let i = 0; i < audioData.length; i++) {
            sumSquares += audioData[i] * audioData[i];
        }

        const rms = Math.sqrt(sumSquares / audioData.length);
        return rms > threshold;
    }

    /**
     * Get queue status for monitoring
     */
    getQueueStatus() {
        return this.queueManager ? this.queueManager.getStatus() : null;
    }

    /**
     * Enable or disable queue system
     */
    setQueueEnabled(enabled) {
        if (this.queueManager) {
            this.queueManager.updateConfig({ enabled });
        }
    }

    /**
     * Set playback volume (0.0 to 1.0)
     */
    setPlaybackVolume(volume) {
        if (this.gainNode && this.playbackAudioContext) {
            const clampedVolume = Math.max(0, Math.min(1, volume));
            this.gainNode.gain.setValueAtTime(clampedVolume, this.playbackAudioContext.currentTime);
            console.log('Playback volume set to:', clampedVolume);
        }
    }

    /**
     * Cleanup queue manager resources
     */
    _cleanupQueueManager() {
        if (this.queueManager) {
            this.queueManager.destroy();
            this.queueManager = null;
        }
    }

    /**
     * Get message transmission statistics
     */
    getTransmissionStats() {
        return {
            messagesSent: { ...this.messagesSent },
            isConnected: this.isConnected,
            isRecording: this.isRecording,
            wsReadyState: this.ws ? this.ws.readyState : 'null',
            queueStatus: this.getQueueStatus(),
            audioPacketsReceived: this.audioPacketsReceived,
            lastAudioGap: this.lastAudioTime > 0 ? Date.now() - this.lastAudioTime : 0,
            recordingContextSampleRate: this.recordingAudioContext ? this.recordingAudioContext.sampleRate : 'null',
            playbackContextSampleRate: this.playbackAudioContext ? this.playbackAudioContext.sampleRate : 'null',
            audioBuffer: {
                samplesBuffered: this.audioBuffer ? this.audioBuffer.length : 0,
                bufferDurationMs: this.audioBuffer ? Math.round((this.audioBuffer.length / 24000) * 1000) : 0, // Output is 24kHz
                isBuffering: this.isBuffering,
                bufferThreshold: this.bufferThreshold,
                maxBufferSize: this.maxBufferSize
            },
            gapAnalysis: {
                totalGaps: this.gapCount,
                largeGaps: this.largeGapCount,
                averageGapMs: Math.round(this.avgGapSize),
                adaptiveThresholdMs: Math.round(this.adaptiveThreshold / 24), // Output is 24kHz
                gapPercentage: this.audioPacketsReceived > 0 ? Math.round((this.gapCount / this.audioPacketsReceived) * 100) : 0
            }
        };
    }
    
    /**
     * Get detailed gap analysis for debugging
     */
    getGapAnalysis() {
        const stats = this.getTransmissionStats().gapAnalysis;
        const totalPackets = this.audioPacketsReceived;
        const gapRate = totalPackets > 0 ? (this.gapCount / totalPackets * 100).toFixed(1) : '0';
        const largeGapRate = totalPackets > 0 ? (this.largeGapCount / totalPackets * 100).toFixed(1) : '0';
        
        return {
            summary: `${this.gapCount} gaps in ${totalPackets} packets (${gapRate}%)`,
            largeGaps: `${this.largeGapCount} large gaps (${largeGapRate}% of total packets)`,
            averageGap: `${Math.round(this.avgGapSize)}ms average gap`,
            currentThreshold: `${Math.round(this.adaptiveThreshold / 24)}ms adaptive buffer`,
            recommendation: this.largeGapCount > 3 ? 
                'High server/network delays detected - check server load or network connectivity' :
                this.gapCount > totalPackets * 0.1 ? 
                    'Frequent gaps detected - network quality may be poor' :
                    'Audio streaming appears normal'
        };
    }
}