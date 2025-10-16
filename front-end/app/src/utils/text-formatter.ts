// Text Formatting Utilities
// Clean up and format agent response text for better UX

/**
 * Clean up and format agent response text
 * - Removes excessive whitespace
 * - Fixes broken markdown
 * - Ensures proper paragraph spacing
 */
export function formatAgentText(text: string): string {
  if (!text) return ''
  
  return text
    // Remove excessive newlines (more than 2 consecutive)
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace from each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Remove leading/trailing whitespace
    .trim()
}

/**
 * Extract and format tool call information for display
 */
export function formatToolCall(toolName: string, args?: any): string {
  const argsCount = args ? Object.keys(args).length : 0
  return argsCount > 0 
    ? `Using tool: *${toolName}* (${argsCount} parameter${argsCount > 1 ? 's' : ''})`
    : `Using tool: *${toolName}*`
}

/**
 * Format tool response for display
 */
export function formatToolResponse(toolName: string, result?: any): string {
  return `Tool completed: *${toolName}*`
}

/**
 * Format code execution for display
 */
export function formatCodeExecution(code: string, language: string): string {
  return `Executing *${language}* code`
}

/**
 * Format code execution result for display
 */
export function formatCodeResult(outcome: string, output?: string): string {
  const status = outcome === 'SUCCESS' || outcome === 'OUTCOME_OK' ? 'Success' : 'Failed'
  return `Execution ${status.toLowerCase()}${output ? `: ${output.substring(0, 100)}...` : ''}`
}

/**
 * Create a progress message for streaming updates
 */
export function createProgressMessage(
  hasToolCalls: boolean,
  hasCodeExecution: boolean,
  hasThoughts: boolean
): string {
  const activities: string[] = []
  
  if (hasThoughts) activities.push('reasoning')
  if (hasToolCalls) activities.push('using tools')
  if (hasCodeExecution) activities.push('executing code')
  
  if (activities.length === 0) return 'Thinking...'
  
  return `Working on your request (${activities.join(', ')})...`
}

