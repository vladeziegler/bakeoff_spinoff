// ADK Agent Type Definitions
// Based on api.json Event-Output schema and ADK documentation

// ============================================================================
// Message Types
// ============================================================================

export interface AgentMessage {
  id: string
  content: string
  sender: 'user' | 'agent'
  timestamp: string  // ISO 8601 string for proper serialization
  hasVisualization?: boolean
  artifactImageUrl?: string
  isError?: boolean
  status?: 'sending' | 'sent' | 'failed'
  retryCount?: number
  toolActivity?: ToolActivity
  codeActivity?: CodeActivity  // Added for code execution display
  metadata?: ResponseMetadata
}

// ============================================================================
// Event Timeline (for displaying agent reasoning steps)
// ============================================================================

export interface ProcessedEvent {
  title: string
  data: {
    type: 'functionCall' | 'functionResponse' | 'thinking' | 'codeExecution' | 'text'
    name?: string
    args?: any
    response?: any
    content?: string
    code?: string
    language?: string
    result?: string
  }
  timestamp: string
}

// ============================================================================
// ADK Event Types (from api.json)
// ============================================================================

export interface AgentRunResponseEvent {
  content?: {
    parts?: MessagePart[]
    role?: string
  }
  groundingMetadata?: GroundingMetadata
  partial?: boolean           // Indicates streaming/partial response
  turn_complete?: boolean     // Indicates end of agent turn (snake_case from backend)
  turnComplete?: boolean      // Also support camelCase for compatibility
  errorCode?: string         // Error identifier
  errorMessage?: string      // Error description
  interrupted?: boolean      // If execution was interrupted
  customMetadata?: any       // Custom metadata
}

// ============================================================================
// Message Part Types (Content can have multiple parts)
// ============================================================================

export interface MessagePart {
  // Content types (exactly ONE should be set per part)
  text?: string                           // Text response
  inlineData?: InlineData                 // Base64 encoded data (images, etc.)
  fileData?: FileData                     // File reference by URI
  
  // Execution and function related
  executableCode?: ExecutableCode         // Code to execute
  functionCall?: FunctionCall             // Tool/function being called
  functionResponse?: FunctionResponse     // Tool/function response
  codeExecutionResult?: CodeExecutionResult // Result of code execution
  
  // Metadata
  videoMetadata?: VideoMetadata
  thought?: boolean                       // Internal reasoning (not shown to user)
  thoughtSignature?: string               // Signature of thought
}

// ============================================================================
// Content Type Interfaces
// ============================================================================

export interface InlineData {
  displayName?: string
  data: string  // base64 encoded
  mimeType: string
}

export interface FileData {
  displayName?: string
  fileUri: string
  mimeType: string
}

export interface ExecutableCode {
  code: string
  language?: string
}

export interface FunctionCall {
  id?: string
  name: string
  args?: Record<string, any>
}

export interface FunctionResponse {
  id?: string
  name: string
  response?: Record<string, any>
  willContinue?: boolean
  scheduling?: 'SCHEDULING_UNSPECIFIED' | 'SILENT' | 'WHEN_IDLE' | 'INTERRUPT'
}

export interface CodeExecutionResult {
  outcome?: string
  output?: string
}

export interface VideoMetadata {
  fps?: number
  startOffset?: string
  endOffset?: string
}

export interface GroundingMetadata {
  // Grounding metadata structure (can be extended as needed)
  [key: string]: any
}

// ============================================================================
// Processed Response Types
// ============================================================================

export interface ProcessedAgentResponse {
  textContent: string
  artifacts?: ArtifactCollection
  toolActivity?: ToolActivity
  codeActivity?: CodeActivity
  metadata: ResponseMetadata
}

export interface ArtifactCollection {
  images?: string[]  // Blob URLs or data URLs
  files?: FileReference[]
}

export interface FileReference {
  uri: string
  name: string
  mimeType: string
}

export interface ToolActivity {
  calls: ToolCall[]
  responses: ToolResponse[]
}

export interface ToolCall {
  name: string
  args: any
  id?: string
}

export interface ToolResponse {
  name: string
  result: any
  id?: string
}

export interface CodeActivity {
  executions: CodeExecution[]
}

export interface CodeExecution {
  code: string
  language: string
  result?: string
}

export interface ResponseMetadata {
  hasThoughts: boolean
  turnComplete: boolean
  interrupted: boolean
  hasErrors: boolean
  errorMessage?: string
}

// ============================================================================
// API Request Types
// ============================================================================

export interface AgentRunRequest {
  appName: string
  userId: string
  sessionId: string
  newMessage: {
    parts?: MessagePart[]
    role?: string
  }
  streaming?: boolean
  stateDelta?: Record<string, any> | null
}

export interface CreateSessionResponse {
  id: string
  app_name: string
  user_id: string
  created_at: string
  last_accessed_at: string
  state: Record<string, any>
}

// ============================================================================
// Message Builder Utilities
// ============================================================================

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

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Convert File to base64 string
 */
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
