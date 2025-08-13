/**
 * Priority Queue Implementation
 * Handles message queuing with priority, rate limiting, and overflow strategies
 */

import { QueueMetrics } from './queue-metrics.js';

// Priority levels
export const PRIORITY = {
    URGENT: 0,   // Control messages
    HIGH: 1,     // Audio messages
    MEDIUM: 2,   // Text messages
    LOW: 3       // Video messages
};

// Overflow strategies
export const OVERFLOW_STRATEGY = {
    DROP_OLDEST: 'drop_oldest',
    DROP_NEWEST: 'drop_newest', 
    REPLACE_NEWEST: 'replace_newest',
    FAIL_SEND: 'fail_send',
    COMPRESS: 'compress'
};

export class PriorityQueue {
    constructor(queueType, config = {}) {
        this.queueType = queueType;
        this.config = {
            maxSize: config.maxSize || 1000,
            rateLimitMs: config.rateLimitMs || 0,
            batchSize: config.batchSize || 1,
            priority: config.priority || PRIORITY.MEDIUM,
            overflowStrategy: config.overflowStrategy || OVERFLOW_STRATEGY.DROP_OLDEST,
            timeoutMs: config.timeoutMs || 30000,
            compressionThreshold: config.compressionThreshold || 0.8,
            ...config
        };

        // Queue storage - array of priority buckets
        this.queues = [[], [], [], []]; // URGENT, HIGH, MEDIUM, LOW
        this.totalSize = 0;
        
        // Rate limiting
        this.lastProcessed = 0;
        this.processingLock = false;
        
        // Batch processing
        this.batchBuffer = [];
        this.batchTimeout = null;
        
        // Metrics
        this.metrics = new QueueMetrics(queueType);
        
        // Message ID counter
        this.messageIdCounter = 0;
        
        // Event handlers
        this.onMessage = null;
        this.onBatch = null;
        this.onOverflow = null;
        this.onError = null;
    }

    /**
     * Add message to queue with automatic priority assignment
     */
    enqueue(message, priority = null, options = {}) {
        const messageId = ++this.messageIdCounter;
        const timestamp = Date.now();
        
        // Determine priority if not specified
        if (priority === null) {
            priority = this.config.priority;
        }
        
        const queuedMessage = {
            id: messageId,
            data: message,
            priority,
            timestamp,
            timeoutAt: timestamp + this.config.timeoutMs,
            retries: 0,
            options: {
                urgent: false,
                batchable: true,
                compressible: false,
                ...options
            }
        };

        // Handle urgent messages immediately
        if (queuedMessage.options.urgent) {
            priority = PRIORITY.URGENT;
            queuedMessage.priority = priority;
        }

        // Check for overflow before adding
        if (this.totalSize >= this.config.maxSize) {
            const handled = this._handleOverflow(queuedMessage);
            if (!handled) {
                this.metrics.messageDropped('queue_full');
                if (this.onOverflow) {
                    this.onOverflow(queuedMessage, 'queue_full');
                }
                return false;
            }
        }

        // Add to appropriate priority queue
        this.queues[priority].push(queuedMessage);
        this.totalSize++;
        
        // Update metrics
        this.metrics.messageQueued(this.totalSize);
        this.metrics.markStart(messageId);

        // Trigger processing
        this._scheduleProcessing();
        
        return messageId;
    }

    /**
     * Process next available message(s)
     */
    async process() {
        if (this.processingLock || this.totalSize === 0) {
            return null;
        }

        // Rate limiting check
        const now = Date.now();
        if (this.config.rateLimitMs > 0 && (now - this.lastProcessed) < this.config.rateLimitMs) {
            setTimeout(() => this._scheduleProcessing(), this.config.rateLimitMs - (now - this.lastProcessed));
            return null;
        }

        this.processingLock = true;
        this.lastProcessed = now;

        try {
            // Check for timed out messages first
            this._cleanupTimedOutMessages();

            // Get next message(s) by priority
            const messages = this._dequeueMessages();
            
            if (messages.length === 0) {
                return null;
            }

            // Process message(s)
            let result;
            if (messages.length === 1) {
                result = await this._processMessage(messages[0]);
            } else {
                result = await this._processBatch(messages);
            }

            // Update metrics
            messages.forEach(msg => {
                this.metrics.markProcessed(msg.id);
            });

            return result;

        } catch (error) {
            console.error(`Error processing ${this.queueType} queue:`, error);
            if (this.onError) {
                this.onError(error);
            }
            return null;
        } finally {
            this.processingLock = false;
            
            // Continue processing if more messages available
            if (this.totalSize > 0) {
                this._scheduleProcessing();
            }
        }
    }

    /**
     * Get current queue status
     */
    getStatus() {
        const queueSizes = this.queues.map(q => q.length);
        const oldestMessage = this._getOldestMessage();
        
        return {
            queueType: this.queueType,
            totalSize: this.totalSize,
            maxSize: this.config.maxSize,
            queuesByPriority: {
                urgent: queueSizes[PRIORITY.URGENT],
                high: queueSizes[PRIORITY.HIGH], 
                medium: queueSizes[PRIORITY.MEDIUM],
                low: queueSizes[PRIORITY.LOW]
            },
            isProcessing: this.processingLock,
            oldestMessageAge: oldestMessage ? Date.now() - oldestMessage.timestamp : 0,
            config: this.config,
            metrics: this.metrics.getStatistics()
        };
    }

    /**
     * Clear queue and reset state
     */
    clear() {
        this.queues = [[], [], [], []];
        this.totalSize = 0;
        this.batchBuffer = [];
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        this.metrics.reset();
    }

    /**
     * Update queue configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    // Private methods

    _handleOverflow(newMessage) {
        switch (this.config.overflowStrategy) {
            case OVERFLOW_STRATEGY.DROP_OLDEST:
                return this._dropOldestMessage();
                
            case OVERFLOW_STRATEGY.DROP_NEWEST:
                this.metrics.messageDropped('overflow_drop_newest');
                return false;
                
            case OVERFLOW_STRATEGY.REPLACE_NEWEST:
                if (newMessage.priority === PRIORITY.LOW) {
                    // For video frames, replace the newest frame of same type
                    const queue = this.queues[newMessage.priority];
                    if (queue.length > 0) {
                        const dropped = queue.pop();
                        this.totalSize--;
                        this.metrics.messageDropped('overflow_replace_newest');
                        return true;
                    }
                }
                return this._dropOldestMessage();
                
            case OVERFLOW_STRATEGY.FAIL_SEND:
                this.metrics.messageDropped('overflow_fail');
                return false;
                
            case OVERFLOW_STRATEGY.COMPRESS:
                return this._attemptCompression();
                
            default:
                return this._dropOldestMessage();
        }
    }

    _dropOldestMessage() {
        // Find oldest message across all priorities (but prefer lower priority)
        for (let priority = PRIORITY.LOW; priority >= PRIORITY.URGENT; priority--) {
            const queue = this.queues[priority];
            if (queue.length > 0) {
                const dropped = queue.shift();
                this.totalSize--;
                this.metrics.messageDropped('overflow_drop_oldest');
                return true;
            }
        }
        return false;
    }

    _attemptCompression() {
        // Try to compress or combine messages of same type
        for (let priority = PRIORITY.LOW; priority >= PRIORITY.HIGH; priority--) {
            const queue = this.queues[priority];
            if (queue.length > 1) {
                // For audio messages, drop every other sample
                if (this.queueType === 'audio' && queue.length > 2) {
                    for (let i = queue.length - 1; i >= 0; i -= 2) {
                        if (queue.length <= this.config.maxSize * this.config.compressionThreshold) {
                            break;
                        }
                        queue.splice(i, 1);
                        this.totalSize--;
                        this.metrics.messageDropped('compression');
                    }
                    return true;
                }
            }
        }
        return this._dropOldestMessage();
    }

    _dequeueMessages() {
        const messages = [];
        let targetBatchSize = this.config.batchSize;

        // Process by priority order
        for (let priority = PRIORITY.URGENT; priority <= PRIORITY.LOW; priority++) {
            const queue = this.queues[priority];
            
            while (queue.length > 0 && messages.length < targetBatchSize) {
                const message = queue.shift();
                this.totalSize--;
                
                // Check if message has timed out
                if (Date.now() > message.timeoutAt) {
                    this.metrics.messageTimedOut();
                    continue;
                }
                
                messages.push(message);
                
                // Urgent messages are processed immediately, one at a time
                if (priority === PRIORITY.URGENT) {
                    break;
                }
                
                // Don't batch non-batchable messages
                if (!message.options.batchable) {
                    break;
                }
            }
            
            // If we found messages, process them (prioritizing higher priority)
            if (messages.length > 0) {
                break;
            }
        }

        return messages;
    }

    async _processMessage(message) {
        if (this.onMessage) {
            return await this.onMessage(message.data, message);
        }
        return message.data;
    }

    async _processBatch(messages) {
        if (this.onBatch) {
            return await this.onBatch(messages.map(m => m.data), messages);
        }
        // Default batch processing - return all message data
        return messages.map(m => m.data);
    }

    _cleanupTimedOutMessages() {
        const now = Date.now();
        let cleanedUp = 0;
        
        for (const queue of this.queues) {
            for (let i = queue.length - 1; i >= 0; i--) {
                if (now > queue[i].timeoutAt) {
                    queue.splice(i, 1);
                    this.totalSize--;
                    cleanedUp++;
                    this.metrics.messageTimedOut();
                }
            }
        }
        
        if (cleanedUp > 0) {
            console.debug(`Cleaned up ${cleanedUp} timed out messages from ${this.queueType} queue`);
        }
    }

    _getOldestMessage() {
        let oldest = null;
        for (const queue of this.queues) {
            if (queue.length > 0) {
                const candidate = queue[0];
                if (!oldest || candidate.timestamp < oldest.timestamp) {
                    oldest = candidate;
                }
            }
        }
        return oldest;
    }

    _scheduleProcessing() {
        // Apply rate limiting if configured
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessed;
        
        if (this.config.rateLimitMs > 0 && timeSinceLastProcess < this.config.rateLimitMs) {
            // Rate limited - schedule after remaining delay
            const delay = this.config.rateLimitMs - timeSinceLastProcess;
            setTimeout(() => this.process(), delay);
        } else {
            // No rate limiting or enough time has passed
            setTimeout(() => this.process(), 0);
        }
    }
}