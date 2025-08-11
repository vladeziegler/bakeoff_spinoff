/**
 * Session Management Module
 * Handles user ID generation, session lifecycle, and footer UI updates
 */

export class SessionManager {
    constructor(client, stateManager = null) {
        this.client = client;
        this.stateManager = stateManager;
        this.userId = this.getOrCreateUserId();
        this.sessionId = null;
        
        // DOM elements
        this.footerUserId = document.getElementById('footer-user-id');
        this.footerSessionId = document.getElementById('footer-session-id');
        this.newSessionButton = document.getElementById('new-session-button');
        
        this.initializeUI();
        this.setupEventListeners();
        
        // Initialize state if state manager is provided
        if (this.stateManager) {
            this.stateManager.setSessionInfo(this.userId);
        }
    }

    /**
     * Generate or retrieve user ID from localStorage
     */
    getOrCreateUserId() {
        let userId = localStorage.getItem('userId');
        if (!userId) {
            userId = Math.random().toString(36).substring(2, 15);
            localStorage.setItem('userId', userId);
        }
        return userId;
    }

    /**
     * Initialize session UI elements
     */
    initializeUI() {
        // Update footer with user ID
        if (this.footerUserId) {
            this.footerUserId.textContent = this.userId;
        }
        
        // Set initial session status
        if (this.footerSessionId) {
            this.footerSessionId.textContent = 'Loading...';
        }
    }

    /**
     * Set up event listeners for session controls
     */
    setupEventListeners() {
        if (this.newSessionButton) {
            this.newSessionButton.addEventListener('click', () => {
                this.startNewSession();
            });
        }

        // Set up client callbacks for session events
        if (this.client) {
            this.client.onSessionIdReceived = (sessionId) => {
                this.handleSessionIdReceived(sessionId);
            };
        }
    }

    /**
     * Handle session ID received from server
     */
    handleSessionIdReceived(sessionId) {
        console.log('Session ID received:', sessionId);
        this.sessionId = sessionId;
        
        // Update state if state manager is provided
        if (this.stateManager) {
            this.stateManager.setSessionInfo(this.userId, sessionId);
        }
        
        // Update footer with session ID
        if (this.footerSessionId) {
            this.footerSessionId.textContent = sessionId;
        }
    }

    /**
     * Update session connection status in UI
     */
    updateConnectionStatus(status) {
        // Update state if state manager is provided
        if (this.stateManager) {
            this.stateManager.setConnectionStatus(status);
        }
        
        if (this.footerSessionId) {
            switch (status) {
                case 'connecting':
                    this.footerSessionId.textContent = 'Connecting...';
                    break;
                case 'creating':
                    this.footerSessionId.textContent = 'Creating new session...';
                    break;
                case 'failed':
                    this.footerSessionId.textContent = 'Connection failed';
                    break;
                default:
                    this.footerSessionId.textContent = status;
            }
        }
    }

    /**
     * Start a new session
     */
    startNewSession() {
        // Update UI to show session creation
        this.updateConnectionStatus('creating');
        
        // Update state manager
        if (this.stateManager) {
            this.stateManager.setSessionInfo(this.userId, null); // Clear session ID
        }
        
        // Force new session by adding query parameter to WebSocket URL
        if (this.client) {
            const baseUrl = this.client.serverUrl.split('?')[0]; // Remove existing query params
            const newWsUrl = `${baseUrl}?new_session=true`;
            this.client.serverUrl = newWsUrl;
        }
        
        // Trigger session restart event
        if (this.onNewSessionRequested) {
            this.onNewSessionRequested();
        }
    }

    /**
     * Get the WebSocket URL for this user
     */
    getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/ws/${this.userId}`;
    }

    /**
     * Get current user ID
     */
    getUserId() {
        return this.userId;
    }

    /**
     * Get current session ID
     */
    getSessionId() {
        return this.sessionId;
    }

    /**
     * Callback for when new session is requested
     * Should be set by the app controller
     */
    onNewSessionRequested = null;
}