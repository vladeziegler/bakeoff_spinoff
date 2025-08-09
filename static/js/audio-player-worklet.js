
console.log('[AudioWorklet] Inline worklet code loaded');

class PCMPlayerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        console.log('[AudioWorklet] PCMPlayerProcessor constructor called');

        // Init buffer
        this.bufferSize = 24000 * 180;  // 24kHz x 180 seconds
        this.buffer = new Float32Array(this.bufferSize);
        this.writeIndex = 0;
        this.readIndex = 0;
        this.notifiedFinished = true;

        // Handle incoming messages from main thread
        this.port.onmessage = (event) => {
            console.log('[AudioWorklet] Received message:', typeof event.data);

            // Reset the buffer when 'endOfAudio' message received
            if (event.data && event.data.command === 'endOfAudio') {
                this.readIndex = this.writeIndex; // Clear the buffer
                console.log("[AudioWorklet] endOfAudio received, clearing the buffer.");
                return;
            }

            // Check if the data is an ArrayBuffer
            if (event.data instanceof ArrayBuffer) {
                console.log(`[AudioWorklet] Processing ${event.data.byteLength} bytes of audio data`);

                // Create a view of the ArrayBuffer as Int16 samples
                const int16Samples = new Int16Array(event.data);
                console.log(`[AudioWorklet] Converted to ${int16Samples.length} int16 samples`);

                // Add the audio data to the buffer
                this._enqueue(int16Samples);
            } else {
                console.warn('[AudioWorklet] Received non-ArrayBuffer data:', event.data);
            }
        };

        console.log('[AudioWorklet] PCMPlayerProcessor initialized');
    }

    // Push incoming Int16 data into our ring buffer.
    _enqueue(int16Samples) {
        this.notifiedFinished = false;
        for (let i = 0; i < int16Samples.length; i++) {
            // Convert 16-bit integer to float in [-1, 1]
            const floatVal = int16Samples[i] / 32768;

            // Store in ring buffer for left channel only (mono)
            this.buffer[this.writeIndex] = floatVal;
            this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

            // Overflow handling (overwrite oldest samples)
            if (this.writeIndex === this.readIndex) {
                this.readIndex = (this.readIndex + 1) % this.bufferSize;
            }
        }
    }

    // The system calls process() ~128 samples at a time (depending on the browser).
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel = output[0];

        const bufferSize = (this.writeIndex - this.readIndex + this.bufferSize) % this.bufferSize;

        if (bufferSize > 0) {
            console.log(`[AudioWorklet] Playing audio! Buffer size: ${bufferSize}, processing ${channel.length} samples`);
        }

        let samplesWritten = 0;
        for (let i = 0; i < channel.length; i++) {
            if (this.readIndex !== this.writeIndex) {
                channel[i] = this.buffer[this.readIndex];
                this.readIndex = (this.readIndex + 1) % this.bufferSize;
                samplesWritten++;
            } else {
                // Fill the rest of the buffer with silence if we've run out of data.
                for (let j = i; j < channel.length; j++) {
                    channel[j] = 0;
                }
                if (!this.notifiedFinished) {
                    console.log('[AudioWorklet] Playback finished, buffer empty');
                    this.port.postMessage({ playbackFinished: true });
                    this.notifiedFinished = true;
                    // Reset indices when buffer is empty
                    this.readIndex = 0;
                    this.writeIndex = 0;
                }
                break;
            }
        }

        if (samplesWritten > 0) {
            console.log(`[AudioWorklet] Output ${samplesWritten} samples to audio system`);
        }

        return true;
    }
}

registerProcessor('pcm-player-processor', PCMPlayerProcessor);
console.log('[AudioWorklet] PCMPlayerProcessor registered successfully');
