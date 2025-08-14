/**
 * UI Management Module
 * Handles DOM interactions, button states, transcript management, and visual feedback
 */

import { StateManager } from './state-manager.js';

export class UIManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        
        // DOM elements
        this.micButton = document.getElementById('mic-button');
        this.micStatus = document.getElementById('mic-status');
        this.micIcon = this.micButton?.querySelector('.mic-icon');
        this.cameraButton = document.getElementById('cameraButton');
        this.screenButton = document.getElementById('screenButton');
        this.webcamVideo = document.getElementById('webcam-video');
        this.webcamPlaceholder = document.getElementById('webcam-placeholder');
        // End button removed - mic button handles start/stop
        this.transcriptContainer = document.getElementById('transcript');
        this.transcriptOuterContainer = document.getElementById('transcript-container');
        this.audioIndicator = document.getElementById('audio-indicator');
        this.volumeSlider = document.getElementById('volume-slider');
        this.volumeDisplay = document.getElementById('volume-display');
        this.userIdInput = document.getElementById('userIdInput');

        // Subscribe to state changes
        this.subscriptions = [];
        this.setupStateSubscriptions();
        
        this.initializeTranscript();
    }

    /**
     * Set up state subscriptions for automatic UI updates
     */
    setupStateSubscriptions() {
        // Subscribe to transcript messages
        this.subscriptions.push(
            this.stateManager.subscribe('ui.transcriptMessages', (messages) => {
                this.renderTranscriptMessages(messages);
            })
        );
        
        // Subscribe to recording state
        this.subscriptions.push(
            this.stateManager.subscribe('recording', (recordingState) => {
                this.updateMicButtonFromState(recordingState);
            })
        );
        
        // Subscribe to video state
        this.subscriptions.push(
            this.stateManager.subscribe('video', (videoState) => {
                this.updateVideoDisplayFromState(videoState);
            })
        );
        
        // Subscribe to button states
        this.subscriptions.push(
            this.stateManager.subscribe('ui.buttonStates', (buttonStates) => {
                this.updateButtonStatesFromState(buttonStates);
            })
        );
        
        // Subscribe to audio indicator
        this.subscriptions.push(
            this.stateManager.subscribe('ui.audioIndicatorVisible', (visible) => {
                this.updateAudioIndicatorFromState(visible);
            })
        );

        // Subscribe to user ID changes
        this.subscriptions.push(
            this.stateManager.subscribe('session.userId', (userId) => {
                this.setUserIdInputValue(userId);
            })
        );
    }

    /**
     * Initialize transcript with placeholder
     */
    initializeTranscript() {
        if (this.transcriptContainer && this.transcriptContainer.children.length === 0) {
            // Initialize with empty transcript in state
            this.stateManager.clearTranscriptMessages();
        }
    }

    /**
     * Add message to transcript via state manager
     */
    addMessage(text, sender, role = null) {
        const isPlaceholder = text === "..." && sender === "user";
        this.stateManager.addTranscriptMessage(text, sender, isPlaceholder, role);
    }
    
    /**
     * Render transcript messages from state
     */
    renderTranscriptMessages(messages) {
        if (!this.transcriptContainer) return;
        
        // Clear existing messages
        this.transcriptContainer.innerHTML = '';
        
        if (messages.length === 0) {
            // Show placeholder
            const placeholder = document.createElement('div');
            placeholder.className = 'text-[#555555] text-center py-10';
            placeholder.textContent = 'Start a conversation to see the transcript.';
            this.transcriptContainer.appendChild(placeholder);
            return;
        }
        
        // Render all messages
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            let bgColor, textColor;

            // Use role for styling if available, otherwise fall back to sender
            const displayRole = message.role || message.sender;
            
            if (displayRole === 'user') {
                bgColor = 'bg-blue-100';
                textColor = 'text-blue-900';
            } else {
                bgColor = 'bg-green-100';
                textColor = 'text-green-900';
            }

            messageElement.className = `p-3 rounded-lg shadow-sm ${bgColor} ${textColor}`;
            messageElement.textContent = message.text;

            if (message.isPlaceholder) {
                messageElement.classList.add('opacity-60', 'italic');
            }

            this.transcriptContainer.appendChild(messageElement);
        });
        
        this.scrollTranscriptToBottom();
    }

    /**
     * Update the last message in the transcript via state manager
     */
    updateLastMessage(text) {
        this.stateManager.updateLastTranscriptMessage(text);
    }

    /**
     * Remove placeholder user message via state manager
     */
    removePlaceholderUserMessage() {
        this.stateManager.removeLastPlaceholderMessage();
    }

    /**
     * Clear transcript via state manager
     */
    clearTranscript() {
        this.stateManager.clearTranscriptMessages();
    }

    /**
     * Scroll transcript to bottom
     */
    scrollTranscriptToBottom() {
        if (this.transcriptOuterContainer) {
            this.transcriptOuterContainer.scrollTop = this.transcriptOuterContainer.scrollHeight;
        }
    }

    /**
     * Update microphone button state via state manager
     */
    updateMicButtonState(recording) {
        this.stateManager.setRecording(recording);
        this.stateManager.updateButtonStates();
    }
    
    /**
     * Update mic button from state changes
     */
    updateMicButtonFromState(recordingState) {
        if (this.micButton) {
            // Remove all mic state classes
            this.micButton.classList.remove('mic-inactive', 'mic-active', 'mic-hearing-audio');
            
            // Apply appropriate state class
            if (!recordingState.isRecording) {
                this.micButton.classList.add('mic-inactive');
            } else if (recordingState.hearingAudio) {
                this.micButton.classList.add('mic-hearing-audio');
            } else {
                this.micButton.classList.add('mic-active');
            }
        }

        if (this.micStatus) {
            const buttonStates = this.stateManager.get('ui.buttonStates');
            if (buttonStates && buttonStates.mic) {
                this.micStatus.textContent = buttonStates.mic.status;
            }
        }
    }

    /**
     * Update button states from state manager
     */
    updateButtonStatesFromState(buttonStates) {
        if (!buttonStates) return;
        
        // Update camera button
        if (this.cameraButton && buttonStates.camera) {
            this.cameraButton.textContent = buttonStates.camera.text;
            this.cameraButton.disabled = buttonStates.camera.disabled;
        }
        
        // Update screen button
        if (this.screenButton && buttonStates.screen) {
            this.screenButton.textContent = buttonStates.screen.text;
            this.screenButton.disabled = buttonStates.screen.disabled;
        }
        
        // End button removed - no longer needed
    }

    /**
     * Update video display state via state manager
     */
    updateVideoDisplay(active, mode = null) {
        this.stateManager.setVideoState(active, mode);
        this.stateManager.updateButtonStates();
    }
    
    /**
     * Update video display from state changes
     */
    updateVideoDisplayFromState(videoState) {
        if (!this.webcamVideo || !this.webcamPlaceholder) return;

        if (videoState.isActive) {
            this.webcamVideo.classList.remove('hidden');
            this.webcamPlaceholder.classList.add('hidden');
        } else {
            this.webcamVideo.classList.add('hidden');
            this.webcamPlaceholder.classList.remove('hidden');
            this.webcamVideo.srcObject = null;
        }
    }

    /**
     * Show/hide audio indicator via state manager
     */
    showAudioIndicator(show) {
        this.stateManager.setAudioIndicatorVisible(show);
    }
    
    /**
     * Update audio indicator from state changes
     */
    updateAudioIndicatorFromState(visible) {
        if (this.audioIndicator) {
            if (visible) {
                this.audioIndicator.classList.remove('hidden');
            } else {
                this.audioIndicator.classList.add('hidden');
            }
        }
    }

    /**
     * Update volume display
     */
    updateVolumeDisplay(volume) {
        if (this.volumeDisplay) {
            this.volumeDisplay.textContent = `${volume}%`;
        }
    }

    /**
     * Set volume slider value programmatically
     */
    setVolumeSlider(volume) {
        if (this.volumeSlider) {
            const volumePercent = Math.round(volume * 100);
            this.volumeSlider.value = volumePercent;
            this.updateVolumeDisplay(volumePercent);
        }
    }

    /**
     * Set user ID input value programmatically
     */
    setUserIdInputValue(userId) {
        if (this.userIdInput && userId) {
            this.userIdInput.value = userId;
        }
    }

    /**
     * Set up event listeners for UI elements
     */
    setupEventListeners(callbacks) {
        // Debug logging:
        // console.log('UIManager setupEventListeners called');
        // console.log('Mic button found:', !!this.micButton);
        // console.log('Camera button found:', !!this.cameraButton);
        // console.log('Screen button found:', !!this.screenButton);
        
        // Microphone button
        if (this.micButton && callbacks.onMicClick) {
            this.micButton.addEventListener('click', callbacks.onMicClick);
            // Debug: console.log('Mic button event listener added');
        }

        // Camera button
        if (this.cameraButton && callbacks.onCameraClick) {
            this.cameraButton.addEventListener('click', callbacks.onCameraClick);
            // Debug: console.log('Camera button event listener added');
        }

        // Screen sharing button
        if (this.screenButton && callbacks.onScreenClick) {
            this.screenButton.addEventListener('click', callbacks.onScreenClick);
            // Debug: console.log('Screen button event listener added');
        }

        // End button removed - mic button handles start/stop functionality

        // Screen share ended event from browser UI
        if (callbacks.onScreenShareEnded) {
            window.addEventListener('screenshare-ended', callbacks.onScreenShareEnded);
        }

        // Volume slider
        if (this.volumeSlider && callbacks.onVolumeChange) {
            this.volumeSlider.addEventListener('input', (event) => {
                const volume = parseInt(event.target.value);
                this.updateVolumeDisplay(volume);
                callbacks.onVolumeChange(volume / 100); // Convert to 0.0-1.0 range
            });
            // Debug: console.log('Volume slider event listener added');
        }

        // User ID input
        if (this.userIdInput && callbacks.onUserIdChange) {
            this.userIdInput.addEventListener('change', (event) => {
                callbacks.onUserIdChange(event.target.value);
            });
        }
    }

    /**
     * Show error message via state manager
     */
    showError(message) {
        this.stateManager.setRecordingError(message);
        this.stateManager.updateButtonStates();
    }

    /**
     * Get current recording state from state manager
     */
    getRecordingState() {
        return this.stateManager.get('recording.isRecording');
    }

    /**
     * Get current video state from state manager
     */
    getVideoState() {
        return this.stateManager.get('video');
    }
    
    /**
     * Get video element for external use
     */
    getVideoElement() {
        return this.webcamVideo;
    }
    
    /**
     * Check if there's a last placeholder message that can be removed
     * Used by AppController for cleanup logic
     */
    hasLastPlaceholderMessage() {
        const messages = this.stateManager.get('ui.transcriptMessages');
        const lastMessage = messages[messages.length - 1];
        return lastMessage && lastMessage.isPlaceholder;
    }
    
    /**
     * Cleanup method
     */
    destroy() {
        // Unsubscribe from all state changes
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];
    }
}