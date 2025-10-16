import React from 'react'
import ReactMarkdown from 'react-markdown'

interface MessageContentProps {
  content: string
  isUser?: boolean
}

export function MessageContent({ content, isUser }: MessageContentProps) {
  if (isUser) {
    // User messages - just plain text
    return <p className="text-sm leading-relaxed break-words text-white font-medium">{content}</p>
  }

  // Agent messages - render with markdown
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        components={{
          // Style bold text
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          // Style italic text (for numbers)
          em: ({ children }) => (
            <em className="text-secondary font-medium not-italic">{children}</em>
          ),
          // Style paragraphs
          p: ({ children }) => (
            <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>
          ),
          // Style lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside text-sm space-y-1 my-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside text-sm space-y-1 my-2">{children}</ol>
          ),
          // Style code
          code: ({ inline, children }) =>
            inline ? (
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
            ) : (
              <code className="block bg-muted p-2 rounded text-xs font-mono my-2 overflow-x-auto">
                {children}
              </code>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

