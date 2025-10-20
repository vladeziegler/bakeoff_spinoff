/**
 * JSON Fragment Processor for ADK Streaming
 * Based on the reference implementation's JSONFragmentProcessor
 * Processes streaming JSON fragments from ADK and converts them to SSE format
 */

interface AgentEngineContentPart {
  text?: string
  thought?: boolean
  functionCall?: {
    name: string
    args: Record<string, unknown>
    id?: string
  }
  functionResponse?: {
    name: string
    response: Record<string, unknown>
    id?: string
  }
  thoughtSignature?: string
  inlineData?: {
    mimeType: string
    data: string
  }
}

interface AgentEngineFragment {
  content?: {
    parts?: AgentEngineContentPart[]
  }
  author?: string
  actions?: unknown
  usage_metadata?: Record<string, unknown>
  invocationId?: string
  partial?: boolean
}

export class JSONFragmentProcessor {
  private buffer: string = ''
  private currentAgent: string = ''
  private onFragment: (fragment: string) => void

  constructor(onFragment: (fragment: string) => void) {
    this.onFragment = onFragment
  }

  /**
   * Process chunks from ADK - accumulate in buffer and extract complete fragments
   */
  processChunk(chunk: string): void {
    console.log(`[JSON PROCESSOR] Processing chunk: ${chunk.length} bytes`)
    
    this.buffer += chunk
    
    // Extract complete JSON fragments from buffer
    this.extractCompleteFragmentsFromBuffer()
  }

  /**
   * Extract complete JSON fragments from buffer
   */
  private extractCompleteFragmentsFromBuffer(): void {
    let searchPos = 0
    
    while (searchPos < this.buffer.length) {
      // Find start of potential JSON object
      const objStart = this.buffer.indexOf('{', searchPos)
      if (objStart === -1) break
      
      // Try to extract complete JSON objects of increasing length
      for (let endPos = objStart + 1; endPos <= this.buffer.length; endPos++) {
        const potentialJson = this.buffer.substring(objStart, endPos)
        
        // Only attempt parsing if it looks complete (ends with })
        if (!potentialJson.endsWith('}')) continue
        
        try {
          const fragment: AgentEngineFragment = JSON.parse(potentialJson)
          
          console.log(`[JSON PROCESSOR] Parsed complete fragment from: ${fragment.author || 'unknown'}`)
          
          // Process this complete fragment
          this.processCompleteFragment(fragment)
          
          // Remove processed JSON from buffer and reset search
          this.buffer = this.buffer.substring(objStart + potentialJson.length)
          searchPos = 0
          break // Found complete object, continue from start
          
        } catch (error) {
          // Not complete JSON yet, try longer substring
          continue
        }
      }
      
      // If no complete object found starting at this position, move forward
      if (searchPos === objStart) {
        searchPos = objStart + 1
      } else {
        break // No progress made, exit
      }
    }
  }

  /**
   * Process a complete JSON fragment
   */
  private processCompleteFragment(fragment: AgentEngineFragment): void {
    // Update current agent
    if (fragment.author) {
      this.currentAgent = fragment.author
    }

    // Process content parts if they exist
    if (fragment.content?.parts) {
      for (const part of fragment.content.parts) {
        console.log(`[JSON PROCESSOR] Emitting part (thought: ${part.thought})`)
        this.emitCompletePart(part)
      }
    }

    // Process metadata
    if (fragment.actions || fragment.usage_metadata || fragment.invocationId || fragment.partial !== undefined) {
      const additionalData: Record<string, unknown> = {
        author: fragment.author || this.currentAgent || 'agent',
      }

      if (fragment.actions) additionalData.actions = fragment.actions
      if (fragment.usage_metadata) additionalData.usage_metadata = fragment.usage_metadata
      if (fragment.invocationId) additionalData.invocation_id = fragment.invocationId
      if (fragment.partial !== undefined) additionalData.partial = fragment.partial

      console.log(`[JSON PROCESSOR] Emitting metadata`)
      this.onFragment(`data: ${JSON.stringify(additionalData)}\n\n`)
    }
  }

  /**
   * Emit a complete part as SSE format
   */
  private emitCompletePart(part: AgentEngineContentPart): void {
    const sseData = {
      content: {
        parts: [part],
      },
      author: this.currentAgent || 'agent',
    }

    const sseEvent = `data: ${JSON.stringify(sseData)}\n\n`
    this.onFragment(sseEvent)
  }

  /**
   * Finalize processing
   */
  finalize(): void {
    console.log('[JSON PROCESSOR] Finalizing stream')

    if (this.buffer.trim()) {
      console.log('[JSON PROCESSOR] Processing remaining buffer:', this.buffer.length, 'chars')
      
      try {
        const fragment: AgentEngineFragment = JSON.parse(this.buffer)
        console.log('[JSON PROCESSOR] Parsing complete fragment from buffer')
        this.processCompleteFragment(fragment)
      } catch (error) {
        console.log('[JSON PROCESSOR] Buffer is not complete JSON, leftover:', 
          this.buffer.substring(0, 200))
      }
    }
    
    console.log('[JSON PROCESSOR] Finalization complete')
  }
}

