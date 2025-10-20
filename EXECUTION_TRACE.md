# Complete Execution Trace: User Message → Agent Response

This document traces **EVERY function call, EVERY file involved, and EVERY data transformation** when a user sends a message.

---

## 🎬 **Example: User types "What's my net worth?"**

---

## 📍 **Phase 1: User Input (UI Layer)**

### **File**: `/front-end/app/page.tsx`

#### **Step 1.1: User Types & Clicks Send**
```tsx
// Lines 382-398: Input handling
<Input
  value={inputValue}  // "What's my net worth?"
  onChange={(e) => setInputValue(e.target.value)}
  onKeyPress={handleKeyPress}  // Enter key detection
/>
<Button onClick={handleSendMessage}>Send</Button>
```

#### **Step 1.2: handleSendMessage() Executes**
```tsx
// Lines 89-100: page.tsx
const handleSendMessage = async () => {
  // 1. Validate input
  if ((!inputValue.trim() && selectedFiles.length === 0) || isLoading) return
  
  // 2. Capture message text
  const messageToSend = inputValue.trim()  // "What's my net worth?"
  
  // 3. Clear input immediately (optimistic UI)
  setInputValue("")
  
  // 4. Clear any previous errors
  if (error) clearError()
  
  // 5. Call Zustand store action
  await sendMessage(messageToSend, selectedFiles)  // ← Goes to useAgentStore
  
  // 6. Clear file attachments
  setSelectedFiles([])
}
```

**Result**: UI cleared, control passed to state management layer

---

## 📍 **Phase 2: State Management (Zustand Store)**

### **File**: `/front-end/app/src/stores/useAgentStore.ts`

#### **Step 2.1: sendMessage() - Convert to MessageParts**
```typescript
// Lines 155-189: useAgentStore.ts
sendMessage: async (message: string, attachments?: File[]) => {
  const parts: MessagePart[] = []
  
  // 1. Add text message
  if (message.trim()) {
    parts.push({ text: "What's my net worth?" })
  }
  
  // 2. Process attachments (if any)
  if (attachments && attachments.length > 0) {
    for (const file of attachments) {
      const base64Data = await fileToBase64(file)
      parts.push({
        inlineData: {
          displayName: file.name,
          data: base64Data,
          mimeType: file.type
        }
      })
    }
  }
  
  // 3. Call main communication method
  await sendMultipartMessage(parts)  // ← Next function
}
```

**Result**: Message converted to ADK format: `[{ text: "What's my net worth?" }]`

---

#### **Step 2.2: sendMultipartMessage() - Main Communication Handler**
```typescript
// Lines 196-422: useAgentStore.ts
sendMultipartMessage: async (parts: MessagePart[]) => {
  const { userId, sessionId, updateMessage } = get()
  
  // ===== STEP 2.2.1: Validation =====
  if (!userId) {
    set({ error: 'User ID is not set. Please authenticate first.' })
    return
  }
  
  // ===== STEP 2.2.2: Create User Message for Display =====
  const textParts = parts.filter(p => p.text).map(p => p.text).join(' ')
  const userMessageId = `user-${uuidv4()}`  // e.g., "user-abc123"
  
  const userMessage: AgentMessage = {
    id: userMessageId,
    content: "What's my net worth?",
    sender: 'user',
    timestamp: new Date().toISOString(),  // "2025-01-16T12:00:00.000Z"
    status: 'sending',
  }
  
  // ===== STEP 2.2.3: Update State - Add User Message =====
  set(state => ({ 
    messages: [...state.messages, userMessage],  // Add to array
    isLoading: true,    // Show loading spinner
    isProcessing: true, // Block new inputs
    error: null         // Clear errors
  }))
  
  // ===== UI UPDATES HERE - React re-renders =====
  // User sees their message bubble with "sending" status
  
  // ===== STEP 2.2.4: Session Management =====
  let currentSessionId = sessionId
  
  if (!currentSessionId) {
    console.log('📝 Creating new session...')
    
    try {
      // Call API client to create session
      const session = await apiClient.createSession(
        API_CONFIG.appName,  // "banking_agent"
        userId               // "user-001"
      )
      currentSessionId = session.id  // "session-xyz789"
      set({ sessionId: currentSessionId })
      console.log('✅ Session created:', currentSessionId)
      
    } catch (sessionError) {
      console.error('❌ Session creation failed:', sessionError)
      set({ sessionId: null })
      throw new Error('Failed to create session...')
    }
  }
  
  // ===== STEP 2.2.5: Update User Message Status =====
  updateMessage(userMessageId, { status: 'sent' })
  
  // ===== UI UPDATES HERE - User message shows checkmark =====
  
  // ===== STEP 2.2.6: Create Agent Message Placeholder =====
  const agentMessageId = `agent-${Date.now()}`  // "agent-1737028800000"
  
  const initialAgentMessage: AgentMessage = {
    id: agentMessageId,
    content: 'Thinking...',
    sender: 'agent',
    timestamp: new Date().toISOString(),
    status: 'sending',
  }
  
  // Add placeholder
  set((state) => ({
    messages: [...state.messages, initialAgentMessage],
  }))
  
  // ===== UI UPDATES HERE - Shows "Thinking..." bubble =====
  
  // ===== STEP 2.2.7: Initialize Event Tracking =====
  const seenToolCallIds = new Set<string>()
  const seenToolResponseIds = new Set<string>()
  const seenTextParts = new Set<string>()
  let cumulativeText = ''
  let cumulativeImages: string[] = []
  let hasFinalText = false
  
  // ===== STEP 2.2.8: Start SSE Stream =====
  console.log('🌊 STARTING SSE STREAM')
  
  await sseClient.sendMessageSSE(
    // Request object
    {
      appName: API_CONFIG.appName,      // "banking_agent"
      userId,                           // "user-001"
      sessionId: currentSessionId,      // "session-xyz789"
      newMessage: { 
        parts,                          // [{ text: "What's my net worth?" }]
        role: 'user' 
      },
      streaming: true,
    },
    
    // ===== CALLBACK 1: onEvent (called for EACH event) =====
    (event) => {
      console.log('⚡ EVENT RECEIVED AT', new Date().toISOString())
      
      // Process this single event
      const partialProcessor = new AgentResponseProcessor()
      const partialProcessed = partialProcessor.process([event], true)
      
      // Extract tool calls
      if (partialProcessed.toolActivity?.calls) {
        for (const call of partialProcessed.toolActivity.calls) {
          const callKey = call.id || `${call.name}-${JSON.stringify(call.args)}`
          if (!seenToolCallIds.has(callKey)) {
            seenToolCallIds.add(callKey)
            const timelineEvent = formatFunctionCallEvent(call.name, call.args, call.id)
            get().addMessageEvent(agentMessageId, timelineEvent)
          }
        }
      }
      
      // Extract tool responses
      if (partialProcessed.toolActivity?.responses) {
        for (const response of partialProcessed.toolActivity.responses) {
          const responseKey = response.id || response.name
          if (!seenToolResponseIds.has(responseKey)) {
            seenToolResponseIds.add(responseKey)
            const timelineEvent = formatFunctionResponseEvent(response.name, response.result, response.id)
            get().addMessageEvent(agentMessageId, timelineEvent)
          }
        }
      }
      
      // Extract code execution
      if (partialProcessed.codeActivity?.executions) {
        for (const exec of partialProcessed.codeActivity.executions) {
          const timelineEvent = formatCodeExecutionEvent(exec.code, exec.language, exec.result)
          get().addMessageEvent(agentMessageId, timelineEvent)
        }
      }
      
      // Extract images
      if (partialProcessed.artifacts?.images) {
        for (const img of partialProcessed.artifacts.images) {
          if (!cumulativeImages.includes(img)) {
            cumulativeImages.push(img)
          }
        }
      }
      
      // Extract text
      if (partialProcessed.textContent && partialProcessed.textContent.trim()) {
        const newText = partialProcessed.textContent.trim()
        if (!cumulativeText.includes(newText)) {
          hasFinalText = true
          cumulativeText = newText
          console.log('⏱️ New text content:', newText.length, 'chars')
        }
      }
      
      // Update message display
      const updatedMessage: Partial<AgentMessage> = {
        content: hasFinalText ? cumulativeText : 'Working on your request...',
        hasVisualization: cumulativeImages.length > 0,
        artifactImageUrl: cumulativeImages[0],
        status: 'sending',
      }
      
      updateMessage(agentMessageId, updatedMessage)
      
      // ===== UI UPDATES HERE - Message content updates =====
      // ===== UI UPDATES HERE - Timeline shows new events =====
    },
    
    // ===== CALLBACK 2: onComplete (called when done) =====
    () => {
      console.log('✅ SSE STREAM COMPLETED')
      updateMessage(agentMessageId, { status: 'sent' })
      set({ isLoading: false, isProcessing: false })
      
      // ===== UI UPDATES HERE - Loading spinner removed =====
    },
    
    // ===== CALLBACK 3: onError (called on failure) =====
    (error) => {
      console.error('❌ SSE stream error:', error.message)
      throw error
    }
  )
  
  // Control passes to SSE client...
}
```

**Result**: 
- User message added to UI
- Agent placeholder added with "Thinking..."
- SSE stream started
- Callbacks registered for events

---

## 📍 **Phase 3: SSE Client (Network Layer)**

### **File**: `/front-end/app/src/utils/agent-sse-client.ts`

#### **Step 3.1: sendMessageSSE() - Initiate Stream**
```typescript
// Lines 13-167: agent-sse-client.ts
async sendMessageSSE(
  request: AgentRunRequest,
  onEvent: (event: AgentRunResponseEvent) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): Promise<void> {
  
  const { appName, userId, sessionId, newMessage, stateDelta } = request
  
  // ===== STEP 3.1.1: Create Abort Controller =====
  this.controller = new AbortController()
  
  // ===== STEP 3.1.2: Build Request URL =====
  const url = getApiUrl('/run_sse')  // Returns: "/api/run_sse"
  
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
  
  console.log('🌊 Opening SSE stream...')
  console.log('URL:', url)
  console.log('Body:', JSON.stringify(requestBody, null, 2))
  
  // ===== STEP 3.1.3: Send HTTP Request =====
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',  // SSE format
      },
      body: JSON.stringify(requestBody),
      signal: this.controller.signal,
    })
    
    // ===== STEP 3.1.4: Check Response Status =====
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`SSE stream failed: ${response.status} ${response.statusText}`)
    }
    
    if (!response.body) {
      throw new Error('Response body is null')
    }
    
    // ===== STEP 3.1.5: Read Stream =====
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventCount = 0
    const streamStartTime = Date.now()
    
    console.log('🌊 SSE CLIENT: Stream started at', new Date().toISOString())
    
    while (true) {
      // Read chunk from stream
      const { done, value } = await reader.read()
      
      if (done) {
        const totalDuration = Date.now() - streamStartTime
        console.log(`✅ SSE stream completed in ${totalDuration}ms`)
        console.log(`Total events: ${eventCount}`)
        onComplete()  // ← Call store's onComplete callback
        break
      }
      
      // Chunk arrived!
      const chunkTime = Date.now() - streamStartTime
      console.log(`📦 CHUNK #${eventCount + 1} at +${chunkTime}ms (${value.length} bytes)`)
      
      // Decode bytes → string
      buffer += decoder.decode(value, { stream: true })
      
      // ===== STEP 3.1.6: Parse SSE Events =====
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''  // Keep incomplete line
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
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
            
            // ===== CRITICAL: Call onEvent callback =====
            const handlerStartTime = Date.now()
            onEvent(event)  // ← Goes back to store's callback
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
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('⚠️ SSE stream aborted by user')
      } else {
        console.error('❌ SSE stream error:', error.message)
        onError(error)  // ← Call store's onError callback
      }
    }
  } finally {
    this.controller = null
  }
}
```

**Result**: 
- HTTP POST sent to `/api/run_sse`
- Stream reader established
- Events parsed and callbacks invoked

---

## 📍 **Phase 4: Next.js API Proxy**

### **File**: `/front-end/next.config.ts`

#### **Step 4.1: Rewrite Rule**
```typescript
// Lines 4-10: next.config.ts
async rewrites() {
  return [
    {
      source: '/api/:path*',           // "/api/run_sse"
      destination: 'http://localhost:8000/:path*',  // "http://localhost:8000/run_sse"
    },
  ];
}
```

**Result**: Request forwarded to ADK backend

---

## 📍 **Phase 5: ADK Backend (Python)**

### **Server**: `http://localhost:8000` (started with `adk web`)

#### **Step 5.1: ADK Web Server Receives Request**
```
POST http://localhost:8000/run_sse
Body: {
  "appName": "banking_agent",
  "userId": "user-001",
  "sessionId": "session-xyz789",
  "newMessage": {
    "parts": [{"text": "What's my net worth?"}],
    "role": "user"
  },
  "streaming": true
}
```

#### **Step 5.2: ADK Processes Request**
```python
# ADK internal processing (simplified):

1. Load banking_agent from agents/banking_agent/agent.py
2. Get session from session_service
3. Add new message to session history
4. Start agent execution:
   
   # Step 5.2.1: Root Agent Receives Message
   root_agent.run(user_message)
   
   # Step 5.2.2: Root Agent Calls transfer_to_agent
   → tool_call: { name: "transfer_to_agent", args: { agent_name: "handling" } }
   → SSE Event #1: functionCall
   
   # Step 5.2.3: Transfer Completes
   → tool_response: { name: "transfer_to_agent", response: {...} }
   → SSE Event #2: functionResponse
   
   # Step 5.2.4: Handling Agent Calls cymbal_banking_agent
   → tool_call: { name: "cymbal_banking_agent", args: { request: "..." } }
   → SSE Event #3: functionCall
   
   # Step 5.2.5: Remote A2A Agent Fetches Data
   → HTTP call to https://agent.ai-agent-bakeoff.com/
   → Returns account balances
   → tool_response: { name: "cymbal_banking_agent", response: {...} }
   → SSE Event #4: functionResponse
   
   # Step 5.2.6: Handling Agent Calls calculator
   → tool_call: { name: "calculator", args: { expression: "..." } }
   → SSE Event #5: functionCall
   
   # Step 5.2.7: Code Executor Runs Calculation
   → code_execution: { code: "...", language: "python" }
   → result: "21000"
   → tool_response: { name: "calculator", response: { result: "21000" } }
   → SSE Event #6: functionResponse
   
   # Step 5.2.8: Handling Agent Generates Response
   → Gemini generates text: "Your net worth is $21,000..."
   → SSE Event #7: text (partial)
   → SSE Event #8: text (final)

5. Stream completes
```

#### **Step 5.3: ADK Streams Events Back**
```
Connection: keep-alive
Content-Type: text/event-stream

data: {"content":{"parts":[{"functionCall":{"name":"transfer_to_agent",...}}]},"id":"event-1",...}

data: {"content":{"parts":[{"functionResponse":{"name":"transfer_to_agent",...}}]},"id":"event-2",...}

data: {"content":{"parts":[{"functionCall":{"name":"cymbal_banking_agent",...}}]},"id":"event-3",...}

data: {"content":{"parts":[{"functionResponse":{"name":"cymbal_banking_agent",...}}]},"id":"event-4",...}

data: {"content":{"parts":[{"functionCall":{"name":"calculator",...}}]},"id":"event-5",...}

data: {"content":{"parts":[{"functionResponse":{"name":"calculator",...}}]},"id":"event-6",...}

data: {"content":{"parts":[{"text":"Your net worth is $21,000..."}]},"id":"event-7",...}

data: {"content":{"parts":[{"text":"Your net worth is $21,000. Here's the breakdown:..."}]},"id":"event-8",...}
```

**Result**: SSE events sent to frontend

---

## 📍 **Phase 6: Event Processing (Utils Layer)**

### **File**: `/front-end/app/src/utils/agent-response-processor.ts`

#### **Step 6.1: Process Single Event**
```typescript
// Called from store's onEvent callback
// Lines 70-305: agent-response-processor.ts

class AgentResponseProcessor {
  process(events: AgentRunResponseEvent[], isPartial: boolean = false) {
    
    for (const event of events) {
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          
          // ===== Extract Text =====
          if (part.text && !part.thought) {
            this.textParts.push(part.text)
            console.log('💬 Found text:', part.text.substring(0, 50))
          }
          
          // ===== Extract Tool Calls =====
          if (part.functionCall) {
            this.toolCalls.push({
              name: part.functionCall.name,
              args: part.functionCall.args,
              id: part.functionCall.id,
            })
            console.log('🔧 Found tool call:', part.functionCall.name)
          }
          
          // ===== Extract Tool Responses =====
          if (part.functionResponse) {
            this.toolResponses.push({
              name: part.functionResponse.name,
              result: part.functionResponse.response,
              id: part.functionResponse.id,
            })
            console.log('✅ Found tool response:', part.functionResponse.name)
          }
          
          // ===== Extract Code Execution =====
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
          
          // ===== Extract Images =====
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
    
    // ===== Build Response Object =====
    return {
      textContent: formatAgentText(this.textParts.join('\n\n')),
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
  }
}
```

**Result**: Event parsed into structured data

---

### **File**: `/front-end/app/src/utils/event-formatter.ts`

#### **Step 6.2: Format Timeline Events**
```typescript
// Called from store's onEvent callback
// Lines 1-140: event-formatter.ts

export function formatFunctionCallEvent(
  toolName: string,
  args?: any,
  id?: string
): ProcessedEvent {
  
  const argsCount = args ? Object.keys(args).length : 0
  
  return {
    title: `🔧 ${toTitleCase(toolName)} (${argsCount} parameter${argsCount > 1 ? 's' : ''})`,
    data: {
      type: 'functionCall',
      name: toolName,
      args,
    },
    timestamp: new Date().toISOString(),
  }
}

export function formatFunctionResponseEvent(
  toolName: string,
  result?: any,
  id?: string
): ProcessedEvent {
  
  return {
    title: `✅ ${toTitleCase(toolName)} completed`,
    data: {
      type: 'functionResponse',
      name: toolName,
      response: result,
    },
    timestamp: new Date().toISOString(),
  }
}
```

**Result**: Timeline events formatted for UI

---

## 📍 **Phase 7: State Updates (Back to Zustand)**

### **File**: `/front-end/app/src/stores/useAgentStore.ts`

#### **Step 7.1: addMessageEvent() - Add to Timeline**
```typescript
// Lines 132-142: useAgentStore.ts
addMessageEvent: (messageId, event) => {
  set((state) => {
    // Clone the Map (immutable update)
    const newMap = new Map(state.messageEvents)
    
    // Get existing events for this message
    const existingEvents = newMap.get(messageId) || []
    
    // Add new event
    newMap.set(messageId, [...existingEvents, event])
    
    console.log(`⏱️ Added event to timeline: ${event.title}`)
    
    // Return new state
    return { messageEvents: newMap }
  })
  
  // ===== TRIGGERS REACT RE-RENDER =====
  // Any component subscribed to messageEvents will update
}
```

#### **Step 7.2: updateMessage() - Update Message Content**
```typescript
// Lines 121-127: useAgentStore.ts
updateMessage: (id, updates) => {
  set((state) => ({
    messages: state.messages.map((m) =>
      m.id === id ? { ...m, ...updates } : m
    ),
  }))
  
  // ===== TRIGGERS REACT RE-RENDER =====
  // page.tsx will re-render with updated message
}
```

**Result**: State updated, React re-renders

---

## 📍 **Phase 8: UI Updates (React Layer)**

### **File**: `/front-end/app/page.tsx`

#### **Step 8.1: Component Re-renders**
```tsx
// Lines 36-49: page.tsx
export default function BankingAIChat() {
  
  // ===== ZUSTAND SUBSCRIPTIONS =====
  const { 
    messages,       // Subscribed - re-render on change
    isLoading,      // Subscribed - re-render on change
    sendMessage,
    // ...
  } = useAgentStore()
  
  // ===== CRITICAL: Subscribe to messageEvents =====
  const messageEvents = useAgentStore(state => state.messageEvents)
  // Without this, EventTimeline won't update!
  
  // When messageEvents Map changes, this component re-renders
  
  return (
    <div>
      {/* Render messages */}
      {messages.map((message) => (
        <div key={message.id}>
          
          {/* ===== STEP 8.1.1: Render Message Content ===== */}
          <MessageContent 
            content={message.content}  // "Your net worth is $21,000..."
            isUser={message.sender === 'user'}
          />
          
          {/* ===== STEP 8.1.2: Render Event Timeline ===== */}
          {message.sender === 'agent' && (() => {
            const events = messageEvents.get(message.id) || []
            return events.length > 0 ? <EventTimeline events={events} /> : null
          })()}
          
          {/* ===== STEP 8.1.3: Render Chart/Artifact ===== */}
          {message.hasVisualization && message.artifactImageUrl && (
            <img src={message.artifactImageUrl} alt="Chart" />
          )}
          
        </div>
      ))}
      
      {/* Loading spinner */}
      {isLoading && <LoadingSpinner />}
    </div>
  )
}
```

**Result**: UI displays updated message with timeline

---

### **File**: `/front-end/components/MessageContent.tsx`

#### **Step 8.2: Render Markdown**
```tsx
// Lines 1-56: MessageContent.tsx
export const MessageContent: React.FC<MessageContentProps> = ({ content, isUser }) => {
  return (
    <ReactMarkdown
      className="prose"
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} />,
        strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
        // ... more customization
      }}
    >
      {content}  {/* "Your net worth is $21,000..." */}
    </ReactMarkdown>
  )
}
```

**Result**: Formatted text displayed

---

### **File**: `/front-end/components/EventTimeline.tsx`

#### **Step 8.3: Render Timeline**
```tsx
// Lines 1-166: EventTimeline.tsx
const EventTimeline: React.FC<EventTimelineProps> = ({ events }) => {
  
  const [isExpanded, setIsExpanded] = useState(true)
  
  return (
    <div className="timeline-container">
      
      {/* Collapse/Expand Button */}
      <button onClick={() => setIsExpanded(!isExpanded)}>
        ⚡ Agent Activity ({events.length} steps)
      </button>
      
      {/* Timeline Items */}
      {isExpanded && (
        <ul>
          {events.map((event, index) => (
            <li key={index}>
              <EventItem event={event} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const EventItem: React.FC<EventItemProps> = ({ event }) => {
  
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  
  return (
    <div>
      {/* Icon based on event type */}
      <span className={getIconColor(event.data.type)}>
        {getIcon(event.data.type)}  {/* 🔧 or ✅ or 💻 */}
      </span>
      
      {/* Event title */}
      <span>{event.title}</span>  {/* "🔧 Calculator (2 parameters)" */}
      
      {/* Timestamp */}
      <span>{formatTime(event.timestamp)}</span>  {/* "12:00:03.120" */}
      
      {/* Expandable details */}
      {detailsExpanded && (
        <pre>{JSON.stringify(event.data.args, null, 2)}</pre>
      )}
    </div>
  )
}
```

**Result**: Timeline displayed with all events

---

## 🎬 **Complete Flow Summary**

```
USER TYPES "What's my net worth?"
  ↓
page.tsx → handleSendMessage()
  ↓
useAgentStore → sendMessage()
  ↓
useAgentStore → sendMultipartMessage()
  ├─ Create user message → State update → React re-render
  ├─ Create session (if needed) → API call
  ├─ Create agent placeholder → State update → React re-render
  └─ Start SSE stream
      ↓
agent-sse-client.ts → sendMessageSSE()
  ├─ POST /api/run_sse
  └─ Read stream chunk by chunk
      ↓
next.config.ts → Rewrite to localhost:8000/run_sse
      ↓
ADK Backend (Python)
  ├─ Load banking_agent
  ├─ Execute agent flow
  │   ├─ transfer_to_agent → Stream event #1-2
  │   ├─ cymbal_banking_agent → Stream event #3-4
  │   ├─ calculator → Stream event #5-6
  │   └─ Generate text → Stream event #7-8
  └─ Close stream
      ↓
agent-sse-client.ts
  └─ For each event:
      ├─ Parse JSON
      └─ Call onEvent(event) callback
          ↓
useAgentStore → onEvent callback
  ├─ Process event (agent-response-processor.ts)
  ├─ Format timeline event (event-formatter.ts)
  ├─ Add to messageEvents Map → State update → React re-render
  └─ Update message content → State update → React re-render
          ↓
page.tsx → Subscribed to state changes
  ├─ Re-render with new message content
  └─ Re-render with new timeline events
          ↓
MessageContent.tsx → Render markdown text
EventTimeline.tsx → Render timeline with events
          ↓
USER SEES FINAL RESPONSE
```

---

## 🐛 **Common Issues & Where They Occur**

| Issue | Location | Root Cause |
|-------|----------|------------|
| **Events not displaying** | `page.tsx` line 49 | Missing `messageEvents` subscription |
| **All events at once** | `agent-sse-client.ts` | ADK backend buffering (expected) |
| **Duplicate events** | `useAgentStore.ts` lines 267-338 | Missing deduplication Sets |
| **No text content** | `agent-response-processor.ts` | Filtering out thought parts |
| **Charts not showing** | `base64.ts` | Base64 encoding issues |
| **Session errors** | `useAgentStore.ts` line 224 | Stale session in localStorage |

---

## 🔍 **Debugging Checklist**

1. ✅ **Frontend server running**: `lsof -i :3000`
2. ✅ **Backend server running**: `lsof -i :8000`
3. ✅ **Browser console**: Check for SSE logs
4. ✅ **Network tab**: Filter `run_sse`, check EventStream
5. ✅ **React DevTools**: Check `messageEvents` Map
6. ✅ **Backend terminal**: Check ADK processing logs

---

**This document traces EVERY function call in your system!** Use it to debug exactly where your issue is occurring.

