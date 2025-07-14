/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * app.js: JS code for the adk-streaming sample app.
 */

/**
 * WebSocket handling
 */

// Connect the server with a WebSocket connection
const sessionId = Math.random().toString().substring(10);
const ws_url =
  "ws://" + window.location.host + "/ws/" + sessionId;
let websocket = null;
let is_audio = true;

// Reconnection management
class ReconnectionManager {
  constructor() {
    this.reconnectDelay = 1000; // Start at 1 second
    this.maxReconnectDelay = 30000; // Cap at 30 seconds
    this.reconnectAttempts = 0;
    this.maxAttempts = 10;
    this.reconnectTimer = null;
    this.isReconnecting = false;
    this.isConnected = false;
  }

  scheduleReconnect() {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxAttempts) {
      if (this.reconnectAttempts >= this.maxAttempts) {
        document.getElementById("messages").textContent = 
          `Connection failed after ${this.maxAttempts} attempts. Please refresh the page.`;
      }
      return;
    }

    this.isReconnecting = true;
    console.log(`Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      connectWebsocket();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.isReconnecting = false;
    }, this.reconnectDelay);
  }

  onConnectionSuccess() {
    // Reset on successful connection
    this.reconnectDelay = 1000;
    this.reconnectAttempts = 0;
    this.isConnected = true;
    this.isReconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  onConnectionLost() {
    this.isConnected = false;
    this.scheduleReconnect();
  }

  reset() {
    this.reconnectDelay = 1000;
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.isReconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

const reconnectionManager = new ReconnectionManager();

// Get DOM elements
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
const micIndicator = document.getElementById("mic-indicator");
const playbackIndicator = document.getElementById("playback-indicator");
let currentMessageId = null;

// WebSocket handlers
function connectWebsocket() {
  // Connect websocket
  websocket = new WebSocket(ws_url + "?is_audio=" + is_audio);

  // Handle connection open
  websocket.onopen = function () {
    // Connection opened messages
    console.log("WebSocket connection opened.");
    document.getElementById("messages").textContent = "Connection opened";
    
    // Notify reconnection manager of success
    reconnectionManager.onConnectionSuccess();

    // Enable the Send button
    document.getElementById("sendButton").disabled = false;
    addSubmitHandler();

    // Start audio session if enabled
    if (is_audio) {
      startAudio();
    }
  };

  // Handle incoming messages
  websocket.onmessage = function (event) {
    console.log('📨 Raw websocket message bytes:', event.data?.length || 0);
    
    try {
      const message_from_server = JSON.parse(event.data);
      console.log('📋 Parsed message:', {
        mime_type: message_from_server.mime_type,
        hasData: !!message_from_server.data,
        dataLength: message_from_server.data?.length,
        turn_complete: message_from_server.turn_complete,
        interrupted: message_from_server.interrupted
      });
      
      console.log(
        `[AGENT TO CLIENT] Received message: ${message_from_server.mime_type}, ${message_from_server.data ? message_from_server.data.length : 0} bytes` 
      );

      // Check if the turn is complete
    // if turn complete, add new message
    if (
      message_from_server.turn_complete &&
      message_from_server.turn_complete == true
    ) {
      currentMessageId = null;
      return;
    }

    // Check for interrupt message
    if (
      message_from_server.interrupted &&
      message_from_server.interrupted === true
    ) {
      // Stop audio playback if it's playing
      if (audioPlayerNode) {
        audioPlayerNode.port.postMessage({ command: "endOfAudio" });
      }
      return;
    }

    // If it's audio, play it
    if (message_from_server.mime_type == "audio/pcm") {
      console.log('🎵 Processing audio message:', {
        hasData: !!message_from_server.data,
        dataLength: message_from_server.data?.length,
        audioPlayerNode: !!audioPlayerNode,
        audioContextState: audioPlayerContext?.state
      });
      
      if (!audioPlayerNode) {
        console.error('❌ AudioPlayerNode is null! Audio system failed to initialize.');
        return;
      }
      
      setPlaybackIndicator(true);
      
      try {
        const buffer = base64ToArray(message_from_server.data);
        console.log(`🔊 Decoded ${buffer.byteLength} bytes of audio data, sending to worklet`);
        audioPlayerNode.port.postMessage(buffer, [buffer]);
        console.log('✅ Audio data sent to worklet successfully');
      } catch (error) {
        console.error('❌ Error processing audio:', error);
      }
    }

    // If it's a text, print it
    if (message_from_server.mime_type == "text/plain") {
      console.log(`Received text: ${message_from_server.data}`);
      // add a new message for a new turn
      if (currentMessageId == null) {
        currentMessageId = Math.random().toString(36).substring(7);
        const message = document.createElement("p");
        message.id = currentMessageId;
        // Append the message element to the messagesDiv
        messagesDiv.appendChild(message);
      }

      // Add message text to the existing message element
      const message = document.getElementById(currentMessageId);
      message.innerText += message_from_server.data;
      console.log(`Appended text to message ${currentMessageId}: "${message_from_server.data}"`);
      message.textContent += message_from_server.data;

      // Scroll down to the bottom of the messagesDiv
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    } catch (error) {
      console.error('❌ Error parsing websocket message:', error, 'Raw data bytes:', event.data?.length || 0);
    }
  };

  // Handle connection close
  websocket.onclose = function (event) {
    console.log("WebSocket connection closed:", event);
    document.getElementById("sendButton").disabled = true;
    
    if (reconnectionManager.isConnected) {
      document.getElementById("messages").textContent = "Connection lost. Reconnecting...";
      reconnectionManager.onConnectionLost();
    }
  };

  websocket.onerror = function (error) {
    console.error("WebSocket error:", error);
    document.getElementById("sendButton").disabled = true;
    
    if (reconnectionManager.isConnected) {
      document.getElementById("messages").textContent = "Connection error. Reconnecting...";
      reconnectionManager.onConnectionLost();
    }
  };
}
connectWebsocket();

// Add submit handler to the form
function addSubmitHandler() {
  messageForm.onsubmit = function (e) {
    e.preventDefault();
    const message = messageInput.value;
    if (message) {
      const p = document.createElement("p");
      p.textContent = "> " + message;
      messagesDiv.appendChild(p);
      messageInput.value = "";
      sendMessage({
        mime_type: "text/plain",
        data: message,
      });
      console.log("[CLIENT TO AGENT] Sending message:", message);
    }
    return false;
  };
}

// Send a message to the server as a JSON string
function sendMessage(message) {
  if (websocket && websocket.readyState == WebSocket.OPEN) {
    console.log("[CLIENT TO AGENT] Sending message:", message);
    const messageJson = JSON.stringify(message);
    websocket.send(messageJson);
  }
}

// Decode Base64 data to Array
function base64ToArray(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Audio handling
 */

let audioPlayerNode;
let audioPlayerContext;
let audioRecorderNode;
let audioRecorderContext;
let micStream;

// Audio buffering for 0.2s intervals
let audioBuffer = [];
let bufferTimer = null;

console.log("app.js loaded");

// Import the audio worklets
import { startAudioPlayerWorklet } from "./audio-player.js";
import { startAudioRecorder, stopAudioRecorder } from "./audio-recorder.js";

export function setMicIndicator(active) {
  micIndicator.classList.toggle("active", active);
}

export function setPlaybackIndicator(active) {
  playbackIndicator.classList.toggle("active", active);
}

async function startAudio() {
  try {
    console.log('🎧 Starting audio systems...');
    
    // Start audio output
    console.log('🔄 Initializing audio player worklet...');
    const [playerNode, playerCtx] = await startAudioPlayerWorklet();
    audioPlayerNode = playerNode;
    audioPlayerContext = playerCtx;
    
    console.log('🔊 Audio player initialized:', {
      audioPlayerNode: !!audioPlayerNode,
      audioContextState: audioPlayerContext?.state,
      sampleRate: audioPlayerContext?.sampleRate
    });

    // Handle playback finished event
    audioPlayerNode.port.onmessage = (event) => {
      console.log('📨 Message from audio worklet:', event.data);
      if (event.data.playbackFinished) {
        setPlaybackIndicator(false);
      }
    };

    // Start audio input
    console.log('🔄 Initializing audio recorder...');
    try {
      const recorderResult = await startAudioRecorder(audioRecorderHandler);
      if (recorderResult) {
        const [recorderNode, recorderCtx, stream] = recorderResult;
        audioRecorderNode = recorderNode;
        audioRecorderContext = recorderCtx;
        micStream = stream;
        console.log('✅ Audio recorder initialized successfully');
      } else {
        console.log('ℹ️ Audio recorder already running, skipping initialization');
      }
    } catch (error) {
      console.error('❌ Failed to initialize audio recorder:', error);
      if (error.name === 'NotAllowedError') {
        console.error('❌ Microphone permission denied. Please allow microphone access and refresh.');
      } else if (error.name === 'NotFoundError') {
        console.error('❌ No microphone found on this device.');
      } else if (error.name === 'SecurityError') {
        console.error('❌ Security error - HTTPS may be required for microphone access.');
      }
    }
    
    console.log('✅ Audio systems started successfully');
  } catch (error) {
    console.error("❌ Failed to start audio:", error);
    console.error("❌ Error details:", error.stack);
    
    // Provide more specific error information
    if (error.name === 'SecurityError') {
      console.error("❌ Security error - user interaction may be required for audio");
    } else if (error.name === 'NotFoundError') {
      console.error("❌ Audio worklet files not found");
    } else if (error.name === 'NotAllowedError') {
      console.error("❌ Audio permission denied");
    }
  }
}

// Handle the user gesture requirement for the Web Audio API
document.body.addEventListener("click", async () => {
  console.log('🖱️ User clicked, checking audio context states...');
  
  if (audioPlayerContext) {
    console.log('🔊 Player context state:', audioPlayerContext.state);
    if (audioPlayerContext.state === "suspended") {
      try {
        await audioPlayerContext.resume();
        console.log('✅ Player context resumed successfully');
      } catch (error) {
        console.error('❌ Failed to resume player context:', error);
      }
    }
  }
  
  if (audioRecorderContext) {
    console.log('🎤 Recorder context state:', audioRecorderContext.state);
    if (audioRecorderContext.state === "suspended") {
      try {
        await audioRecorderContext.resume();
        console.log('✅ Recorder context resumed successfully');
      } catch (error) {
        console.error('❌ Failed to resume recorder context:', error);
      }
    }
  }
});

// Audio recorder handler
function audioRecorderHandler(pcmData) {
  console.log('🎤 Audio recorder received PCM data:', pcmData.byteLength, 'bytes');
  
  // Add the 16-bit PCM data to the buffer
  audioBuffer.push(new Uint8Array(pcmData));

  // Start timer if not already running
  if (!bufferTimer) {
    console.log('🎤 Starting audio buffer timer (200ms intervals)');
    bufferTimer = setInterval(sendBufferedAudio, 200); // 0.2 seconds
  }
}

// Send buffered audio data every 0.2 seconds
function sendBufferedAudio() {
  if (audioBuffer.length === 0 || !is_audio) {
    console.log('🎤 Skipping audio send - no buffer data or audio disabled');
    return;
  }

  console.log('🎤 Preparing to send', audioBuffer.length, 'audio chunks');

  // Calculate total length
  let totalLength = 0;
  for (const chunk of audioBuffer) {
    totalLength += chunk.length;
  }

  console.log('🎤 Total audio data length:', totalLength, 'bytes');

  // Combine all chunks into a single buffer
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioBuffer) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  // Send the combined audio data
  sendMessage({
    mime_type: "audio/pcm",
    data: arrayBufferToBase64(combinedBuffer.buffer),
  });
  console.log("🎤 [CLIENT TO AGENT] Sent audio:", combinedBuffer.byteLength, "bytes");

  // Clear the buffer
  audioBuffer = [];
}

// Convert Float32Array to 16-bit PCM (Uint8Array)
function float32ToInt16(inputData) {
  // Create an Int16Array of the same length.
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    // Multiply by 0x7fff (32767) to scale the float value to 16-bit PCM range.
    pcm16[i] = inputData[i] * 0x7fff;
  }
  // Return the underlying ArrayBuffer.
}

let isMuted = false;
const muteButton = document.getElementById("mute-button");
muteButton.addEventListener("click", async () => {
  if (isMuted) {
    // Unmute
    console.log("Unmuted");
    isMuted = false;
    muteButton.textContent = "Mute";
    const recorderResult = await startAudioRecorder(audioRecorderHandler);
    if (recorderResult) {
      const [recorderNode, recorderCtx, stream] = recorderResult;
      audioRecorderNode = recorderNode;
      audioRecorderContext = recorderCtx;
      micStream = stream;
    }
  } else {
    // Mute
    console.log("Muted");
    isMuted = true;
    muteButton.textContent = "Unmute";
    stopAudioRecorder();
  }
});

// Encode an array buffer with Base64
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
