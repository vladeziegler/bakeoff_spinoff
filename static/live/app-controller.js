/**
 * App Controller Module
 * Main application orchestration and coordination between modules
 */

import { SessionManager } from './session-manager.js';
import { UIManager } from './ui-manager.js';
import { StateManager } from './state-manager.js';

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

        this.client.onTextReceived = (text) => {
            if (text && text.trim()) {
                this.uiManager.removePlaceholderUserMessage();

                if (isFirstChunk) {
                    currentResponseText = text;
                    this.uiManager.addMessage(text, "assistant");
                    isFirstChunk = false;
                } else {
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
        
        // Cleanup managers
        if (this.uiManager) {
            this.uiManager.destroy();
        }
        
        if (this.stateManager) {
            this.stateManager.destroy();
        }
        
        console.log('AppController destroyed and resources cleaned up');
    }
}