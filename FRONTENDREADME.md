# Frontend Architecture Documentation

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Data Flow](#data-flow)
4. [File Structure](#file-structure)
5. [Core Components](#core-components)
6. [Utilities](#utilities)
7. [State Management](#state-management)
8. [API Communication](#api-communication)
9. [Event Processing](#event-processing)
10. [UI Components](#ui-components)
11. [Complete Request-Response Cycle](#complete-request-response-cycle)

---

## 🎯 Overview

This frontend is a **Next.js 14+ application** with TypeScript that provides a real-time chat interface for interacting with Google ADK (Agent Development Kit) agents. It features:

- ✅ **Real-time SSE streaming** for agent responses (native ADK streaming)
- ✅ **Event Timeline UI** showing agent reasoning steps
- ✅ **File attachments** support (images, documents)
- ✅ **Chart/artifact display** from ADK agents
- ✅ **Type-safe** with comprehensive TypeScript interfaces
- ✅ **Modular architecture** with clear separation of concerns

---

## ⚡ **Streaming: Real vs. Simulated**

### **IMPORTANT: This App Uses TRUE ADK Streaming**

The app connects directly to ADK's `/run_sse` endpoint, which provides **genuine Server-Sent Events (SSE) streaming**:

```
User Input → Frontend → ADK /run_sse → Events stream back as they're generated
```

**How ADK Streaming Works**:
1. 🔄 ADK receives request and starts processing
2. ⏳ Agent calls tools, executes code (2-3 seconds)
3. 📡 As each piece completes, ADK streams it immediately
4. 🎨 Frontend receives and displays events in real-time
5. ✅ User sees progress as it happens

**Characteristics**:
- ✅ **TRUE streaming**: Events arrive as work completes
- ⚠️ **Backend-buffered**: ADK processes before streaming (not true incremental)
- ✅ **No artificial delays**: Events arrive when ready
- ✅ **Lower latency**: Faster than batch + simulate

**NOT Simulated**: The custom `/run_sse_custom` proxy endpoint (in `/api/run_sse_custom/route.ts`) was created for testing but is **NOT currently used**. The app connects directly to ADK's native streaming endpoint.

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                             │
│                          (page.tsx)                                   │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐                 │
│  │  Input     │  │  Message    │  │  Event       │                 │
│  │  Field     │  │  Bubbles    │  │  Timeline    │                 │
│  └─────┬──────┘  └──────▲──────┘  └──────▲───────┘                 │
└────────┼────────────────┼─────────────────┼─────────────────────────┘
         │                │                 │
         ▼                │                 │
┌─────────────────────────┼─────────────────┼─────────────────────────┐
│                    STATE MANAGEMENT                                  │
│                   (useAgentStore.ts)                                 │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  • messages: AgentMessage[]                          │           │
│  │  • messageEvents: Map<string, ProcessedEvent[]>      │           │
│  │  • sendMessage()                                     │           │
│  │  • addMessageEvent()                                 │           │
│  └──────────────┬───────────────────────▲───────────────┘           │
└─────────────────┼───────────────────────┼─────────────────────────┘
                  │                       │
                  │ Send Request          │ Receive Events
                  ▼                       │
┌─────────────────────────────────────────┼─────────────────────────┐
│                   API LAYER (utils/)    │                          │
│  ┌─────────────────┐  ┌────────────────┴──────────────┐           │
│  │ AgentAPIClient  │  │    AgentSSEClient             │           │
│  │ • createSession │  │    • sendMessageSSE()         │           │
│  │ • sendMessage   │  │    • Real-time event stream   │           │
│  └────────┬────────┘  └────────────────┬──────────────┘           │
└───────────┼─────────────────────────────┼─────────────────────────┘
            │                             │
            │ HTTP POST                   │ SSE Events
            ▼                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              NEXT.JS API ROUTE (Middleware Proxy)                    │
│                  /api/run_sse_custom/route.ts                        │
│  ┌───────────────────────────────────────────────────────┐          │
│  │  • Receives SSE request from frontend                 │          │
│  │  • Forwards to ADK backend                            │          │
│  │  • Streams events back incrementally (50ms delay)     │          │
│  └────────────────────┬──────────────────▲───────────────┘          │
└─────────────────────┼──────────────────┼─────────────────────────┘
                      │                  │
                      │ HTTP POST        │ JSON Response
                      ▼                  │
┌─────────────────────────────────────────────────────────────────────┐
│                     ADK BACKEND (Python)                             │
│                    localhost:8000/run                                │
│  ┌───────────────────────────────────────────────────────┐          │
│  │  • Processes agent request                            │          │
│  │  • Executes tools, code, sub-agents                   │          │
│  │  • Returns array of events                            │          │
│  └───────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### **User Sends Message → Agent Responds**

```
1. USER TYPES MESSAGE in Input Field (page.tsx)
   ↓
2. PAGE calls sendMessage() from useAgentStore
   ↓
3. STORE creates user message, adds to messages array
   ↓
4. STORE calls AgentSSEClient.sendMessageSSE()
   ↓
5. SSE CLIENT sends POST to /api/run_sse_custom
   ↓
6. NEXT.JS API ROUTE forwards to ADK at localhost:8000/run
   ↓
7. ADK BACKEND processes request (tools, agents, code)
   ↓
8. ADK returns JSON array of events
   ↓
9. NEXT.JS API ROUTE streams events back (50ms apart)
   ↓
10. SSE CLIENT receives events one-by-one
    ↓
11. SSE CLIENT calls onEvent() callback for each event
    ↓
12. STORE processes each event with AgentResponseProcessor
    ↓
13. STORE adds tool calls/responses to messageEvents Map
    ↓
14. STORE accumulates text content and updates message
    ↓
15. REACT re-renders when messageEvents Map changes
    ↓
16. PAGE displays updated message + EventTimeline
    ↓
17. USER sees agent response with reasoning steps
```

---

## 📁 File Structure

```
adk-bricks-bakeoff/front-end/
├── app/
│   ├── page.tsx                          # Main chat UI
│   ├── layout.tsx                        # Root layout
│   ├── globals.css                       # Global styles
│   │
│   ├── api/                              # Next.js API routes
│   │   └── run_sse_custom/
│   │       ├── route.ts                  # SSE proxy endpoint
│   │       └── json-fragment-processor.ts # Stream parser (unused)
│   │
│   └── src/
│       ├── config/
│       │   └── route.ts                  # API config & helpers
│       │
│       ├── types/
│       │   └── agent.ts                  # TypeScript interfaces
│       │
│       ├── stores/
│       │   └── useAgentStore.ts          # Zustand state management
│       │
│       └── utils/
│           ├── agent-api-client.ts       # HTTP API client
│           ├── agent-sse-client.ts       # SSE streaming client
│           ├── agent-response-processor.ts # Event parser
│           ├── event-formatter.ts        # Timeline event formatter
│           ├── text-formatter.ts         # Text cleaning utils
│           └── base64.ts                 # Image processing
│
├── components/
│   ├── ui/                               # shadcn/ui components
│   ├── EventTimeline.tsx                 # Collapsible event timeline
│   ├── MessageContent.tsx                # Markdown renderer
│   └── ToolActivity.tsx                  # Legacy (unused)
│
└── next.config.ts                        # Next.js config (API proxy)
```

---

## 🧩 Core Components

### **1. page.tsx** - Main Chat Interface

**Purpose**: Root UI component that renders the chat interface

**Key Responsibilities**:
- Render message bubbles
- Handle user input
- Display event timeline for each message
- Show loading states
- Manage file attachments
- Auto-scroll to bottom

**Important Sections**:

```tsx
// Lines 36-49: Connect to Zustand store
const { 
  messages,        // All chat messages
  isLoading,       // Agent is processing
  sendMessage,     // Send text + files
  // ...
} = useAgentStore()

// Lines 48-49: Subscribe to messageEvents to trigger re-renders
const messageEvents = useAgentStore(state => state.messageEvents)

// Lines 89-100: Handle sending message
const handleSendMessage = async () => {
  // Send message with optional file attachments
  await sendMessage(messageToSend, selectedFiles)
}

// Lines 198-274: Render each message
messages.map((message) => (
  <div key={message.id}>
    {/* Message bubble with markdown content */}
    <MessageContent content={message.content} />
    
    {/* Event timeline showing agent reasoning */}
    {message.sender === 'agent' && (
      <EventTimeline events={messageEvents.get(message.id) || []} />
    )}
    
    {/* Chart/artifact display */}
    {message.hasVisualization && (
      <img src={message.artifactImageUrl} />
    )}
  </div>
))
```

**Key Insight**: 
- `page.tsx` is a **pure UI component** - it doesn't handle API logic
- All state/logic is in `useAgentStore`
- Re-renders happen when `messages` or `messageEvents` change

---

### **2. useAgentStore.ts** - State Management

**Purpose**: Centralized state management using Zustand

**Key State**:

```typescript
interface AgentState {
  // Messages displayed in chat
  messages: AgentMessage[]
  
  // Event timeline for each message (NEW!)
  // Maps message ID → array of events (tool calls, etc.)
  messageEvents: Map<string, ProcessedEvent[]>
  
  // Loading states
  isLoading: boolean      // Waiting for response
  isProcessing: boolean   // Processing events
  
  // User info
  userId: string
  sessionId: string | null
  
  // Actions (functions)
  sendMessage(text, files): Promise<void>
  addMessageEvent(messageId, event): void
  // ...
}
```

**Key Actions**:

#### **sendMessage()** (Lines 155-189)
Converts user input → MessagePart array

```typescript
sendMessage: async (message: string, attachments?: File[]) => {
  const parts: MessagePart[] = []
  
  // Add text
  if (message.trim()) {
    parts.push({ text: message })
  }
  
  // Add file attachments
  if (attachments) {
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
  
  // Send to ADK
  await sendMultipartMessage(parts)
}
```

#### **sendMultipartMessage()** (Lines 196-422)
Main communication method - handles entire request/response cycle

```typescript
sendMultipartMessage: async (parts: MessagePart[]) => {
  // 1. Create user message for display
  const userMessage = {
    id: `user-${uuidv4()}`,
    content: textParts,
    sender: 'user',
    // ...
  }
  set(state => ({ messages: [...state.messages, userMessage] }))
  
  // 2. Create/get session
  if (!sessionId) {
    const session = await apiClient.createSession(appName, userId)
    set({ sessionId: session.id })
  }
  
  // 3. Create placeholder agent message
  const agentMessageId = `agent-${Date.now()}`
  const placeholder = {
    id: agentMessageId,
    content: 'Thinking...',
    sender: 'agent',
    // ...
  }
  set(state => ({ messages: [...state.messages, placeholder] }))
  
  // 4. Start SSE stream
  await sseClient.sendMessageSSE(
    { appName, userId, sessionId, newMessage: { parts }, streaming: true },
    
    // onEvent callback - called for EACH event
    (event) => {
      // Process event
      const processed = new AgentResponseProcessor().process([event], true)
      
      // Add tool calls to timeline
      if (processed.toolActivity?.calls) {
        for (const call of processed.toolActivity.calls) {
          const timelineEvent = formatFunctionCallEvent(call.name, call.args)
          addMessageEvent(agentMessageId, timelineEvent)
        }
      }
      
      // Add tool responses to timeline
      if (processed.toolActivity?.responses) {
        for (const response of processed.toolActivity.responses) {
          const timelineEvent = formatFunctionResponseEvent(response.name, response.result)
          addMessageEvent(agentMessageId, timelineEvent)
        }
      }
      
      // Accumulate text content
      if (processed.textContent) {
        cumulativeText = processed.textContent
      }
      
      // Update message display
      updateMessage(agentMessageId, {
        content: cumulativeText || 'Working...',
        hasVisualization: processed.artifacts?.images?.length > 0,
        artifactImageUrl: processed.artifacts?.images[0],
      })
    },
    
    // onComplete callback
    () => {
      updateMessage(agentMessageId, { status: 'sent' })
      set({ isLoading: false })
    },
    
    // onError callback
    (error) => {
      console.error('SSE error:', error)
    }
  )
}
```

#### **addMessageEvent()** (Lines 132-142)
Adds an event to a message's timeline

```typescript
addMessageEvent: (messageId, event) => {
  set((state) => {
    const newMap = new Map(state.messageEvents)
    const existingEvents = newMap.get(messageId) || []
    newMap.set(messageId, [...existingEvents, event])
    return { messageEvents: newMap }
  })
}
```

**Key Insight**:
- **Event Timeline Pattern**: Tool calls/responses are stored separately in `messageEvents` Map
- Message content only contains final text + images
- This allows incremental display of reasoning steps

---

## 🛠️ Utilities

### **1. agent-api-client.ts** - HTTP API Client

**Purpose**: Encapsulates all HTTP requests to ADK backend

**Key Methods**:

```typescript
class AgentAPIClient {
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }
  
  // Create a new session
  async createSession(appName: string, userId: string): Promise<Session> {
    const url = `${this.baseUrl}/apps/${appName}/users/${userId}/sessions`
    const response = await fetch(url, { method: 'POST' })
    return await response.json()
  }
  
  // Send message (non-streaming, returns all events at once)
  async sendMessage(request: AgentRunRequest): Promise<AgentRunResponseEvent[]> {
    const url = getApiUrl('/run')
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName: request.appName,
        userId: request.userId,
        sessionId: request.sessionId,
        newMessage: request.newMessage,
        streaming: false,
      })
    })
    return await response.json()
  }
}
```

**Usage**: Currently used for session creation only (SSE client handles messages)

---

### **2. agent-sse-client.ts** - SSE Streaming Client

**Purpose**: Handles Server-Sent Events (SSE) streaming for real-time updates

**Key Method**:

```typescript
class AgentSSEClient {
  async sendMessageSSE(
    request: AgentRunRequest,
    onEvent: (event: AgentRunResponseEvent) => void,  // Called for each event
    onComplete: () => void,                           // Called when done
    onError: (error: Error) => void                   // Called on error
  ): Promise<void> {
    // Use custom endpoint that streams events incrementally
    const url = getApiUrl('/run_sse_custom')
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',  // SSE format
      },
      body: JSON.stringify({
        appName, userId, sessionId, newMessage, streaming: true
      }),
    })
    
    // Read SSE stream
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        onComplete()
        break
      }
      
      buffer += decoder.decode(value, { stream: true })
      
      // Process complete SSE events
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonData = line.substring(6)
          const event: AgentRunResponseEvent = JSON.parse(jsonData)
          
          // Call callback immediately
          onEvent(event)
        }
      }
    }
  }
}
```

**Key Insight**:
- Reads stream chunk-by-chunk
- Calls `onEvent()` callback **immediately** for each event
- Enables real-time UI updates as events arrive

---

### **3. agent-response-processor.ts** - Event Parser

**Purpose**: Parses raw ADK events into structured UI-friendly data

**Key Method**:

```typescript
class AgentResponseProcessor {
  process(
    events: AgentRunResponseEvent[],
    isPartial: boolean = false
  ): ProcessedAgentResponse {
    // Parse each event
    for (const event of events) {
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          // Extract text
          if (part.text && !part.thought) {
            this.textParts.push(part.text)
          }
          
          // Extract tool calls
          if (part.functionCall) {
            this.toolCalls.push({
              name: part.functionCall.name,
              args: part.functionCall.args,
              id: part.functionCall.id,
            })
          }
          
          // Extract tool responses
          if (part.functionResponse) {
            this.toolResponses.push({
              name: part.functionResponse.name,
              result: part.functionResponse.response,
              id: part.functionResponse.id,
            })
          }
          
          // Extract code execution
          if (part.executableCode) {
            this.codeExecutions.push({
              code: part.executableCode.code,
              language: part.executableCode.language,
            })
          }
          
          // Extract images (charts/artifacts)
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            const imageUrl = processBase64Image(part.inlineData)
            this.imageUrls.push(imageUrl)
          }
        }
      }
    }
    
    // Build structured response
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

**Key Insight**:
- Processes multiple event types (text, tool calls, images, code)
- Separates concerns: text content vs. activity timeline
- Handles deduplication (same event sent multiple times)

---

### **4. event-formatter.ts** - Timeline Event Formatter

**Purpose**: Converts tool calls/responses into `ProcessedEvent` format for timeline display

**Key Functions**:

```typescript
// Format a tool call as a timeline event
export function formatFunctionCallEvent(
  toolName: string, 
  args?: any, 
  id?: string
): ProcessedEvent {
  const argsCount = args ? Object.keys(args).length : 0
  return {
    title: `🔧 ${toTitleCase(toolName)} (${argsCount} parameters)`,
    data: {
      type: 'functionCall',
      name: toolName,
      args,
    },
    timestamp: new Date().toISOString(),
  }
}

// Format a tool response as a timeline event
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

// Format code execution as a timeline event
export function formatCodeExecutionEvent(
  code: string, 
  language: string, 
  result?: string
): ProcessedEvent {
  return {
    title: `💻 Executing ${language || 'code'}`,
    data: {
      type: 'codeExecution',
      code,
      language,
      result,
    },
    timestamp: new Date().toISOString(),
  }
}
```

**Key Insight**:
- Creates consistent event structure for timeline display
- Adds icons and formatting for better UX
- Timestamp allows sorting/ordering

---

### **5. text-formatter.ts** - Text Cleaning Utils

**Purpose**: Cleans and formats agent text for display

**Key Functions**:

```typescript
// Clean up agent text (remove extra whitespace, add paragraph breaks)
export function formatAgentText(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n\n')  // Double newline for paragraph breaks
    .trim()
}

// Format tool call description
export function formatToolCall(toolName: string, args?: any): string {
  const argsCount = args ? Object.keys(args).length : 0
  return argsCount > 0 
    ? `Using tool: *${toolName}* (${argsCount} parameter${argsCount > 1 ? 's' : ''})`
    : `Using tool: *${toolName}*`
}

// Format tool response description
export function formatToolResponse(toolName: string, result?: any): string {
  return `Tool completed: *${toolName}*`
}
```

---

### **6. base64.ts** - Image Processing

**Purpose**: Converts Base64 encoded images to displayable URLs

**Key Functions**:

```typescript
// Process Base64 image data from ADK
export function processBase64Image(inlineData: InlineData): string | null {
  try {
    let base64Data = inlineData.data.replace(/\s/g, '')
    
    // Handle Base64URL encoding (- and _ instead of + and /)
    if (base64Data.includes('-') || base64Data.includes('_')) {
      base64Data = base64Data
        .replace(/-/g, '+')
        .replace(/_/g, '/')
      
      // Add padding if needed
      const padding = base64Data.length % 4
      if (padding !== 0) {
        base64Data += '='.repeat(4 - padding)
      }
    }
    
    // Handle URL encoding
    if (base64Data.includes('%')) {
      base64Data = decodeURIComponent(base64Data)
    }
    
    // Create Blob URL (more reliable than data URLs)
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: inlineData.mimeType })
    
    return URL.createObjectURL(blob)
    
  } catch (error) {
    console.error('Failed to process Base64 image:', error)
    return null
  }
}
```

**Key Insight**:
- Handles various Base64 encoding formats (standard, URL-safe)
- Uses Blob URLs for better performance
- Graceful error handling

---

## 📡 API Communication

### **Next.js API Route: /api/run_sse_custom/route.ts**

**Purpose**: Middleware proxy that enables incremental SSE streaming

**Why it exists**:
- ADK backend returns all events at once (batch mode)
- Frontend expects real-time incremental streaming
- This route bridges the gap by streaming events with delays

**How it works**:

```typescript
export async function POST(request: NextRequest) {
  // 1. Parse frontend request
  const { appName, userId, sessionId, newMessage } = await request.json()
  
  // 2. Forward to ADK backend
  const adkResponse = await fetch('http://localhost:8000/run', {
    method: 'POST',
    body: JSON.stringify({
      appName, userId, sessionId, newMessage, streaming: false
    })
  })
  
  // 3. Get all events from ADK
  const eventsJson = await adkResponse.json()
  const events = Array.isArray(eventsJson) ? eventsJson : [eventsJson]
  
  // 4. Stream events back incrementally
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      
      // Stream each event with 50ms delay
      for (let i = 0; i < events.length; i++) {
        const sseEvent = `data: ${JSON.stringify(events[i])}\n\n`
        controller.enqueue(encoder.encode(sseEvent))
        
        // Delay between events
        if (i < events.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
      
      controller.close()
    }
  })
  
  // 5. Return SSE stream
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
```

**Flow**:
```
Frontend → POST /api/run_sse_custom → Proxy → POST localhost:8000/run
                                         ↓
                                    Get all events
                                         ↓
                                    Stream back with delays
                                         ↓
Frontend ← SSE event #1 (t=0ms)
Frontend ← SSE event #2 (t=50ms)
Frontend ← SSE event #3 (t=100ms)
...
```

**Key Insight**:
- Simulates real-time streaming from a batch response
- 50ms delay creates smooth incremental UI updates
- Handles errors gracefully

---

### **next.config.ts** - API Proxy Configuration

**Purpose**: Proxies `/api/*` requests to ADK backend

```typescript
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/:path*', // ADK server
      },
    ]
  },
}
```

**Why**:
- Avoids CORS issues
- Single origin for frontend and backend
- `/api/run` → `http://localhost:8000/run`

---

## 🎨 UI Components

### **1. EventTimeline.tsx** - Collapsible Event Timeline

**Purpose**: Displays agent reasoning steps (tool calls, code execution)

**Structure**:

```tsx
<EventTimeline events={events} />
  ↓
  <div className="collapsible-container">
    <button onClick={toggleExpanded}>
      ⚡ Agent Activity ({events.length} steps)
    </button>
    
    {isExpanded && (
      <ul className="timeline">
        {events.map(event => (
          <EventItem event={event} />
        ))}
      </ul>
    )}
  </div>

<EventItem event={event} />
  ↓
  <div className="timeline-item">
    <Icon type={event.data.type} />  {/* 🔧 ✅ 💻 */}
    <span>{event.title}</span>
    <span>{formatTime(event.timestamp)}</span>
    
    {/* Expandable details */}
    <button onClick={toggleDetails}>...</button>
    {detailsExpanded && (
      <pre>{JSON.stringify(event.data.args, null, 2)}</pre>
    )}
  </div>
```

**Props**:
- `events: ProcessedEvent[]` - Array of timeline events

**Features**:
- Collapsible timeline (show/hide all events)
- Each event has expandable details (args, response, code)
- Icons and colors by event type
- Millisecond-precision timestamps

---

### **2. MessageContent.tsx** - Markdown Renderer

**Purpose**: Renders agent text with markdown formatting

**Structure**:

```tsx
<MessageContent content={content} isUser={false} />
  ↓
  <ReactMarkdown
    className="prose"
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ node, ...props }) => <p className="mb-1" {...props} />,
      strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
      code: ({ node, inline, ...props }) => (
        inline 
          ? <code className="bg-gray-200 px-1 rounded" {...props} />
          : <pre className="bg-gray-800 p-2 rounded" {...props} />
      ),
    }}
  >
    {content}
  </ReactMarkdown>
```

**Features**:
- GitHub Flavored Markdown (tables, task lists)
- Custom styling for code blocks
- Optimized for chat UI

---

## 🔄 Complete Request-Response Cycle

### **Example: User asks "What's my net worth?"**

#### **Phase 1: User Input (page.tsx)**

```
1. User types "What's my net worth?" in input field
2. User clicks Send button
3. page.tsx calls handleSendMessage()
   ↓
   sendMessage("What's my net worth?", [])
```

#### **Phase 2: State Update (useAgentStore.ts)**

```
4. useAgentStore.sendMessage() converts to MessagePart[]
   parts = [{ text: "What's my net worth?" }]

5. Store creates user message:
   {
     id: "user-1234",
     content: "What's my net worth?",
     sender: "user",
     timestamp: "2025-01-16T11:00:00.000Z",
     status: "sending"
   }

6. Store adds user message to messages array
7. React re-renders → user sees their message

8. Store calls sendMultipartMessage(parts)
```

#### **Phase 3: Session Management**

```
9. Check if sessionId exists
10. If not, call apiClient.createSession()
    POST /api/apps/banking_agent/users/user-001/sessions
    ← { id: "session-5678", ... }

11. Store saves sessionId: "session-5678"
```

#### **Phase 4: Create Placeholder Message**

```
12. Create placeholder agent message:
    {
      id: "agent-1234567890",
      content: "Thinking...",
      sender: "agent",
      timestamp: "2025-01-16T11:00:01.000Z",
      status: "sending"
    }

13. Add to messages array
14. React re-renders → user sees "Thinking..." bubble
```

#### **Phase 5: Start SSE Stream**

```
15. Call sseClient.sendMessageSSE()
    ↓
    POST /api/run_sse_custom
    Body: {
      appName: "banking_agent",
      userId: "user-001",
      sessionId: "session-5678",
      newMessage: {
        parts: [{ text: "What's my net worth?" }],
        role: "user"
      },
      streaming: true
    }
```

#### **Phase 6: API Proxy (route.ts)**

```
16. API route receives request
17. Forwards to ADK backend:
    POST http://localhost:8000/run
    Body: { appName, userId, sessionId, newMessage, streaming: false }

18. ADK processes request:
    - Calls transfer_to_agent (root → handling agent)
    - Calls cymbal_banking_agent (fetch account data)
    - Calls calculator (compute net worth)
    - Returns final text response

19. ADK returns array of 20 events:
    [
      { content: { parts: [{ functionCall: { name: "transfer_to_agent", ... } }] } },
      { content: { parts: [{ functionResponse: { name: "transfer_to_agent", ... } }] } },
      { content: { parts: [{ functionCall: { name: "cymbal_banking_agent", ... } }] } },
      { content: { parts: [{ functionResponse: { name: "cymbal_banking_agent", ... } }] } },
      { content: { parts: [{ functionCall: { name: "calculator", ... } }] } },
      { content: { parts: [{ functionResponse: { name: "calculator", ... } }] } },
      { content: { parts: [{ text: "Your net worth is $21,000..." }] } },
      // ... more events
    ]

20. API route streams events back with 50ms delays:
    data: {"content":{"parts":[{"functionCall":...}]}}\n\n  (t=0ms)
    data: {"content":{"parts":[{"functionResponse":...}]}}\n\n  (t=50ms)
    data: {"content":{"parts":[{"functionCall":...}]}}\n\n  (t=100ms)
    ...
```

#### **Phase 7: Frontend Receives Events (agent-sse-client.ts)**

```
21. SSE client reads stream chunk by chunk
22. For each complete "data: {...}\n\n" line:
    - Parse JSON
    - Call onEvent(event) callback
```

#### **Phase 8: Process Each Event (useAgentStore.ts)**

```
23. For Event #1 (transfer_to_agent call):
    a. Create AgentResponseProcessor
    b. Process event:
       processed = {
         toolActivity: {
           calls: [{ name: "transfer_to_agent", args: {...}, id: "..." }]
         }
       }
    c. Format as timeline event:
       event = {
         title: "🔧 Transfer To Agent (1 parameter)",
         data: { type: "functionCall", name: "transfer_to_agent", args: {...} },
         timestamp: "2025-01-16T11:00:01.100Z"
       }
    d. Call addMessageEvent("agent-1234567890", event)
    e. messageEvents Map updated:
       Map {
         "agent-1234567890" => [
           { title: "🔧 Transfer To Agent", ... }
         ]
       }
    f. React re-renders → EventTimeline shows new event

24. For Event #2 (transfer_to_agent response):
    a. Process event
    b. Format as timeline event:
       event = {
         title: "✅ Transfer To Agent completed",
         data: { type: "functionResponse", name: "transfer_to_agent", response: {...} },
         timestamp: "2025-01-16T11:00:01.150Z"
       }
    c. Call addMessageEvent("agent-1234567890", event)
    d. messageEvents Map updated:
       Map {
         "agent-1234567890" => [
           { title: "🔧 Transfer To Agent", ... },
           { title: "✅ Transfer To Agent completed", ... }
         ]
       }
    e. React re-renders → EventTimeline shows 2 events

25. For Event #7 (text response):
    a. Process event:
       processed = {
         textContent: "Your net worth is $21,000. Here's the breakdown:\n\n**Assets:**\n* Checking: $8,500\n* Savings: $25,000\n* 401k: $50,000\n* **Total Assets: $83,500**\n\n**Liabilities:**\n* Student Loan: $60,000\n* Credit Card: $2,500\n* **Total Liabilities: $62,500**\n\n**Net Worth:**\n$83,500 - $62,500 = **$21,000**"
       }
    b. Update cumulative text:
       cumulativeText = processed.textContent
    c. Update message:
       updateMessage("agent-1234567890", {
         content: cumulativeText,
         status: "sending"
       })
    d. React re-renders → message bubble shows full text

26. Repeat for all 20 events
```

#### **Phase 9: Stream Complete**

```
27. SSE stream ends (no more events)
28. Call onComplete() callback
29. Update message status:
    updateMessage("agent-1234567890", { status: "sent" })
30. Set loading states:
    set({ isLoading: false, isProcessing: false })
31. React re-renders → loading spinner disappears
```

#### **Phase 10: Final UI State**

```
32. User sees:
    ┌────────────────────────────────────────┐
    │ 👤 User                                │
    │ What's my net worth?                   │
    │ 11:00 AM                               │
    └────────────────────────────────────────┘

    ┌────────────────────────────────────────┐
    │ 🤖 Agent                               │
    │                                        │
    │ Your net worth is $21,000.             │
    │ Here's the breakdown:                  │
    │                                        │
    │ **Assets:**                            │
    │ • Checking: $8,500                     │
    │ • Savings: $25,000                     │
    │ • 401k: $50,000                        │
    │ • **Total Assets: $83,500**            │
    │                                        │
    │ **Liabilities:**                       │
    │ • Student Loan: $60,000                │
    │ • Credit Card: $2,500                  │
    │ • **Total Liabilities: $62,500**       │
    │                                        │
    │ **Net Worth:**                         │
    │ $83,500 - $62,500 = **$21,000**        │
    │                                        │
    │ ┌─────────────────────────────────┐   │
    │ │ ⚡ Agent Activity (6 steps) ▼   │   │
    │ │                                 │   │
    │ │ • 🔧 Transfer To Agent          │   │
    │ │   11:00:01.100                  │   │
    │ │ • ✅ Transfer To Agent completed│   │
    │ │   11:00:01.150                  │   │
    │ │ • 🔧 Cymbal Banking Agent       │   │
    │ │   11:00:01.200                  │   │
    │ │ • ✅ Cymbal Banking Agent ...   │   │
    │ │   11:00:01.250                  │   │
    │ │ • 🔧 Calculator                 │   │
    │ │   11:00:01.300                  │   │
    │ │ • ✅ Calculator completed       │   │
    │ │   11:00:01.350                  │   │
    │ └─────────────────────────────────┘   │
    │                                        │
    │ 11:00 AM                               │
    └────────────────────────────────────────┘
```

---

## 🎯 Key Architectural Patterns

### **1. Event Timeline Pattern**

**Problem**: How to show agent reasoning without cluttering the message text?

**Solution**: Separate storage for events vs. message content

```typescript
// Message content (what user sees in bubble)
message = {
  content: "Your net worth is $21,000...",  // Final text only
  hasVisualization: true,
  artifactImageUrl: "blob:http://..."
}

// Event timeline (collapsible, shows process)
messageEvents.get(message.id) = [
  { title: "🔧 Transfer To Agent", ... },
  { title: "✅ Transfer To Agent completed", ... },
  { title: "🔧 Calculator", ... },
  { title: "✅ Calculator completed", ... },
]
```

**Benefits**:
- Clean message display
- Optional detailed view
- Incremental updates possible

---

### **2. SSE Simulation Pattern**

**Problem**: ADK backend doesn't stream, returns batch

**Solution**: Middleware proxy that streams events with delays

```
ADK Backend (batch)          API Route (streaming)         Frontend (SSE)
       ↓                             ↓                          ↓
Returns all 20 events    → Receives all events      → Receives event #1
at once (t=0ms)          → Waits 50ms                  (t=0ms)
                         → Sends event #1            → Receives event #2
                         → Waits 50ms                  (t=50ms)
                         → Sends event #2            → Receives event #3
                         → Waits 50ms                  (t=100ms)
                         → Sends event #3            → ...
                         → ...
```

**Benefits**:
- Incremental UI updates
- Better UX (shows progress)
- Works with existing ADK

---

### **3. Processor Pattern**

**Problem**: ADK events have complex, nested structure

**Solution**: Processor class that extracts and normalizes data

```typescript
// Raw ADK event (complex)
event = {
  content: {
    parts: [
      {
        functionCall: {
          name: "calculator",
          args: { expression: "(8500 + 25000 + 50000) - (60000 + 2500)" },
          id: "adk-123"
        }
      }
    ],
    role: "model"
  },
  invocationId: "...",
  author: "handling",
  // ... 20+ other fields
}

// Processed (simple)
processed = {
  toolActivity: {
    calls: [
      { name: "calculator", args: {...}, id: "adk-123" }
    ]
  }
}
```

**Benefits**:
- Single source of parsing logic
- Type-safe processing
- Easy to test

---

## 📊 State Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ZUSTAND STORE STATE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  messages: [                                                         │
│    { id: "user-1", content: "Hi", sender: "user" },                 │
│    { id: "agent-1", content: "Hello!", sender: "agent" },           │
│  ]                                                                   │
│                                                                       │
│  messageEvents: Map {                                                │
│    "agent-1" => [                                                    │
│      { title: "🔧 Tool Call", data: {...} },                        │
│      { title: "✅ Tool Response", data: {...} },                    │
│    ]                                                                 │
│  }                                                                   │
│                                                                       │
│  isLoading: false                                                    │
│  userId: "user-001"                                                  │
│  sessionId: "session-5678"                                           │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ set({ ... })
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                         STORE ACTIONS                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  sendMessage(text, files)                                            │
│    ↓                                                                 │
│  sendMultipartMessage(parts)                                         │
│    ↓                                                                 │
│  sseClient.sendMessageSSE(...)                                       │
│    ↓                                                                 │
│  For each event:                                                     │
│    - Process with AgentResponseProcessor                             │
│    - Format with event-formatter                                     │
│    - addMessageEvent(messageId, event)                               │
│    - updateMessage(messageId, { content: ... })                      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Callbacks
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                       SSE CLIENT                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  sendMessageSSE(request, onEvent, onComplete, onError)               │
│    ↓                                                                 │
│  POST /api/run_sse_custom                                            │
│    ↓                                                                 │
│  Read SSE stream                                                     │
│    ↓                                                                 │
│  For each "data: {...}\n\n":                                         │
│    - Parse JSON                                                      │
│    - Call onEvent(event) immediately                                 │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ SSE Stream
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                      API ROUTE PROXY                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  POST /api/run_sse_custom                                            │
│    ↓                                                                 │
│  POST http://localhost:8000/run                                      │
│    ↓                                                                 │
│  Receive all events [event1, event2, ...]                            │
│    ↓                                                                 │
│  Stream back with delays:                                            │
│    - Send event1 (t=0ms)                                             │
│    - Wait 50ms                                                       │
│    - Send event2 (t=50ms)                                            │
│    - Wait 50ms                                                       │
│    - Send event3 (t=100ms)                                           │
│    - ...                                                             │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎓 Key Takeaways

1. **Separation of Concerns**:
   - `page.tsx` = UI only
   - `useAgentStore.ts` = State + business logic
   - `utils/` = Pure functions (API, processing)

2. **Event Timeline Pattern**:
   - Message content = final text + images
   - Event timeline = reasoning steps (separate Map)
   - Allows clean display + optional detailed view

3. **SSE Simulation**:
   - ADK doesn't stream → API route simulates it
   - 50ms delays create incremental UI updates
   - Frontend gets real-time experience

4. **Type Safety**:
   - All ADK types defined in `types/agent.ts`
   - TypeScript catches errors at compile time
   - Better IDE autocomplete

5. **Modular Architecture**:
   - Easy to test individual utilities
   - Easy to swap implementations (e.g., different SSE client)
   - Clear data flow

6. **React Re-rendering**:
   - Zustand triggers re-renders when state changes
   - `messageEvents` Map subscription in `page.tsx` ensures timeline updates
   - Efficient: only changed messages re-render

---

## 🐛 Debugging Tips

### **1. Check Console Logs**

**Frontend** (browser DevTools):
```javascript
// SSE stream activity
🌊🌊🌊... SSE CLIENT: Stream started at ...
📦 CHUNK #1 at +50ms (234 bytes)
⚡ EVENT #1 parsed at +52ms
⏱️  [STORE] Processor returned in 3ms: { hasText: false, hasToolCalls: true }
⏱️  [STORE] Added event to timeline: 🔧 Transfer To Agent
```

**Backend** (Next.js terminal):
```
[CUSTOM SSE] Incoming streaming request
[CUSTOM SSE] Received 20 events from ADK
[CUSTOM SSE] Streaming event #1 at +0ms
[CUSTOM SSE] Streaming event #2 at +50ms
```

**ADK Backend** (Python terminal):
```python
🎨 After agent callback triggered for artifact generation
🎯 Chart was generated - creating artifact from real chart data...
✅ Saved chart as artifact 'Financial_Analysis_20250116.png' version 1
```

### **2. Check Network Tab**

- **Filter**: `run_sse_custom`
- **Type**: EventStream
- **Look for**: Incremental events arriving over time
- **If all events arrive at once**: API route isn't streaming properly

### **3. Check React DevTools**

- **Component**: page.tsx
- **State**: `messageEvents` Map
- **Should see**: Map growing as events arrive
- **If not updating**: Missing subscription in component

### **4. Common Issues**

| Issue | Cause | Fix |
|-------|-------|-----|
| No events in timeline | `messageEvents` not subscribed | Add `const messageEvents = useAgentStore(state => state.messageEvents)` in component |
| All events at once | API route not streaming | Check `/api/run_sse_custom/route.ts` has delays |
| Duplicate events | No deduplication | Check `seenToolCallIds` Set in `useAgentStore.ts` |
| Charts not displaying | Base64 encoding issue | Check `processBase64Image()` in `base64.ts` |
| Session errors | Stale session | Change User ID or clear localStorage |

---

## 🚀 Future Improvements

1. **True ADK Streaming**: When ADK supports real streaming, remove API route delays
2. **Offline Support**: Cache messages in IndexedDB
3. **Message Editing**: Allow users to edit/delete messages
4. **Voice Input**: Add speech-to-text
5. **Export Chat**: Download conversation as PDF/Markdown
6. **Dark Mode**: Theme toggle
7. **Mobile Optimization**: Better touch interactions

---

**Last Updated**: January 16, 2025  
**Version**: 2.0 (SSE Streaming + Event Timeline)  
**Author**: AI Assistant

---

## 📚 Additional Resources

- [Google ADK Documentation](https://cloud.google.com/agent-development-kit)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Zustand State Management](https://zustand-demo.pmnd.rs/)
- [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [React Markdown](https://github.com/remarkjs/react-markdown)

