/**
 * Processing Queue Implementation
 * Specialized queue for inbound message processing with buffering and chunking
 */

import { QueueMetrics } from './queue-metrics.js';

export const PROCESSING_MODE = {
    IMMEDIATE: 'immediate',      // Process messages as they arrive
    BUFFERED: 'buffered',        // Buffer messages before processing
    CHUNKED: 'chunked',          // Assemble message chunks before processing
    REALTIME: 'realtime'         // Real-time processing with minimal latency
};

export class ProcessingQueue {
    constructor(queueType, config = {}) {
        this.queueType = queueType;
        this.config = {
            mode: config.mode || PROCESSING_MODE.IMMEDIATE,
            bufferSizeMs: config.bufferSizeMs || 100,
            maxBufferSize: config.maxBufferSize || 50,
            chunkTimeout: config.chunkTimeout || 500,
            maxLatencyMs: config.maxLatencyMs || 1000,
            enableOrdering: config.enableOrdering || false,
            orderingWindowMs: config.orderingWindowMs || 200,
            ...config
        };

        // Processing state
        this.buffer = [];
        this.chunkAssembler = new Map(); // For assembling chunked messages
        this.orderingBuffer = new Map(); // For message ordering
        this.nextExpectedSeq = 0;
        
        // Timing
        this.bufferTimeout = null;
        this.lastProcessed = 0;
        this.isProcessing = false;
        
        // Metrics
        this.metrics = new QueueMetrics(queueType);
        
        // Event handlers
        this.onProcessed = null;
        this.onError = null;
        this.onBufferFull = null;
        this.onChunkComplete = null;
    }

    /**
     * Add incoming message for processing
     */
    enqueue(message, metadata = {}) {
        const timestamp = Date.now();
        const messageId = metadata.id || `${timestamp}-${Math.random()}`;
        
        const processedMessage = {
            id: messageId,
            data: message,
            timestamp,
            metadata: {
                sequenceNumber: metadata.sequenceNumber,
                isChunk: metadata.isChunk || false,
                chunkIndex: metadata.chunkIndex,
                totalChunks: metadata.totalChunks,
                role: metadata.role,
                contentType: metadata.contentType,
                ...metadata
            }
        };

        this.metrics.messageQueued(this.buffer.length + 1);
        this.metrics.markStart(messageId);

        // Route to appropriate processing based on mode
        switch (this.config.mode) {
            case PROCESSING_MODE.IMMEDIATE:
                return this._processImmediate(processedMessage);
                
            case PROCESSING_MODE.BUFFERED:
                return this._addToBuffer(processedMessage);
                
            case PROCESSING_MODE.CHUNKED:
                return this._handleChunked(processedMessage);
                
            case PROCESSING_MODE.REALTIME:
                return this._processRealtime(processedMessage);
                
            default:
                return this._processImmediate(processedMessage);
        }
    }

    /**
     * Force process all pending messages
     */
    async flush() {
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }
        
        if (this.buffer.length > 0) {
            await this._processBuffer();
        }
        
        // Process any pending chunks
        for (const [chunkId, assembler] of this.chunkAssembler) {
            if (assembler.hasPartialData()) {
                console.warn(`Flushing incomplete chunk: ${chunkId}`);
                const result = assembler.getPartialMessage();
                if (result) {
                    await this._processMessage(result);
                }
            }
        }
        
        this.chunkAssembler.clear();
    }

    /**
     * Clear all pending messages
     */
    clear() {
        this.buffer = [];
        this.chunkAssembler.clear();
        this.orderingBuffer.clear();
        this.nextExpectedSeq = 0;
        
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }
        
        this.metrics.reset();
    }

    /**
     * Get current processing status
     */
    getStatus() {
        const pendingChunks = Array.from(this.chunkAssembler.values())
            .map(assembler => assembler.getStatus());
            
        return {
            queueType: this.queueType,
            mode: this.config.mode,
            bufferSize: this.buffer.length,
            maxBufferSize: this.config.maxBufferSize,
            pendingChunks: pendingChunks.length,
            chunkDetails: pendingChunks,
            orderingBufferSize: this.orderingBuffer.size,
            nextExpectedSeq: this.nextExpectedSeq,
            isProcessing: this.isProcessing,
            metrics: this.metrics.getStatistics()
        };
    }

    // Private methods

    async _processImmediate(message) {
        try {
            const result = await this._processMessage(message);
            this.metrics.markProcessed(message.id);
            return result;
        } catch (error) {
            console.error(`Error in immediate processing for ${this.queueType}:`, error);
            if (this.onError) {
                this.onError(error, message);
            }
            return null;
        }
    }

    _addToBuffer(message) {
        this.buffer.push(message);
        
        // Check if buffer is full
        if (this.buffer.length >= this.config.maxBufferSize) {
            if (this.onBufferFull) {
                this.onBufferFull(this.buffer.length);
            }
            this._scheduleBufferProcessing(0); // Process immediately
        } else {
            this._scheduleBufferProcessing(this.config.bufferSizeMs);
        }
        
        return true;
    }

    _handleChunked(message) {
        const { metadata } = message;
        
        if (!metadata.isChunk) {
            // Non-chunked message, process immediately
            return this._processImmediate(message);
        }
        
        const chunkId = metadata.chunkId || metadata.role || 'default';
        
        if (!this.chunkAssembler.has(chunkId)) {
            this.chunkAssembler.set(chunkId, new ChunkAssembler(chunkId, this.config));
        }
        
        const assembler = this.chunkAssembler.get(chunkId);
        const result = assembler.addChunk(message);
        
        if (result.isComplete) {
            this.chunkAssembler.delete(chunkId);
            
            if (this.onChunkComplete) {
                this.onChunkComplete(result.message);
            }
            
            return this._processImmediate(result.message);
        }
        
        return true; // Chunk stored, waiting for more
    }

    async _processRealtime(message) {
        // Real-time processing with minimal buffering
        if (this.config.enableOrdering && message.metadata.sequenceNumber !== undefined) {
            return this._handleOrdering(message);
        }
        
        return this._processImmediate(message);
    }

    _handleOrdering(message) {
        const seq = message.metadata.sequenceNumber;
        
        if (seq === this.nextExpectedSeq) {
            // This is the next expected message
            this._processImmediate(message);
            this.nextExpectedSeq++;
            
            // Check if we can process any buffered messages
            while (this.orderingBuffer.has(this.nextExpectedSeq)) {
                const nextMessage = this.orderingBuffer.get(this.nextExpectedSeq);
                this.orderingBuffer.delete(this.nextExpectedSeq);
                this._processImmediate(nextMessage);
                this.nextExpectedSeq++;
            }
        } else if (seq > this.nextExpectedSeq) {
            // Future message, buffer it
            this.orderingBuffer.set(seq, message);
            
            // Clean up old buffered messages after timeout
            setTimeout(() => {
                if (this.orderingBuffer.has(seq)) {
                    console.warn(`Discarding out-of-order message seq=${seq}, expected=${this.nextExpectedSeq}`);
                    this.orderingBuffer.delete(seq);
                }
            }, this.config.orderingWindowMs);
        } else {
            // Old message, process it anyway but log warning
            console.warn(`Received old message seq=${seq}, expected=${this.nextExpectedSeq}`);
            this._processImmediate(message);
        }
        
        return true;
    }

    _scheduleBufferProcessing(delayMs = 0) {
        if (this.bufferTimeout) {
            return; // Already scheduled
        }
        
        this.bufferTimeout = setTimeout(async () => {
            this.bufferTimeout = null;
            if (this.buffer.length > 0 && !this.isProcessing) {
                await this._processBuffer();
            }
        }, delayMs);
    }

    async _processBuffer() {
        if (this.isProcessing || this.buffer.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        const messagesToProcess = [...this.buffer];
        this.buffer = [];
        
        try {
            for (const message of messagesToProcess) {
                await this._processMessage(message);
                this.metrics.markProcessed(message.id);
            }
        } catch (error) {
            console.error(`Error processing buffer for ${this.queueType}:`, error);
            if (this.onError) {
                this.onError(error, messagesToProcess);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    async _processMessage(message) {
        if (this.onProcessed) {
            return await this.onProcessed(message.data, message.metadata, message);
        }
        
        // Default processing - just return the data
        return message.data;
    }
}

/**
 * Helper class for assembling chunked messages
 */
class ChunkAssembler {
    constructor(chunkId, config = {}) {
        this.chunkId = chunkId;
        this.config = config;
        this.chunks = new Map();
        this.totalChunks = null;
        this.receivedChunks = 0;
        this.firstChunkTime = null;
        this.lastChunkTime = null;
        this.role = null;
        this.contentType = null;
    }

    addChunk(message) {
        const { metadata } = message;
        const chunkIndex = metadata.chunkIndex;
        
        if (this.firstChunkTime === null) {
            this.firstChunkTime = message.timestamp;
            this.role = metadata.role;
            this.contentType = metadata.contentType;
        }
        
        this.lastChunkTime = message.timestamp;
        
        // Store chunk if we don't already have it
        if (!this.chunks.has(chunkIndex)) {
            this.chunks.set(chunkIndex, message);
            this.receivedChunks++;
        }
        
        // Update total chunks if specified
        if (metadata.totalChunks && this.totalChunks === null) {
            this.totalChunks = metadata.totalChunks;
        }
        
        // Check if we have all chunks
        const isComplete = this.totalChunks !== null && 
                          this.receivedChunks >= this.totalChunks &&
                          this._hasContiguousChunks();
        
        if (isComplete) {
            return {
                isComplete: true,
                message: this._assembleMessage()
            };
        }
        
        // Check for timeout
        const age = Date.now() - this.firstChunkTime;
        if (age > this.config.chunkTimeout) {
            console.warn(`Chunk assembly timeout for ${this.chunkId}, assembling partial message`);
            return {
                isComplete: true,
                message: this._assembleMessage(true) // Force assembly
            };
        }
        
        return { isComplete: false };
    }

    _hasContiguousChunks() {
        if (this.totalChunks === null) return false;
        
        for (let i = 0; i < this.totalChunks; i++) {
            if (!this.chunks.has(i)) {
                return false;
            }
        }
        return true;
    }

    _assembleMessage(forcePartial = false) {
        const sortedChunks = Array.from(this.chunks.entries())
            .sort(([a], [b]) => a - b)
            .map(([_, message]) => message);
        
        if (sortedChunks.length === 0) {
            return null;
        }
        
        // Combine chunk data
        let combinedData = '';
        for (const chunk of sortedChunks) {
            combinedData += chunk.data;
        }
        
        return {
            id: `${this.chunkId}-assembled`,
            data: combinedData,
            timestamp: this.firstChunkTime,
            metadata: {
                role: this.role,
                contentType: this.contentType,
                isAssembled: true,
                chunksReceived: this.receivedChunks,
                totalChunks: this.totalChunks,
                isPartial: forcePartial && this.receivedChunks < this.totalChunks,
                assemblyTime: this.lastChunkTime - this.firstChunkTime
            }
        };
    }

    hasPartialData() {
        return this.chunks.size > 0;
    }

    getPartialMessage() {
        return this._assembleMessage(true);
    }

    getStatus() {
        return {
            chunkId: this.chunkId,
            receivedChunks: this.receivedChunks,
            totalChunks: this.totalChunks,
            age: this.firstChunkTime ? Date.now() - this.firstChunkTime : 0,
            isComplete: this._hasContiguousChunks()
        };
    }
}