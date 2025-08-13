/**
 * Global Configuration for ADK Streaming Application
 * Centralizes all configuration including queue settings
 */

// Queue configuration constants
export const QUEUE_CONFIG = {
    // Global queue settings
    global: {
        enabled: true,
        debugMode: false,
        maxMemoryMb: 50,
        healthCheckIntervalMs: 10000,
        autoTuning: true
    },
    
    // Audio queue configuration
    audio: {
        outbound: {
            maxSize: 5,                      // Very small queue for real-time audio
            rateLimitMs: 100,                // Much slower rate to prevent overflow
            batchSize: 1,                    // Process one at a time
            timeoutMs: 500,                  // Very short timeout for real-time
            compressionThreshold: 0.8,       // Compress when 80% full
            priority: 'HIGH',                // Audio priority
            overflowStrategy: 'DROP_OLDEST'  // Drop oldest audio for real-time
        },
        inbound: {
            bufferSizeMs: 200,               // Audio buffer duration
            maxLatencyMs: 500,               // Max acceptable latency
            mode: 'realtime'                 // Processing mode
        }
    },
    
    // Video queue configuration  
    video: {
        outbound: {
            maxSize: 2,                      // Only keep latest frames
            rateLimitMs: 1000,               // 1 FPS default
            batchSize: 1,
            timeoutMs: 2000,
            priority: 'LOW',                 // Video priority
            overflowStrategy: 'REPLACE_NEWEST' // Replace with newest frame
        },
        inbound: {
            maxLatencyMs: 100,
            mode: 'immediate'
        }
    },
    
    // Text message configuration
    text: {
        outbound: {
            maxSize: 50,
            rateLimitMs: 0,                  // No rate limiting for user input
            batchSize: 1,
            timeoutMs: 30000,
            priority: 'MEDIUM',              // Text priority
            overflowStrategy: 'FAIL_SEND'    // Don't drop user text
        },
        inbound: {
            chunkTimeout: 500,               // Max time to wait for chunks
            enableOrdering: true,
            orderingWindowMs: 200,
            mode: 'chunked'
        }
    },
    
    // Control message configuration
    control: {
        outbound: {
            maxSize: 20,
            rateLimitMs: 0,
            batchSize: 1,
            timeoutMs: 10000,
            priority: 'URGENT',              // Control priority
            overflowStrategy: 'FAIL_SEND'    // Never drop control messages
        },
        inbound: {
            mode: 'immediate'
        }
    }
};

// WebSocket configuration
export const WEBSOCKET_CONFIG = {
    // Default connection settings
    defaultHost: 'localhost',
    defaultPort: 8881,
    
    // Connection retry settings
    maxReconnectAttempts: 5,
    reconnectDelayMs: 1000,
    reconnectBackoffMultiplier: 1.5,
    
    // Health check settings
    pingIntervalMs: 30000,
    pongTimeoutMs: 5000,
    
    // Message size limits
    maxMessageSizeBytes: 1024 * 1024, // 1MB
    maxQueuedMessages: 1000
};

// Audio processing configuration
export const AUDIO_CONFIG = {
    // Audio context settings
    sampleRate: 22000,
    bufferSize: 2048,
    channels: 1,
    
    // Audio worklet settings
    workletBufferSize: 128,
    workletUpdateIntervalMs: 46,
    
    // Audio activity detection
    activityThreshold: 0.01,
    activitySmoothingFactor: 0.8,
    
    // Audio playback
    playbackBufferSize: 4096,
    maxPlaybackLatencyMs: 200
};

// Video processing configuration
export const VIDEO_CONFIG = {
    // Default video constraints
    defaultConstraints: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 }
    },
    
    // Screen share constraints
    screenConstraints: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 15, max: 30 }
    },
    
    // Video streaming
    defaultFrameRate: 1,              // Frames per second to send
    maxFrameRate: 5,
    jpegQuality: 0.8,
    
    // Video canvas settings
    canvasWidth: 640,
    canvasHeight: 480
};

// UI configuration
export const UI_CONFIG = {
    // Transcript settings
    maxTranscriptMessages: 1000,
    transcriptScrollBehavior: 'smooth',
    
    // Button states and animations
    micButtonAnimationDuration: 200,
    audioIndicatorPulseRate: 1500,
    
    // Queue health indicators
    showQueueHealth: false,
    healthIndicatorUpdateMs: 1000,
    
    // Debug UI
    showDebugInfo: false,
    debugPanelPosition: 'bottom-right'
};

// Performance configuration
export const PERFORMANCE_CONFIG = {
    // Memory management
    maxMemoryUsageMb: 100,
    gcIntervalMs: 60000,
    
    // Performance monitoring
    enablePerformanceMonitoring: true,
    performanceLogIntervalMs: 30000,
    
    // Resource cleanup
    audioContextCleanupDelayMs: 5000,
    inactiveStreamCleanupMs: 300000,  // 5 minutes
    
    // Throttling
    maxConcurrentProcessing: 3,
    backgroundTaskDelayMs: 100
};

// Development and debugging configuration
export const DEBUG_CONFIG = {
    // Logging levels
    logLevel: 'info',                 // error, warn, info, debug
    enableConsoleLogging: true,
    enableQueueLogging: false,
    enablePerformanceLogging: false,
    
    // Testing modes
    simulateNetworkIssues: false,
    simulateHighLatency: false,
    simulatePacketLoss: false,
    
    // Mock data
    enableMockAudio: false,
    enableMockVideo: false,
    mockDataIntervalMs: 1000
};

/**
 * Global configuration object that merges all configs
 */
export const CONFIG = {
    queue: QUEUE_CONFIG,
    websocket: WEBSOCKET_CONFIG,
    audio: AUDIO_CONFIG,
    video: VIDEO_CONFIG,
    ui: UI_CONFIG,
    performance: PERFORMANCE_CONFIG,
    debug: DEBUG_CONFIG
};

/**
 * Get WebSocket URL based on configuration
 */
export function getWebSocketUrl(appName = 'my_agent', userId = 'user', sessionId = null) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = CONFIG.websocket.host || CONFIG.websocket.defaultHost || window.location.hostname;
    const port = CONFIG.websocket.port || CONFIG.websocket.defaultPort || window.location.port;
    
    let url = `${protocol}//${host}`;
    if (port && port !== '80' && port !== '443') {
        url += `:${port}`;
    }
    
    // Use new API format with query parameters
    url += `/run_live?app_name=${encodeURIComponent(appName)}&user_id=${encodeURIComponent(userId)}`;
    
    if (sessionId) {
        url += `&session_id=${encodeURIComponent(sessionId)}`;
    }
    
    return url;
}

/**
 * Update configuration at runtime
 */
export function updateConfig(path, value) {
    const keys = path.split('.');
    let current = CONFIG;
    
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current)) {
            current[key] = {};
        }
        current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
    
    console.log(`Updated config ${path} =`, value);
}

/**
 * Get configuration value by path
 */
export function getConfig(path, defaultValue = null) {
    const keys = path.split('.');
    let current = CONFIG;
    
    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        } else {
            return defaultValue;
        }
    }
    
    return current;
}

/**
 * Validate configuration
 */
export function validateConfig() {
    const errors = [];
    
    // Validate queue settings
    if (CONFIG.queue.audio.outbound.maxSize < 2) {
        errors.push('Audio queue size too small (minimum 2)');
    }
    
    if (CONFIG.audio.sampleRate < 8000 || CONFIG.audio.sampleRate > 48000) {
        errors.push('Invalid audio sample rate (must be 8000-48000 Hz)');
    }
    
    if (CONFIG.video.defaultFrameRate > CONFIG.video.maxFrameRate) {
        errors.push('Default video frame rate exceeds maximum');
    }
    
    // Validate queue priorities are valid
    const validPriorities = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
    const queueTypes = ['audio', 'video', 'text', 'control'];
    
    for (const type of queueTypes) {
        const priority = CONFIG.queue[type].outbound.priority;
        if (priority && !validPriorities.includes(priority)) {
            errors.push(`Invalid priority '${priority}' for ${type} queue`);
        }
    }
    
    // Validate overflow strategies
    const validStrategies = ['DROP_OLDEST', 'DROP_NEWEST', 'REPLACE_NEWEST', 'FAIL_SEND', 'COMPRESS'];
    
    for (const type of queueTypes) {
        const strategy = CONFIG.queue[type].outbound.overflowStrategy;
        if (strategy && !validStrategies.includes(strategy)) {
            errors.push(`Invalid overflow strategy '${strategy}' for ${type} queue`);
        }
    }
    
    // Validate rate limits are reasonable
    if (CONFIG.queue.audio.outbound.rateLimitMs < 10) {
        errors.push('Audio rate limit too aggressive (minimum 10ms)');
    }
    
    if (CONFIG.queue.video.outbound.rateLimitMs < 100) {
        errors.push('Video rate limit too aggressive (minimum 100ms)');
    }
    
    if (errors.length > 0) {
        console.error('Configuration validation errors:', errors);
        return false;
    }
    
    return true;
}

/**
 * Load configuration from localStorage or use defaults
 */
export function loadConfig() {
    try {
        const savedConfig = localStorage.getItem('adk-streaming-config');
        if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            
            // Merge saved config with defaults
            Object.assign(CONFIG, parsed);
            
            console.log('Loaded configuration from localStorage');
        }
    } catch (error) {
        console.warn('Failed to load saved configuration:', error);
    }
    
    return validateConfig();
}

/**
 * Save configuration to localStorage
 */
export function saveConfig() {
    try {
        localStorage.setItem('adk-streaming-config', JSON.stringify(CONFIG));
        console.log('Configuration saved to localStorage');
        return true;
    } catch (error) {
        console.error('Failed to save configuration:', error);
        return false;
    }
}

// Auto-load configuration on module import
loadConfig();