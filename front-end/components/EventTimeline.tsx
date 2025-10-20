// Event Timeline Component
// Displays a timeline of agent reasoning events (tool calls, code execution, etc.)

import React from 'react'
import type { ProcessedEvent } from '@/app/src/types/agent'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface EventTimelineProps {
  events: ProcessedEvent[]
  isCollapsed?: boolean
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ 
  events, 
  isCollapsed: initialCollapsed = false 
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(initialCollapsed)
  
  if (events.length === 0) {
    return null
  }

  return (
    <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/50">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-blue-500">⚡</span>
          Agent Activity ({events.length} {events.length === 1 ? 'step' : 'steps'})
        </span>
        {isCollapsed ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronUp className="w-4 h-4" />
        )}
      </button>

      {/* Timeline */}
      {!isCollapsed && (
        <div className="px-4 py-3 space-y-2">
          {events.map((event, index) => (
            <EventItem 
              key={`event-${index}-${event.timestamp}`} 
              event={event} 
              isLast={index === events.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface EventItemProps {
  event: ProcessedEvent
  isLast: boolean
}

const EventItem: React.FC<EventItemProps> = ({ event, isLast }) => {
  const { title, data, timestamp } = event
  const [isExpanded, setIsExpanded] = React.useState(false)
  
  // Check if event has expandable details
  const hasDetails = (
    (data.type === 'functionCall' && data.args && Object.keys(data.args).length > 0) ||
    (data.type === 'functionResponse' && data.response) ||
    (data.type === 'codeExecution' && (data.code || data.result)) ||
    (data.type === 'thinking' && data.content)
  )

  // Format timestamp with milliseconds for better precision
  const timeDisplay = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  } as any)  // TypeScript doesn't know about fractionalSecondDigits yet

  // Get icon color based on type
  const getIconColor = () => {
    switch (data.type) {
      case 'functionCall': return 'text-blue-500'
      case 'functionResponse': return 'text-green-500'
      case 'codeExecution': return 'text-purple-500'
      case 'thinking': return 'text-yellow-500'
      default: return 'text-gray-500'
    }
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-2 top-6 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-600" />
      )}
      
      {/* Event content */}
      <div className="relative flex items-start gap-3">
        {/* Timeline dot */}
        <div className={`relative z-10 flex-shrink-0 w-4 h-4 rounded-full border-2 border-current ${getIconColor()} bg-gray-50 dark:bg-gray-800 mt-1`} />
        
        {/* Event details */}
        <div className="flex-1 min-w-0">
          <div 
            className={`text-sm ${hasDetails ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' : ''}`}
            onClick={() => hasDetails && setIsExpanded(!isExpanded)}
          >
            <span className="font-medium">{title}</span>
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{timeDisplay}</span>
          </div>
          
          {/* Expandable details */}
          {hasDetails && isExpanded && (
            <div className="mt-2 p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-xs">
              {data.type === 'functionCall' && data.args && (
                <pre className="overflow-x-auto text-gray-700 dark:text-gray-300">
                  {JSON.stringify(data.args, null, 2)}
                </pre>
              )}
              
              {data.type === 'functionResponse' && data.response && (
                <pre className="overflow-x-auto text-gray-700 dark:text-gray-300">
                  {JSON.stringify(data.response, null, 2)}
                </pre>
              )}
              
              {data.type === 'codeExecution' && (
                <div className="space-y-2">
                  {data.code && (
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 mb-1">Code:</div>
                      <pre className="overflow-x-auto bg-gray-800 text-white p-2 rounded">
                        {data.code}
                      </pre>
                    </div>
                  )}
                  {data.result && (
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 mb-1">Result:</div>
                      <pre className="overflow-x-auto text-gray-700 dark:text-gray-300">
                        {data.result}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              
              {data.type === 'thinking' && data.content && (
                <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {data.content}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EventTimeline

