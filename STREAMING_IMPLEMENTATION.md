# Custom SSE Streaming Implementation

## 🎯 **Overview**

We've implemented a custom SSE (Server-Sent Events) streaming solution to provide **incremental real-time updates** in the frontend, even though ADK's backend doesn't support true streaming.

---

## 📁 **New Files Created**

### 1. `/app/api/run_sse_custom/route.ts`
**Purpose**: Next.js API Route that acts as a middleware proxy

**What it does**:
- Receives streaming requests from the frontend
- Forwards them to ADK's `/run` endpoint (batch mode)
- Receives all events at once from ADK
- **Streams events incrementally to the frontend** with 50ms delays
- Converts batch response → SSE format

**Key Features**:
- ✅ Proper SSE headers with `text/event-stream`
- ✅ CORS enabled
- ✅ Error handling for ADK failures
- ✅ Incremental event emission with delays
- ✅ Logging for debugging

---

### 2. `/app/api/run_sse_custom/json-fragment-processor.ts`
**Purpose**: JSON Fragment Processor (prepared for future true streaming)

**What it does**:
- Parses incomplete JSON fragments from streaming responses
- Extracts complete objects as they arrive
- Designed for true ADK streaming (when available)

**Status**: 
- ⚠️ Currently not used (ADK doesn't stream)
- ✅ Ready for future ADK updates
- ✅ Based on reference implementation

---

## 🔄 **Modified Files**

### 1. `/app/src/utils/agent-sse-client.ts`
**Change**: Updated endpoint from `/run_sse` to `/run_sse_custom`

```typescript
const url = getApiUrl('/run_sse_custom')
```

This redirects all SSE requests to our custom proxy.

---

## 🏗️ **Architecture**

```
┌─────────────────┐
│   Frontend      │
│  (React/Zustand)│
└────────┬────────┘
         │ SSE Request
         ▼
┌─────────────────────────┐
│ /api/run_sse_custom     │  ← **Our Custom Proxy**
│ (Next.js API Route)     │
└────────┬────────────────┘
         │ HTTP POST /run
         ▼
┌─────────────────────────┐
│   ADK Backend           │
│   (localhost:8000)      │
└────────┬────────────────┘
         │ Batch Response
         ▼
┌─────────────────────────┐
│ Custom Proxy Streams    │  ← **Incremental Emission**
│ Events 1-by-1 (50ms)    │
└────────┬────────────────┘
         │ SSE Events
         ▼
┌─────────────────┐
│   Frontend      │
│  Real-time UI   │
└─────────────────┘
```

---

## ⚡ **How It Works**

### **Step 1: Frontend Request**
Frontend sends message via `AgentSSEClient`:
```typescript
await sseClient.sendMessageSSE(
  {
    appName: 'banking_agent',
    userId,
    sessionId,
    newMessage: { parts, role: 'user' },
    streaming: true,
  },
  onEvent,    // Called for each event
  onComplete, // Called when done
  onError     // Called on error
)
```

### **Step 2: Custom Proxy Processing**
Our `/api/run_sse_custom` route:
1. Receives request
2. Forwards to ADK `/run` endpoint
3. Waits for complete response
4. **Streams events back one-by-one with 50ms delays**

```typescript
for (let i = 0; i < events.length; i++) {
  const sseEvent = `data: ${JSON.stringify(events[i])}\n\n`
  controller.enqueue(encoder.encode(sseEvent))
  
  // Delay between events for incremental UI
  if (i < events.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
```

### **Step 3: Frontend Processing**
For each SSE event:
1. `onEvent` callback fires
2. Process event (extract tool calls, text, etc.)
3. Update UI state
4. React re-renders with new data

---

## 📊 **Event Timeline**

**Without Custom Proxy** (all at once):
```
11:13:39.804  →  All 20 events arrive
11:13:39.804  →  UI updates with everything
```

**With Custom Proxy** (incremental):
```
11:13:00.000  →  Event #1 (transfer_to_agent call)
11:13:00.050  →  Event #2 (transfer_to_agent response)
11:13:00.100  →  Event #3 (cymbal_banking_agent call)
11:13:00.150  →  Event #4 (cymbal_banking_agent response)
...           →  ...
11:13:01.000  →  Event #20 (final text)
```

Each event triggers a UI update → **users see progress in real-time!**

---

## ✅ **Benefits**

1. **Better UX**: Users see agent thinking/working
2. **Progress Indication**: Timeline shows each step as it "happens"
3. **Professional Feel**: Smooth, incremental updates
4. **No Backend Changes**: Works with ADK as-is
5. **Future-Proof**: Ready for true ADK streaming

---

## 🎨 **User Experience**

**Before** (batch mode):
- User sends message → ⏳ Loading spinner → 💬 All content appears at once

**After** (custom streaming):
- User sends message → 
- 🔧 "Using tool: Transfer To Agent" appears
- ✅ "Tool completed" appears
- 🔧 "Using tool: Cymbal Banking Agent" appears
- ✅ "Tool completed" appears
- 💻 "Executing code" appears
- 💬 Text response builds up progressively

---

## 🔧 **Configuration**

### Timing
Current delay: `50ms` between events

To adjust:
```typescript
// In /app/api/run_sse_custom/route.ts
await new Promise(resolve => setTimeout(resolve, 50)) // ← Change this
```

Recommendations:
- **Faster (25ms)**: More responsive, but might feel rushed
- **Current (50ms)**: Good balance
- **Slower (100ms)**: More deliberate, better for demos

### Endpoint
Frontend connects to: `/api/run_sse_custom`

Backend (ADK) endpoint: `http://localhost:8000/run`

---

## 🐛 **Debugging**

### Check Logs

**Frontend Console**:
```javascript
console.log('⚡ EVENT RECEIVED AT ...')
console.log('🌊 Opening SSE stream...')
```

**Backend Console** (Next.js):
```
[CUSTOM SSE] Incoming streaming request
[CUSTOM SSE] Received X events from ADK
[CUSTOM SSE] Streaming event #1 at +0ms
[CUSTOM SSE] Streaming event #2 at +50ms
...
```

### Common Issues

**No events appearing**:
- Check browser console for SSE errors
- Verify `/api/run_sse_custom` is accessible
- Check ADK backend is running on port 8000

**All events appear at once**:
- Check that `agent-sse-client.ts` is using `/run_sse_custom`
- Verify the delay is present in the API route

**Session errors**:
- Clear browser cache/storage
- Use a new User ID
- Check ADK backend logs

---

## 🚀 **Testing**

### In Browser
1. Open app at `http://localhost:3000`
2. Send a message
3. Open DevTools → Network tab → Filter "run_sse_custom"
4. Watch EventStream tab for incremental events

### Expected Behavior
- ✅ Events appear one-by-one
- ✅ Timeline updates progressively
- ✅ Text builds up incrementally
- ✅ Loading states transition smoothly

---

## 📈 **Future Improvements**

### When ADK Supports True Streaming
1. Update `/api/run_sse_custom/route.ts` to use `run_sse` endpoint
2. Enable `JSONFragmentProcessor` for real-time parsing
3. Remove artificial delays
4. Stream events as they're generated by ADK

### Code Changes Needed
```typescript
// In route.ts, replace batch mode with:
const stream = new ReadableStream({
  async start(controller) {
    const reader = adkResponse.body.getReader()
    const processor = new JSONFragmentProcessor((sseEvent) => {
      controller.enqueue(new TextEncoder().encode(sseEvent))
    })
    
    // Stream chunks in real-time
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      processor.processChunk(decoder.decode(value))
    }
  }
})
```

---

## 🎓 **Key Takeaways**

1. **ADK doesn't support true streaming yet** → We simulate it
2. **Custom API route acts as middleware** → Incremental emission
3. **Frontend gets real-time updates** → Better UX
4. **No backend agent changes required** → Works with existing ADK
5. **Ready for future ADK updates** → JSONFragmentProcessor prepared

---

## 📝 **Related Files**

- Frontend SSE Client: `/app/src/utils/agent-sse-client.ts`
- Custom API Route: `/app/api/run_sse_custom/route.ts`
- JSON Processor: `/app/api/run_sse_custom/json-fragment-processor.ts`
- Event Timeline UI: `/components/EventTimeline.tsx`
- Event Formatting: `/app/src/utils/event-formatter.ts`
- Zustand Store: `/app/src/stores/useAgentStore.ts`

---

**Status**: ✅ **Fully Implemented and Ready to Test**

Test it now by sending a message in the UI and watching the console logs!
