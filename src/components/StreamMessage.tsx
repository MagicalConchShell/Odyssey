import React, { memo, useMemo, useCallback } from 'react'
import { Terminal, User, Bot, CheckCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ClaudeStreamMessage } from '../types/claude-stream'
import {
  TodoWidget,
  LSWidget,
  ReadWidget,
  BashWidget,
  WriteWidget,
  GrepWidget,
  CommandOutputWidget,
  SummaryWidget,
  SystemInitializedWidget,
  ThinkingWidget,
  SystemReminderWidget,
  TaskWidget,
  WebSearchWidget,
  EditWidget,
  MultiEditWidget,
  GlobWidget,
  NotebookWidget,
  WebFetchWidget,
  MCPWidget,
  ReadResultWidget,
  BashResultWidget,
  GrepResultWidget,
  LSResultWidget,
  GlobResultWidget
} from './ToolWidgets'

interface StreamMessageProps {
  message: ClaudeStreamMessage
  streamMessages?: ClaudeStreamMessage[]
  onLinkDetected?: (url: string) => void
}

// Helper function to find the corresponding tool_use for a tool_result (memoized)
const findToolUse = (toolUseId: string, streamMessages?: ClaudeStreamMessage[], currentIndex?: number): any => {
  if (!streamMessages || !toolUseId) return null;
  
  // Look backwards from current message to find the tool_use
  for (let i = (currentIndex || streamMessages.length) - 1; i >= 0; i--) {
    const msg = streamMessages[i];
    if (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content)) {
      const toolUse = msg.message.content.find((c: any) => 
        c.type === 'tool_use' && c.id === toolUseId
      );
      if (toolUse) return toolUse;
    }
  }
  return null;
};

// Helper function to render tool result with appropriate widget
const renderToolResult = (content: any, streamMessages?: ClaudeStreamMessage[], currentIndex?: number) => {
  const resultContent = typeof content.content === 'string' ? content.content : JSON.stringify(content.content, null, 2);
  
  // Find the corresponding tool_use if available
  const toolUse = findToolUse(content.tool_use_id, streamMessages, currentIndex);
  const toolName = toolUse?.name?.toLowerCase();
  
  // Route to appropriate widget based on tool type
  if (toolName === 'read') {
    const filePath = toolUse?.input?.file_path;
    return <ReadResultWidget content={resultContent} filePath={filePath} />;
  } else if (toolName === 'bash') {
    const command = toolUse?.input?.command;
    const description = toolUse?.input?.description;
    return <BashResultWidget output={resultContent} command={command || description} />;
  } else if (toolName === 'grep') {
    const pattern = toolUse?.input?.pattern;
    const include = toolUse?.input?.include;
    const path = toolUse?.input?.path;
    return <GrepResultWidget content={resultContent} pattern={pattern} include={include} path={path} />;
  } else if (toolName === 'ls') {
    const path = toolUse?.input?.path;
    return <LSResultWidget content={resultContent} path={path} />;
  } else if (toolName === 'glob') {
    const pattern = toolUse?.input?.pattern;
    const path = toolUse?.input?.path;
    return <GlobResultWidget content={resultContent} pattern={pattern} path={path} />;
  } else {
    // Default to enhanced CommandOutputWidget for other tools
    return <CommandOutputWidget output={resultContent} />;
  }
};

export const StreamMessage: React.FC<StreamMessageProps> = memo(({ message, streamMessages, onLinkDetected: _onLinkDetected }) => {
  const renderMessageIcon = useMemo(() => {
    switch (message.type) {
      case 'system':
        return <Terminal className="h-5 w-5 text-muted-foreground mt-0.5" />
      case 'user':
        return <User className="h-5 w-5 text-muted-foreground mt-0.5" />
      case 'assistant':
        return <Bot className="h-5 w-5 text-primary mt-0.5" />
      case 'result':
        return message.is_error ? 
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5" /> :
          <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
      default:
        return <Terminal className="h-5 w-5 text-muted-foreground mt-0.5" />
    }
  }, [message.type, message.is_error])

  const getMessageTypeLabel = useMemo(() => {
    switch (message.type) {
      case 'system':
        return 'System'
      case 'user':
        return 'User'
      case 'assistant':
        return 'Assistant'
      case 'result':
        return 'Result'
      default:
        return 'Message'
    }
  }, [message.type])

  const renderToolWidget = useCallback((toolUse: any) => {
    const { name, input } = toolUse
    
    // Handle different tool types with enhanced widgets
    switch (name.toLowerCase()) {
      case 'todowrite':
        return <TodoWidget todos={input?.todos || []} />
      
      case 'ls':
        return <LSWidget path={input?.path || ''} />
      
      case 'read':
        return <ReadWidget filePath={input?.file_path || input?.path || ''} />
      
      case 'bash':
        return (
          <BashWidget 
            command={input?.command || ''} 
            description={input?.description}
          />
        )
      
      case 'write':
        return (
          <WriteWidget 
            filePath={input?.file_path || ''}
            content={input?.content || ''}
          />
        )
      
      case 'edit':
        return (
          <EditWidget 
            filePath={input?.file_path}
            oldString={input?.old_string}
            newString={input?.new_string}
            replaceAll={input?.replace_all}
          />
        )
      
      case 'multiedit':
        return (
          <MultiEditWidget 
            filePath={input?.file_path}
            edits={input?.edits}
          />
        )
      
      case 'glob':
        return (
          <GlobWidget 
            pattern={input?.pattern}
            path={input?.path}
          />
        )
      
      case 'notebookread':
      case 'notebookedit':
        return (
          <NotebookWidget 
            notebookPath={input?.notebook_path}
            cellId={input?.cell_id}
            cellType={input?.cell_type}
            editMode={input?.edit_mode}
            newSource={input?.new_source}
          />
        )
      
      case 'webfetch':
        return (
          <WebFetchWidget 
            url={input?.url}
            prompt={input?.prompt}
          />
        )
      
      case 'grep':
        return (
          <GrepWidget 
            pattern={input?.pattern || ''}
            include={input?.include}
            path={input?.path}
          />
        )
      
      case 'task':
        return (
          <TaskWidget 
            description={input?.description}
            prompt={input?.prompt}
          />
        )
      
      case 'websearch':
        return (
          <WebSearchWidget 
            query={input?.query || ''}
          />
        )
      
      default:
        // Handle MCP tools (start with mcp__)
        if (name.startsWith('mcp__')) {
          const parts = name.split('__')
          const serverName = parts[1]
          const toolName = parts.slice(2).join('__')
          
          return (
            <MCPWidget 
              toolName={toolName}
              serverName={serverName}
              input={input}
            />
          )
        }
        
        // Fallback to original display for unknown tools
        return (
          <div className="bg-primary/10 border border-primary/20 rounded p-3">
            <div className="text-sm font-medium text-primary mb-2">
              🔧 Tool: {name}
            </div>
            <pre className="text-xs text-primary/80 whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>
        )
    }
  }, [])

  const renderMessageContent = () => {
    if (message.type === 'assistant' && message.message?.content) {
      // Handle case where content is not an array (e.g., string)
      if (!Array.isArray(message.message.content)) {
        return (
          <div className="space-y-2">
            <div className="text-sm">
              {typeof message.message.content === 'string' ? message.message.content : JSON.stringify(message.message.content)}
            </div>
          </div>
        )
      }
      
      return (
        <div className="space-y-2">
          {message.message.content.map((content: any, index: number) => {
            if (content.type === 'text') {
              return (
                <div key={index} className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {content.text}
                  </ReactMarkdown>
                </div>
              )
            } else if (content.type === 'tool_use') {
              return (
                <div key={index}>
                  {renderToolWidget(content)}
                </div>
              )
            }
            return null
          })}
          {message.message.usage && (
            <div className="text-xs text-muted-foreground mt-2">
              Tokens: {message.message.usage.input_tokens} in, {message.message.usage.output_tokens} out
            </div>
          )}
        </div>
      )
    }

    if (message.type === 'user' && message.message?.content) {
      // Handle case where content is not an array (e.g., string)
      if (!Array.isArray(message.message.content)) {
        return (
          <div className="space-y-2">
            <div className="text-sm">
              {typeof message.message.content === 'string' ? message.message.content : JSON.stringify(message.message.content)}
            </div>
          </div>
        )
      }
      
      return (
        <div className="space-y-2">
          {message.message.content.map((content: any, index: number) => {
            if (content.type === 'text') {
              return (
                <div key={index} className="text-sm">
                  {content.text}
                </div>
              )
            } else if (content.type === 'tool_result') {
              return (
                <div key={index}>
                  {renderToolResult(content, streamMessages)}
                </div>
              )
            }
            return null
          })}
        </div>
      )
    }

    if (message.type === 'result') {
      return (
        <div className="space-y-2">
          {/* Handle tool results in message content */}
          {message.message?.content && (
            <div className="space-y-2">
              {Array.isArray(message.message.content) ? (
                message.message.content.map((content: any, index: number) => {
                if (content.type === 'tool_result') {
                  return (
                    <div key={index}>
                      {renderToolResult(content, streamMessages)}
                    </div>
                  )
                } else if (content.type === 'text') {
                  return (
                    <div key={index} className="text-sm">
                      {content.text}
                    </div>
                  )
                }
                return null
              })) : (
                <div className="text-sm">
                  {typeof message.message.content === 'string' ? message.message.content : JSON.stringify(message.message.content)}
                </div>
              )}
            </div>
          )}
          
          {/* Handle legacy result fields */}
          {message.result && (
            <div className="text-sm">
              {message.result}
            </div>
          )}
          {message.error && (
            <div className="text-destructive text-sm">
              Error: {message.error}
            </div>
          )}
          
          {/* Usage and timing info */}
          <div className="text-xs text-muted-foreground space-y-1">
            {message.cost_usd !== undefined && (
              <div>Cost: ${message.cost_usd.toFixed(4)} USD</div>
            )}
            {message.duration_ms !== undefined && (
              <div>Duration: {(message.duration_ms / 1000).toFixed(2)}s</div>
            )}
            {message.num_turns !== undefined && (
              <div>Turns: {message.num_turns}</div>
            )}
            {message.usage && (
              <div>
                Total Tokens: {message.usage.input_tokens + message.usage.output_tokens} 
                ({message.usage.input_tokens} in, {message.usage.output_tokens} out)
              </div>
            )}
          </div>
        </div>
      )
    }

    // Handle special message types with enhanced widgets
    if (message.type === 'system') {
      // Handle system initialization
      if (message.subtype === 'init' || (message.session_id && message.model)) {
        return (
          <SystemInitializedWidget
            sessionId={message.session_id}
            model={message.model}
            cwd={message.cwd}
            tools={message.tools}
          />
        )
      }
      
      // Handle system reminders
      if (message.content && typeof message.content === 'string' && 
          message.content.includes('<system-reminder>')) {
        const reminderMatch = message.content.match(/<system-reminder>([\s\S]*?)<\/system-reminder>/)
        if (reminderMatch) {
          return <SystemReminderWidget message={reminderMatch[1].trim()} />
        }
      }
    }
    
    // Handle thinking content
    if (message.thinking && typeof message.thinking === 'string') {
      return <ThinkingWidget thinking={message.thinking} />
    }
    
    // Handle AI summaries
    if (message.summary && typeof message.summary === 'string') {
      return (
        <SummaryWidget 
          summary={message.summary}
          leafUuid={message.leafUuid}
        />
      )
    }

    // Fallback for simple content
    if (message.content) {
      return (
        <pre className="whitespace-pre-wrap text-sm font-mono">
          {message.content}
        </pre>
      )
    }

    return (
      <div className="text-sm text-muted-foreground">
        [No content]
      </div>
    )
  }

  // For assistant messages, use Card structure like Tauri
  if (message.type === 'assistant' && message.message?.content) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {renderMessageIcon}
            <div className="flex-1 space-y-2 min-w-0">
              {Array.isArray(message.message.content) ? (
                message.message.content.map((content: any, index: number) => {
                if (content.type === 'text') {
                  return (
                    <div key={index} className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {content.text}
                      </ReactMarkdown>
                    </div>
                  )
                } else if (content.type === 'tool_use') {
                  return (
                    <div key={index}>
                      {renderToolWidget(content)}
                    </div>
                  )
                }
                return null
              })) : (
                <div className="text-sm">
                  {typeof message.message.content === 'string' ? message.message.content : JSON.stringify(message.message.content)}
                </div>
              )}
              {message.message.usage && (
                <div className="text-xs text-muted-foreground mt-2">
                  Tokens: {message.message.usage.input_tokens} in, {message.message.usage.output_tokens} out
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // For user messages, use Card structure like Tauri
  if (message.type === 'user') {
    return (
      <Card className="border-muted-foreground/20 bg-muted/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {renderMessageIcon}
            <div className="flex-1 space-y-2 min-w-0">
              {renderMessageContent()}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // For result messages
  if (message.type === 'result') {
    const isError = message.is_error;
    return (
      <Card className={clsx(
        isError ? "border-destructive/20 bg-destructive/5" : "border-green-500/20 bg-green-500/5"
      )}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {renderMessageIcon}
            <div className="flex-1 space-y-2">
              <h4 className="font-semibold text-sm">
                {isError ? "Execution Failed" : "Execution Complete"}
              </h4>
              {renderMessageContent()}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Fallback for other message types
  return (
    <div className={clsx(
      "border rounded-lg p-4 space-y-3",
      message.type === 'system' && "bg-accent border-border"
    )}>
      <div className="flex items-center gap-2">
        {renderMessageIcon}
        <span className="text-sm font-medium">
          {getMessageTypeLabel}
        </span>
        {message.timestamp && (
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      
      <div className="ml-6">
        {renderMessageContent()}
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  return (
    prevProps.message === nextProps.message &&
    prevProps.streamMessages?.length === nextProps.streamMessages?.length
  )
})