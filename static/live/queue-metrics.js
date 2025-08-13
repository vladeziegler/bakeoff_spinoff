/**
 * Queue Metrics System
 * Tracks performance and health metrics for message queues
 */

export class QueueMetrics {
    constructor(queueType) {
        this.queueType = queueType;
        this.reset();
        
        // Performance tracking
        this.performanceMarks = new Map();
        this.recentProcessingTimes = [];
        this.maxRecentSamples = 100;
    }

    reset() {
        this.messagesQueued = 0;
        this.messagesProcessed = 0;
        this.messagesDropped = 0;
        this.messagesTimedOut = 0;
        this.currentQueueDepth = 0;
        this.maxQueueDepth = 0;
        this.totalQueueTime = 0;
        this.averageProcessingTime = 0;
        this.lastProcessingTime = 0;
        this.startTime = Date.now();
        this.lastResetTime = Date.now();
    }

    // Queue operations tracking
    messageQueued(queueDepth) {
        this.messagesQueued++;
        this.currentQueueDepth = queueDepth;
        this.maxQueueDepth = Math.max(this.maxQueueDepth, queueDepth);
    }

    messageProcessed(processingTimeMs) {
        this.messagesProcessed++;
        this.currentQueueDepth = Math.max(0, this.currentQueueDepth - 1);
        this.lastProcessingTime = processingTimeMs;
        
        // Track recent processing times for rolling average
        this.recentProcessingTimes.push(processingTimeMs);
        if (this.recentProcessingTimes.length > this.maxRecentSamples) {
            this.recentProcessingTimes.shift();
        }
        
        // Update average processing time
        this.averageProcessingTime = this.recentProcessingTimes.reduce((a, b) => a + b, 0) / this.recentProcessingTimes.length;
    }

    messageDropped(reason = 'unknown') {
        this.messagesDropped++;
        // Only log occasionally to avoid spam - log every 100th drop
        if (this.messagesDropped % 100 === 0) {
            console.warn(`${this.messagesDropped} messages dropped in ${this.queueType} queue (last reason: ${reason})`);
        }
    }

    messageTimedOut() {
        this.messagesTimedOut++;
        console.warn(`Message timed out in ${this.queueType} queue`);
    }

    // Performance marking for detailed timing
    markStart(messageId) {
        this.performanceMarks.set(messageId, {
            queueTime: Date.now(),
            processed: false
        });
    }

    markProcessed(messageId) {
        const mark = this.performanceMarks.get(messageId);
        if (mark && !mark.processed) {
            const processingTime = Date.now() - mark.queueTime;
            this.messageProcessed(processingTime);
            mark.processed = true;
            
            // Clean up old marks
            if (this.performanceMarks.size > 1000) {
                const oldEntries = Array.from(this.performanceMarks.entries())
                    .filter(([_, mark]) => mark.processed)
                    .slice(0, 500);
                oldEntries.forEach(([id]) => this.performanceMarks.delete(id));
            }
        }
    }

    // Health assessment
    getHealthStatus() {
        const uptimeMs = Date.now() - this.startTime;
        const totalMessages = this.messagesQueued;
        const successRate = totalMessages > 0 ? (this.messagesProcessed / totalMessages) * 100 : 100;
        const dropRate = totalMessages > 0 ? (this.messagesDropped / totalMessages) * 100 : 0;
        
        let status = 'healthy';
        const issues = [];
        
        // Check various health indicators
        if (dropRate > 5) {
            status = 'degraded';
            issues.push(`High drop rate: ${dropRate.toFixed(1)}%`);
        }
        
        if (this.currentQueueDepth > 50) {
            status = 'degraded';
            issues.push(`High queue depth: ${this.currentQueueDepth}`);
        }
        
        if (this.averageProcessingTime > 1000) {
            status = 'degraded';
            issues.push(`Slow processing: ${this.averageProcessingTime.toFixed(0)}ms avg`);
        }
        
        if (dropRate > 15 || this.currentQueueDepth > 100) {
            status = 'critical';
        }

        return {
            status,
            issues,
            successRate: successRate.toFixed(1),
            dropRate: dropRate.toFixed(1),
            currentDepth: this.currentQueueDepth,
            maxDepth: this.maxQueueDepth,
            avgProcessingTime: this.averageProcessingTime.toFixed(1),
            uptime: uptimeMs
        };
    }

    // Statistics summary
    getStatistics() {
        const uptimeMs = Date.now() - this.startTime;
        const throughputPerSecond = uptimeMs > 0 ? (this.messagesProcessed / (uptimeMs / 1000)) : 0;
        
        return {
            queueType: this.queueType,
            uptime: uptimeMs,
            messagesQueued: this.messagesQueued,
            messagesProcessed: this.messagesProcessed,
            messagesDropped: this.messagesDropped,
            messagesTimedOut: this.messagesTimedOut,
            currentQueueDepth: this.currentQueueDepth,
            maxQueueDepth: this.maxQueueDepth,
            averageProcessingTime: this.averageProcessingTime,
            lastProcessingTime: this.lastProcessingTime,
            throughputPerSecond: throughputPerSecond.toFixed(2),
            successRate: this.messagesQueued > 0 ? ((this.messagesProcessed / this.messagesQueued) * 100).toFixed(1) : '100.0'
        };
    }

    // Get recent performance trend
    getPerformanceTrend(sampleSize = 10) {
        const recentSamples = this.recentProcessingTimes.slice(-sampleSize);
        if (recentSamples.length < 2) return 'stable';
        
        const firstHalf = recentSamples.slice(0, Math.floor(recentSamples.length / 2));
        const secondHalf = recentSamples.slice(Math.floor(recentSamples.length / 2));
        
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        const changePct = ((secondAvg - firstAvg) / firstAvg) * 100;
        
        if (changePct > 20) return 'degrading';
        if (changePct < -20) return 'improving';
        return 'stable';
    }

    // Export metrics for monitoring systems
    exportMetrics() {
        return {
            timestamp: Date.now(),
            ...this.getStatistics(),
            health: this.getHealthStatus(),
            trend: this.getPerformanceTrend()
        };
    }
}

// Utility class for managing multiple queue metrics
export class MetricsCollector {
    constructor() {
        this.queueMetrics = new Map();
        this.globalStartTime = Date.now();
    }

    registerQueue(queueType) {
        if (!this.queueMetrics.has(queueType)) {
            this.queueMetrics.set(queueType, new QueueMetrics(queueType));
        }
        return this.queueMetrics.get(queueType);
    }

    getMetrics(queueType) {
        return this.queueMetrics.get(queueType);
    }

    getAllMetrics() {
        const allMetrics = {};
        for (const [type, metrics] of this.queueMetrics) {
            allMetrics[type] = metrics.exportMetrics();
        }
        return {
            timestamp: Date.now(),
            uptime: Date.now() - this.globalStartTime,
            queues: allMetrics
        };
    }

    getOverallHealth() {
        const healths = Array.from(this.queueMetrics.values()).map(m => m.getHealthStatus());
        
        if (healths.some(h => h.status === 'critical')) return 'critical';
        if (healths.some(h => h.status === 'degraded')) return 'degraded';
        return 'healthy';
    }

    reset() {
        for (const metrics of this.queueMetrics.values()) {
            metrics.reset();
        }
    }
}