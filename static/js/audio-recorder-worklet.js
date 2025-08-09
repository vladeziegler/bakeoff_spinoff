
console.log("[AudioWorklet] Inline recorder worklet code loaded");

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    console.log("[AudioWorklet] PCMProcessor constructor called");
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
console.log("[AudioWorklet] PCMProcessor registered successfully");
