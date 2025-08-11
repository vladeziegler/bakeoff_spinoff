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
 * Logging system
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

let currentLogLevel = LogLevel.WARN; // Default to WARN

export const logger = {
  debug: (...args) => { if (currentLogLevel <= LogLevel.DEBUG) console.log('[DEBUG]', ...args); },
  info: (...args) => { if (currentLogLevel <= LogLevel.INFO) console.info('[INFO]', ...args); },
  warn: (...args) => { if (currentLogLevel <= LogLevel.WARN) console.warn('[WARN]', ...args); },
  error: (...args) => { if (currentLogLevel <= LogLevel.ERROR) console.error('[ERROR]', ...args); }
};

// Global function to change log level from browser console
window.setLogLevel = function (level) {
  const levelName = typeof level === 'string' ? level.toUpperCase() : level;
  if (LogLevel.hasOwnProperty(levelName)) {
    currentLogLevel = LogLevel[levelName];
    logger.info(`Log level set to ${levelName}`);
  } else if (typeof level === 'number' && level >= 0 && level <= 3) {
    currentLogLevel = level;
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    logger.info(`Log level set to ${levelNames[level]}`);
  } else {
    console.error('Invalid log level. Use: setLogLevel("DEBUG"), setLogLevel("INFO"), setLogLevel("WARN"), or setLogLevel("ERROR")');
  }
};

/**
 * User and session management
 */

// Gets a user ID from local storage, or creates a new one if it doesn't exist.
function getOrCreateUserId() {
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('userId', userId);
    logger.info(`New user ID created: ${userId}`);
  }
  return userId;
}

// Resets the session by clearing the user ID and reloading the page.
function resetSession() {
  logger.info('Resetting session...');
  localStorage.removeItem('userId');
  window.websocket_connection_active = false; // Reset the singleton guard

  if (websocket && websocket.readyState === WebSocket.OPEN) {
    // Set a one-time close handler to reload the page.
    websocket.onclose = function () {
      logger.debug("WebSocket closed, reloading page.");
      location.reload();
    };
    // Close the connection. The handler above will trigger the reload.
    websocket.close();
  } else {
    // If there's no open websocket, just reload.
    location.reload();
  }
}

// Add event listener to the reset button.
document.addEventListener('DOMContentLoaded', () => {
  const resetButton = document.getElementById('reset-session-button');
  if (resetButton) {
    resetButton.addEventListener('click', resetSession);
  }
});

/**
 * WebSocket handling
 */

// Singleton guard to ensure only one WebSocket connection is active.
window.websocket_connection_active = false;

// Get the user ID and construct the WebSocket URL.
const userId = getOrCreateUserId();
const ws_url = "ws://" + window.location.host + "/ws/" + userId;

// Check for verbose mode
const urlParams = new URLSearchParams(window.location.search);
const isVerbose = urlParams.get('verbose') === 'true';
if (isVerbose) {
  window.setLogLevel('DEBUG');
}

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
    logger.debug(`Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxAttempts})`);

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

// #################################################################
//  Message Handlers
// #################################################################

const messageHandlers = {
  "audio/pcm": handleAudioChunk,
  "text/plain": handleTextChunk,
  "session_info": handleSessionInfo,
  "turn_complete": handleTurnComplete,
  "interrupted": handleInterrupted,
};

function handleAudioChunk(message) {
  if (!audioPlayerNode) {
    logger.error('❌ AudioPlayerNode is null! Audio system failed to initialize.');
    return;
  }
  setPlaybackIndicator(true);
  try {
    const buffer = base64ToArray(message.data);
    logger.debug(`🔊 Decoded ${buffer.byteLength} bytes of audio data, sending to worklet`);
    audioPlayerNode.port.postMessage(buffer, [buffer]);
    logger.debug('✅ Audio data sent to worklet successfully');
  } catch (error) {
    logger.error('❌ Error processing audio:', error);
  }
}

function handleTextChunk(message) {
  logger.info(`Received text: ${message.data}`);
  let messageEl;
  if (currentMessageId == null) {
    currentMessageId = Math.random().toString(36).substring(7);
    messageEl = document.createElement("p");
    messageEl.id = currentMessageId;
    messagesDiv.appendChild(messageEl);
  } else {
    messageEl = document.getElementById(currentMessageId);
  }

  if (messageEl) {
    messageEl.textContent += message.data;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

function handleSessionInfo(message) {
  document.getElementById("user-id").textContent = message.data.user_id;
  document.getElementById("session-id").textContent = message.data.session_id;
}

function handleTurnComplete(message) {
  currentMessageId = null;
}

function handleInterrupted(message) {
  if (audioPlayerNode) {
    audioPlayerNode.port.postMessage({ command: "endOfAudio" });
  }
}



// Get DOM elements
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
const micIndicator = document.getElementById("mic-indicator");
const playbackIndicator = document.getElementById("playback-indicator");
let currentMessageId = null;

// WebSocket handlers
function connectWebsocket() {
  // Singleton Guard: If a connection is already active, do nothing.
  if (window.websocket_connection_active) {
    logger.debug("WebSocket connection already active. Skipping connection.");
    return;
  }
  window.websocket_connection_active = true;
  logger.debug("WebSocket connection flag set to true.");
  // Connect websocket
  websocket = new WebSocket(ws_url + "?is_audio=" + is_audio);

  // Handle connection open
  websocket.onopen = function () {
    // Connection opened messages
    logger.info("WebSocket connection opened.");
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
    logger.info('📨 Raw websocket message bytes:', event.data?.length || 0);
    try {
      const message = JSON.parse(event.data);
      let handler;

      if (message.event) {
        handler = messageHandlers[message.event];
      } else if (message.turn_complete) {
        handler = messageHandlers['turn_complete'];
      } else if (message.interrupted) {
        handler = messageHandlers['interrupted'];
      } else {
        handler = messageHandlers[message.mime_type];
      }

      if (handler) {
        handler(message);
      } else {
        logger.warn("No handler for message:", message);
      }
    } catch (error) {
      logger.error('❌ Error parsing websocket message:', error, 'Raw data bytes:', event.data?.length || 0);
    }
  };

  // Handle connection close
  websocket.onclose = function (event) {
    logger.info("WebSocket connection closed:", event);
    window.websocket_connection_active = false; // Reset the singleton guard
    document.getElementById("sendButton").disabled = true;

    if (reconnectionManager.isConnected) {
      document.getElementById("messages").textContent = "Connection lost. Reconnecting...";
      reconnectionManager.onConnectionLost();
    }
  };

  websocket.onerror = function (error) {
    logger.error("WebSocket error:", error);
    window.websocket_connection_active = false; // Reset the singleton guard
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
      logger.debug("[CLIENT TO AGENT] Sending message:", message);
    }
    return false;
  };
}

// Send a message to the server as a JSON string
function sendMessage(message) {
  if (websocket && websocket.readyState == WebSocket.OPEN) {
    //logger.debug("[CLIENT TO AGENT] Sending message:", message);
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

logger.info("app.js loaded");

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
    logger.info('🎧 Starting audio systems...');

    // Start audio output
    logger.debug('🔄 Initializing audio player worklet...');
    const [playerNode, playerCtx, gainNode] = await startAudioPlayerWorklet(isVerbose);
    audioPlayerNode = playerNode;
    audioPlayerContext = playerCtx;

    logger.debug('🔊 Audio player initialized:', {
      audioPlayerNode: !!audioPlayerNode,
      audioContextState: audioPlayerContext?.state,
      sampleRate: audioPlayerContext?.sampleRate
    });

    // Handle volume control
    const volumeSlider = document.getElementById('volume-slider');
    volumeSlider.addEventListener('input', (event) => {
      const volume = event.target.value;
      gainNode.gain.value = volume;
      logger.debug(`Volume set to: ${volume}`);
    });

    // Handle playback finished event
    audioPlayerNode.port.onmessage = (event) => {
      logger.debug('📨 Message from audio worklet:', event.data);
      if (event.data.playbackFinished) {
        setPlaybackIndicator(false);
      }
    };

    // Start audio input
    logger.debug('🔄 Initializing audio recorder...');
    try {
      const recorderResult = await startAudioRecorder(audioRecorderHandler, isVerbose);
      if (recorderResult) {
        const [recorderNode, recorderCtx, stream] = recorderResult;
        audioRecorderNode = recorderNode;
        audioRecorderContext = recorderCtx;
        micStream = stream;
        logger.debug('✅ Audio recorder initialized successfully');
      } else {
        logger.debug('ℹ️ Audio recorder already running, skipping initialization');
      }
    } catch (error) {
      logger.error('❌ Failed to initialize audio recorder:', error);
      if (error.name === 'NotAllowedError') {
        logger.error('❌ Microphone permission denied. Please allow microphone access and refresh.');
      } else if (error.name === 'NotFoundError') {
        logger.error('❌ No microphone found on this device.');
      } else if (error.name === 'SecurityError') {
        logger.error('❌ Security error - HTTPS may be required for microphone access.');
      }
    }

    logger.info('✅ Audio systems started successfully');
  } catch (error) {
    logger.error("❌ Failed to start audio:", error);
    logger.error("❌ Error details:", error.stack);

    // Provide more specific error information
    if (error.name === 'SecurityError') {
      logger.error("❌ Security error - user interaction may be required for audio");
    } else if (error.name === 'NotFoundError') {
      logger.error("❌ Audio worklet files not found");
    } else if (error.name === 'NotAllowedError') {
      logger.error("❌ Audio permission denied");
    }
  }
}

// Handle the user gesture requirement for the Web Audio API
document.body.addEventListener("click", async () => {
  logger.debug('🖱️ User clicked, checking audio context states...');

  if (audioPlayerContext) {
    logger.debug('🔊 Player context state:', audioPlayerContext.state);
    if (audioPlayerContext.state === "suspended") {
      try {
        await audioPlayerContext.resume();
        logger.debug('✅ Player context resumed successfully');
      } catch (error) {
        logger.error('❌ Failed to resume player context:', error);
      }
    }
  }

  if (audioRecorderContext) {
    logger.debug('🎤 Recorder context state:', audioRecorderContext.state);
    if (audioRecorderContext.state === "suspended") {
      try {
        await audioRecorderContext.resume();
        logger.debug('✅ Recorder context resumed successfully');
      } catch (error) {
        logger.error('❌ Failed to resume recorder context:', error);
      }
    }
  }
});

// Audio recorder handler
function audioRecorderHandler(pcmData) {
  logger.debug('🎤 Audio recorder received PCM data:', pcmData.byteLength, 'bytes');

  // Add the 16-bit PCM data to the buffer
  audioBuffer.push(new Uint8Array(pcmData));

  // Start timer if not already running
  if (!bufferTimer) {
    logger.debug('🎤 Starting audio buffer timer (200ms intervals)');
    bufferTimer = setInterval(sendBufferedAudio, 200); // 0.2 seconds
  }
}

// Send buffered audio data every 0.2 seconds
function sendBufferedAudio() {
  if (audioBuffer.length === 0 || !is_audio) {
    logger.debug('🎤 Skipping audio send - no buffer data or audio disabled');
    return;
  }

  logger.debug('🎤 Preparing to send', audioBuffer.length, 'audio chunks');

  // Calculate total length
  let totalLength = 0;
  for (const chunk of audioBuffer) {
    totalLength += chunk.length;
  }

  logger.debug('🎤 Total audio data length:', totalLength, 'bytes');

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
  logger.debug("🎤 [CLIENT TO AGENT] Sent audio:", combinedBuffer.byteLength, "bytes");

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
    logger.info("Unmuted");
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
    logger.info("Muted");
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
