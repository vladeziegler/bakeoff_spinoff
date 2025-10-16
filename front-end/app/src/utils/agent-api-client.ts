// Agent API Client
// Handles all communication with the ADK Web Server

import { API_CONFIG, getApiUrl, debugLog } from '@/app/src/config/route'
import type { AgentRunRequest, AgentRunResponseEvent, CreateSessionResponse } from '@/app/src/types/agent'

/**
 * Custom error for API communication failures
 */
export class AgentAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: any
  ) {
    super(message)
    this.name = 'AgentAPIError'
  }
}

/**
 * Agent API Client
 * Provides methods for interacting with the ADK Web Server
 */
export class AgentAPIClient {
  constructor(private baseURL: string = API_CONFIG.baseUrl) {
    debugLog('AgentAPIClient initialized', { baseURL: this.baseURL })
  }

  /**
   * Create a new session for a user
   * 
   * @param appName - Name of the ADK application
   * @param userId - User identifier
   * @returns Session information including session ID
   * @throws AgentAPIError if request fails
   */
  async createSession(appName: string, userId: string): Promise<CreateSessionResponse> {
    const url = getApiUrl(`/apps/${appName}/users/${userId}/sessions`)
    debugLog('Creating session', { appName, userId, url })

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new AgentAPIError(
          `Failed to create session: ${response.statusText}`,
          response.status,
          errorBody
        )
      }

      const session = await response.json()
      debugLog('Session created successfully', { sessionId: session.id })
      
      return session
    } catch (error) {
      if (error instanceof AgentAPIError) {
        throw error
      }
      
      throw new AgentAPIError(
        `Network error creating session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        error
      )
    }
  }

  /**
   * Send a message to the agent and get response events
   * 
   * @param request - Agent run request with message and session info
   * @returns Array of response events from the agent
   * @throws AgentAPIError if request fails
   */
  async sendMessage(request: AgentRunRequest): Promise<AgentRunResponseEvent[]> {
    const { appName, userId, sessionId, newMessage, streaming, stateDelta } = request
    
    // ADK Web Server simplified endpoint: /run
    // All parameters go in the request body
    const url = getApiUrl('/run')
    
    // ADK API request format - all fields in body
    const requestBody = {
      appName,
      userId,
      sessionId,
      newMessage,
      streaming: streaming || false,
      stateDelta: stateDelta || null,
    }
    
    debugLog('Sending message to agent', {
      appName,
      userId,
      sessionId,
      messagePartCount: newMessage.parts?.length || 0,
      url,
      requestBody: JSON.stringify(requestBody, null, 2)
    })
    
    console.log('🚀 Full request details:', {
      url,
      method: 'POST',
      body: requestBody
    })

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        debugLog('Agent run failed', {
          status: response.status,
          statusText: response.statusText,
          errorBody
        })
        
        throw new AgentAPIError(
          `Agent run failed: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        )
      }

      const data = await response.json()
      
      console.log('📥 Raw response data:', JSON.stringify(data, null, 2))
      
      // ADK Web Server returns array of events directly
      const events: AgentRunResponseEvent[] = Array.isArray(data) ? data : [data]
      
      debugLog('Received agent response', {
        eventCount: events.length,
        hasContent: events.some(e => e.content?.parts?.length),
        turnComplete: events.some(e => e.turnComplete || e.turn_complete),
        events: events.map(e => ({
          hasParts: !!e.content?.parts?.length,
          partCount: e.content?.parts?.length || 0,
          turnComplete: e.turnComplete || e.turn_complete
        }))
      })
      
      return events
      
    } catch (error) {
      if (error instanceof AgentAPIError) {
        throw error
      }
      
      throw new AgentAPIError(
        `Network error sending message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        error
      )
    }
  }

  /**
   * Get session information
   * 
   * @param appName - Name of the ADK application
   * @param userId - User identifier
   * @param sessionId - Session identifier
   * @returns Session information
   * @throws AgentAPIError if request fails
   */
  async getSession(appName: string, userId: string, sessionId: string): Promise<CreateSessionResponse> {
    const url = getApiUrl(`/apps/${appName}/users/${userId}/sessions/${sessionId}`)
    debugLog('Getting session', { appName, userId, sessionId, url })

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new AgentAPIError(
          `Failed to get session: ${response.statusText}`,
          response.status
        )
      }

      return await response.json()
    } catch (error) {
      if (error instanceof AgentAPIError) {
        throw error
      }
      
      throw new AgentAPIError(
        `Network error getting session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        error
      )
    }
  }

  /**
   * List all sessions for a user
   * 
   * @param appName - Name of the ADK application
   * @param userId - User identifier
   * @returns Array of sessions
   * @throws AgentAPIError if request fails
   */
  async listSessions(appName: string, userId: string): Promise<CreateSessionResponse[]> {
    const url = getApiUrl(`/apps/${appName}/users/${userId}/sessions`)
    debugLog('Listing sessions', { appName, userId, url })

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new AgentAPIError(
          `Failed to list sessions: ${response.statusText}`,
          response.status
        )
      }

      return await response.json()
    } catch (error) {
      if (error instanceof AgentAPIError) {
        throw error
      }
      
      throw new AgentAPIError(
        `Network error listing sessions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        error
      )
    }
  }
}

/**
 * Default API client instance
 * Can be imported and used directly
 */
export const defaultApiClient = new AgentAPIClient()
