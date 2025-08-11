/**
 * State Manager Module
 * Centralized state management with observer pattern for state change notifications
 */

export class StateManager {
    constructor() {
        // Initialize state
        this.state = {
            // Recording state
            recording: {
                isRecording: false,
                micActive: false,
                errorMessage: null
            },
            
            // Video state  
            video: {
                isActive: false,
                mode: null, // 'webcam' | 'screen' | null
                streamActive: false,
                element: null
            },
            
            // Session state
            session: {
                userId: null,
                sessionId: null,
                connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'failed'
                client: null
            },
            
            // UI state
            ui: {
                transcriptMessages: [],
                audioIndicatorVisible: false,
                buttonStates: {
                    camera: { text: 'Start Camera', disabled: false },
                    screen: { text: 'Share Screen', disabled: false },
                    mic: { active: false, status: 'Click the icon to start recording' },
                    end: { disabled: false }
                }
            }
        };
        
        // Event listeners for state changes
        this.listeners = new Map();
    }

    /**
     * Subscribe to state changes
     * @param {string} path - State path to watch (e.g., 'recording.isRecording' or 'video')
     * @param {Function} callback - Callback function called with (newValue, oldValue, path)
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        
        this.listeners.get(path).add(callback);
        
        // Return unsubscribe function
        return () => {
            const pathListeners = this.listeners.get(path);
            if (pathListeners) {
                pathListeners.delete(callback);
                if (pathListeners.size === 0) {
                    this.listeners.delete(path);
                }
            }
        };
    }

    /**
     * Get state value by path
     * @param {string} path - Dot-separated path (e.g., 'recording.isRecording')
     * @returns {*} State value
     */
    get(path) {
        return this._getNestedValue(this.state, path);
    }

    /**
     * Set state value by path and notify listeners
     * @param {string} path - Dot-separated path
     * @param {*} value - New value
     */
    set(path, value) {
        const oldValue = this.get(path);
        this._setNestedValue(this.state, path, value);
        this._notifyListeners(path, value, oldValue);
    }

    /**
     * Update multiple state values atomically
     * @param {Object} updates - Object with path-value pairs
     */
    update(updates) {
        const changes = [];
        
        // Collect all changes first
        for (const [path, value] of Object.entries(updates)) {
            const oldValue = this.get(path);
            this._setNestedValue(this.state, path, value);
            changes.push({ path, value, oldValue });
        }
        
        // Notify all listeners
        changes.forEach(({ path, value, oldValue }) => {
            this._notifyListeners(path, value, oldValue);
        });
    }

    /**
     * Get the entire state (read-only)
     * @returns {Object} Deep copy of current state
     */
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    // Recording state methods
    setRecording(isRecording, micActive = isRecording) {
        this.update({
            'recording.isRecording': isRecording,
            'recording.micActive': micActive,
            'recording.errorMessage': null
        });
    }

    setRecordingError(errorMessage) {
        this.set('recording.errorMessage', errorMessage);
    }

    // Video state methods
    setVideoState(isActive, mode = null, streamActive = isActive) {
        this.update({
            'video.isActive': isActive,
            'video.mode': mode,
            'video.streamActive': streamActive
        });
    }

    setVideoElement(element) {
        this.set('video.element', element);
    }

    // Session state methods
    setSessionInfo(userId, sessionId = null) {
        this.update({
            'session.userId': userId,
            'session.sessionId': sessionId
        });
    }

    setConnectionStatus(status) {
        this.set('session.connectionStatus', status);
    }

    setClient(client) {
        this.set('session.client', client);
    }

    // UI state methods
    addTranscriptMessage(text, sender, isPlaceholder = false) {
        const messages = [...this.get('ui.transcriptMessages')];
        messages.push({
            id: Date.now() + Math.random(),
            text,
            sender,
            isPlaceholder,
            timestamp: Date.now()
        });
        this.set('ui.transcriptMessages', messages);
    }

    updateLastTranscriptMessage(text) {
        const messages = [...this.get('ui.transcriptMessages')];
        if (messages.length > 0) {
            messages[messages.length - 1].text = text;
            this.set('ui.transcriptMessages', messages);
        }
    }

    removeLastPlaceholderMessage() {
        const messages = [...this.get('ui.transcriptMessages')];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.isPlaceholder) {
            messages.pop();
            this.set('ui.transcriptMessages', messages);
        }
    }

    clearTranscriptMessages() {
        this.set('ui.transcriptMessages', []);
    }

    setAudioIndicatorVisible(visible) {
        this.set('ui.audioIndicatorVisible', visible);
    }

    updateButtonStates() {
        const video = this.get('video');
        const recording = this.get('recording');
        
        const buttonStates = {
            camera: {
                text: video.isActive && video.mode === 'webcam' ? 'Stop Camera' : 'Start Camera',
                disabled: false
            },
            screen: {
                text: video.isActive && video.mode === 'screen' ? 'Stop Sharing' : 'Share Screen', 
                disabled: false
            },
            mic: {
                active: recording.micActive,
                status: recording.isRecording ? 'Recording... Speak now' : 
                       recording.errorMessage || 'Click the icon to start recording'
            },
            end: {
                disabled: false
            }
        };
        
        this.set('ui.buttonStates', buttonStates);
    }

    // Helper methods
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : undefined, obj);
    }

    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        
        target[lastKey] = value;
    }

    _notifyListeners(path, newValue, oldValue) {
        // Notify exact path listeners
        const exactListeners = this.listeners.get(path);
        if (exactListeners) {
            exactListeners.forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error(`Error in state listener for path "${path}":`, error);
                }
            });
        }
        
        // Notify parent path listeners (e.g., 'recording' listeners when 'recording.isRecording' changes)
        const pathParts = path.split('.');
        for (let i = pathParts.length - 1; i > 0; i--) {
            const parentPath = pathParts.slice(0, i).join('.');
            const parentListeners = this.listeners.get(parentPath);
            if (parentListeners) {
                const parentValue = this.get(parentPath);
                parentListeners.forEach(callback => {
                    try {
                        callback(parentValue, parentValue, parentPath);
                    } catch (error) {
                        console.error(`Error in state listener for parent path "${parentPath}":`, error);
                    }
                });
            }
        }
    }

    /**
     * Debug method to log current state
     */
    debug() {
        console.log('Current State:', this.getState());
        console.log('Active Listeners:', Array.from(this.listeners.keys()));
    }

    /**
     * Cleanup method to remove all listeners
     */
    destroy() {
        this.listeners.clear();
    }
}