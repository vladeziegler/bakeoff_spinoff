// SSE (Server-Sent Events) Client for Real-Time Streaming
// Provides true real-time updates as events arrive from the ADK agent

import { API_CONFIG, getApiUrl, debugLog } from '@/app/src/config/route'
import type { AgentRunRequest, AgentRunResponseEvent } from '@/app/src/types/agent'

export class AgentSSEClient {
  private controller: AbortController | null = null

  /**
   * Send message using SSE for real-time streaming
   * 
   * @param request - Agent run request
   * @param onEvent - Callback for each event as it arrives
   * @param onComplete - Callback when stream completes
   * @param onError - Callback for errors
   */
  async sendMessageSSE(
    request: AgentRunRequest,
    onEvent: (event: AgentRunResponseEvent) => void,
    onComplete: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    const { appName, userId, sessionId, newMessage, stateDelta } = request
    
    // Create abort controller for cancellation
    this.controller = new AbortController()
    
    const url = getApiUrl('/run_sse')
    const requestBody = {
      appName,
      userId,
      sessionId,
      newMessage,
      streaming: true,
      stateDelta: stateDelta || null,
    }
    
    debugLog('Starting SSE stream', {
      url,
      appName,
      userId,
      sessionId,
    })
    
    console.log('🌊 Opening SSE stream...')

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
        signal: this.controller.signal,
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`SSE stream failed: ${response.status} ${response.statusText} - ${errorBody}`)
      }

      if (!response.body) {
        throw new Error('Response body is null')
      }

      // Read the stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventCount = 0

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          console.log('✅ SSE stream completed', { totalEvents: eventCount })
          onComplete()
          break
        }

        // Decode the chunk
        buffer += decoder.decode(value, { stream: true })
        
        // Process complete events in the buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonData = line.substring(6) // Remove 'data: ' prefix
              const event: AgentRunResponseEvent = JSON.parse(jsonData)
              
              eventCount++
              debugLog(`SSE Event #${eventCount}`, {
                hasContent: !!event.content,
                parts: event.content?.parts?.length || 0,
                turnComplete: event.turn_complete || event.turnComplete,
              })
              
              // Call the event handler immediately
              onEvent(event)
              
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
          onError(error)
        }
      } else {
        const unknownError = new Error('Unknown SSE error')
        console.error('❌ SSE stream error:', unknownError)
        onError(unknownError)
      }
    } finally {
      this.controller = null
    }
  }

  /**
   * Cancel the current SSE stream
   */
  cancel(): void {
    if (this.controller) {
      console.log('🛑 Cancelling SSE stream...')
      this.controller.abort()
      this.controller = null
    }
  }
}

