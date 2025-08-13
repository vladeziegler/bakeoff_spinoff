/**
 * Message Queue Manager
 * Central coordination system for outbound and inbound message queues
 */

import { PriorityQueue, PRIORITY, OVERFLOW_STRATEGY } from './priority-queue.js';
import { ProcessingQueue, PROCESSING_MODE } from './processing-queue.js';
import { MetricsCollector } from './queue-metrics.js';

export class MessageQueueManager {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled !== false,
            maxMemoryMb: config.maxMemoryMb || 50,
            healthCheckIntervalMs: config.healthCheckIntervalMs || 5000,
            autoTuning: config.autoTuning !== false,
            debugMode: config.debugMode || false,
            ...config
        };

        // Queue configurations
        this.queueConfigs = this._getDefaultQueueConfigs(config);
        
        // Outbound queues (for sending messages)
        this.outboundQueues = new Map();
        this.outboundQueues.set('audio', new PriorityQueue('audio-out', this.queueConfigs.audio.outbound));
        this.outboundQueues.set('video', new PriorityQueue('video-out', this.queueConfigs.video.outbound));
        this.outboundQueues.set('text', new PriorityQueue('text-out', this.queueConfigs.text.outbound));
        this.outboundQueues.set('control', new PriorityQueue('control-out', this.queueConfigs.control.outbound));

        // Inbound queues (for processing received messages)
        this.inboundQueues = new Map();
        this.inboundQueues.set('audio', new ProcessingQueue('audio-in', this.queueConfigs.audio.inbound));
        this.inboundQueues.set('video', new ProcessingQueue('video-in', this.queueConfigs.video.inbound));
        this.inboundQueues.set('text', new ProcessingQueue('text-in', this.queueConfigs.text.inbound));
        this.inboundQueues.set('control', new ProcessingQueue('control-in', this.queueConfigs.control.inbound));

        // Metrics and monitoring
        this.metricsCollector = new MetricsCollector();
        this._setupMetrics();

        // Connection state
        this.isConnected = false;
        this.connectionQuality = 'unknown'; // good, fair, poor, offline
        this.offlineBuffer = new Map(); // Buffer messages when offline
        
        // Processors
        this.isProcessing = false;
        this.processingLoop = null;
        
        // Event handlers
        this.onSend = null; // Called when messages are ready to send
        this.onReceive = null; // Called when messages are processed
        this.onError = null;
        this.onHealthChange = null;
        
        // Health monitoring
        this.healthCheckInterval = null;
        this.lastHealthStatus = 'healthy';
        
        this._setupQueues();
        this._startProcessing();
        this._startHealthMonitoring();
        
        if (this.config.debugMode) {
            console.log('MessageQueueManager initialized with config:', this.config);
        }
    }

    /**
     * Send a message through the appropriate outbound queue
     */
    async send(messageType, data, options = {}) {
        if (!this.config.enabled) {
            // If queuing is disabled, send directly
            if (this.onSend) {
                return await this.onSend(messageType, data, options);
            }
            return false;
        }

        const queue = this.outboundQueues.get(messageType);
        if (!queue) {
            console.error(`Unknown message type: ${messageType}`);
            return false;
        }

        // Handle offline buffering
        if (!this.isConnected && messageType !== 'control') {
            return this._bufferOfflineMessage(messageType, data, options);
        }

        // Enqueue the message
        const messageId = queue.enqueue(data, options.priority, options);
        
        // Reduced logging to avoid spam - only log non-audio messages
        if (this.config.debugMode && messageId && messageType !== 'audio') {
            console.debug(`Queued ${messageType} message:`, messageId);
        }
        
        return messageId !== false;
    }

    /**
     * Process incoming message through appropriate inbound queue
     */
    async receive(messageType, data, metadata = {}) {
        if (!this.config.enabled) {
            // If queuing is disabled, process directly
            if (this.onReceive) {
                return await this.onReceive(messageType, data, metadata);
            }
            return data;
        }

        const queue = this.inboundQueues.get(messageType);
        if (!queue) {
            console.error(`Unknown message type for processing: ${messageType}`);
            return null;
        }

        return await queue.enqueue(data, metadata);
    }

    /**
     * Update connection state and trigger appropriate actions
     */
    setConnectionState(connected, quality = 'unknown') {
        const wasConnected = this.isConnected;
        this.isConnected = connected;
        this.connectionQuality = quality;

        if (connected && !wasConnected) {
            // Reconnected - flush offline buffer
            this._flushOfflineBuffer();
        }

        // Adjust queue configurations based on connection quality
        if (this.config.autoTuning) {
            this._adjustForConnectionQuality(quality);
        }

        if (this.config.debugMode) {
            console.log(`Connection state changed: ${connected ? 'connected' : 'disconnected'} (${quality})`);
        }
    }

    /**
     * Get current queue status and health
     */
    getStatus() {
        const outboundStatus = {};
        const inboundStatus = {};
        
        for (const [type, queue] of this.outboundQueues) {
            outboundStatus[type] = queue.getStatus();
        }
        
        for (const [type, queue] of this.inboundQueues) {
            inboundStatus[type] = queue.getStatus();
        }

        return {
            enabled: this.config.enabled,
            connected: this.isConnected,
            connectionQuality: this.connectionQuality,
            overallHealth: this.metricsCollector.getOverallHealth(),
            outbound: outboundStatus,
            inbound: inboundStatus,
            offlineBufferSize: this.offlineBuffer.size,
            metrics: this.metricsCollector.getAllMetrics()
        };
    }

    /**
     * Clear all queues
     */
    clear() {
        for (const queue of this.outboundQueues.values()) {
            queue.clear();
        }
        for (const queue of this.inboundQueues.values()) {
            queue.clear();
        }
        this.offlineBuffer.clear();
        this.metricsCollector.reset();
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Update queue configurations
        const newQueueConfigs = this._getDefaultQueueConfigs(newConfig);
        for (const [type, queue] of this.outboundQueues) {
            if (newQueueConfigs[type]?.outbound) {
                queue.updateConfig(newQueueConfigs[type].outbound);
            }
        }
        
        if (this.config.debugMode) {
            console.log('MessageQueueManager config updated:', this.config);
        }
    }

    /**
     * Shutdown the queue manager
     */
    destroy() {
        this.isProcessing = false;
        
        if (this.processingLoop) {
            clearInterval(this.processingLoop);
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.clear();
        
        if (this.config.debugMode) {
            console.log('MessageQueueManager destroyed');
        }
    }

    // Private methods

    _getDefaultQueueConfigs(config) {
        return {
            audio: {
                outbound: {
                    maxSize: config.audioMaxSize || 5,
                    rateLimitMs: config.audioRateLimitMs || 100,
                    priority: PRIORITY.HIGH,
                    overflowStrategy: OVERFLOW_STRATEGY.DROP_OLDEST,
                    batchSize: 1,
                    timeoutMs: 500
                },
                inbound: {
                    mode: PROCESSING_MODE.REALTIME,
                    bufferSizeMs: config.audioBufferMs || 200,
                    maxLatencyMs: 500
                }
            },
            video: {
                outbound: {
                    maxSize: 2,
                    rateLimitMs: config.videoRateLimitMs || 1000,
                    priority: PRIORITY.LOW,
                    overflowStrategy: OVERFLOW_STRATEGY.REPLACE_NEWEST,
                    batchSize: 1,
                    timeoutMs: 2000
                },
                inbound: {
                    mode: PROCESSING_MODE.IMMEDIATE,
                    maxLatencyMs: 100
                }
            },
            text: {
                outbound: {
                    maxSize: 50,
                    rateLimitMs: 0,
                    priority: PRIORITY.MEDIUM,
                    overflowStrategy: OVERFLOW_STRATEGY.FAIL_SEND,
                    batchSize: 1,
                    timeoutMs: 30000
                },
                inbound: {
                    mode: PROCESSING_MODE.CHUNKED,
                    chunkTimeout: config.textChunkTimeout || 500,
                    enableOrdering: true,
                    orderingWindowMs: 200
                }
            },
            control: {
                outbound: {
                    maxSize: 20,
                    rateLimitMs: 0,
                    priority: PRIORITY.URGENT,
                    overflowStrategy: OVERFLOW_STRATEGY.FAIL_SEND,
                    batchSize: 1,
                    timeoutMs: 10000
                },
                inbound: {
                    mode: PROCESSING_MODE.IMMEDIATE
                }
            }
        };
    }

    _setupMetrics() {
        for (const [type] of this.outboundQueues) {
            this.metricsCollector.registerQueue(`${type}-out`);
        }
        for (const [type] of this.inboundQueues) {
            this.metricsCollector.registerQueue(`${type}-in`);
        }
    }

    _setupQueues() {
        // Setup outbound queue processors
        for (const [type, queue] of this.outboundQueues) {
            queue.onMessage = async (data, message) => {
                if (this.onSend) {
                    return await this.onSend(type, data, message);
                }
                return true;
            };
            
            queue.onError = (error) => {
                console.error(`Outbound ${type} queue error:`, error);
                if (this.onError) {
                    this.onError(`outbound-${type}`, error);
                }
            };
        }

        // Setup inbound queue processors
        for (const [type, queue] of this.inboundQueues) {
            queue.onProcessed = async (data, metadata, message) => {
                if (this.onReceive) {
                    return await this.onReceive(type, data, metadata);
                }
                return data;
            };
            
            queue.onError = (error) => {
                console.error(`Inbound ${type} queue error:`, error);
                if (this.onError) {
                    this.onError(`inbound-${type}`, error);
                }
            };
        }
    }

    _startProcessing() {
        if (!this.config.enabled) return;
        
        this.isProcessing = true;
        
        // Process outbound queues
        this.processingLoop = setInterval(async () => {
            if (!this.isProcessing) return;
            
            for (const queue of this.outboundQueues.values()) {
                try {
                    await queue.process();
                } catch (error) {
                    console.error('Error in outbound queue processing:', error);
                }
            }
        }, 10); // High frequency for real-time processing
    }

    _startHealthMonitoring() {
        if (!this.config.healthCheckIntervalMs) return;
        
        this.healthCheckInterval = setInterval(() => {
            const health = this.metricsCollector.getOverallHealth();
            
            if (health !== this.lastHealthStatus) {
                this.lastHealthStatus = health;
                
                if (this.onHealthChange) {
                    this.onHealthChange(health, this.getStatus());
                }
                
                if (this.config.debugMode) {
                    console.log(`Queue health changed to: ${health}`);
                }
            }
        }, this.config.healthCheckIntervalMs);
    }

    _adjustForConnectionQuality(quality) {
        const adjustments = {
            poor: { audioRateLimit: 100, videoRateLimit: 2000, maxSizes: 0.5 },
            fair: { audioRateLimit: 60, videoRateLimit: 1500, maxSizes: 0.8 },
            good: { audioRateLimit: 46, videoRateLimit: 1000, maxSizes: 1.0 }
        };

        const adjustment = adjustments[quality];
        if (!adjustment) return;

        // Adjust audio queue
        const audioQueue = this.outboundQueues.get('audio');
        if (audioQueue) {
            audioQueue.updateConfig({
                rateLimitMs: adjustment.audioRateLimit,
                maxSize: Math.floor(this.queueConfigs.audio.outbound.maxSize * adjustment.maxSizes)
            });
        }

        // Adjust video queue
        const videoQueue = this.outboundQueues.get('video');
        if (videoQueue) {
            videoQueue.updateConfig({
                rateLimitMs: adjustment.videoRateLimit
            });
        }
    }

    _bufferOfflineMessage(messageType, data, options) {
        const maxOfflineBuffer = 1000;
        
        if (this.offlineBuffer.size >= maxOfflineBuffer) {
            // Remove oldest messages
            const firstKey = this.offlineBuffer.keys().next().value;
            this.offlineBuffer.delete(firstKey);
        }
        
        const messageId = `offline-${Date.now()}-${Math.random()}`;
        this.offlineBuffer.set(messageId, {
            type: messageType,
            data,
            options,
            timestamp: Date.now()
        });
        
        if (this.config.debugMode) {
            console.debug(`Buffered offline message: ${messageType}`);
        }
        
        return true;
    }

    async _flushOfflineBuffer() {
        if (this.offlineBuffer.size === 0) return;
        
        const messages = Array.from(this.offlineBuffer.values())
            .sort((a, b) => a.timestamp - b.timestamp);
        
        this.offlineBuffer.clear();
        
        if (this.config.debugMode) {
            console.log(`Flushing ${messages.length} offline messages`);
        }
        
        // Send buffered messages with rate limiting
        for (const message of messages) {
            await this.send(message.type, message.data, message.options);
            // Small delay to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
}