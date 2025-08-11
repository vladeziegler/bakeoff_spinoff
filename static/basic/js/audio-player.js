import { logger } from "./app.js";

// console.log("audio-player.js loaded");

/**
 * Audio Player Worklet
 */

export async function startAudioPlayerWorklet(isVerbose = false) {
    try {
        logger.debug('🎧 Creating AudioContext...');
        // 1. Create an AudioContext
        const audioContext = new AudioContext({
            sampleRate: 24000
        });
        
        logger.debug('🎧 AudioContext created:', {
            state: audioContext.state,
            sampleRate: audioContext.sampleRate
        });
        
        // 2. Load the worklet module
        const workletUrl = '/static/js/audio-player-worklet.js';
        logger.debug('🔄 Loading audio worklet from:', workletUrl);

        try {
            await audioContext.audioWorklet.addModule(workletUrl);
            logger.debug('✅ Audio worklet loaded successfully');
        } catch (error) {
            logger.error('❌ Failed to load worklet:', error);
            throw error;
        }
        
        // 3. Create an AudioWorkletNode
        logger.debug('🔄 Creating AudioWorkletNode...');
        const audioPlayerNode = new AudioWorkletNode(audioContext, 'pcm-player-processor', {
            processorOptions: {
                isVerbose: isVerbose
            }
        });
        logger.debug('✅ AudioWorkletNode created successfully');

        // 4. Create a GainNode for volume control
        logger.debug('🔄 Creating GainNode...');
        const gainNode = audioContext.createGain();
        logger.debug('✅ GainNode created');

        // 5. Connect the nodes: Player -> Gain -> Destination
        logger.debug('🔄 Connecting audio pipeline: Player -> Gain -> Destination...');
        audioPlayerNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        logger.debug('✅ Audio pipeline connected');

        // The audioPlayerNode.port is how we send messages (audio data) to the processor
        return [audioPlayerNode, audioContext, gainNode];
    } catch (error) {
        logger.error('❌ Error in startAudioPlayerWorklet:', error);
        logger.error('❌ Error stack:', error.stack);
        throw error;
    }
}
