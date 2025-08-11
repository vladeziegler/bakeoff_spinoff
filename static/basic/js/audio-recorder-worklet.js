


class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.verbose = options?.processorOptions?.isVerbose || false;
    this.log = (...args) => {
        if (this.verbose) {
            console.log('[AudioWorklet] [Recorder]', ...args);
        }
    };
    this.log("PCMProcessor constructor called");
  }

  process(inputs, outputs, parameters) {
    if (inputs.length > 0 && inputs[0].length > 0) {
      // Use the first channel
      const inputChannel = inputs[0][0];
      // Copy the buffer to avoid issues with recycled memory
      const inputCopy = new Float32Array(inputChannel);
      // Post the PCM data to the main thread
      this.port.postMessage(inputCopy);
    }
    return true;
  }
}

registerProcessor("pcm-recorder-processor", PCMProcessor);
