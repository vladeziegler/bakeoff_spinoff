/**
 * Debug Monitor for Message Transmission
 * Provides easy debugging functions for checking transmission status
 */

// Global debug function for browser console
window.debugTransmission = function() {
    console.log('=== TRANSMISSION DEBUG ===');
    
    const stats = window.getTransmissionStats ? window.getTransmissionStats() : null;
    if (!stats) {
        console.log('❌ No transmission stats available - client not initialized');
        return;
    }
    
    console.log('📊 Connection Status:');
    console.log('  - Connected:', stats.isConnected);
    console.log('  - Recording:', stats.isRecording);
    console.log('  - WebSocket State:', stats.wsReadyState);
    
    console.log('📤 Messages Sent:');
    Object.entries(stats.messagesSent).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
    });
    
    if (stats.queueStatus) {
        console.log('📋 Queue Status:');
        console.log('  - Enabled:', stats.queueStatus.enabled);
        console.log('  - Connected:', stats.queueStatus.connected);
        console.log('  - Health:', stats.queueStatus.overallHealth);
        
        console.log('  - Outbound Queues:');
        Object.entries(stats.queueStatus.outbound || {}).forEach(([type, queue]) => {
            console.log(`    ${type}: ${queue.totalSize}/${queue.maxSize} (${queue.health})`);
        });
    }
    
    return stats;
};

// Monitor for 30 seconds and report transmission activity
window.monitorTransmission = function(durationSeconds = 30) {
    console.log(`🔍 Starting transmission monitor for ${durationSeconds} seconds...`);
    
    const startStats = window.getTransmissionStats();
    if (!startStats) {
        console.log('❌ Cannot monitor - client not available');
        return;
    }
    
    console.log('📊 Initial stats:', startStats.messagesSent);
    
    setTimeout(() => {
        const endStats = window.getTransmissionStats();
        if (!endStats) {
            console.log('❌ Monitor ended - client unavailable');
            return;
        }
        
        console.log('📊 TRANSMISSION MONITORING RESULTS:');
        console.log('Duration:', durationSeconds, 'seconds');
        
        Object.entries(endStats.messagesSent).forEach(([type, endCount]) => {
            const startCount = startStats.messagesSent[type] || 0;
            const sent = endCount - startCount;
            const rate = sent / durationSeconds;
            console.log(`${type}: ${sent} messages sent (${rate.toFixed(2)}/sec)`);
        });
        
        if (endStats.messagesSent.audio > startStats.messagesSent.audio) {
            console.log('✅ Audio messages are being transmitted');
        } else {
            console.log('❌ No audio messages transmitted during monitoring period');
        }
        
    }, durationSeconds * 1000);
};

// Quick check function
window.checkTransmission = function() {
    const stats = window.getTransmissionStats();
    if (!stats) return '❌ Client not available';
    
    const audioCount = stats.messagesSent.audio || 0;
    const isRecording = stats.isRecording;
    const isConnected = stats.isConnected;
    
    if (!isConnected) return '🔌 Not connected to server';
    if (!isRecording) return '🎤 Not recording audio';
    if (audioCount === 0) return '📤 No audio messages sent yet';
    
    return `✅ Transmitting: ${audioCount} audio messages sent`;
};

console.log('🛠️ Debug functions loaded:');
console.log('  - debugTransmission() - Full status report');
console.log('  - monitorTransmission(30) - Monitor for 30 seconds');
console.log('  - checkTransmission() - Quick status check');