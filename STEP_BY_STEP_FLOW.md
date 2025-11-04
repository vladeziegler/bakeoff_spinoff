# Step-by-Step Execution Flow: Session Creation → Agent Response

This document traces **EVERY SINGLE STEP** from when the user types a message to when they see the agent's response.

---

## 🎬 **Scenario: User types "What's my net worth?" and presses Send**

---

## ✅ **STEP 1: User Interaction (UI Layer)**

### **1.1: User Types in Input Field**

**File**: `/front-end/app/page.tsx`  
**Line**: 382-388  
**Function**: React `<Input>` component's `onChange` handler

```tsx
<Input
  value={inputValue}  // Current value: ""
  onChange={(e) => setInputValue(e.target.value)}  // ← User types here
  // inputValue now = "What's my net worth?"
/>
```

**State Update**: React local state `inputValue` = "What's my net worth?"

---

### **1.2: User Clicks Send Button**

**File**: `/front-end/app/page.tsx`  
**Line**: 390-397  
**Function**: `<Button>` component's `onClick` handler

```tsx
<Button onClick={handleSendMessage}>  // ← User clicks here
  <Send className="w-4 h-4" />
</Button>
```

**Trigger**: Calls `handleSendMessage()` function

---

## ✅ **STEP 2: Message Handler (UI Layer)**

### **2.1: handleSendMessage() Executes**

**File**: `/front-end/app/page.tsx`  
**Lines**: 89-100  
**Function**: `handleSendMessage`

```tsx
const handleSendMessage = async () => {
  // 2.1.1: Validate input
  if ((!inputValue.trim() && selectedFiles.length === 0) || isLoading) return
  // Input is valid: "What's my net worth?"
  
  // 2.1.2: Capture message text
  const messageToSend = inputValue.trim()  // "What's my net worth?"
  
  // 2.1.3: Clear input (optimistic UI)
  setInputValue("")  // Input field now empty
  
  // 2.1.4: Clear errors
  if (error) clearError()
  
  // 2.1.5: Call Zustand store
  await sendMessage(messageToSend, selectedFiles)  // ← GOES TO STEP 3
  
  // 2.1.6: Clear attachments
  setSelectedFiles([])
}
```

**Result**: Control passes to Zustand store's `sendMessage()` action

---

## ✅ **STEP 3: Zustand Store - sendMessage() (State Layer)**

### **3.1: Convert Text to MessagePart**

**File**: `/front-end/app/src/stores/useAgentStore.ts`  
**Lines**: 155-189  
**Function**: `sendMessage`

```typescript
sendMessage: async (message: string, attachments?: File[]) => {
  // 3.1.1: Initialize parts array
  const parts: MessagePart[] = []
  
  // 3.1.2: Add text message
  if (message.trim()) {
    parts.push({ text: "What's my net worth?" })
  }
  // parts = [{ text: "What's my net worth?" }]
  
  // 3.1.3: Process attachments (none in this case)
  if (attachments && attachments.length > 0) {
    // ... (skipped, no files)
  }
  
  // 3.1.4: Ensure at least one part
  if (parts.length === 0) {
    parts.push({ text: '' })
  }
  
  // 3.1.5: Call main communication method
  await get().sendMultipartMessage(parts)  // ← GOES TO STEP 4
}
```

**Result**: Message converted to ADK format: `[{ text: "What's my net worth?" }]`

---

## ✅ **STEP 4: Zustand Store - sendMultipartMessage() (State Layer)**

**File**: `/front-end/app/src/stores/useAgentStore.ts`  
**Lines**: 196-422  
**Function**: `sendMultipartMessage`

### **4.1: Validation**

**Lines**: 197-202

```typescript
const { userId, sessionId, updateMessage } = get()

// 4.1.1: Check if user is authenticated
if (!userId) {
  set({ error: 'User ID is not set. Please authenticate first.' })
  return  // Would exit here if not authenticated
}
// userId = "user-001" ✅ Authenticated
```

---

### **4.2: Create User Message for Display**

**Lines**: 205-214

```typescript
// 4.2.1: Extract text from parts
const textParts = parts.filter(p => p.text).map(p => p.text).join(' ')
// textParts = "What's my net worth?"

// 4.2.2: Generate unique ID
const userMessageId = `user-${uuidv4()}`
// userMessageId = "user-a1b2c3d4-e5f6-7890-abcd-ef1234567890"

// 4.2.3: Create message object
const userMessage: AgentMessage = {
  id: userMessageId,
  content: "What's my net worth?",
  sender: 'user',
  timestamp: new Date().toISOString(),  // "2025-01-16T17:00:00.000Z"
  status: 'sending',
}
```

---

### **4.3: Update State - Add User Message**

**Lines**: 216-221

```typescript
// 4.3.1: Update Zustand state
set(state => ({ 
  messages: [...state.messages, userMessage],  // Add to messages array
  isLoading: true,      // Show loading spinner
  isProcessing: true,   // Block new inputs
  error: null           // Clear errors
}))

// ⚡ REACT RE-RENDERS - User sees their message bubble
```

---

### **4.4: Session Management**

**Lines**: 224-241

```typescript
// 4.4.1: Check if session exists
let currentSessionId = sessionId  // null (first message)

if (!currentSessionId) {
  console.log('📝 Creating new session...')
  
  try {
    // 4.4.2: Call API client to create session
    const session = await apiClient.createSession(
      API_CONFIG.appName,  // "banking_agent"
      userId               // "user-001"
    )
    // ← GOES TO STEP 5 (Session Creation)
    
    // 4.4.3: Save session ID
    currentSessionId = session.id  // "session-xyz789"
    set({ sessionId: currentSessionId })
    console.log('✅ Session created:', currentSessionId)
    
  } catch (sessionError) {
    console.error('❌ Session creation failed:', sessionError)
    set({ sessionId: null })
    throw new Error('Failed to create session...')
  }
}
```

**Result**: Session ID obtained, stored in Zustand state

---

## ✅ **STEP 5: Create Session (API Client)**

**File**: `/front-end/app/src/utils/agent-api-client.ts`  
**Lines**: 38-72  
**Function**: `createSession`

### **5.1: Build Request**

**Lines**: 38-41

```typescript
async createSession(appName: string, userId: string): Promise<CreateSessionResponse> {
  // 5.1.1: Build URL (goes through Next.js proxy)
  const url = getApiUrl(`/apps/${appName}/users/${userId}/sessions`)
  // url = "/api/apps/banking_agent/users/user-001/sessions"
  
  debugLog('Creating session', { appName, userId, url })
```

---

### **5.2: Send HTTP Request**

**Lines**: 43-46

```typescript
// 5.2.1: Send POST request
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
})
// ← HTTP REQUEST TO NEXT.JS PROXY
```

---

### **5.3: Next.js Proxy Rewrites URL**

**File**: `/front-end/next.config.ts`  
**Lines**: 4-10  
**Function**: `rewrites()`

```typescript
{
  source: '/api/:path*',  
  // Matches: "/api/apps/banking_agent/users/user-001/sessions"
  
  destination: 'http://localhost:8000/:path*',
  // Rewrites to: "http://localhost:8000/apps/banking_agent/users/user-001/sessions"
}
```

**Result**: Request forwarded to ADK backend

---

### **5.4: ADK Backend Creates Session**

**Server**: Python ADK Web Server (port 8000)  
**Endpoint**: `POST /apps/banking_agent/users/user-001/sessions`

```python
# ADK internal processing:
session_service.create_session(
    app_name="banking_agent",
    user_id="user-001"
)

# Returns:
{
  "id": "session-xyz789",
  "app_name": "banking_agent",
  "user_id": "user-001",
  "created_at": "2025-01-16T17:00:00.000Z",
  "state": {}
}
```

---

### **5.5: Return Session to Frontend**

**File**: `/front-end/app/src/utils/agent-api-client.ts`  
**Lines**: 48-60

```typescript
// 5.5.1: Check response status
if (!response.ok) {
  const errorBody = await response.text()
  throw new AgentAPIError(
    `Failed to create session: ${response.statusText}`,
    response.status,
    errorBody
  )
}

// 5.5.2: Parse JSON response
const session = await response.json()
// session = { id: "session-xyz789", ... }

debugLog('Session created successfully', { sessionId: session.id })

// 5.5.3: Return to caller
return session  // ← RETURNS TO STEP 4.4.2
```

**Result**: Session object returned to Zustand store

---

## ✅ **STEP 6: Zustand Store - Continue sendMultipartMessage()**

**File**: `/front-end/app/src/stores/useAgentStore.ts`  
**Function**: `sendMultipartMessage` (continued)

### **6.1: Update User Message Status**

**Line**: 244

```typescript
// 6.1.1: Mark user message as sent
updateMessage(userMessageId, { status: 'sent' })

// ⚡ REACT RE-RENDERS - User message shows checkmark
```

---

### **6.2: Create Agent Placeholder Message**

**Lines**: 252-260

```typescript
// 6.2.1: Generate agent message ID
const agentMessageId = `agent-${Date.now()}`
// agentMessageId = "agent-1737045600000"

// 6.2.2: Create placeholder message
const initialAgentMessage: AgentMessage = {
  id: agentMessageId,
  content: 'Thinking...',
  sender: 'agent',
  timestamp: new Date().toISOString(),
  status: 'sending',
}

// 6.2.3: Add to messages
set((state) => ({
  messages: [...state.messages, initialAgentMessage],
}))

// ⚡ REACT RE-RENDERS - "Thinking..." bubble appears
```

---

### **6.3: Initialize Event Tracking**

**Lines**: 266-275

```typescript
// 6.3.1: Create deduplication Sets
const seenToolCallIds = new Set<string>()
const seenToolResponseIds = new Set<string>()
const seenTextParts = new Set<string>()

// 6.3.2: Initialize accumulators
let cumulativeText = ''
let cumulativeImages: string[] = []
let hasFinalText = false
```

---

### **6.4: Start SSE Stream**

**Lines**: 278-398

```typescript
console.log('🌊 STARTING SSE STREAM')

// 6.4.1: Call SSE client
await sseClient.sendMessageSSE(
  // Request object
  {
    appName: API_CONFIG.appName,      // "banking_agent"
    userId,                           // "user-001"
    sessionId: currentSessionId,      // "session-xyz789"
    newMessage: { 
      parts: [{ text: "What's my net worth?" }],
      role: 'user' 
    },
    streaming: true,
  },
  
  // Callback 1: onEvent (called for EACH event)
  (event) => {
    // Process each event as it arrives
    // ← DEFINED HERE, CALLED FROM STEP 9
  },
  
  // Callback 2: onComplete (called when done)
  () => {
    console.log('✅ SSE STREAM COMPLETED')
    updateMessage(agentMessageId, { status: 'sent' })
    set({ isLoading: false, isProcessing: false })
  },
  
  // Callback 3: onError (called on failure)
  (error) => {
    console.error('❌ SSE stream error:', error.message)
    throw error
  }
)
// ← GOES TO STEP 7 (SSE Client)
```

**Result**: SSE stream initiated, callbacks registered

---

## ✅ **STEP 7: SSE Client - sendMessageSSE() (Network Layer)**

**File**: `/front-end/app/src/utils/agent-sse-client.ts`  
**Lines**: 18-167  
**Function**: `sendMessageSSE`

### **7.1: Initialize Request**

**Lines**: 24-30

```typescript
const { appName, userId, sessionId, newMessage, stateDelta } = request

// 7.1.1: Create abort controller
this.controller = new AbortController()

// 7.1.2: Build URL (custom SSE endpoint)
const url = getApiUrl('/run_sse_custom')
// url = "/api/run_sse_custom"
```

---

### **7.2: Prepare Request Body**

**Lines**: 31-38

```typescript
const requestBody = {
  appName: "banking_agent",
  userId: "user-001",
  sessionId: "session-xyz789",
  newMessage: {
    parts: [{ text: "What's my net worth?" }],
    role: "user"
  },
  streaming: true,
  stateDelta: null,
}
```

---

### **7.3: Send HTTP Request**

**Lines**: 50-58

```typescript
console.log('🌊 Opening SSE stream...')

// 7.3.1: Send POST request
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',  // SSE format
  },
  body: JSON.stringify(requestBody),
  signal: this.controller.signal,
})
// ← HTTP REQUEST TO NEXT.JS API ROUTE (STEP 8)
```

---

## ✅ **STEP 8: Next.js API Route - Custom SSE Proxy**

**File**: `/front-end/app/api/run_sse_custom/route.ts`  
**Lines**: 1-127  
**Function**: `POST`

### **8.1: Edge Runtime Configuration**

**Lines**: 9-10

```typescript
// USE EDGE RUNTIME - This prevents buffering!
export const runtime = 'edge'
```

**⚠️ CRITICAL**: This line tells Next.js to use Edge Runtime instead of Node.js, which enables true streaming without buffering

---

### **8.2: Parse Request**

**Lines**: 48-51

```typescript
// 8.2.1: Parse JSON body
const body = await request.json()
const { appName, userId, sessionId, newMessage, streaming, stateDelta } = body

console.log('[CUSTOM SSE] Request params:', {
  appName,     // "banking_agent"
  userId,      // "user-001"
  sessionId,   // "session-xyz789"
})
```

---

### **8.3: Validate Request**

**Lines**: 60-66

```typescript
// 8.3.1: Check required fields
if (!appName || !userId || !sessionId || !newMessage) {
  return new Response(
    JSON.stringify({ error: 'Missing required fields' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  )
}
// All fields present ✅
```

---

### **8.4: Forward to ADK Backend**

**Lines**: 69-81

```typescript
// 8.4.1: Build ADK URL
const adkUrl = `http://localhost:8000/run_sse`

// 8.4.2: Prepare payload
const adkPayload = {
  appName: "banking_agent",
  userId: "user-001",
  sessionId: "session-xyz789",
  newMessage: {
    parts: [{ text: "What's my net worth?" }],
    role: "user"
  },
  streaming: true,
  stateDelta: null,
}

console.log('[CUSTOM SSE] Forwarding to ADK SSE:', adkUrl)

// 8.4.3: Send request to ADK
const adkResponse = await fetch(adkUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(adkPayload),
})
// ← HTTP REQUEST TO ADK BACKEND (STEP 8.5)
```

---

### **8.5: ADK Backend Processes Request**

**Server**: Python ADK Web Server (port 8000)  
**Endpoint**: `POST /run_sse`

```python
# ADK Processing (simplified):

# 8.5.1: Load agent
root_agent = get_agent("banking_agent")

# 8.5.2: Get session
session = session_service.get_session("session-xyz789")

# 8.5.3: Add user message to history
session.history.append({
    "role": "user",
    "parts": [{"text": "What's my net worth?"}]
})

# 8.5.4: Start agent execution
for event in root_agent.run(session):
    
    # Event 1: transfer_to_agent (function call)
    yield {
        "content": {
            "parts": [{
                "functionCall": {
                    "name": "transfer_to_agent",
                    "args": {"agent_name": "handling"}
                }
            }]
        },
        "id": "event-1"
    }
    
    # Event 2: transfer_to_agent (function response)
    yield {
        "content": {
            "parts": [{
                "functionResponse": {
                    "name": "transfer_to_agent",
                    "response": {...}
                }
            }]
        },
        "id": "event-2"
    }
    
    # Event 3: cymbal_banking_agent (function call)
    yield {
        "content": {
            "parts": [{
                "functionCall": {
                    "name": "cymbal_banking_agent",
                    "args": {"request": "account balances"}
                }
            }]
        },
        "id": "event-3"
    }
    
    # Event 4: cymbal_banking_agent (function response)
    yield {
        "content": {
            "parts": [{
                "functionResponse": {
                    "name": "cymbal_banking_agent",
                    "response": {
                        "result": "Checking: $8,500\nSavings: $25,000\n..."
                    }
                }
            }]
        },
        "id": "event-4"
    }
    
    # Event 5: calculator (function call)
    yield {
        "content": {
            "parts": [{
                "functionCall": {
                    "name": "calculator",
                    "args": {"expression": "83500 - 62500"}
                }
            }]
        },
        "id": "event-5"
    }
    
    # Event 6: calculator (function response)
    yield {
        "content": {
            "parts": [{
                "functionResponse": {
                    "name": "calculator",
                    "response": {"result": "21000"}
                }
            }]
        },
        "id": "event-6"
    }
    
    # Event 7: Final text response
    yield {
        "content": {
            "parts": [{
                "text": "Your net worth is $21,000. Here's the breakdown:..."
            }]
        },
        "id": "event-7"
    }

# Stream format: "data: {json}\n\n"
```

**Result**: Events streamed back to Next.js API route

---

### **8.6: Proxy Stream Back to Frontend**

**Lines**: 115-120

```typescript
// 8.6.1: Check response
if (!adkResponse.ok) {
  // Handle error
}

if (!adkResponse.body) {
  // Handle error
}

console.log('[CUSTOM SSE] Proxying SSE stream from ADK (edge runtime = no buffering)')

// 8.6.2: Return ADK response body directly
// Edge runtime ensures no buffering!
return new Response(adkResponse.body, {
  headers: SSE_HEADERS,  // Content-Type: text/event-stream
})
// ← STREAMS BACK TO STEP 7.4
```

**Result**: SSE stream proxied to frontend without buffering

---

## ✅ **STEP 9: SSE Client - Read Stream (Network Layer)**

**File**: `/front-end/app/src/utils/agent-sse-client.ts`  
**Lines**: 73-148  
**Function**: `sendMessageSSE` (continued)

### **9.1: Initialize Stream Reader**

**Lines**: 73-80

```typescript
// 9.1.1: Get readable stream
const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''
let eventCount = 0
const streamStartTime = Date.now()

console.log('🌊 SSE CLIENT: Stream started at', new Date().toISOString())
```

---

### **9.2: Read Stream Loop**

**Lines**: 82-148

```typescript
while (true) {
  // 9.2.1: Read chunk from stream
  const { done, value } = await reader.read()
  
  if (done) {
    // Stream complete
    const totalDuration = Date.now() - streamStartTime
    console.log(`✅ SSE stream completed in ${totalDuration}ms`)
    console.log(`Total events: ${eventCount}`)
    onComplete()  // ← Call Zustand's onComplete callback (STEP 6.4)
    break
  }
  
  // 9.2.2: Chunk arrived!
  const chunkTime = Date.now() - streamStartTime
  console.log(`📦 CHUNK #${eventCount + 1} at +${chunkTime}ms (${value.length} bytes)`)
  
  // 9.2.3: Decode bytes to string
  buffer += decoder.decode(value, { stream: true })
  
  // 9.2.4: Parse SSE events from buffer
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''  // Keep incomplete line
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        // 9.2.5: Parse JSON event
        const jsonData = line.substring(6)  // Remove "data: " prefix
        const event: AgentRunResponseEvent = JSON.parse(jsonData)
        
        eventCount++
        const eventTime = Date.now() - streamStartTime
        
        console.log(`⚡ EVENT #${eventCount} parsed at +${eventTime}ms`)
        console.log('Event:', {
          hasContent: !!event.content,
          parts: event.content?.parts?.length || 0,
          hasFunctionCall: event.content?.parts?.some(p => p.functionCall),
          hasFunctionResponse: event.content?.parts?.some(p => p.functionResponse),
          hasText: event.content?.parts?.some(p => p.text && !p.thought),
        })
        
        // 9.2.6: Call onEvent callback
        const handlerStartTime = Date.now()
        onEvent(event)  // ← Call Zustand's onEvent callback (STEP 10)
        const handlerDuration = Date.now() - handlerStartTime
        
        if (handlerDuration > 10) {
          console.warn(`⚠️ Event handler took ${handlerDuration}ms (slow!)`)
        }
        
      } catch (parseError) {
        console.warn('Failed to parse SSE event:', line.substring(0, 100))
      }
    }
  }
}
```

**Result**: Each event processed and callback invoked immediately

---

## ✅ **STEP 10: Zustand Store - Process Event (onEvent Callback)**

**File**: `/front-end/app/src/stores/useAgentStore.ts`  
**Lines**: 289-379  
**Function**: `onEvent` callback inside `sendMultipartMessage`

### **10.1: Process Event**

**Lines**: 289-296

```typescript
(event) => {
  const eventProcessStartTime = Date.now()
  console.log('━'.repeat(80))
  console.log(`⚡ EVENT RECEIVED AT ${new Date().toISOString()}`)
  console.log('━'.repeat(80))
  
  // 10.1.1: Create processor instance
  const partialProcessor = new AgentResponseProcessor()
  
  // 10.1.2: Process this single event
  const partialProcessed = partialProcessor.process([event], true)
  // ← GOES TO STEP 11 (AgentResponseProcessor)
  
  console.log(`⏱️ [STORE] Processor returned in ${Date.now() - eventProcessStartTime}ms:`, {
    hasText: !!partialProcessed.textContent,
    hasToolCalls: !!partialProcessed.toolActivity?.calls?.length,
    hasToolResponses: !!partialProcessed.toolActivity?.responses?.length,
  })
```

---

### **10.2: Extract Tool Calls**

**Lines**: 308-318

```typescript
// 10.2.1: Check for tool calls
if (partialProcessed.toolActivity?.calls) {
  for (const call of partialProcessed.toolActivity.calls) {
    // 10.2.2: Generate unique key
    const callKey = call.id || `${call.name}-${JSON.stringify(call.args)}`
    
    // 10.2.3: Deduplicate
    if (!seenToolCallIds.has(callKey)) {
      seenToolCallIds.add(callKey)
      
      // 10.2.4: Format as timeline event
      const event = formatFunctionCallEvent(call.name, call.args, call.id)
      // ← GOES TO STEP 12 (event-formatter)
      
      // 10.2.5: Add to message timeline
      get().addMessageEvent(agentMessageId, event)
      // ← GOES TO STEP 13 (addMessageEvent)
    }
  }
}
```

---

### **10.3: Extract Tool Responses**

**Lines**: 321-331

```typescript
// 10.3.1: Check for tool responses
if (partialProcessed.toolActivity?.responses) {
  for (const response of partialProcessed.toolActivity.responses) {
    // 10.3.2: Generate unique key
    const responseKey = response.id || response.name
    
    // 10.3.3: Deduplicate
    if (!seenToolResponseIds.has(responseKey)) {
      seenToolResponseIds.add(responseKey)
      
      // 10.3.4: Format as timeline event
      const event = formatFunctionResponseEvent(response.name, response.result, response.id)
      
      // 10.3.5: Add to message timeline
      get().addMessageEvent(agentMessageId, event)
    }
  }
}
```

---

### **10.4: Extract Code Execution**

**Lines**: 334-339

```typescript
// 10.4.1: Check for code execution
if (partialProcessed.codeActivity?.executions) {
  for (const exec of partialProcessed.codeActivity.executions) {
    // 10.4.2: Format as timeline event
    const event = formatCodeExecutionEvent(exec.code, exec.language, exec.result)
    
    // 10.4.3: Add to message timeline
    get().addMessageEvent(agentMessageId, event)
  }
}
```

---

### **10.5: Extract Images**

**Lines**: 342-348

```typescript
// 10.5.1: Check for images
if (partialProcessed.artifacts?.images) {
  for (const img of partialProcessed.artifacts.images) {
    // 10.5.2: Deduplicate
    if (!cumulativeImages.includes(img)) {
      cumulativeImages.push(img)
    }
  }
}
```

---

### **10.6: Extract Text**

**Lines**: 351-363

```typescript
// 10.6.1: Check for text content
if (partialProcessed.textContent && partialProcessed.textContent.trim()) {
  const newText = partialProcessed.textContent.trim()
  
  // 10.6.2: Deduplicate
  if (!cumulativeText.includes(newText)) {
    hasFinalText = true
    cumulativeText = newText  // Replace (ADK sends complete text each time)
    console.log(`⏱️ [STORE] New text content received (${newText.length} chars)`)
  } else {
    console.log(`⏱️ [STORE] Duplicate text ignored`)
  }
}
```

---

### **10.7: Update Message Display**

**Lines**: 366-379

```typescript
// 10.7.1: Build update object
const updatedMessage: Partial<AgentMessage> = {
  content: hasFinalText ? cumulativeText : 'Working on your request...',
  hasVisualization: cumulativeImages.length > 0,
  artifactImageUrl: cumulativeImages[0],
  status: 'sending',
}

console.log(`⏱️ [STORE] Updating message with text:`, {
  contentLength: updatedMessage.content?.length,
  hasText: hasFinalText,
  hasImages: cumulativeImages.length > 0,
})

// 10.7.2: Update message in state
updateMessage(agentMessageId, updatedMessage)

// ⚡ REACT RE-RENDERS - Message content updates
// ⚡ REACT RE-RENDERS - Timeline shows new events
```

**Result**: UI updated with new content

---

## ✅ **STEP 11: AgentResponseProcessor - Parse Event**

**File**: `/front-end/app/src/utils/agent-response-processor.ts`  
**Lines**: 70-176  
**Function**: `process`

### **11.1: Loop Through Events**

**Lines**: 77-176

```typescript
process(events: AgentRunResponseEvent[], isPartial: boolean = false) {
  
  // 11.1.1: Loop through events (usually 1 in SSE)
  for (const event of events) {
    
    // 11.1.2: Check if event has content parts
    if (event.content?.parts) {
      
      // 11.1.3: Loop through parts
      for (const part of event.content.parts) {
        
        // ========== TEXT ==========
        if (part.text && !part.thought) {
          this.textParts.push(part.text)
          console.log('💬 Found text:', part.text.substring(0, 50))
        }
        
        // ========== FUNCTION CALL ==========
        if (part.functionCall) {
          this.toolCalls.push({
            name: part.functionCall.name,
            args: part.functionCall.args,
            id: part.functionCall.id,
          })
          console.log('🔧 Found tool call:', part.functionCall.name)
        }
        
        // ========== FUNCTION RESPONSE ==========
        if (part.functionResponse) {
          this.toolResponses.push({
            name: part.functionResponse.name,
            result: part.functionResponse.response,
            id: part.functionResponse.id,
          })
          console.log('✅ Found tool response:', part.functionResponse.name)
        }
        
        // ========== CODE EXECUTION ==========
        if (part.executableCode) {
          this.codeExecutions.push({
            code: part.executableCode.code,
            language: part.executableCode.language,
          })
          console.log('💻 Found code execution')
        }
        
        if (part.codeExecutionResult) {
          const lastExec = this.codeExecutions[this.codeExecutions.length - 1]
          if (lastExec) {
            lastExec.result = part.codeExecutionResult.output
            lastExec.outcome = part.codeExecutionResult.outcome
          }
        }
        
        // ========== IMAGES ==========
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          const imageUrl = processBase64Image(part.inlineData)
          if (imageUrl) {
            this.imageUrls.push(imageUrl)
            console.log('🎨 Processed image artifact')
          }
        }
      }
    }
  }
  
  // 11.1.4: Build response object
  return this.buildResponse()
}
```

---

### **11.2: Build Response Object**

**Lines**: 178-210

```typescript
private buildResponse(): ProcessedAgentResponse {
  // 11.2.1: Format text
  const rawText = this.textParts.length > 0
    ? this.textParts.join('\n\n')
    : ''
  
  const textContent = formatAgentText(rawText)
  
  // 11.2.2: Return structured response
  return {
    textContent,
    toolActivity: {
      calls: this.toolCalls,
      responses: this.toolResponses,
    },
    codeActivity: {
      executions: this.codeExecutions,
    },
    artifacts: {
      images: this.imageUrls,
    },
  }
  // ← RETURNS TO STEP 10.1.2
}
```

**Result**: Parsed event data returned to Zustand store

---

## ✅ **STEP 12: Format Timeline Event**

**File**: `/front-end/app/src/utils/event-formatter.ts`  
**Lines**: 12-33  
**Function**: `formatFunctionCallEvent`

```typescript
export function formatFunctionCallEvent(
  toolName: string,      // "calculator"
  args?: any,            // { expression: "83500 - 62500" }
  id?: string            // "adk-123"
): ProcessedEvent {
  
  // 12.1: Count arguments
  const argsCount = args ? Object.keys(args).length : 0  // 1
  
  // 12.2: Convert to title case
  const title = `🔧 ${toTitleCase(toolName)} (${argsCount} parameter${argsCount > 1 ? 's' : ''})`
  // title = "🔧 Calculator (1 parameter)"
  
  // 12.3: Create event object
  return {
    title: "🔧 Calculator (1 parameter)",
    data: {
      type: 'functionCall',
      name: "calculator",
      args: { expression: "83500 - 62500" },
    },
    timestamp: new Date().toISOString(),  // "2025-01-16T17:00:03.120Z"
  }
  // ← RETURNS TO STEP 10.2.4
}
```

**Result**: Formatted timeline event ready for UI

---

## ✅ **STEP 13: Add Event to Timeline**

**File**: `/front-end/app/src/stores/useAgentStore.ts`  
**Lines**: 132-142  
**Function**: `addMessageEvent`

```typescript
addMessageEvent: (messageId, event) => {
  // 13.1: Update state (immutable)
  set((state) => {
    // 13.1.1: Clone Map
    const newMap = new Map(state.messageEvents)
    
    // 13.1.2: Get existing events
    const existingEvents = newMap.get(messageId) || []
    // existingEvents = [event1, event2, ...]
    
    // 13.1.3: Add new event
    newMap.set(messageId, [...existingEvents, event])
    // newMap = Map { "agent-123" => [event1, event2, event3, ...] }
    
    console.log(`⏱️ Added event to timeline: ${event.title}`)
    
    // 13.1.4: Return new state
    return { messageEvents: newMap }
  })
  
  // ⚡ REACT RE-RENDERS - EventTimeline updates
}
```

**Result**: Event added to Map, React re-renders

---

## ✅ **STEP 14: React Re-renders (UI Layer)**

**File**: `/front-end/app/page.tsx`  
**Lines**: 36-274  
**Function**: `BankingAIChat` component

### **14.1: Component Subscribes to State**

**Lines**: 36-49

```tsx
// 14.1.1: Subscribe to messages
const { 
  messages,       // ← Triggers re-render when messages change
  isLoading,      // ← Triggers re-render when isLoading changes
  sendMessage,
  // ...
} = useAgentStore()

// 14.1.2: Subscribe to messageEvents
const messageEvents = useAgentStore(state => state.messageEvents)
// ← CRITICAL: Without this, EventTimeline won't update!

// 14.1.3: When state changes, component re-renders
```

---

### **14.2: Render Messages**

**Lines**: 198-274

```tsx
{messages.map((message) => (
  <div key={message.id}>
    
    {/* 14.2.1: Render avatar */}
    <Avatar>
      {message.sender === 'agent' ? <Bot /> : <User />}
    </Avatar>
    
    {/* 14.2.2: Render message bubble */}
    <div className="message-bubble">
      
      {/* 14.2.3: Render markdown content */}
      <MessageContent 
        content={message.content}  // "Your net worth is $21,000..."
        isUser={message.sender === 'user'}
      />
      // ← GOES TO STEP 15 (MessageContent)
      
      {/* 14.2.4: Render event timeline */}
      {message.sender === 'agent' && (() => {
        const events = messageEvents.get(message.id) || []
        return events.length > 0 ? <EventTimeline events={events} /> : null
      })()}
      // ← GOES TO STEP 16 (EventTimeline)
      
      {/* 14.2.5: Render chart/artifact */}
      {message.hasVisualization && message.artifactImageUrl && (
        <img src={message.artifactImageUrl} alt="Chart" />
      )}
      
      {/* 14.2.6: Render timestamp */}
      <p className="text-xs">
        {new Date(message.timestamp).toLocaleTimeString()}
      </p>
    </div>
  </div>
))}
```

**Result**: Message rendered with content, timeline, and artifacts

---

## ✅ **STEP 15: Render Message Content**

**File**: `/front-end/components/MessageContent.tsx`  
**Lines**: 12-50  
**Function**: `MessageContent` component

```tsx
export const MessageContent: React.FC<MessageContentProps> = ({ content, isUser }) => {
  // 15.1: Render with ReactMarkdown
  return (
    <ReactMarkdown
      className="prose prose-sm max-w-none"
      remarkPlugins={[remarkGfm]}  // GitHub Flavored Markdown
      components={{
        // 15.2: Custom paragraph rendering
        p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} />,
        
        // 15.3: Custom bold rendering
        strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
        
        // 15.4: Custom code rendering
        code: ({ node, inline, className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <pre className="bg-gray-800 text-white p-2 rounded-md">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          ) : (
            <code className="bg-gray-200 px-1 py-0.5 rounded-sm" {...props}>
              {children}
            </code>
          )
        }
      }}
    >
      {content}  {/* "Your net worth is $21,000. Here's the breakdown:..." */}
    </ReactMarkdown>
  )
}
```

**Result**: Formatted markdown text displayed

---

## ✅ **STEP 16: Render Event Timeline**

**File**: `/front-end/components/EventTimeline.tsx`  
**Lines**: 12-91  
**Function**: `EventTimeline` component

```tsx
const EventTimeline: React.FC<EventTimelineProps> = ({ events }) => {
  
  // 16.1: Initialize state
  const [isExpanded, setIsExpanded] = useState(true)
  
  if (events.length === 0) {
    return null
  }
  
  // 16.2: Render timeline
  return (
    <div className="timeline-container">
      
      {/* 16.3: Collapse/Expand button */}
      <button onClick={() => setIsExpanded(!isExpanded)}>
        <ChevronDown />
        ⚡ Agent Activity ({events.length} steps)
      </button>
      
      {/* 16.4: Timeline items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div>
            <ul className="timeline">
              {events.map((event, index) => (
                <li key={index}>
                  <EventItem event={event} />
                  {/* ← GOES TO STEP 17 */}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

**Result**: Timeline rendered with events

---

## ✅ **STEP 17: Render Timeline Item**

**File**: `/front-end/components/EventTimeline.tsx`  
**Lines**: 93-166  
**Function**: `EventItem` component

```tsx
const EventItem: React.FC<EventItemProps> = ({ event }) => {
  
  // 17.1: Initialize state
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  
  // 17.2: Render event item
  return (
    <div className="event-item">
      
      {/* 17.3: Event icon */}
      <span className={getIconColor(event.data.type)}>
        {getIcon(event.data.type)}  {/* 🔧 for functionCall */}
      </span>
      
      {/* 17.4: Event title */}
      <span className="font-medium">
        {event.title}  {/* "🔧 Calculator (1 parameter)" */}
      </span>
      
      {/* 17.5: Timestamp */}
      <span className="text-gray-500 ml-auto">
        {new Date(event.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3
        })}  {/* "17:00:03.120" */}
      </span>
      
      {/* 17.6: Expand details button */}
      {hasDetails(event.data) && (
        <button onClick={() => setDetailsExpanded(!detailsExpanded)}>
          {detailsExpanded ? <ChevronUp /> : <ChevronDown />}
        </button>
      )}
      
      {/* 17.7: Expandable details */}
      <AnimatePresence>
        {detailsExpanded && hasDetails(event.data) && (
          <motion.div>
            {event.data.type === 'functionCall' && event.data.args && (
              <pre className="bg-gray-100 p-2 rounded-md">
                <code>
                  {JSON.stringify(event.data.args, null, 2)}
                  {/* { "expression": "83500 - 62500" } */}
                </code>
              </pre>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

**Result**: Timeline item displayed with icon, title, timestamp, and expandable details

---

## 🎬 **COMPLETE FLOW SUMMARY**

```
USER TYPES & CLICKS SEND
  ↓ [Step 1-2: UI Layer]
page.tsx → handleSendMessage()
  ↓ [Step 3: State Layer]
useAgentStore → sendMessage()
  ↓ [Step 4: State Layer]
useAgentStore → sendMultipartMessage()
  ├─ [Step 5: API Client]
  │  agent-api-client.ts → createSession()
  │    ↓ [Next.js Proxy]
  │    next.config.ts → Rewrite to localhost:8000
  │    ↓ [ADK Backend]
  │    Python: session_service.create_session()
  │    ↓ Returns: { id: "session-xyz789" }
  │  ← Session created ✅
  │
  └─ [Step 7: SSE Client]
     agent-sse-client.ts → sendMessageSSE()
       ↓ [Step 8: Next.js API Route]
       route.ts (edge runtime) → POST()
         ↓ Forward to ADK
         fetch('http://localhost:8000/run_sse')
         ↓ [ADK Backend]
         Python: root_agent.run() → yields events
         ↓ Stream back:
         ├─ Event 1: transfer_to_agent call
         ├─ Event 2: transfer_to_agent response
         ├─ Event 3: cymbal_banking_agent call
         ├─ Event 4: cymbal_banking_agent response
         ├─ Event 5: calculator call
         ├─ Event 6: calculator response
         └─ Event 7: Final text
       ← Proxy stream (edge = no buffer) ✅
     ← [Step 9: SSE Client]
     agent-sse-client.ts → Read stream chunk-by-chunk
       ↓ For each event:
       ├─ [Step 10: State Layer]
       │  useAgentStore → onEvent callback
       │    ├─ [Step 11: Utils]
       │    │  agent-response-processor.ts → process()
       │    │  ← Returns: { textContent, toolActivity, ... }
       │    ├─ [Step 12: Utils]
       │    │  event-formatter.ts → formatFunctionCallEvent()
       │    │  ← Returns: ProcessedEvent
       │    └─ [Step 13: State Layer]
       │       useAgentStore → addMessageEvent()
       │       ← Adds to messageEvents Map
       │       ⚡ REACT RE-RENDERS
       │
       └─ [Step 14-17: UI Layer]
          page.tsx → Re-renders
            ├─ [Step 15]
            │  MessageContent.tsx → Renders markdown
            ├─ [Step 16]
            │  EventTimeline.tsx → Renders timeline
            └─ [Step 17]
               EventItem.tsx → Renders each event
          
          ⚡ USER SEES UPDATED UI
```

---

## 🎯 **Critical Points**

1. **Edge Runtime** (Step 8): `export const runtime = 'edge'` prevents buffering
2. **Streaming Loop** (Step 9): Events processed as they arrive, not all at once
3. **Deduplication** (Step 10): Sets prevent duplicate events
4. **State Subscription** (Step 14): `messageEvents` subscription triggers re-renders
5. **Immutable Updates** (Step 13): New Map created for each state update

---

## 🐛 **Where Issues Occur**

| Step | Common Issue | Solution |
|------|--------------|----------|
| 5 | Session creation fails (CORS) | Use Next.js proxy, not direct |
| 8 | Events buffered | Add `export const runtime = 'edge'` |
| 9 | Stream not reading | Check `Accept: text/event-stream` header |
| 10 | Duplicate events | Use deduplication Sets |
| 13 | Timeline not updating | Ensure immutable Map update |
| 14 | No re-renders | Subscribe to `messageEvents` in component |

---

**This document shows EXACTLY what happens at each step!** 🎯




