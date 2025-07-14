import { setMicIndicator } from "./app.js";

console.log("audio-recorder.js loaded");

/**
 * Audio Recorder Worklet
 */

let micStream;
let micIndicatorTimeout = null;
const INDICATOR_TIMEOUT_MS = 500; // Hide indicator after 500ms of silence
const VOLUME_THRESHOLD = 0.01; // Threshold for activating the indicator

export async function startAudioRecorderWorklet(audioRecorderHandler) {
  // Create an AudioContext
  const audioRecorderContext = new AudioContext({ sampleRate: 16000 });
  console.log("AudioContext sample rate:", audioRecorderContext.sampleRate);

  // Load the AudioWorklet module
  const workletURL = new URL("./pcm-recorder-processor.js", import.meta.url);
  await audioRecorderContext.audioWorklet.addModule(workletURL);

  // Request access to the microphone
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1 },
  });
  const source = audioRecorderContext.createMediaStreamSource(micStream);



  // Create an AudioWorkletNode that uses the PCMProcessor
  const audioRecorderNode = new AudioWorkletNode(
    audioRecorderContext,
    "pcm-recorder-processor"
  );

  // Connect the microphone source to the worklet.
  source.connect(audioRecorderNode);
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
  return [audioRecorderNode, audioRecorderContext, micStream];
}

/**
 * Stop the microphone.
 */
export function stopMicrophone(micStream) {
  micStream.getTracks().forEach((track) => track.stop());
  console.log("stopMicrophone(): Microphone stopped.");
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
