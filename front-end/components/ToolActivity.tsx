import React from 'react'
import { Wrench, CheckCircle2, Code2 } from 'lucide-react'
import type { ToolActivity, CodeActivity } from '@/app/src/types/agent'

interface ToolActivityDisplayProps {
  toolActivity?: ToolActivity
  codeActivity?: CodeActivity
}

export function ToolActivityDisplay({ toolActivity, codeActivity }: ToolActivityDisplayProps) {
  const hasActivity = (toolActivity?.calls?.length ?? 0) > 0 || (codeActivity?.executions?.length ?? 0) > 0
  
  if (!hasActivity) return null

  return (
    <div className="mt-3 p-3 bg-secondary/5 border border-secondary/20 rounded-lg space-y-2 text-xs">
      {/* Tool Calls */}
      {toolActivity?.calls && toolActivity.calls.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-secondary font-medium">
            <Wrench className="w-3.5 h-3.5" />
            <span>Tool Activity</span>
          </div>
          {toolActivity.calls.map((call, idx) => (
            <div key={call.id || idx} className="ml-5 text-muted-foreground">
              • Using <span className="font-medium text-foreground">{call.name}</span>
              {call.args && Object.keys(call.args).length > 0 && (
                <span className="text-xs"> ({Object.keys(call.args).length} param{Object.keys(call.args).length > 1 ? 's' : ''})</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Code Execution */}
      {codeActivity?.executions && codeActivity.executions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-secondary font-medium">
            <Code2 className="w-3.5 h-3.5" />
            <span>Code Execution</span>
          </div>
          {codeActivity.executions.map((exec, idx) => (
            <div key={idx} className="ml-5 space-y-0.5">
              <div className="text-muted-foreground">
                • Executed <span className="font-medium text-foreground">{exec.language}</span> code
              </div>
              {exec.result && (
                <div className="ml-3 text-muted-foreground/80 text-xs truncate max-w-md">
                  Result: {exec.result.substring(0, 80)}{exec.result.length > 80 ? '...' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tool Responses (if separate from calls) */}
      {toolActivity?.responses && toolActivity.responses.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-500 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Completed</span>
          </div>
          {toolActivity.responses.map((response, idx) => (
            <div key={response.id || idx} className="ml-5 text-muted-foreground">
              • {response.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

