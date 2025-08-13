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

        // Audio playback (legacy - will be replaced by queue system)
        this.audioQueue = [];
        this.isPlaying = false;
        this.currentSource = null;

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
                            mime_type: 'audio/pcm',
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
                    this.onAudioReceived(data);
                    await this.playAudio(data);
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
                            // Process audio through queue system
                            try {
                                if (this.queueManager) {
                                    await this.queueManager.receive('audio', message.data, {
                                        contentType: 'audio/pcm',
                                        timestamp: Date.now()
                                    });
                                } else {
                                    // Fallback to direct processing
                                    this.onAudioReceived(message.data);
                                    await this.playAudio(message.data);
                                }
                            } catch (error) {
                                console.error('Error processing audio message:', error);
                                // Fallback to direct processing
                                this.onAudioReceived(message.data);
                                await this.playAudio(message.data);
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

            // Reuse existing audio context if available or create a new one
            if (!this.audioContext || this.audioContext.state === 'closed') {
                console.log("Creating new audio context for recording with AudioWorklet");
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: (CONFIG && CONFIG.audio && CONFIG.audio.sampleRate) || 22000 // Use configured sample rate or default
                });
                console.log('AudioContext created with sample rate:', this.audioContext.sampleRate);

                // Track this context for cleanup with LRU management
                this.trackAudioContext(this.audioContext);

                // Load the AudioWorklet module
                try {
                    console.log('Loading AudioWorklet module...');
                    const workletUrl = `${window.location.origin}/static/live/audio-processor.js`;
                    console.log('Worklet URL:', workletUrl);
                    await this.audioContext.audioWorklet.addModule(workletUrl);
                    console.log('AudioWorklet module loaded successfully');
                } catch (workletError) {
                    console.warn('AudioWorklet failed to load:', workletError);
                    throw new Error('AudioWorklet initialization failed: ' + workletError.message);
                }
            }

            // Create MediaStreamSource
            console.log('Creating MediaStreamSource...');
            const source = this.audioContext.createMediaStreamSource(stream);
            console.log('MediaStreamSource created');

            // Create AudioWorkletNode
            console.log('Creating AudioWorkletNode...');
            const workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor-worklet');
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
                                    mime_type: 'audio/pcm',
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

    // Decode and play received audio
    async playAudio(base64Audio) {
        try {
            // Decode the base64 audio data
            const audioData = this._base64ToArrayBuffer(base64Audio);

            // Create an audio context if needed
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: (CONFIG && CONFIG.audio && CONFIG.audio.sampleRate) || 22000 // Use configured sample rate or default
                });

                // Track this context for cleanup
                window.existingAudioContexts.push(this.audioContext);

                // Limit the number of contexts we track to avoid memory issues
                if (window.existingAudioContexts.length > 5) {
                    const oldContext = window.existingAudioContexts.shift();
                    try {
                        if (oldContext && oldContext !== this.audioContext && oldContext.state !== 'closed') {
                            oldContext.close();
                        }
                    } catch (e) {
                        console.error("Error closing old audio context:", e);
                    }
                }
            }

            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Add to audio queue
            this.audioQueue.push(audioData);

            // If not currently playing, start playback
            if (!this.isPlaying) {
                this.playNextInQueue();
            }

            // Set flag to indicate model is speaking
            this.isModelSpeaking = true;
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }

    // Play next audio chunk from queue
    playNextInQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;

        try {
            // Stop any previous source if still active
            if (this.currentSource) {
                try {
                    this.currentSource.onended = null; // Remove event listener
                    this.currentSource.stop();
                    this.currentSource.disconnect();
                } catch (e) {
                    // Ignore errors if already stopped
                }
                this.currentSource = null;
            }

            // Get next audio data from queue
            const audioData = this.audioQueue.shift();

            // Convert Int16Array to Float32Array for AudioBuffer
            const int16Array = new Int16Array(audioData);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768.0;
            }

            // Create an AudioBuffer
            const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
            audioBuffer.getChannelData(0).set(float32Array);

            // Create a source node
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            // Store reference to current source
            this.currentSource = source;

            // Connect to destination
            source.connect(this.audioContext.destination);

            // When this buffer ends, play the next one
            source.onended = () => {
                this.currentSource = null;
                this.playNextInQueue();
            };

            // Start playing
            source.start(0);
        } catch (error) {
            console.error('Error during audio playback:', error);
            this.currentSource = null;
            // Try next buffer on error
            setTimeout(() => this.playNextInQueue(), 100);
        }
    }

    // Interrupt current playback
    interrupt() {
        this.isModelSpeaking = false;

        // Stop current audio source if active
        if (this.currentSource) {
            try {
                this.currentSource.onended = null; // Remove event listener
                this.currentSource.stop();
                this.currentSource.disconnect();
            } catch (e) {
                // Ignore errors if already stopped
            }
            this.currentSource = null;
        }

        // Clear queue and reset playing state
        this.audioQueue = [];
        this.isPlaying = false;
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

        // Close audio context and remove from tracking
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try {
                this.untrackAudioContext(this.audioContext);
                this.audioContext.close().catch(e => console.error("Error closing audio context:", e));
            } catch (e) {
                console.error("Error closing audio context:", e);
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
            queueStatus: this.getQueueStatus()
        };
    }
}