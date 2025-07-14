console.log('[AudioWorklet] pcm-player-processor.js loaded.');

/**
 * An audio worklet processor that stores the PCM audio data sent from the main thread
 * to a buffer and plays it.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Init buffer
    this.bufferSize = 24000 * 180;  // 24kHz x 180 seconds
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.notifiedFinished = true;

    // Handle incoming messages from main thread
    this.port.onmessage = (event) => {
      // Reset the buffer when 'endOfAudio' message received
      if (event.data.command === 'endOfAudio') {
        this.readIndex = this.writeIndex; // Clear the buffer
        console.log("[AudioWorklet] endOfAudio received, clearing the buffer.");
        return;
      }

      // Check if the data is an ArrayBuffer
      if (event.data instanceof ArrayBuffer) {
        console.log(`[AudioWorklet] Received ${event.data.byteLength} bytes.`);
        // Create a view of the ArrayBuffer as Int16 samples
        const int16Samples = new Int16Array(event.data);

        // Add the audio data to the buffer
        this._enqueue(int16Samples);
      }
    };
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

  // The system calls `process()` ~128 samples at a time (depending on the browser).
  // We fill the output buffers from our ring buffer.
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];

    if (this.readIndex !== this.writeIndex) {
      console.log(`[AudioWorklet] Processing audio. Buffer size: ${this.writeIndex - this.readIndex}`);
    }

    let i = 0;
    for (; i < channel.length; ++i) {
      if (this.readIndex !== this.writeIndex) {
        channel[i] = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      } else {
        // Fill the rest of the buffer with silence if we've run out of data.
        channel.fill(0, i);
        if (!this.notifiedFinished) {
          this.port.postMessage({ playbackFinished: true });
          this.notifiedFinished = true;
        }
        break;
      }
    }

    return true;
  }
}

registerProcessor('pcm-player-processor', PCMPlayerProcessor);

