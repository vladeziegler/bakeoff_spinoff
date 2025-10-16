# Migration Guide - Frontend Refactoring

## Quick Start

### If Your Code Still Works ✅
**You don't need to change anything!** The refactoring maintains backward compatibility.

### If You Need to Update Imports 🔄

**Old:**
```typescript
import { useAgentStore } from './stores/useAgentStore'
```

**New:**
```typescript
import { useAgentStore } from '@/app/src/stores/useAgentStore'
```

---

## Common Migration Scenarios

### 1. Message Timestamps

**Old Code:**
```typescript
const message = {
  id: '123',
  content: 'Hello',
  sender: 'user',
  timestamp: new Date() // ❌ Date object
}

// Display
<div>{message.timestamp.toLocaleString()}</div>
```

**New Code:**
```typescript
const message = {
  id: '123',
  content: 'Hello',
  sender: 'user',
  timestamp: new Date().toISOString() // ✅ ISO string
}

// Display
<div>{new Date(message.timestamp).toLocaleString()}</div>
```

---

### 2. Accessing Tool Activity (New Feature)

**Before:** Not available

**After:**
```typescript
function MessageComponent({ message }: { message: AgentMessage }) {
  return (
    <div>
      <p>{message.content}</p>
      
      {/* Show which tools were used */}
      {message.toolActivity && (
        <div className="tool-activity">
          <h4>Tools Used:</h4>
          {message.toolActivity.calls.map((call, idx) => (
            <div key={idx}>
              <strong>{call.name}</strong>
              <pre>{JSON.stringify(call.args, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

### 3. Message Status Tracking (New Feature)

**Before:** No status tracking

**After:**
```typescript
function MessageComponent({ message }: { message: AgentMessage }) {
  const retryMessage = useAgentStore(state => state.retryMessage)
  
  return (
    <div>
      <p>{message.content}</p>
      
      {/* Show status indicators */}
      {message.status === 'sending' && <Spinner />}
      {message.status === 'failed' && (
        <Button onClick={() => retryMessage(message.id)}>
          Retry
        </Button>
      )}
    </div>
  )
}
```

---

### 4. Optimized Re-renders (New Feature)

**Before:**
```typescript
function ChatComponent() {
  const store = useAgentStore() // ❌ Re-renders on ANY state change
  
  return (
    <div>
      {store.messages.map(m => <Message key={m.id} message={m} />)}
      <Button onClick={() => store.sendMessage('Hi')}>Send</Button>
    </div>
  )
}
```

**After:**
```typescript
function ChatComponent() {
  const messages = useMessages() // ✅ Only re-renders when messages change
  const { sendMessage } = useAgentActions() // ✅ Never re-renders
  
  return (
    <div>
      {messages.map(m => <Message key={m.id} message={m} />)}
      <Button onClick={() => sendMessage('Hi')}>Send</Button>
    </div>
  )
}
```

---

### 5. Error Handling

**Before:**
```typescript
const error = useAgentStore(state => state.error)

{error && <div className="error">{error}</div>}
```

**After (Same, but with more detail):**
```typescript
const error = useError() // New selector hook

{error && (
  <Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}

// Messages now also have error status
{message.isError && (
  <div className="error-message">{message.content}</div>
)}
```

---

### 6. Custom Message Parts

**Before:**
```typescript
// Had to manually construct parts
const parts = [
  { text: 'Hello' },
  { inlineData: { data: base64, mimeType: 'image/png' } }
]
```

**After (Same, but with helpers):**
```typescript
import { createTextMessage, createFileMessage } from '@/app/src/stores/useAgentStore'

const parts = [
  createTextMessage('Hello'),
  createFileMessage(file, base64Data)
]
```

---

## New Features You Can Use

### 1. Retry Failed Messages
```typescript
const retryMessage = useAgentStore(state => state.retryMessage)

<Button onClick={() => retryMessage(messageId)}>
  Retry
</Button>
```

### 2. Update Message Dynamically
```typescript
const updateMessage = useAgentStore(state => state.updateMessage)

// Mark message as read
updateMessage(messageId, { read: true })

// Update content
updateMessage(messageId, { content: 'Updated text' })
```

### 3. Access Metadata
```typescript
{message.metadata && (
  <div>
    {message.metadata.hasThoughts && <Badge>Thinking...</Badge>}
    {message.metadata.turnComplete && <Badge>Complete</Badge>}
    {message.metadata.interrupted && <Badge>Interrupted</Badge>}
  </div>
)}
```

### 4. Code Execution Results
```typescript
{message.codeActivity && (
  <div className="code-activity">
    {message.codeActivity.executions.map((exec, idx) => (
      <div key={idx}>
        <pre><code>{exec.code}</code></pre>
        {exec.result && <pre>{exec.result}</pre>}
      </div>
    ))}
  </div>
)}
```

---

## Breaking Changes Checklist

- [ ] Update `timestamp` from `Date` to `string` (if you store messages)
- [ ] Update import paths to use `@/app/src/...`
- [ ] Update any code that directly accesses `message.timestamp` methods
- [ ] Test file upload functionality (base64 processing changed)
- [ ] Test error handling (error structure enhanced)

---

## Testing Your Migration

### 1. Basic Functionality
```bash
# Start dev server
npm run dev

# Test:
1. Send a text message ✓
2. Send a message with image ✓
3. Trigger an error (invalid user ID) ✓
4. Retry a failed message ✓
5. Clear messages ✓
```

### 2. Check Console
Look for these logs:
- `🚀 Sending message to agent...`
- `✅ Received X events from agent`
- `📊 Processed response: {...}`
- `✨ Response processing complete: {...}`

### 3. Check Network Tab
- Requests go to `/api/apps/banking_agent/...`
- Responses are JSON arrays of events
- No 500 errors

---

## Rollback Plan

If something breaks:

1. **Revert Store File:**
   ```bash
   git checkout HEAD~1 -- front-end/app/src/stores/useAgentStore.ts
   ```

2. **Remove New Files:**
   ```bash
   rm -rf front-end/app/src/types/agent.ts
   rm -rf front-end/app/src/config/route.ts
   rm -rf front-end/app/src/utils/base64.ts
   rm -rf front-end/app/src/utils/agent-api-client.ts
   rm -rf front-end/app/src/utils/agent-response-processor.ts
   ```

3. **Restart Dev Server:**
   ```bash
   npm run dev
   ```

---

## Getting Help

### Debug Mode
Enable detailed logging:
```bash
# .env.local
NEXT_PUBLIC_API_DEBUG=true
```

### Common Issues

**Issue:** `Cannot find module '@/app/src/types/agent'`  
**Fix:** Check `tsconfig.json` has `"@/*": ["./"]` in paths

**Issue:** Images not displaying  
**Fix:** Check console for base64 processing errors, ensure data is valid base64

**Issue:** Messages not updating  
**Fix:** Ensure you're using `updateMessage()` method, not direct state mutation

**Issue:** Tool calls not showing  
**Fix:** Check `message.toolActivity` exists, ensure backend is returning function calls

---

## Performance Tips

### 1. Use Selector Hooks
```typescript
// ❌ Bad - re-renders on any state change
const store = useAgentStore()

// ✅ Good - only re-renders when messages change
const messages = useMessages()
const { sendMessage } = useAgentActions()
```

### 2. Memoize Message Components
```typescript
const Message = React.memo(({ message }: { message: AgentMessage }) => {
  return <div>{message.content}</div>
})
```

### 3. Cleanup Blob URLs
```typescript
import { revokeBlobUrl } from '@/app/src/utils/base64'

useEffect(() => {
  return () => {
    if (message.artifactImageUrl) {
      revokeBlobUrl(message.artifactImageUrl)
    }
  }
}, [message.artifactImageUrl])
```

---

## Questions?

1. Check `REFACTORING_SUMMARY.md` for detailed changes
2. Review type definitions in `types/agent.ts`
3. Check examples in this guide
4. Enable debug logging

---

**Last Updated:** October 16, 2025  
**Status:** ✅ Production Ready

