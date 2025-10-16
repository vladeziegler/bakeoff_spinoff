// Agent Response Processor
// Processes ADK event arrays into structured, usable responses

import type {
  AgentRunResponseEvent,
  MessagePart,
  ProcessedAgentResponse,
  ToolActivity,
  CodeActivity,
  ResponseMetadata,
  FileReference
} from '@/app/src/types/agent'
import { processBase64Image } from './base64'
import { formatAgentText, formatToolCall, formatToolResponse, formatCodeExecution, formatCodeResult } from './text-formatter'

/**
 * Agent Response Processor
 * Handles all ADK event types and extracts structured information
 */
export class AgentResponseProcessor {
  // Accumulated data from events
  private textParts: string[] = []
  private imageUrls: string[] = []
  private fileRefs: FileReference[] = []
  private toolCalls: Array<{name: string, args: any, id?: string}> = []
  private toolResponses: Array<{name: string, result: any, id?: string}> = []
  private codeExecutions: Array<{code: string, language: string, result?: string}> = []
  
  // Metadata tracking
  private hasThoughts = false
  private hasErrors = false
  private errorMessage?: string
  private turnComplete = false
  private interrupted = false

  /**
   * Process array of ADK events into structured response
   * 
   * @param events - Array of events from ADK agent
   * @param includePartial - Whether to include partial/streaming events
   * @returns Processed response with all extracted information
   */
  process(events: AgentRunResponseEvent[], includePartial = false): ProcessedAgentResponse {
    this.reset()
    
    console.log(`🔄 Processing ${events.length} agent events`)
    
    for (const event of events) {
      this.processEvent(event, includePartial)
    }

    return this.buildResponse()
  }

  /**
   * Reset all accumulated data
   * Called at the start of each process() call
   */
  private reset(): void {
    this.textParts = []
    this.imageUrls = []
    this.fileRefs = []
    this.toolCalls = []
    this.toolResponses = []
    this.codeExecutions = []
    this.hasThoughts = false
    this.hasErrors = false
    this.errorMessage = undefined
    this.turnComplete = false
    this.interrupted = false
  }

  /**
   * Process a single event
   */
  private processEvent(event: AgentRunResponseEvent, includePartial: boolean): void {
    // Skip partial events unless explicitly requested
    if (event.partial && !includePartial) {
      console.log('⏳ Skipping partial event')
      return
    }

    // Track event-level metadata (handle both snake_case and camelCase)
    if (event.turnComplete || event.turn_complete) {
      this.turnComplete = true
      console.log('✅ Agent turn complete')
    }
    
    if (event.interrupted) {
      this.interrupted = true
      console.log('⚠️ Agent interrupted')
    }
    
    if (event.errorCode || event.errorMessage) {
      this.hasErrors = true
      this.errorMessage = event.errorMessage || event.errorCode
      console.warn('⚠️ Agent error:', this.errorMessage)
    }

    // Process content parts
    if (event.content?.parts) {
      console.log(`📄 Processing ${event.content.parts.length} content parts`)
      for (const part of event.content.parts) {
        this.processPart(part)
      }
    }
  }

  /**
   * Process a single message part
   * Handles all ADK part types: text, functions, code, files, etc.
   */
  private processPart(part: MessagePart): void {
    // ========================================================================
    // Text Content
    // ========================================================================
    if (part.text) {
      if (part.thought) {
        // Internal reasoning - don't show to user
        this.hasThoughts = true
        console.log('💭 Agent thought (internal):', part.text.substring(0, 100))
      } else {
        // Regular text response
        this.textParts.push(part.text)
        console.log('💬 Text part:', part.text.substring(0, 100) + (part.text.length > 100 ? '...' : ''))
      }
    }

    // ========================================================================
    // Function/Tool Calls
    // ========================================================================
    if (part.functionCall) {
      console.log('🔧 Tool call:', part.functionCall.name, part.functionCall.id || '')
      this.toolCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args || {},
        id: part.functionCall.id
      })
    }

    // ========================================================================
    // Function/Tool Responses
    // ========================================================================
    if (part.functionResponse) {
      console.log('✅ Tool response:', part.functionResponse.name, part.functionResponse.id || '')
      this.toolResponses.push({
        name: part.functionResponse.name,
        result: part.functionResponse.response || {},
        id: part.functionResponse.id
      })
    }

    // ========================================================================
    // Code Execution
    // ========================================================================
    if (part.executableCode) {
      console.log('💻 Executable code:', part.executableCode.language || 'unknown')
      this.codeExecutions.push({
        code: part.executableCode.code,
        language: part.executableCode.language || 'unknown',
        result: undefined
      })
    }

    if (part.codeExecutionResult) {
      console.log('📊 Code execution result:', part.codeExecutionResult.outcome || 'no outcome')
      
      // Match with the most recent code execution
      const lastExec = this.codeExecutions[this.codeExecutions.length - 1]
      if (lastExec) {
        lastExec.result = part.codeExecutionResult.output || part.codeExecutionResult.outcome
      } else {
        // Code result without preceding code - create entry
        this.codeExecutions.push({
          code: '',
          language: 'unknown',
          result: part.codeExecutionResult.output || part.codeExecutionResult.outcome
        })
      }
    }

    // ========================================================================
    // Inline Data (Images, Audio, Video, etc.)
    // ========================================================================
    if (part.inlineData) {
      console.log('📦 Inline data:', part.inlineData.mimeType, part.inlineData.displayName || 'unnamed')
      
      // Handle images
      if (part.inlineData.mimeType?.startsWith('image/')) {
        const imageUrl = processBase64Image(part.inlineData)
        if (imageUrl) {
          this.imageUrls.push(imageUrl)
          console.log('🎨 Processed image artifact')
        } else {
          console.error('❌ Failed to process image artifact')
        }
      }
      
      // Can extend to handle other mime types:
      // - audio/* -> audio player
      // - video/* -> video player
      // - application/pdf -> PDF viewer
      // etc.
    }

    // ========================================================================
    // File Data (File References)
    // ========================================================================
    if (part.fileData) {
      console.log('📁 File reference:', part.fileData.fileUri, part.fileData.displayName || 'unnamed')
      this.fileRefs.push({
        uri: part.fileData.fileUri,
        name: part.fileData.displayName || 'Unknown File',
        mimeType: part.fileData.mimeType
      })
    }

    // ========================================================================
    // Video Metadata
    // ========================================================================
    if (part.videoMetadata) {
      console.log('🎥 Video metadata:', {
        fps: part.videoMetadata.fps,
        startOffset: part.videoMetadata.startOffset,
        endOffset: part.videoMetadata.endOffset
      })
      // Can be used to enhance video playback if fileData or inlineData contains video
    }
  }

  /**
   * Build final processed response from accumulated data
   */
  private buildResponse(): ProcessedAgentResponse {
    // Just get the main text content - don't add tool activity narrative
    // Tool activity will be shown separately in the UI
    const rawText = this.textParts.length > 0
      ? this.textParts.join('\n\n')
      : ''
    
    // Clean up and format the text for better display
    const textContent = formatAgentText(rawText)

    // Build tool activity if any tools were used
    const toolActivity: ToolActivity | undefined = 
      this.toolCalls.length > 0 || this.toolResponses.length > 0
        ? {
            calls: this.toolCalls,
            responses: this.toolResponses
          }
        : undefined

    // Build code activity if any code was executed
    const codeActivity: CodeActivity | undefined =
      this.codeExecutions.length > 0
        ? { executions: this.codeExecutions }
        : undefined

    // Build artifacts collection
    const artifacts = 
      this.imageUrls.length > 0 || this.fileRefs.length > 0
        ? {
            images: this.imageUrls.length > 0 ? this.imageUrls : undefined,
            files: this.fileRefs.length > 0 ? this.fileRefs : undefined
          }
        : undefined

    // Build metadata
    const metadata: ResponseMetadata = {
      hasThoughts: this.hasThoughts,
      turnComplete: this.turnComplete,
      interrupted: this.interrupted,
      hasErrors: this.hasErrors,
      errorMessage: this.errorMessage
    }

    // Log summary
    console.log('✨ Response processing complete:', {
      textLength: textContent.length,
      imageCount: this.imageUrls.length,
      fileCount: this.fileRefs.length,
      toolCallCount: this.toolCalls.length,
      toolResponseCount: this.toolResponses.length,
      codeExecutionCount: this.codeExecutions.length,
      hasThoughts: this.hasThoughts,
      hasErrors: this.hasErrors,
      turnComplete: this.turnComplete
    })

    return {
      textContent,
      artifacts,
      toolActivity,
      codeActivity,
      metadata
    }
  }
}

/**
 * Default processor instance
 * Can be imported and used directly
 */
export const defaultResponseProcessor = new AgentResponseProcessor()
