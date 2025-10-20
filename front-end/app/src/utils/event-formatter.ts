// Event Formatter
// Converts ADK agent events into user-friendly ProcessedEvent format for timeline display

import type { ProcessedEvent } from '@/app/src/types/agent'

/**
 * Format a function call as a timeline event
 */
export function formatFunctionCallEvent(
  name: string,
  args?: any,
  id?: string
): ProcessedEvent {
  // Create user-friendly title based on function name
  let title = `🔧 ${formatFunctionName(name)}`
  
  // Add arg count if present
  const argCount = args ? Object.keys(args).length : 0
  if (argCount > 0) {
    title += ` (${argCount} parameter${argCount > 1 ? 's' : ''})`
  }
  
  return {
    title,
    data: {
      type: 'functionCall',
      name,
      args,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format a function response as a timeline event
 */
export function formatFunctionResponseEvent(
  name: string,
  response?: any,
  id?: string
): ProcessedEvent {
  return {
    title: `✅ ${formatFunctionName(name)} completed`,
    data: {
      type: 'functionResponse',
      name,
      response,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format code execution as a timeline event
 */
export function formatCodeExecutionEvent(
  code: string,
  language: string,
  result?: string
): ProcessedEvent {
  const langDisplay = language || 'code'
  
  return {
    title: `💻 Executing ${langDisplay}`,
    data: {
      type: 'codeExecution',
      code,
      language,
      result,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format thinking/reasoning as a timeline event
 */
export function formatThinkingEvent(content: string): ProcessedEvent {
  // Extract first line or truncate for title
  const firstLine = content.split('\n')[0]
  const title = firstLine.length > 50 
    ? `💭 ${firstLine.substring(0, 47)}...`
    : `💭 ${firstLine}`
  
  return {
    title,
    data: {
      type: 'thinking',
      content,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * Convert snake_case or camelCase function names to Title Case
 * Examples:
 * - transfer_to_agent → Transfer To Agent
 * - cymbal_banking_agent → Cymbal Banking Agent
 * - lookupMatplotlibDocs → Lookup Matplotlib Docs
 */
function formatFunctionName(name: string): string {
  // Handle snake_case
  if (name.includes('_')) {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  
  // Handle camelCase
  return name
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Create a deduplication key for an event
 * Used to prevent duplicate events from being added to timeline
 */
export function createEventKey(event: ProcessedEvent): string {
  const { type, name, code } = event.data
  
  switch (type) {
    case 'functionCall':
    case 'functionResponse':
      return `${type}-${name}-${event.timestamp}`
    case 'codeExecution':
      return `${type}-${code?.substring(0, 50)}-${event.timestamp}`
    case 'thinking':
      return `${type}-${event.data.content?.substring(0, 50)}-${event.timestamp}`
    default:
      return `${type}-${event.timestamp}`
  }
}

