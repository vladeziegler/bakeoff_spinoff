/**
 * Audio Processor Worklet
 * Modern AudioWorklet implementation to replace deprecated ScriptProcessorNode
 */

class AudioProcessorWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRecording = false;
        
        // Listen for messages from main thread with error handling
        this.port.onmessage = (event) => {
            try {
                const { type, data } = event.data;
                
                switch (type) {
                    case 'start-recording':
                        this.isRecording = true;
                        break;
                    case 'stop-recording':
                        this.isRecording = false;
                        break;
                    default:
                        console.warn('Unknown message type in AudioProcessorWorklet:', type);
                }
            } catch (error) {
                // Report message handling error
                this.port.postMessage({
                    type: 'error',
                    error: 'Message handling error: ' + error.message
                });
            }
        };
    }

    process(inputs, outputs, parameters) {
        try {
            // Only process if we have input and are recording
            if (!this.isRecording || !inputs || inputs.length === 0) {
                return true;
            }

            const input = inputs[0];
            if (!input || input.length === 0) {
                return true;
            }

            const inputChannel = input[0]; // Get first channel
            
            if (inputChannel && inputChannel.length > 0) {
                // Convert float32 to int16 with error handling
                try {
                    const int16Data = new Int16Array(inputChannel.length);
                    for (let i = 0; i < inputChannel.length; i++) {
                        // Clamp and convert to 16-bit integer with validation
                        const sample = Number.isFinite(inputChannel[i]) ? 
                            Math.max(-1, Math.min(1, inputChannel[i])) : 0;
                        int16Data[i] = Math.floor(sample * 32767);
                    }

                    // Send audio data to main thread
                    this.port.postMessage({
                        type: 'audio-data',
                        data: int16Data
                    });
                } catch (conversionError) {
                    // Report conversion error but continue processing
                    this.port.postMessage({
                        type: 'error',
                        error: 'Audio conversion error: ' + conversionError.message
                    });
                }
            }

            return true; // Keep processor alive
        } catch (error) {
            // Report processing error to main thread
            this.port.postMessage({
                type: 'error',
                error: 'Audio processing error: ' + error.message
            });
            
            // Continue processing despite error
            return true;
        }
    }
}

// Register the processor
registerProcessor('audio-processor-worklet', AudioProcessorWorklet);