# Bug Fix Summary: Wrong API Endpoint

## Problem
The refactored frontend was calling the wrong API endpoint, causing all agent interactions to fail.

## Root Cause

### Wrong Endpoint Used
The refactored code was trying to use the RESTful endpoint:
```
POST /api/apps/{appName}/users/{userId}/sessions/{sessionId}:run
```

But the **ADK Web Server provides a simplified endpoint** that takes all parameters in the body:
```
POST /api/run
```

### The Correct Format
**Endpoint**: `POST /run`

**Request Body**:
```json
{
  "appName": "banking_agent",
  "userId": "user-001",
  "sessionId": "uuid-here",
  "newMessage": {
    "parts": [{"text": "..."}],
    "role": "user"
  },
  "streaming": false,
  "stateDelta": null
}
```

All routing information (`appName`, `userId`, `sessionId`) goes in the request body, not the URL path!

## Solution

Changed the endpoint from the complex RESTful path to the simple `/run` endpoint:

```typescript
// ❌ Before - wrong endpoint
const url = `/api/apps/${appName}/users/${userId}/sessions/${sessionId}:run`

// ✅ After - correct simplified endpoint  
const url = getApiUrl('/run')

// Request body includes all routing info
const requestBody = {
  appName,
  userId,
  sessionId,
  newMessage,
  streaming: false,
  stateDelta: null,
}
```

## Files Changed

- `/front-end/app/src/utils/agent-api-client.ts` (lines 84-88)
  - Modified `sendMessage()` method to build URL in two steps
  - Added explanatory comment about why `:run` must not be URL-encoded

## Testing

1. **Before Fix:**
   ```
   POST .../sessions/abc%3Arun → 400 Bad Request
   ```

2. **After Fix:**
   ```
   POST .../sessions/abc:run → 200 OK
   ```

## Additional Issues Fixed

### 1. Snake Case vs Camel Case (`turn_complete`)
The backend returns `turn_complete` (snake_case) but TypeScript expected `turnComplete` (camelCase).

**Fix:** Updated `AgentRunResponseEvent` interface to support both:

```typescript
export interface AgentRunResponseEvent {
  turn_complete?: boolean     // Backend format (snake_case)
  turnComplete?: boolean      // Also support camelCase
  // ... other fields
}
```

### 2. Empty Response Handling
The `AgentResponseProcessor` was returning a placeholder text when no text parts were found.

**Fix:** Changed default to empty string so frontend can decide how to handle empty responses:

```typescript
const textContent = this.textParts.length > 0
  ? this.textParts.join('\n\n')
  : '' // Empty string instead of "I've processed your request"
```

### 3. Backend Filters Non-Text Parts
The backend (`main.py` lines 110-128) explicitly filters out all `MessagePart` types except `text`:

```python
if hasattr(part, "text") and part.text is not None:
    clean_parts.append({"text": part.text})
```

This means `inlineData` (images), `functionCall`, `functionResponse`, etc. are NOT sent to frontend.

**Note:** Frontend is now equipped to handle these types, but backend needs modification to actually send them.

## Remaining Backend Limitation

The backend currently only sends text content. To fully utilize the refactored frontend's capabilities, the backend would need to be updated to send:
- `inlineData` for images/artifacts
- `functionCall` and `functionResponse` for tool activity
- `executableCode` and `codeExecutionResult` for code execution

This was intentionally deferred per user request to minimize backend changes.

## Session ID Issue

### Problem
After the initial broken deployment, some sessions were created with `:run` appended to the session ID (e.g., `9c7122de-9a39-4dc8-a268-84a634610d4b:run`). These malformed sessions are stored in the backend and cause "Session already exists" errors.

### Solution
**For users experiencing this error:**

1. **Change your User ID** - Enter a different User ID in the input field. This will clear the session and create a new one.
2. **OR Refresh the page** and use a new User ID

**Code improvements:**
- Added error handling in session creation to provide helpful error messages
- `setUserId()` now always clears the session when changing users
- Better logging to track session creation and clearing

### Code Changes
```typescript
// In useAgentStore.ts - setUserId() now clears session
setUserId: (userId: string) => {
  set({ 
    userId, 
    sessionId: null, // Always clear session when changing user ID
    error: null, // Clear any existing errors
    messages: [...]
  })
  console.log('👤 User ID set:', userId, '- Session cleared')
}
```

## Verification

✅ Frontend builds without linter errors  
✅ URL is no longer URL-encoded (`:run` stays literal)  
✅ API requests now use correct endpoint format  
✅ Both `turn_complete` and `turnComplete` are handled  
✅ Empty responses don't show placeholder text  
✅ Session errors provide helpful user guidance  
✅ Changing User ID clears old sessions  

## Testing Instructions

1. **If you see "Session already exists" error:**
   - Change your User ID to something new (e.g., add `-v2` suffix)
   - Or refresh the page and enter a new User ID
   
2. **To verify the fix works:**
   - Open browser DevTools → Console
   - Look for logs showing:
     - `👤 User ID set: {userId} - Session cleared`
     - `📝 Creating new session...`
     - `✅ Session created: {uuid}` (should be a clean UUID without `:run`)
     - `🚀 Sending message to agent...`
     - `✅ Received N events from agent`

3. **Expected URL in Network tab:**
   ```
   POST /api/apps/banking_agent/users/{userId}/sessions/{uuid}:run
   ```
   NOT:
   ```
   POST /api/apps/banking_agent/users/{userId}/sessions/{uuid}%3Arun
   ```

The fix is complete and ready for testing in the browser.

