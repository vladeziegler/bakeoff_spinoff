import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid';  

// --- Types based on api.json ---

interface AgentMessage {
  id: string
  content: string
  sender: 'user' | 'agent'
  timestamp: Date
  hasVisualization?: boolean
  visualizationHtml?: string
  chartUrl?: string
  isError?: boolean
  attachments?: MessageAttachment[]
}

interface MessageAttachment {
  type: 'file' | 'image' | 'video' | 'audio'
  name: string
  mimeType: string
  data?: string // base64 encoded for inline data
  fileUri?: string // for file references
}

interface Session {
  id: string
  app_name: string
  user_id: string
  created_at: string
  last_accessed_at: string
  state: Record<string, any>
}

// Complete ADK message part types based on api.json
interface VideoMetadata {
  fps?: number
  endOffset?: string
  startOffset?: string
}

interface InlineData {
  displayName?: string
  data: string  // base64 encoded
  mimeType: string
}

interface FileData {
  displayName?: string
  fileUri: string
  mimeType: string
}

interface ExecutableCode {
  code: string
  language?: string
}

interface FunctionCall {
  id?: string
  name: string
  args?: Record<string, any>
}

interface FunctionResponse {
  willContinue?: boolean
  scheduling?: 'SCHEDULING_UNSPECIFIED' | 'SILENT' | 'WHEN_IDLE' | 'INTERRUPT'
  id?: string
  name: string
  response?: Record<string, any>
}

interface CodeExecutionResult {
  outcome?: string
  output?: string
}

interface MessagePart {
  // Content types (exactly one should be set)
  text?: string
  inlineData?: InlineData
  fileData?: FileData
  
  // Execution and function related
  executableCode?: ExecutableCode
  functionCall?: FunctionCall
  functionResponse?: FunctionResponse
  codeExecutionResult?: CodeExecutionResult
  
  // Metadata
  videoMetadata?: VideoMetadata
  thought?: boolean
  thoughtSignature?: string
}

interface AgentRunRequest {
  appName: string
  userId: string
  sessionId: string
  newMessage: {
    parts?: MessagePart[]  // Optional according to API spec
    role?: string          // Optional according to API spec
  }
  streaming?: boolean      // Optional with default false
  stateDelta?: Record<string, any> | null  // Optional, can be null
}

interface AgentRunResponseEvent {
  // Define structure based on Event-Output from api.json
  content?: {
    parts?: MessagePart[]
    role?: string
  }
  turn_complete?: boolean
  interrupted?: boolean
  // Add other potential fields from the spec if needed
}

// --- Message Builder Utilities ---

export function createTextMessage(text: string): MessagePart {
  return { text }
}

export function createFileMessage(file: File, data: string): MessagePart {
  return {
    inlineData: {
      displayName: file.name,
      data: data, // base64 encoded
      mimeType: file.type
    }
  }
}

export function createFileUriMessage(fileUri: string, displayName: string, mimeType: string): MessagePart {
  return {
    fileData: {
      displayName,
      fileUri,
      mimeType
    }
  }
}

export function createExecutableCodeMessage(code: string, language: string = 'LANGUAGE_UNSPECIFIED'): MessagePart {
  return {
    executableCode: {
      code,
      language
    }
  }
}

export function createMultipartMessage(parts: MessagePart[]): MessagePart[] {
  return parts
}

// Helper to convert File to base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64Data = result.split(',')[1]
      resolve(base64Data)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
  sendMessage: (message: string, attachments?: File[]) => Promise<void>
  sendMultipartMessage: (parts: MessagePart[]) => Promise<void>
  clearMessages: () => void
  setUserId: (userId: string) => void
  clearError: () => void
  // Add a new method to handle responses and update messages
  handleAgentResponse: (response: AgentRunResponseEvent[]) => void;
  isProcessing: boolean;
  isGeminiFormatting: boolean;
}

// Configuration
const AGENT_BASE_URL = '/api'; // Using the proxy
const APP_NAME = 'banking_agent'
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent'

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
      isProcessing: false, // New state to track agent processing
      error: null,
      userId: '',
      sessionId: null,
      isGeminiFormatting: false, // New state for Gemini formatting status

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

      sendMessage: async (message: string, attachments?: File[]) => {
        const parts: MessagePart[] = []
        
        // Add text message if provided
        if (message.trim()) {
          parts.push(createTextMessage(message))
        }
        
        // Process attachments if provided
        if (attachments && attachments.length > 0) {
          try {
            for (const file of attachments) {
              const base64Data = await fileToBase64(file)
              parts.push(createFileMessage(file, base64Data))
            }
          } catch (error) {
            console.error('Error processing attachments:', error)
            set({ error: 'Failed to process file attachments' })
            return
          }
        }
        
        // Ensure we have at least one part
        if (parts.length === 0) {
          // Send an empty text part if no other content
          parts.push(createTextMessage(''));
        }
        
        await get().sendMultipartMessage(parts);
      },

      sendMultipartMessage: async (parts: MessagePart[]) => {
        const { userId } = get();
        if (!userId) {
          set({ error: 'User ID is not set. Please authenticate first.' });
          return;
        }

        const textParts = parts.filter(p => p.text).map(p => p.text).join(' ');
        const displayAttachments: MessageAttachment[] = parts
          .map(part => {
          if (part.inlineData) {
              return {
                type: part.inlineData.mimeType.startsWith('image/') ? 'image' : 'file',
              name: part.inlineData.displayName || 'attachment',
              mimeType: part.inlineData.mimeType,
              data: part.inlineData.data
              };
            }
            return null;
          })
          .filter((attachment): attachment is MessageAttachment => attachment !== null);

        const userMessage: AgentMessage = {
          id: `user-${uuidv4()}`,
          content: textParts || 'Message with attachments',
          sender: 'user',
          timestamp: new Date(),
          attachments: displayAttachments.length > 0 ? displayAttachments : undefined
        };
        set(state => ({ 
          messages: [...state.messages, userMessage], 
          isLoading: true, 
          isProcessing: true,
          error: null 
        }));

        try {
          let currentSessionId = get().sessionId;
          if (!currentSessionId) {
            const sessionsUrl = `${AGENT_BASE_URL}/apps/${APP_NAME}/users/${userId}/sessions`;
            const listResponse = await fetch(sessionsUrl);
            if (!listResponse.ok) throw new Error(`Failed to list sessions: ${listResponse.statusText}`);
            const existingSessions: { sessions: Session[] } = await listResponse.json();

            if (existingSessions.sessions && existingSessions.sessions.length > 0) {
              currentSessionId = existingSessions.sessions[0].id;
            } else {
              const createResponse = await fetch(sessionsUrl, { method: 'POST' });
              if (!createResponse.ok) throw new Error(`Failed to create session: ${createResponse.statusText}`);
              const newSession: Session = await createResponse.json();
              currentSessionId = newSession.id;
            }
            set({ sessionId: currentSessionId });
          }

          const runUrl = `${AGENT_BASE_URL}/apps/${APP_NAME}/users/${userId}/sessions/${currentSessionId}:run`;
          const runPayload = { newMessage: { parts, role: 'user' } };

          console.log('🚀 Sending request to:', runUrl);
          console.log('📤 Request payload:', JSON.stringify(runPayload, null, 2));

          const runResponse = await fetch(runUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
            },
            body: JSON.stringify(runPayload),
          });
          
          console.log('📥 Response status:', runResponse.status, runResponse.statusText);
          
          set({ isLoading: false }); // Request sent, now processing

          if (!runResponse.ok) {
            const errorBody = await runResponse.text();
            console.error('❌ Error response body:', errorBody);
            throw new Error(`Agent run failed: ${runResponse.status} ${runResponse.statusText} - ${errorBody}`);
          }

          const responseEvents: AgentRunResponseEvent[] = await runResponse.json();
          console.log('✅ Response events:', responseEvents);
          get().handleAgentResponse(responseEvents);

        } catch (error) {
          const errorMessage = `Agent communication error: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(errorMessage);
          set(state => ({
            messages: [...state.messages, {
              id: `error-${uuidv4()}`,
              content: errorMessage,
            sender: 'agent',
            timestamp: new Date(),
            isError: true,
            }],
            isLoading: false,
            isProcessing: false,
            error: errorMessage,
          }));
        }
      },

      clearMessages: () => {
        const userId = get().userId;
        set({ 
          messages: [{
            id: 'welcome-cleared',
            content: userId ? `Welcome back, ${userId}! Your chat has been cleared. How can I assist you?` : 'Chat cleared. Please enter your User ID.',
            sender: 'agent',
            timestamp: new Date(),
          }],
        });
      },

      clearError: () => {
        set({ error: null });
      },
    // Add a new method to handle responses and update messages
    handleAgentResponse: (response: AgentRunResponseEvent[]) => {
      set((state) => {
        const agentMessage = processAgentResponse(response);
        return {
          messages: [...state.messages, agentMessage],
          isLoading: false,
          isProcessing: false,
        };
      });
      },
    }),
    {
      name: 'agent-store-rest',
    }
  )
)

// Helper function to process agent responses
function processAgentResponse(events: AgentRunResponseEvent[]): AgentMessage {
  console.log('🔄 Processing agent response events:', events);
  
  let finalContent = "I've processed your request.";
  let chartUrl: string | undefined = undefined;

  // Search through all events and parts to find text content
  for (const event of events) {
    console.log('📝 Processing event:', event);
    if (event.content?.parts) {
      for (const part of event.content.parts) {
        console.log('📄 Processing part:', part);
        if (part.text) {
          console.log('💬 Found text:', part.text);
          // Check for CHART_URL pattern (handle with or without space after colon)
          const chartUrlMatch = part.text.match(/CHART_URL:([^\s]+)/);
          if (chartUrlMatch) {
            chartUrl = chartUrlMatch[1];
            console.log('🖼️ Found chart URL:', chartUrl);
            // Remove the CHART_URL pattern from display text
            finalContent = part.text.replace(/CHART_URL:[^\s]+/, '').trim();
          } else {
            // Fallback: Check for HTML img tag with /static/images/ src
            const imgTagMatch = part.text.match(/<img[^>]+src="([^"]*\/static\/images\/[^"]+)"[^>]*>/);
            if (imgTagMatch && !chartUrl) {
              chartUrl = imgTagMatch[1];
              console.log('🖼️ Found chart URL in img tag:', chartUrl);
              // Remove the img tag from display text for cleaner presentation
              finalContent = part.text.replace(/<img[^>]+src="[^"]*\/static\/images\/[^"]+"[^>]*>/, '').trim();
            } else if (!chartUrl) {
              // Use this text if we haven't found a chart URL yet
              finalContent = part.text;
            }
          }
        }
      }
    }
  }

  const result = {
    id: `agent-${Date.now()}`,
    content: finalContent,
    sender: 'agent',
    timestamp: new Date(),
    hasVisualization: !!chartUrl,
    chartUrl: chartUrl
  };
  
  console.log('✨ Final processed message:', result);
  return result;
}

export const useAgentActions = () => {
  const sendMessage = useAgentStore(state => state.sendMessage)
  
  return {
    requestSpendingAnalysis: () => sendMessage('Show me my spending analysis with a chart'),
    requestPortfolioBreakdown: () => sendMessage('Display my portfolio breakdown with visualization'),
    requestBudgetComparison: () => sendMessage('Show budget vs actual comparison chart'),
  }
}