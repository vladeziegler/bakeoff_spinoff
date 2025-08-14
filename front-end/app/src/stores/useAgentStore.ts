import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// --- Types based on api.json ---

interface AgentMessage {
  id: string
  content: string
  sender: 'user' | 'agent'
  timestamp: Date
  hasVisualization?: boolean
  visualizationHtml?: string
  isError?: boolean
}

interface Session {
  id: string
  app_name: string
  user_id: string
  created_at: string
  last_accessed_at: string
  state: Record<string, any>
}

interface AgentRunRequest {
  appName: string
  userId: string
  sessionId: string
  newMessage: {
    parts: Array<{
      text: string
    }>
    role: 'user'
  }
}

interface AgentRunResponseEvent {
  // Define structure based on Event-Output from api.json
  content?: {
    parts?: Array<{
      text?: string
    }>
  }
  turn_complete?: boolean
  // Add other potential fields from the spec if needed
}

// --- Zustand Store Definition ---

interface AgentState {
  // State
  messages: AgentMessage[]
  isLoading: boolean
  error: string | null
  userId: string
  sessionId: string | null
  
  // Actions
  sendMessage: (message: string) => Promise<void>
  clearMessages: () => void
  setUserId: (userId: string) => void
  clearError: () => void
}

// Configuration
const AGENT_BASE_URL = 'http://localhost:8881'
const APP_NAME = 'banking_agent'

export const useAgentStore = create<AgentState>()(
  devtools(
    (set, get) => ({
      // --- Initial State ---
      messages: [
        {
          id: 'welcome',
          content: "Hello! I'm your AI Financial Concierge. Please enter your User ID to begin.",
          sender: 'agent',
          timestamp: new Date(),
        }
      ],
      isLoading: false,
      error: null,
      userId: '',
      sessionId: null,

      // --- Actions ---

      setUserId: (userId: string) => {
        set({ 
          userId, 
          sessionId: null, // Reset session when user changes
          messages: [{
            id: 'welcome-user',
            content: `Welcome, ${userId}! How can I help you with your finances today?`,
            sender: 'agent',
            timestamp: new Date(),
          }]
        })
      },

      sendMessage: async (message: string) => {
        const { userId } = get()
        if (!userId) {
          set({ error: 'User ID is not set. Please authenticate first.' })
          return
        }

        // Add user message to UI immediately
        const userMessage: AgentMessage = {
          id: `user-${Date.now()}`,
          content: message,
          sender: 'user',
          timestamp: new Date(),
        }
        set(state => ({ 
          messages: [...state.messages, userMessage], 
          isLoading: true, 
          error: null 
        }))

        try {
          // Step 1 & 2: Get or create a session
          let currentSessionId = get().sessionId
          if (!currentSessionId) {
            const sessionsUrl = `${AGENT_BASE_URL}/apps/${APP_NAME}/users/${userId}/sessions`
            
            // Check for existing sessions
            const listResponse = await fetch(sessionsUrl)
            if (!listResponse.ok) throw new Error(`Failed to list sessions: ${listResponse.statusText}`)
            const existingSessions: Session[] = await listResponse.json()

            if (existingSessions.length > 0) {
              currentSessionId = existingSessions[0].id // Use the most recent session
            } else {
              // Create a new session
              const createResponse = await fetch(sessionsUrl, { method: 'POST' })
              if (!createResponse.ok) throw new Error(`Failed to create session: ${createResponse.statusText}`)
              const newSession: Session = await createResponse.json()
              currentSessionId = newSession.id
            }
            set({ sessionId: currentSessionId })
          }

          // Step 3: Run the agent
          const runUrl = `${AGENT_BASE_URL}/run`
          const runPayload: AgentRunRequest = {
            appName: APP_NAME,
            userId: userId,
            sessionId: currentSessionId!,
            newMessage: {
              parts: [{ text: message }],
              role: 'user',
            },
          }

          const runResponse = await fetch(runUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(runPayload),
          })

          if (!runResponse.ok) {
            throw new Error(`Agent run failed: ${runResponse.status} ${runResponse.statusText}`)
          }

          const responseEvents: AgentRunResponseEvent[] = await runResponse.json()
          
          // Process the response to find the final message
          const agentReply = processAgentResponse(responseEvents)

          set(state => ({
            messages: [...state.messages, agentReply],
          }))

        } catch (error) {
          console.error('Agent communication error:', error)
          const errorMessage: AgentMessage = {
            id: `error-${Date.now()}`,
            content: `I'm sorry, I encountered an error. Please try again. Details: ${error instanceof Error ? error.message : 'Unknown error'}`,
            sender: 'agent',
            timestamp: new Date(),
            isError: true,
          }
          set(state => ({
            messages: [...state.messages, errorMessage],
          }))
        } finally {
          set({ isLoading: false })
        }
      },

      clearMessages: () => {
        const userId = get().userId
        set({ 
          messages: [{
            id: 'welcome-cleared',
            content: userId ? `Welcome back, ${userId}! Your chat has been cleared. How can I assist you?` : 'Chat cleared. Please enter your User ID.',
            sender: 'agent',
            timestamp: new Date(),
          }],
        })
      },

      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: 'agent-store-rest',
    }
  )
)

// --- Helper Functions ---

function processAgentResponse(events: AgentRunResponseEvent[]): AgentMessage {
  // Find the final text response from the agent in the event stream
  let finalContent = "I've processed your request."
  
  for (const event of events) {
    if (event.content?.parts?.[0]?.text) {
      finalContent = event.content.parts[0].text
    }
  }

  // Check for visualization HTML in the final content
  const { content, hasVisualization, visualizationHtml } = processMessageForVisualization(finalContent)
  
  return {
    id: `agent-${Date.now()}`,
    content: content || "Here is your visualization.",
    sender: 'agent',
    timestamp: new Date(),
    hasVisualization,
    visualizationHtml,
  }
}

function processMessageForVisualization(messageText: string) {
  let content = messageText
  let hasVisualization = false
  let visualizationHtml = ''

  if (messageText && (messageText.includes('<div class="graph-container" id="graph">') || messageText.includes('id="graph"'))) {
    hasVisualization = true
    const graphMatch = messageText.match(/<div[^>]*id="graph"[^>]*>.*?<\/div>/s)
    if (graphMatch) {
      visualizationHtml = graphMatch[0]
      content = messageText.replace(graphMatch[0], '').trim()
    }
  }

  return { content, hasVisualization, visualizationHtml }
}

export const useAgentActions = () => {
  const sendMessage = useAgentStore(state => state.sendMessage)
  
  return {
    requestSpendingAnalysis: () => sendMessage('Show me my spending analysis with a chart'),
    requestPortfolioBreakdown: () => sendMessage('Display my portfolio breakdown with visualization'),
    requestBudgetComparison: () => sendMessage('Show budget vs actual comparison chart'),
  }
}