/**
 * App Controller Module
 * Main application orchestration and coordination between modules
 */

import { SessionManager } from './session-manager.js';
import { UIManager } from './ui-manager.js';
import { StateManager } from './state-manager.js';
import { MultimodalClient } from './multimodal-client.js';
import { enableQueueDebugging } from './queue-debug.js';
import { CONFIG } from './config.js';

// Debug logging can be uncommented if needed:
// console.log('AppController imports loaded:', { SessionManager, UIManager, StateManager });

export class AppController {
    constructor() {
        // Debug: console.log('AppController constructor called');
        
        // Initialize state manager first
        this.stateManager = new StateManager();
        // Debug: console.log('StateManager created');
        
        // Initialize managers with state manager
        this.sessionManager = null;
        this.uiManager = new UIManager(this.stateManager);
        // Debug: console.log('UIManager created');
        this.client = null;
        
        // Initialize client first, then session manager
        this.initializeClient();
    }

    /**
     * Initialize the multimodal client
     */
    initializeClient() {
        console.log('initializeClient called');
        
        // Create session manager first to get user ID
        const tempSessionManager = new SessionManager(null, this.stateManager);
        const wsUrl = tempSessionManager.getWebSocketUrl();
        console.log('WebSocket URL:', wsUrl);
        
        // Create multimodal client
        this.client = new MultimodalClient(wsUrl);
        this.client.maxReconnectAttempts = 0;
        console.log('MultimodalClient created');
        
        // Now create the real session manager with the client and state manager
        this.sessionManager = new SessionManager(this.client, this.stateManager);
        console.log('SessionManager created');
        
        // Set up session manager callback
        this.sessionManager.onNewSessionRequested = () => {
            this.handleNewSessionRequest();
        };
        
        // Set up UI event listeners
        this.setupUIEventListeners();
        console.log('UI event listeners set up');
        
        // Connect to server
        this.connectToServer();
        
        // Enable queue debugging if in debug mode
        if (CONFIG.debug.enableQueueLogging || CONFIG.ui.showQueueHealth) {
            this._enableQueueDebugging();
        }
        
        // Start queue health monitoring
        this._startQueueHealthMonitoring();
        
        // Expose transmission stats globally for debugging
        window.getTransmissionStats = () => {
            return this.client ? this.client.getTransmissionStats() : null;
        };
    }

    /**
     * Set up UI event listeners
     */
    setupUIEventListeners() {
        // Debug: console.log('Setting up UI event listeners...');
        this.uiManager.setupEventListeners({
            onMicClick: () => this.handleMicClick(),
            onCameraClick: () => this.handleCameraClick(),
            onScreenClick: () => this.handleScreenClick(),
            // End button removed - mic button handles start/stop
            onScreenShareEnded: () => this.handleScreenShareEnded()
        });
    }

    /**
     * Connect to the server and set up callbacks
     */
    async connectToServer() {
        try {
            // Update session status
            this.sessionManager.updateConnectionStatus('connecting');

            // Set up client callbacks BEFORE connecting
            this.setupClientCallbacks();

            // Connect to server
            await this.client.connect();

        } catch (error) {
            console.error('Failed to initialize client:', error);
            this.uiManager.addMessage("Sorry, I'm having trouble connecting. Please try again later.", "assistant");
            this.sessionManager.updateConnectionStatus('failed');
        }
    }

    /**
     * Set up client event callbacks
     */
    setupClientCallbacks() {
        let currentResponseText = '';
        let isFirstChunk = true;
        let lastRole = null; // Track the role of the last message

        this.client.onReady = () => {
            console.log('Client ready');
            const videoState = this.uiManager.getVideoState();
            if (videoState.isActive) { // If video was already active before a reconnect
                this.client.startVideoStream(1);
            }
        };

        this.client.onAudioReceived = (audioData) => {
            this.uiManager.showAudioIndicator(true);
            // Don't change mic button state for incoming audio from model
        };

        this.client.onTextReceived = (text, role) => {
            if (text && text.trim()) {
                this.uiManager.removePlaceholderUserMessage();

                // Map role to sender for UI consistency
                const sender = role === 'user' ? 'user' : 'assistant';

                // If this is the first chunk or role has changed, create a new message
                if (isFirstChunk || lastRole !== role) {
                    currentResponseText = text;
                    this.uiManager.addMessage(text, sender, role);
                    isFirstChunk = false;
                    lastRole = role;
                } else {
                    // Same role, append to existing message
                    currentResponseText += ' ' + text.trim();
                    this.uiManager.updateLastMessage(currentResponseText);
                }
            }
        };

        this.client.onTurnComplete = () => {
            console.log('Turn complete, preparing for next turn');
            this.uiManager.showAudioIndicator(false);
            currentResponseText = '';
            isFirstChunk = true;
            lastRole = null; // Reset role tracking
            
            if (this.client.ws && this.client.ws.readyState !== WebSocket.OPEN) {
                console.log('WebSocket not open, reconnecting...');
                setTimeout(() => { 
                    if (!this.client.isConnected) this.connectToServer(); 
                }, 1000);
            }
            
            const sessionId = this.client.sessionId;
            if (sessionId) {
                console.log(`Turn complete with session ID: ${sessionId}`);
            }
        };

        this.client.onError = (error) => {
            console.error('Client error:', error);
            this.uiManager.addMessage("Sorry, I encountered an error. Please try again.", "assistant");
            currentResponseText = ''; 
            isFirstChunk = true;
            lastRole = null; // Reset role tracking
            
            if (!this.client.isConnected || (this.client.ws && this.client.ws.readyState !== WebSocket.OPEN)) {
                console.log('Connection lost due to error, attempting to reconnect...');
                setTimeout(() => { 
                    if (!this.client.isConnected) this.connectToServer(); 
                }, 2000);
            }
        };

        this.client.onInterrupted = () => {
            console.log('Interruption detected, stopping audio playback');
            this.uiManager.showAudioIndicator(false);
            this.client.interrupt();
            currentResponseText = ''; 
            isFirstChunk = true;
            lastRole = null; // Reset role tracking
        };
        
        // Handle audio activity detection for mic button styling
        this.client.onAudioSent = (hasAudio) => {
            this.stateManager.setHearingAudio(hasAudio);
        };
    }

    /**
     * Handle microphone button click
     */
    async handleMicClick() {
        const isRecording = this.uiManager.getRecordingState();
        
        if (isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    /**
     * Start audio recording
     */
    async startRecording() {
        try {
            const success = await this.client.startRecording();
            if (success) {
                this.uiManager.updateMicButtonState(true);
                this.uiManager.addMessage("...", "user");
                
                // Video streaming should already be active if video is enabled
                const videoState = this.uiManager.getVideoState();
                if (videoState.isActive && !this.client.videoSendInterval) {
                    console.log('🎬 Starting video stream during recording (fallback)');
                    this.client.startVideoStream(1);
                }
            }
        } catch (error) {
            console.error('Error starting recording:', error);
            this.uiManager.showError('Error starting. Try again.');
        }
    }

    /**
     * Stop audio recording
     */
    stopRecording() {
        this.client.stopRecording();
        this.uiManager.updateMicButtonState(false);
        
        // Reset audio detection state when recording stops
        this.stateManager.setHearingAudio(false);

        // Remove placeholder message if present using UIManager API
        if (this.uiManager.hasLastPlaceholderMessage()) {
            this.uiManager.removePlaceholderUserMessage();
        }
    }

    /**
     * Handle camera button click
     */
    async handleCameraClick() {
        const videoState = this.uiManager.getVideoState();
        
        if (videoState.isActive && videoState.mode === 'webcam') {
            // Stop camera
            this.client.stopVideo();
            this.uiManager.updateVideoDisplay(false, null);
        } else {
            // Start camera (stop screen sharing if active)
            if (videoState.isActive) {
                this.client.stopVideo();
            }
            
            try {
                const success = await this.client.initializeWebcam(this.uiManager.getVideoElement());
                if (success) {
                    this.uiManager.updateVideoDisplay(true, 'webcam');
                    // Always start video streaming immediately when camera is active and connected
                    if (this.client.isConnected) {
                        console.log('🎬 Starting video stream immediately after camera activation');
                        this.client.startVideoStream(1);
                    }
                }
            } catch (error) {
                console.error('Error accessing webcam:', error);
                console.warn('Unable to access webcam. Please check permissions.');
                this.uiManager.updateVideoDisplay(false, null);
            }
        }
    }

    /**
     * Handle screen sharing button click
     */
    async handleScreenClick() {
        const videoState = this.uiManager.getVideoState();
        
        if (videoState.isActive && videoState.mode === 'screen') {
            // Stop screen sharing
            this.client.stopVideo();
            this.uiManager.updateVideoDisplay(false, null);
        } else {
            // Start screen sharing (stop camera if active)
            if (videoState.isActive) {
                this.client.stopVideo();
            }
            
            try {
                const success = await this.client.initializeScreenShare(this.uiManager.getVideoElement());
                if (success) {
                    this.uiManager.updateVideoDisplay(true, 'screen');
                    // Always start video streaming immediately when screen sharing is active and connected
                    if (this.client.isConnected) {
                        console.log('🎬 Starting video stream immediately after screen share activation');
                        this.client.startVideoStream(1);
                    }
                }
            } catch (error) {
                console.error('Error accessing screen share:', error);
                if (error.name === 'NotAllowedError') {
                    console.warn('User denied screen sharing permission');
                } else {
                    console.warn('Unable to share screen. ' + error.message);
                }
                this.uiManager.updateVideoDisplay(false, null);
            }
        }
    }

    // End button functionality removed - mic button handles start/stop

    /**
     * Handle screen share ended via browser UI
     */
    handleScreenShareEnded() {
        console.log('Screen sharing ended via browser UI');
        const videoState = this.uiManager.getVideoState();
        if (videoState.mode === 'screen') {
            this.uiManager.updateVideoDisplay(false, null);
        }
    }

    /**
     * Handle new session request
     */
    handleNewSessionRequest() {
        if (this.uiManager.getRecordingState()) {
            this.stopRecording();
        }

        // Clear transcript
        this.uiManager.clearTranscript();
        this.uiManager.addMessage("Starting new session...", "assistant");
        
        // Close existing connection and reconnect
        this.client.close();
        this.connectToServer();
    }

    /**
     * Initialize the application when page loads
     */
    static initialize() {
        let hasInitialized = false;
        
        window.addEventListener('load', () => {
            if (!hasInitialized) {
                hasInitialized = true;
                console.log('Initializing client for the first time');
                window.appControllerInstance = new AppController();
            }
        });

        // Add unload handler
        window.addEventListener('beforeunload', () => {
            console.log('Page unloading, closing connection');
            // Cleanup all managers
            if (window.appControllerInstance) {
                window.appControllerInstance.destroy();
            }
        });
    }
    
    /**
     * Cleanup method for proper resource management
     */
    destroy() {
        // Close client connection
        if (this.client) {
            this.client.close();
        }
        
        // Stop queue health monitoring
        this._stopQueueHealthMonitoring();
        
        // Cleanup managers
        if (this.uiManager) {
            this.uiManager.destroy();
        }
        
        if (this.stateManager) {
            this.stateManager.destroy();
        }
        
        console.log('AppController destroyed and resources cleaned up');
    }

    /**
     * Enable queue debugging and monitoring
     */
    _enableQueueDebugging() {
        if (this.client && this.client.queueManager) {
            enableQueueDebugging(this.client.queueManager);
            console.log('Queue debugging enabled. Press Ctrl+Shift+Q to toggle debug panel.');
        }
    }

    /**
     * Start queue health monitoring and automatic recovery
     */
    _startQueueHealthMonitoring() {
        // Monitor queue health every 10 seconds
        this.queueHealthInterval = setInterval(() => {
            if (this.client && this.client.queueManager) {
                const status = this.client.queueManager.getStatus();
                this._handleQueueHealth(status);
            }
        }, 10000);
    }

    /**
     * Handle queue health status and implement recovery strategies
     */
    _handleQueueHealth(status) {
        if (status.overallHealth === 'critical') {
            console.warn('Queue health critical, implementing recovery strategies');
            
            // Strategy 1: Clear queues if they're backed up
            Object.entries(status.outbound).forEach(([type, queueStatus]) => {
                if (queueStatus.totalSize > queueStatus.maxSize * 0.9) {
                    console.warn(`Clearing backed up ${type} outbound queue`);
                    this.client.queueManager.outboundQueues.get(type)?.clear();
                }
            });
            
            // Strategy 2: Reset queue configuration to more conservative settings
            this._applyConservativeQueueSettings();
            
            // Strategy 3: Notify UI of issues
            if (this.uiManager) {
                this.uiManager.addMessage("Connection quality degraded, adjusting performance...", "assistant");
            }
            
        } else if (status.overallHealth === 'degraded') {
            console.info('Queue health degraded, applying optimizations');
            
            // Strategy: Adjust connection quality and queue settings
            const connectionQuality = this._assessConnectionQuality(status);
            this.client.queueManager.setConnectionState(status.connected, connectionQuality);
        }
    }

    /**
     * Apply conservative queue settings during recovery
     */
    _applyConservativeQueueSettings() {
        if (this.client && this.client.queueManager) {
            const conservativeConfig = {
                audio: {
                    outbound: {
                        maxSize: 50,        // Reduce buffer size
                        rateLimitMs: 50     // Slow down audio
                    }
                },
                video: {
                    outbound: {
                        rateLimitMs: 2000   // Reduce video frame rate
                    }
                }
            };
            
            this.client.queueManager.updateConfig(conservativeConfig);
            console.log('Applied conservative queue settings for recovery');
        }
    }

    /**
     * Assess connection quality based on queue metrics
     */
    _assessConnectionQuality(status) {
        let qualityScore = 100;
        
        // Penalize based on queue depth
        Object.values(status.outbound).forEach(queue => {
            if (queue.totalSize > queue.maxSize * 0.7) {
                qualityScore -= 20;
            }
        });
        
        // Penalize based on drop rates
        Object.values(status.metrics?.queues || {}).forEach(metrics => {
            const dropRate = parseFloat(metrics.health?.dropRate || 0);
            if (dropRate > 5) {
                qualityScore -= dropRate * 2;
            }
        });
        
        // Return quality assessment
        if (qualityScore > 80) return 'good';
        if (qualityScore > 50) return 'fair';
        return 'poor';
    }

    /**
     * Get queue status for external monitoring
     */
    getQueueStatus() {
        return this.client ? this.client.getQueueStatus() : null;
    }

    /**
     * Stop queue health monitoring
     */
    _stopQueueHealthMonitoring() {
        if (this.queueHealthInterval) {
            clearInterval(this.queueHealthInterval);
            this.queueHealthInterval = null;
        }
    }
}