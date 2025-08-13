/**
 * Additional Debug Functions for Audio Gap Analysis
 */

// Audio gap analysis
window.checkAudioGaps = function() {
    if (window.audioClient && typeof window.audioClient.getGapAnalysis === 'function') {
        const analysis = window.audioClient.getGapAnalysis();
        console.log('=== AUDIO GAP ANALYSIS ===');
        console.log('📊', analysis.summary);
        console.log('⚠️', analysis.largeGaps);
        console.log('📈', analysis.averageGap);
        console.log('📦', analysis.currentThreshold);
        console.log('💡', analysis.recommendation);
        return analysis;
    } else {
        console.log('❌ Audio client not available');
        return null;
    }
};

// Set playback volume
window.setPlaybackVolume = function(volume) {
    if (window.audioClient && typeof window.audioClient.setPlaybackVolume === 'function') {
        window.audioClient.setPlaybackVolume(volume);
        console.log(`🔊 Volume set to ${Math.round(volume * 100)}%`);
    } else {
        console.log('❌ Audio client not available');
    }
};

console.log('🔧 Additional debug functions loaded:');
console.log('  - checkAudioGaps() - Audio gap analysis');
console.log('  - setPlaybackVolume(0.7) - Adjust volume');