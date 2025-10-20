// Zustand Store for Agent Communication
// Refactored to use utility modules for cleaner, more maintainable code

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

// Import types
import type {
  AgentMessage,
  MessagePart,
  AgentRunResponseEvent,
  ToolActivity,
  ResponseMetadata,
  ProcessedEvent
} from '@/app/src/types/agent'

// Import utilities
import { AgentAPIClient } from '@/app/src/utils/agent-api-client'
import { AgentSSEClient } from '@/app/src/utils/agent-sse-client'
import { AgentResponseProcessor } from '@/app/src/utils/agent-response-processor'
import { API_CONFIG } from '@/app/src/config/route'
import { 
  formatFunctionCallEvent, 
  formatFunctionResponseEvent, 
  formatCodeExecutionEvent 
} from '@/app/src/utils/event-formatter'

// Import message builders (re-export from types for backward compatibility)
export {
  createTextMessage,
  createFileMessage,
  createFileUriMessage,
  createExecutableCodeMessage,
  createMultipartMessage,
  fileToBase64
} from '@/app/src/types/agent'

// ============================================================================
// Store State Interface
// ============================================================================

interface AgentState {
  // State
  messages: AgentMessage[]
  messageEvents: Map<string, ProcessedEvent[]>  // Event timeline for each message
  isLoading: boolean
  isProcessing: boolean
  error: string | null
  userId: string
  sessionId: string | null
  
  // Actions
  sendMessage: (message: string, attachments?: File[]) => Promise<void>
  sendMultipartMessage: (parts: MessagePart[]) => Promise<void>
  updateMessage: (id: string, updates: Partial<AgentMessage>) => void
  addMessageEvent: (messageId: string, event: ProcessedEvent) => void  // Add event to timeline
  getEventsForMessage: (messageId: string) => ProcessedEvent[]  // Get events for a message
  retryMessage: (messageId: string) => Promise<void>
  clearMessages: () => void
  setUserId: (userId: string) => void
  clearError: () => void
}

// ============================================================================
// Utility Instances
// ============================================================================

const apiClient = new AgentAPIClient(API_CONFIG.baseUrl)
const sseClient = new AgentSSEClient()
const responseProcessor = new AgentResponseProcessor()

// ============================================================================
// Zustand Store
// ============================================================================

export const useAgentStore = create<AgentState>()(
  devtools(
    (set, get) => ({
      // --- Initial State ---
      messages: [
        {
          id: 'welcome',
          content: "Hello! I'm your AI Financial Concierge. Please enter your User ID to begin.",
          sender: 'agent',
          timestamp: new Date().toISOString(),
          status: 'sent',
        }
      ],
      messageEvents: new Map(),  // Event timeline storage
      isLoading: false,
      isProcessing: false,
      error: null,
      userId: '',
      sessionId: null,

      // --- Actions ---

      /**
       * Set user ID and reset session
       */
      setUserId: (userId: string) => {
        set({ 
          userId, 
          sessionId: null, // Always clear session when changing user ID
          error: null, // Clear any existing errors
          messages: [{
            id: 'welcome-user',
            content: `Welcome, ${userId}! How can I help you with your finances today?`,
            sender: 'agent',
            timestamp: new Date().toISOString(),
            status: 'sent',
          }]
        })
        console.log('👤 User ID set:', userId, '- Session cleared')
      },

      /**
       * Update a specific message
       */
      updateMessage: (id, updates) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        }))
      },

      /**
       * Add an event to a message's timeline
       */
      addMessageEvent: (messageId, event) => {
        set((state) => {
          const newMap = new Map(state.messageEvents)
          const existingEvents = newMap.get(messageId) || []
          newMap.set(messageId, [...existingEvents, event])
          
          console.log(`⏱️  [STORE] Added event to timeline for message ${messageId}:`, event.title)
          
          return { messageEvents: newMap }
        })
      },

      /**
       * Get all events for a specific message
       */
      getEventsForMessage: (messageId) => {
        const events = get().messageEvents.get(messageId) || []
        return events
      },

      /**
       * Send a text message with optional file attachments
       */
      sendMessage: async (message: string, attachments?: File[]) => {
        const parts: MessagePart[] = []
        
        // Add text message if provided
        if (message.trim()) {
          parts.push({ text: message })
        }
        
        // Process attachments if provided
        if (attachments && attachments.length > 0) {
          try {
            const { fileToBase64 } = await import('@/app/src/types/agent')
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
          } catch (error) {
            console.error('Error processing attachments:', error)
            set({ error: 'Failed to process file attachments' })
            return
          }
        }
        
        // Ensure we have at least one part
        if (parts.length === 0) {
          parts.push({ text: '' })
        }
        
        await get().sendMultipartMessage(parts)
      },

      /**
       * Send a multipart message to the agent
       * Main communication method with ADK
       */
      sendMultipartMessage: async (parts: MessagePart[]) => {
        const { userId, sessionId, updateMessage } = get()
        
        if (!userId) {
          set({ error: 'User ID is not set. Please authenticate first.' })
          return
        }

        // Create user message for display
        const textParts = parts.filter(p => p.text).map(p => p.text).join(' ')
        const userMessageId = `user-${uuidv4()}`

        const userMessage: AgentMessage = {
          id: userMessageId,
          content: textParts || 'Message with attachments',
          sender: 'user',
          timestamp: new Date().toISOString(),
          status: 'sending',
        }
        
        set(state => ({ 
          messages: [...state.messages, userMessage], 
          isLoading: true, 
          isProcessing: true,
          error: null 
        }))

        try {
          // Create or get session
          let currentSessionId = sessionId
          if (!currentSessionId) {
            console.log('📝 Creating new session...')
            try {
              const session = await apiClient.createSession(API_CONFIG.appName, userId)
              currentSessionId = session.id
              set({ sessionId: currentSessionId })
              console.log('✅ Session created:', currentSessionId)
            } catch (sessionError) {
              // If session creation fails (e.g., "already exists"), try to recover
              console.error('❌ Session creation failed:', sessionError)
              
              // Clear any cached session and try again
              set({ sessionId: null })
              throw new Error('Failed to create session. Please try changing your User ID or refreshing the page.')
            }
          }

          // Update user message status
          updateMessage(userMessageId, { status: 'sent' })

          // Send message using SSE for TRUE real-time streaming
          console.log('='.repeat(80))
          console.log('🌊 STARTING SSE STREAM')
          console.log('='.repeat(80))
          
          // Create initial agent message placeholder
          const agentMessageId = `agent-${Date.now()}`
          const initialAgentMessage: AgentMessage = {
            id: agentMessageId,
            content: 'Thinking...',
            sender: 'agent',
            timestamp: new Date().toISOString(),
            status: 'sending',
          }
          
          // Add placeholder message immediately
          set((state) => ({
            messages: [...state.messages, initialAgentMessage],
          }))

          // Accumulate data across events with deduplication
          const seenToolCallIds = new Set<string>()
          const seenToolResponseIds = new Set<string>()
          const seenTextParts = new Set<string>()
          let cumulativeText = ''
          let cumulativeToolCalls: any[] = []
          let cumulativeToolResponses: any[] = []
          let cumulativeCodeExecutions: any[] = []
          let cumulativeImages: string[] = []
          let hasFinalText = false

          // Start SSE stream
          await sseClient.sendMessageSSE(
            {
              appName: API_CONFIG.appName,
              userId,
              sessionId: currentSessionId,
              newMessage: { parts, role: 'user' },
              streaming: true,
            },
            // onEvent - called for each event as it arrives
            // NOTE: ADK /run_sse doesn't truly stream - it sends everything at once
            // We'll process events immediately but they arrive in a batch
            (event) => {
              const eventProcessStartTime = Date.now()
              console.log('━'.repeat(80))
              console.log(`⚡ EVENT RECEIVED AT ${new Date().toISOString()}`)
              console.log('━'.repeat(80))
              
              const partialProcessor = new AgentResponseProcessor()
              const partialProcessed = partialProcessor.process([event], true)
              
              console.log(`⏱️  [STORE] Processor returned in ${Date.now() - eventProcessStartTime}ms:`, {
                hasText: !!partialProcessed.textContent,
                hasToolCalls: !!partialProcessed.toolActivity?.calls?.length,
                hasToolResponses: !!partialProcessed.toolActivity?.responses?.length,
              })
              
              // ============================================================
              // ADD EVENTS TO TIMELINE (instead of accumulating in message)
              // ============================================================
              
              // Add tool calls as individual timeline events
              if (partialProcessed.toolActivity?.calls) {
                for (const call of partialProcessed.toolActivity.calls) {
                  const callKey = call.id || `${call.name}-${JSON.stringify(call.args)}`
                  if (!seenToolCallIds.has(callKey)) {
                    seenToolCallIds.add(callKey)
                    // Add to timeline instead of accumulating
                    const event = formatFunctionCallEvent(call.name, call.args, call.id)
                    get().addMessageEvent(agentMessageId, event)
                  }
                }
              }
              
              // Add tool responses as individual timeline events
              if (partialProcessed.toolActivity?.responses) {
                for (const response of partialProcessed.toolActivity.responses) {
                  const responseKey = response.id || response.name
                  if (!seenToolResponseIds.has(responseKey)) {
                    seenToolResponseIds.add(responseKey)
                    // Add to timeline instead of accumulating
                    const event = formatFunctionResponseEvent(response.name, response.result, response.id)
                    get().addMessageEvent(agentMessageId, event)
                  }
                }
              }
              
              // Add code executions as timeline events
              if (partialProcessed.codeActivity?.executions) {
                for (const exec of partialProcessed.codeActivity.executions) {
                  const event = formatCodeExecutionEvent(exec.code, exec.language, exec.result)
                  get().addMessageEvent(agentMessageId, event)
                }
              }
              
              // Collect images
              if (partialProcessed.artifacts?.images) {
                for (const img of partialProcessed.artifacts.images) {
                  if (!cumulativeImages.includes(img)) {
                    cumulativeImages.push(img)
                  }
                }
              }
              
              // Accumulate text content (deduplicate by exact match)
              if (partialProcessed.textContent && partialProcessed.textContent.trim()) {
                const newText = partialProcessed.textContent.trim()
                
                // Check if this text is NOT already in cumulative text
                if (!cumulativeText.includes(newText)) {
                  hasFinalText = true
                  cumulativeText = newText  // Replace, don't append (ADK sends complete text each time)
                  console.log(`⏱️  [STORE] New text content received (${newText.length} chars)`)
                } else {
                  console.log(`⏱️  [STORE] Duplicate text ignored`)
                }
              }

              // Update message with ONLY text content and images (no tool activity)
              const updatedMessage: Partial<AgentMessage> = {
                content: hasFinalText ? cumulativeText : 'Working on your request...',
                hasVisualization: cumulativeImages.length > 0,
                artifactImageUrl: cumulativeImages[0],
                status: 'sending',
              }
              
              console.log(`⏱️  [STORE] Updating message with text:`, {
                contentLength: updatedMessage.content?.length,
                hasText: hasFinalText,
                hasImages: cumulativeImages.length > 0,
              })
              
              updateMessage(agentMessageId, updatedMessage)
            },
            // onComplete - called when stream finishes
            () => {
              console.log('='.repeat(80))
              console.log('✅ SSE STREAM COMPLETED')
              console.log('='.repeat(80))
              // Mark as sent but KEEP the tool activity visible
              updateMessage(agentMessageId, { 
                status: 'sent',
                // ✅ Keep tool/code activity visible to show what the agent did
              })
              set({ isLoading: false, isProcessing: false })
            },
            // onError - called if stream fails
            (error) => {
              console.error('❌ SSE stream error:', error.message)
              throw error
            }
          )

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
          console.error('❌ Agent communication error:', errorMessage)
          
          // Update user message status to failed
          updateMessage(userMessageId, { status: 'failed' })
          
          // Add error message
          set(state => ({
            messages: [...state.messages, {
              id: `error-${uuidv4()}`,
              content: `Error: ${errorMessage}`,
            sender: 'agent',
              timestamp: new Date().toISOString(),
            isError: true,
              status: 'sent',
            }],
            isLoading: false,
            isProcessing: false,
            error: errorMessage,
          }))
        }
      },

      /**
       * Retry a failed message
       */
      retryMessage: async (messageId: string) => {
        const message = get().messages.find(m => m.id === messageId)
        if (!message || message.sender !== 'user') {
          console.warn('Cannot retry: message not found or not a user message')
          return
        }

        const retryCount = (message.retryCount || 0) + 1
        if (retryCount > API_CONFIG.retryAttempts) {
          set({ error: 'Maximum retry attempts reached' })
          return
        }

        console.log(`🔄 Retrying message (attempt ${retryCount}/${API_CONFIG.retryAttempts})`)
        get().updateMessage(messageId, { status: 'sending', retryCount })
        
        // Resend the message
        await get().sendMessage(message.content)
      },

      /**
       * Clear all messages
       */
      clearMessages: () => {
        const userId = get().userId
        set({ 
          messages: [{
            id: 'welcome-cleared',
            content: userId 
              ? `Welcome back, ${userId}! Your chat has been cleared. How can I assist you?` 
              : 'Chat cleared. Please enter your User ID.',
            sender: 'agent',
            timestamp: new Date().toISOString(),
            status: 'sent',
          }],
          messageEvents: new Map(),  // Clear event timeline too
        })
      },

      /**
       * Clear error state
       */
      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: 'agent-store',
    }
  )
)

// ============================================================================
// Selector Hooks (Optional - for optimized re-renders)
// ============================================================================

/**
 * Hook to get only the actions from the store
 * Prevents re-renders when state changes
 */
export const useAgentActions = () => {
  const sendMessage = useAgentStore(state => state.sendMessage)
  const sendMultipartMessage = useAgentStore(state => state.sendMultipartMessage)
  const updateMessage = useAgentStore(state => state.updateMessage)
  const addMessageEvent = useAgentStore(state => state.addMessageEvent)
  const getEventsForMessage = useAgentStore(state => state.getEventsForMessage)
  const retryMessage = useAgentStore(state => state.retryMessage)
  const clearMessages = useAgentStore(state => state.clearMessages)
  const setUserId = useAgentStore(state => state.setUserId)
  const clearError = useAgentStore(state => state.clearError)
  
  return {
    sendMessage,
    sendMultipartMessage,
    updateMessage,
    addMessageEvent,
    getEventsForMessage,
    retryMessage,
    clearMessages,
    setUserId,
    clearError,
    // Helper functions for quick actions
    requestSpendingAnalysis: () => sendMessage('Look at transactions for past 30 days, and return pie chart'),
    requestPortfolioBreakdown: () => sendMessage('Show me history of transactions on a monthly basis in bar chart, each one per month. generate bar chart with results'),
    requestBudgetComparison: () => sendMessage('Show stacked bars with assets on one side, liabilities on the other'),
  }
}

/**
 * Hook to get only the messages
 */
export const useMessages = () => useAgentStore(state => state.messages)

/**
 * Hook to get only the loading states
 */
export const useLoadingState = () => {
  const isLoading = useAgentStore(state => state.isLoading)
  const isProcessing = useAgentStore(state => state.isProcessing)
  return { isLoading, isProcessing }
}

/**
 * Hook to get error state
 */
export const useError = () => useAgentStore(state => state.error)
