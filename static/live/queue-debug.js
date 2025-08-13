/**
 * Queue Debug and Monitoring Utilities
 * Provides debugging tools and monitoring for the queue system
 */

import { CONFIG } from './config.js';

export class QueueDebugger {
    constructor(queueManager) {
        this.queueManager = queueManager;
        this.debugPanel = null;
        this.updateInterval = null;
        this.isVisible = false;
        
        // Performance tracking
        this.performanceLog = [];
        this.maxLogEntries = 1000;
        
        // Event listeners
        this.eventLog = [];
        this.maxEvents = 500;
    }

    /**
     * Create and show debug panel
     */
    showDebugPanel() {
        if (this.debugPanel) {
            this.debugPanel.style.display = 'block';
            this.isVisible = true;
            this._startUpdates();
            return;
        }

        this.debugPanel = document.createElement('div');
        this.debugPanel.id = 'queue-debug-panel';
        this.debugPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 400px;
            max-height: 80vh;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            padding: 15px;
            border-radius: 8px;
            z-index: 10000;
            overflow-y: auto;
            border: 1px solid #333;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #444;
            font-weight: bold;
        `;
        header.innerHTML = `
            <span>Queue Debug Monitor</span>
            <button id="close-debug-panel" style="
                background: #ff4444;
                border: none;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
            ">×</button>
        `;

        this.debugPanel.appendChild(header);

        // Add content container
        const content = document.createElement('div');
        content.id = 'debug-content';
        this.debugPanel.appendChild(content);

        document.body.appendChild(this.debugPanel);

        // Add close handler
        document.getElementById('close-debug-panel').addEventListener('click', () => {
            this.hideDebugPanel();
        });

        this.isVisible = true;
        this._startUpdates();
    }

    /**
     * Hide debug panel
     */
    hideDebugPanel() {
        if (this.debugPanel) {
            this.debugPanel.style.display = 'none';
        }
        this.isVisible = false;
        this._stopUpdates();
    }

    /**
     * Toggle debug panel visibility
     */
    toggleDebugPanel() {
        if (this.isVisible) {
            this.hideDebugPanel();
        } else {
            this.showDebugPanel();
        }
    }

    /**
     * Log queue event
     */
    logEvent(type, message, data = null) {
        const event = {
            timestamp: Date.now(),
            type,
            message,
            data
        };
        
        this.eventLog.push(event);
        
        if (this.eventLog.length > this.maxEvents) {
            this.eventLog.shift();
        }
        
        if (CONFIG.debug.enableQueueLogging) {
            console.log(`[Queue ${type}]`, message, data);
        }
    }

    /**
     * Log performance metrics
     */
    logPerformance(metrics) {
        this.performanceLog.push({
            timestamp: Date.now(),
            ...metrics
        });
        
        if (this.performanceLog.length > this.maxLogEntries) {
            this.performanceLog.shift();
        }
    }

    /**
     * Get queue statistics
     */
    getStatistics() {
        if (!this.queueManager) return null;

        const status = this.queueManager.getStatus();
        const recentEvents = this.eventLog.slice(-10);
        const recentPerformance = this.performanceLog.slice(-10);

        return {
            status,
            recentEvents,
            recentPerformance,
            eventLogSize: this.eventLog.length,
            performanceLogSize: this.performanceLog.length
        };
    }

    /**
     * Export debug data
     */
    exportDebugData() {
        const data = {
            timestamp: Date.now(),
            config: CONFIG.queue,
            status: this.queueManager ? this.queueManager.getStatus() : null,
            events: this.eventLog,
            performance: this.performanceLog
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `queue-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Private methods

    _startUpdates() {
        if (this.updateInterval) return;
        
        this.updateInterval = setInterval(() => {
            this._updateDebugPanel();
        }, CONFIG.ui.healthIndicatorUpdateMs || 1000);
        
        this._updateDebugPanel();
    }

    _stopUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    _updateDebugPanel() {
        const content = document.getElementById('debug-content');
        if (!content || !this.queueManager) return;

        const status = this.queueManager.getStatus();
        const recentEvents = this.eventLog.slice(-5);

        content.innerHTML = `
            <div style="margin-bottom: 15px;">
                <div style="color: #4CAF50; font-weight: bold; margin-bottom: 8px;">Connection Status</div>
                <div>Status: <span style="color: ${status.connected ? '#4CAF50' : '#ff4444'}">${status.connected ? 'Connected' : 'Disconnected'}</span></div>
                <div>Quality: <span style="color: ${this._getQualityColor(status.connectionQuality)}">${status.connectionQuality}</span></div>
                <div>Health: <span style="color: ${this._getHealthColor(status.overallHealth)}">${status.overallHealth}</span></div>
            </div>

            <div style="margin-bottom: 15px;">
                <div style="color: #2196F3; font-weight: bold; margin-bottom: 8px;">Outbound Queues</div>
                ${this._renderQueueStatus('audio', status.outbound.audio)}
                ${this._renderQueueStatus('video', status.outbound.video)}
                ${this._renderQueueStatus('text', status.outbound.text)}
                ${this._renderQueueStatus('control', status.outbound.control)}
            </div>

            <div style="margin-bottom: 15px;">
                <div style="color: #FF9800; font-weight: bold; margin-bottom: 8px;">Inbound Queues</div>
                ${this._renderQueueStatus('audio', status.inbound.audio, 'in')}
                ${this._renderQueueStatus('video', status.inbound.video, 'in')}
                ${this._renderQueueStatus('text', status.inbound.text, 'in')}
                ${this._renderQueueStatus('control', status.inbound.control, 'in')}
            </div>

            <div style="margin-bottom: 15px;">
                <div style="color: #9C27B0; font-weight: bold; margin-bottom: 8px;">Recent Events</div>
                <div style="max-height: 120px; overflow-y: auto; font-size: 10px;">
                    ${recentEvents.map(event => 
                        `<div style="margin: 2px 0; padding: 2px 4px; background: rgba(255,255,255,0.1); border-radius: 2px;">
                            <span style="color: #888">${new Date(event.timestamp).toLocaleTimeString()}</span>
                            <span style="color: #4CAF50">[${event.type}]</span>
                            ${event.message}
                        </div>`
                    ).join('')}
                </div>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 15px;">
                <button onclick="window.queueDebugger.exportDebugData()" style="
                    background: #2196F3;
                    border: none;
                    color: white;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 10px;
                ">Export Data</button>
                <button onclick="window.queueDebugger.queueManager.clear()" style="
                    background: #ff4444;
                    border: none;
                    color: white;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 10px;
                ">Clear Queues</button>
            </div>
        `;
    }

    _renderQueueStatus(type, status, direction = 'out') {
        if (!status) return '';
        
        const size = status.totalSize || status.bufferSize || 0;
        const maxSize = status.maxSize || status.maxBufferSize || 0;
        const usage = maxSize > 0 ? (size / maxSize * 100).toFixed(1) : '0';
        
        return `
            <div style="margin: 4px 0; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 3px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>${type}-${direction}</span>
                    <span style="color: ${size > maxSize * 0.8 ? '#ff4444' : '#4CAF50'}">${size}/${maxSize}</span>
                </div>
                <div style="font-size: 10px; color: #ccc;">
                    Usage: ${usage}% | Processing: ${status.isProcessing ? 'Yes' : 'No'}
                </div>
            </div>
        `;
    }

    _getQualityColor(quality) {
        switch (quality) {
            case 'good': return '#4CAF50';
            case 'fair': return '#FF9800';
            case 'poor': return '#ff4444';
            default: return '#888';
        }
    }

    _getHealthColor(health) {
        switch (health) {
            case 'healthy': return '#4CAF50';
            case 'degraded': return '#FF9800';
            case 'critical': return '#ff4444';
            default: return '#888';
        }
    }
}

/**
 * Global queue debugging utilities
 */
export function enableQueueDebugging(queueManager) {
    if (typeof window !== 'undefined') {
        window.queueDebugger = new QueueDebugger(queueManager);
        
        // Add keyboard shortcut (Ctrl+Shift+Q)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
                e.preventDefault();
                window.queueDebugger.toggleDebugPanel();
            }
        });
        
        console.log('Queue debugging enabled. Press Ctrl+Shift+Q to toggle debug panel.');
    }
}

/**
 * Test queue system with simulated load
 */
export async function testQueueSystem(queueManager, options = {}) {
    const {
        duration = 10000,
        audioRate = 50,
        videoRate = 1,
        textRate = 0.1
    } = options;
    
    console.log(`Starting queue test for ${duration}ms...`);
    
    let audioCount = 0;
    let videoCount = 0;
    let textCount = 0;
    
    const startTime = Date.now();
    
    // Audio test
    const audioInterval = setInterval(async () => {
        if (Date.now() - startTime > duration) {
            clearInterval(audioInterval);
            return;
        }
        
        const mockAudioData = new Array(1024).fill(0).map(() => Math.random() * 32767);
        await queueManager.send('audio', {
            mime_type: 'audio/pcm',
            data: btoa(String.fromCharCode(...mockAudioData))
        });
        audioCount++;
    }, 1000 / audioRate);
    
    // Video test
    const videoInterval = setInterval(async () => {
        if (Date.now() - startTime > duration) {
            clearInterval(videoInterval);
            return;
        }
        
        await queueManager.send('video', {
            mime_type: 'image/jpeg',
            data: btoa('mock-video-frame-data'),
            mode: 'test'
        });
        videoCount++;
    }, 1000 / videoRate);
    
    // Text test
    const textInterval = setInterval(async () => {
        if (Date.now() - startTime > duration) {
            clearInterval(textInterval);
            return;
        }
        
        await queueManager.send('text', {
            mime_type: 'text/plain',
            data: `Test message ${textCount}`
        });
        textCount++;
    }, 1000 / textRate);
    
    return new Promise(resolve => {
        setTimeout(() => {
            console.log(`Queue test completed. Sent: ${audioCount} audio, ${videoCount} video, ${textCount} text messages.`);
            resolve({ audioCount, videoCount, textCount });
        }, duration);
    });
}