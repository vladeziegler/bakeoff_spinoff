import { setMicIndicator, logger } from "./app.js";

// console.log("audio-recorder.js loaded");

/**
 * Audio Recorder Worklet
 */

let micStream;
let audioRecorderContext;
let micIndicatorTimeout = null;
const INDICATOR_TIMEOUT_MS = 500; // Hide indicator after 500ms of silence
const VOLUME_THRESHOLD = 0.01; // Threshold for activating the indicator

export async function startAudioRecorder(audioRecorderHandler) {
  if (audioRecorderContext && audioRecorderContext.state === "running") {
    logger.debug("Audio recorder is already running.");
    return;
  }
  
  try {
    // Create an AudioContext
    logger.debug('🎤 Creating AudioContext for recording...');
    audioRecorderContext = new AudioContext({ sampleRate: 16000 });
    logger.debug("🎤 AudioContext sample rate:", audioRecorderContext.sampleRate);

    // Create inline worklet code to bypass file loading issues
    logger.debug('🎤 Creating inline PCM recorder worklet...');
    const recorderWorkletCode = `
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
    `;
    
    // Create a blob URL for the recorder worklet
    const recorderBlob = new Blob([recorderWorkletCode], { type: 'application/javascript' });
    const recorderWorkletUrl = URL.createObjectURL(recorderBlob);
    
    logger.debug('🔗 Inline recorder worklet blob URL:', recorderWorkletUrl);
    
    try {
      await audioRecorderContext.audioWorklet.addModule(recorderWorkletUrl);
      logger.debug('✅ Inline PCM recorder worklet loaded successfully');
      
      // Clean up the blob URL
      URL.revokeObjectURL(recorderWorkletUrl);
    } catch (error) {
      logger.error('❌ Failed to load inline recorder worklet:', error);
      URL.revokeObjectURL(recorderWorkletUrl);
      throw error;
    }

    // Request access to the microphone
    logger.debug('🎤 Requesting microphone access...');
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
    });
    logger.debug('✅ Microphone access granted');
    
    const source = audioRecorderContext.createMediaStreamSource(micStream);
    logger.debug('✅ Media stream source created');

    // Create an AudioWorkletNode that uses the PCMProcessor
    logger.debug('🎤 Creating AudioWorkletNode...');
    const audioRecorderNode = new AudioWorkletNode(
      audioRecorderContext,
      "pcm-recorder-processor"
    );
    logger.debug('✅ AudioWorkletNode created');

    // Connect the microphone source to the worklet.
    logger.debug('🎤 Connecting microphone to worklet...');
    source.connect(audioRecorderNode);
    logger.debug('✅ Audio pipeline connected');
    
    audioRecorderNode.port.onmessage = (event) => {
      const audioData = event.data;

      // Calculate volume and activate indicator if above threshold
      const volume = calculateRMS(audioData);
      if (volume > VOLUME_THRESHOLD) {
        setMicIndicator(true);
        if (micIndicatorTimeout) {
          clearTimeout(micIndicatorTimeout);
        }
        micIndicatorTimeout = setTimeout(() => {
          setMicIndicator(false);
        }, INDICATOR_TIMEOUT_MS);
      }

      // Convert to 16-bit PCM
      const pcmData = convertFloat32ToPCM(audioData);

      // Send the PCM data to the handler.
      audioRecorderHandler(pcmData);
    };
    
    logger.debug('✅ Audio recorder setup complete');
    return [audioRecorderNode, audioRecorderContext, micStream];
    
  } catch (error) {
    logger.error('❌ Error in startAudioRecorder:', error);
    
    // Clean up on error
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    if (audioRecorderContext) {
      audioRecorderContext.close();
      audioRecorderContext = null;
    }
    
    throw error; // Re-throw to be caught by the caller
  }
}

/**
 * Stop the microphone.
 */
export function stopMicrophone(micStream) {
  micStream.getTracks().forEach((track) => track.stop());
  logger.debug("stopMicrophone(): Microphone stopped.");
  if (micIndicatorTimeout) {
    clearTimeout(micIndicatorTimeout);
  }
  setMicIndicator(false);
}

// Calculate the Root Mean Square (RMS) of the audio data to measure volume.
function calculateRMS(audioData) {
  let sumOfSquares = 0;
  for (let i = 0; i < audioData.length; i++) {
    sumOfSquares += audioData[i] * audioData[i];
  }
  return Math.sqrt(sumOfSquares / audioData.length);
}

export function stopAudioRecorder() {
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
    logger.debug("Microphone stream stopped.");
  }
  if (audioRecorderContext) {
    audioRecorderContext.close();
    audioRecorderContext = null;
    logger.debug("AudioContext closed.");
  }
  if (micIndicatorTimeout) {
    clearTimeout(micIndicatorTimeout);
  }
  setMicIndicator(false);
}

// Convert Float32 samples to 16-bit PCM.
function convertFloat32ToPCM(inputData) {
  // Create an Int16Array of the same length.
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    // Multiply by 0x7fff (32767) to scale the float value to 16-bit PCM range.
    pcm16[i] = inputData[i] * 0x7fff;
  }
  // Return the underlying ArrayBuffer.
  return pcm16.buffer;
}
