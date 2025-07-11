import React, { useState, memo, useCallback, useMemo } from "react";
import { 
  CheckCircle2, 
  Circle, 
  Clock,
  FolderOpen,
  FileText,
  Search,
  Terminal,
  FileEdit,
  Code,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Info,
  Settings,
  Bot,
  Sparkles,
  Wrench,
  Globe,
  Edit3,
  Files,
  Layers,
  Server,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, getLanguageFromPath, parseClaudeContent } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { claudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";

/**
 * Widget for TodoWrite tool - displays a beautiful TODO list
 */
export const TodoWidget: React.FC<{ todos: any[]; result?: any }> = memo(({ todos, result: _result }) => {
  const statusIcons = useMemo(() => ({
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    in_progress: <Clock className="h-4 w-4 text-blue-500 animate-pulse" />,
    pending: <Circle className="h-4 w-4 text-muted-foreground" />
  }), []);

  const priorityColors = useMemo(() => ({
    high: "bg-red-500/10 text-red-500 border-red-500/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    low: "bg-green-500/10 text-green-500 border-green-500/20"
  }), []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <FileEdit className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Todo List</span>
      </div>
      <div className="space-y-2">
        {todos.map((todo, idx) => (
          <div
            key={todo.id || idx}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border bg-card/50",
              todo.status === "completed" && "opacity-60"
            )}
          >
            <div className="mt-0.5">
              {statusIcons[todo.status as keyof typeof statusIcons] || statusIcons.pending}
            </div>
            <div className="flex-1 space-y-1">
              <p className={cn(
                "text-sm",
                todo.status === "completed" && "line-through"
              )}>
                {todo.content}
              </p>
              {todo.priority && (
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", priorityColors[todo.priority as keyof typeof priorityColors])}
                >
                  {todo.priority}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Widget for LS (List Directory) tool
 */
export const LSWidget: React.FC<{ path: string; result?: any }> = ({ path, result }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
        <FolderOpen className="h-4 w-4 text-primary" />
        <span className="text-sm">Listing directory:</span>
        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
          {path}
        </code>
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
            <span>Loading...</span>
          </div>
        )}
      </div>
      
      {result && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for Read tool
 */
export const ReadWidget: React.FC<{ filePath: string; result?: any }> = memo(({ filePath, result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const toggleExpanded = useCallback(() => setIsExpanded(prev => !prev), []);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm">Reading file:</span>
        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
          {filePath}
        </code>
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
            <span>Loading...</span>
          </div>
        )}
      </div>
      
      {result && (
        <div className="rounded-lg border bg-zinc-950 overflow-hidden">
          <div className="px-4 py-2 border-b bg-zinc-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground">
                {filePath}
              </span>
            </div>
            <button
              onClick={toggleExpanded}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
          
          {isExpanded && (
            <div className="p-4 max-h-96 overflow-auto">
              <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
                {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * Widget for Bash tool
 */
export const BashWidget: React.FC<{ 
  command: string; 
  description?: string;
  result?: any;
}> = memo(({ command, description, result }) => {
  let resultContent = '';
  let isError = false;
  
  if (result) {
    isError = result.is_error || false;
    if (typeof result.content === 'string') {
      resultContent = result.content;
    } else if (result.content && typeof result.content === 'object') {
      resultContent = JSON.stringify(result.content, null, 2);
    }
  }
  
  return (
    <div className="rounded-lg border bg-zinc-950 overflow-hidden">
      <div className="px-4 py-2 bg-zinc-900/50 flex items-center gap-2 border-b">
        <Terminal className="h-3.5 w-3.5 text-green-500" />
        <span className="text-xs font-mono text-muted-foreground">Terminal</span>
        {description && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{description}</span>
          </>
        )}
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            <span>Running...</span>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <code className="text-xs font-mono text-green-400 block">
          $ {command}
        </code>
        
        {result && (
          <div className={cn(
            "mt-3 p-3 rounded-md border text-xs font-mono whitespace-pre-wrap overflow-x-auto",
            isError 
              ? "border-red-500/20 bg-red-500/5 text-red-400" 
              : "border-green-500/20 bg-green-500/5 text-green-300"
          )}>
            {resultContent || (isError ? "Command failed" : "Command completed")}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Widget for Write tool
 */
export const WriteWidget: React.FC<{ filePath: string; content: string; result?: any }> = ({ filePath, content, result: _result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLargeContent = content.length > 1000;
  const displayContent = isLargeContent && !isExpanded ? content.substring(0, 1000) + "\n..." : content;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
        <FileEdit className="h-4 w-4 text-primary" />
        <span className="text-sm">Writing to file:</span>
        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
          {filePath}
        </code>
      </div>
      
      <div className="rounded-lg border bg-zinc-950 overflow-hidden">
        <div className="px-4 py-2 border-b bg-zinc-950 flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">Preview</span>
          {isLargeContent && (
            <div className="flex items-center gap-2">
              {!isExpanded && (
                <Badge variant="outline" className="text-xs">
                  Truncated to 1000 chars
                </Badge>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </button>
            </div>
          )}
        </div>
        <div className="p-4 max-h-96 overflow-auto">
          <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
            {displayContent}
          </pre>
        </div>
      </div>
    </div>
  );
};

/**
 * Widget for Grep tool
 */
export const GrepWidget: React.FC<{ 
  pattern: string; 
  include?: string; 
  path?: string;
  result?: any;
}> = ({ pattern, include, path, result }) => {
  let resultContent = '';
  let isError = false;
  
  if (result) {
    isError = result.is_error || false;
    if (typeof result.content === 'string') {
      resultContent = result.content;
    } else if (result.content && typeof result.content === 'object') {
      resultContent = JSON.stringify(result.content, null, 2);
    }
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
        <Search className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium">Searching with grep</span>
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
            <span>Searching...</span>
          </div>
        )}
      </div>
      
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Code className="h-3 w-3 text-emerald-500" />
          <span className="text-xs font-medium text-muted-foreground">Pattern:</span>
          <code className="font-mono text-sm bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded text-emerald-600 dark:text-emerald-400">
            {pattern}
          </code>
        </div>
        
        {path && (
          <div className="flex items-center gap-2">
            <FolderOpen className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Path:</span>
            <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
              {path}
            </code>
          </div>
        )}
        
        {include && (
          <div className="flex items-center gap-2">
            <FileText className="h-3 w-3 text-green-500" />
            <span className="text-xs font-medium text-muted-foreground">Include:</span>
            <code className="font-mono text-xs bg-green-500/10 border border-green-500/20 px-2 py-1 rounded text-green-600 dark:text-green-400">
              {include}
            </code>
          </div>
        )}
      </div>
      
      {result && (
        <div className="rounded-lg border bg-zinc-950 p-3">
          {isError ? (
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div className="text-sm">{resultContent || "Search failed"}</div>
            </div>
          ) : (
            <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
              {resultContent || "No matches found"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Widget for command output/stdout with collapsible functionality
 */
export const CommandOutputWidget: React.FC<{ output: string }> = ({ output }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const lineCount = output.split('\n').filter(line => line.trim()).length;
  const isLargeOutput = lineCount > 20 || output.length > 1000;

  return (
    <div className="rounded-lg border bg-zinc-950/50 overflow-hidden">
      <div className="px-4 py-2 bg-zinc-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChevronRight className="h-3 w-3 text-green-500" />
          <span className="text-xs font-mono text-green-400">Output</span>
          {isLargeOutput && (
            <span className="text-xs text-muted-foreground">
              ({lineCount} lines)
            </span>
          )}
        </div>
        {isLargeOutput && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      
      {(!isLargeOutput || isExpanded) && (
        <div className="p-3">
          <SyntaxHighlighter
            language="bash"
            style={claudeSyntaxTheme}
            showLineNumbers={false}
            wrapLongLines={false}
            customStyle={{
              margin: 0,
              background: 'transparent',
              lineHeight: '1.6'
            }}
            codeTagProps={{
              style: {
                fontSize: '0.75rem'
              }
            }}
          >
            {output || "No output"}
          </SyntaxHighlighter>
        </div>
      )}
      
      {isLargeOutput && !isExpanded && (
        <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-zinc-900/30">
          Click "Expand" to view the full output
        </div>
      )}
    </div>
  );
};

/**
 * Widget for AI-generated summaries
 */
export const SummaryWidget: React.FC<{ 
  summary: string;
  leafUuid?: string;
}> = ({ summary, leafUuid }) => {
  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5">
          <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Info className="h-4 w-4 text-blue-500" />
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400">AI Summary</div>
          <p className="text-sm text-foreground">{summary}</p>
          {leafUuid && (
            <div className="text-xs text-muted-foreground mt-2">
              ID: <code className="font-mono">{leafUuid.slice(0, 8)}...</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Widget for displaying system initialization information
 */
export const SystemInitializedWidget: React.FC<{
  sessionId?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
}> = ({ sessionId, model, cwd, tools = [] }) => {
  const [toolsExpanded, setToolsExpanded] = useState(false);
  
  // Tool icon mapping
  const toolIcons: Record<string, LucideIcon> = {
    'bash': Terminal,
    'read': FileText,
    'write': FileEdit,
    'grep': Search,
    'ls': FolderOpen,
  };
  
  const getToolIcon = (toolName: string) => {
    const normalizedName = toolName.toLowerCase();
    return toolIcons[normalizedName] || Wrench;
  };
  
  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Settings className="h-5 w-5 text-blue-500 mt-0.5" />
          <div className="flex-1 space-y-4">
            <h4 className="font-semibold text-sm">System Initialized</h4>
            
            <div className="space-y-2">
              {sessionId && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Session ID:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {sessionId}
                  </code>
                </div>
              )}
              
              {model && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Model:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {model}
                  </code>
                </div>
              )}
              
              {cwd && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Working Directory:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    {cwd}
                  </code>
                </div>
              )}
            </div>
            
            {tools.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setToolsExpanded(!toolsExpanded)}
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span>Available Tools ({tools.length})</span>
                  <ChevronDown className={cn(
                    "h-3 w-3 transition-transform",
                    toolsExpanded && "rotate-180"
                  )} />
                </button>
                
                {toolsExpanded && (
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((tool, idx) => {
                      const Icon = getToolIcon(tool);
                      return (
                        <Badge 
                          key={idx} 
                          variant="secondary" 
                          className="text-xs py-0.5 px-2 flex items-center gap-1"
                        >
                          <Icon className="h-3 w-3" />
                          {tool}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Widget for displaying AI thinking/reasoning content
 */
export const ThinkingWidget: React.FC<{ thinking: string }> = ({ thinking }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bot className="h-4 w-4 text-gray-500" />
            <Sparkles className="h-2.5 w-2.5 text-gray-400 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400 italic">
            Thinking...
          </span>
        </div>
        <ChevronRight className={cn(
          "h-4 w-4 text-gray-500 transition-transform",
          isExpanded && "rotate-90"
        )} />
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-500/20">
          <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-500/5 p-3 rounded-lg italic">
            {thinking.trim()}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for displaying system reminders
 */
export const SystemReminderWidget: React.FC<{ message: string }> = ({ message }) => {
  let icon = <Info className="h-4 w-4" />;
  let colorClass = "border-blue-500/20 bg-blue-500/5 text-blue-600";
  
  if (message.toLowerCase().includes("warning")) {
    icon = <AlertCircle className="h-4 w-4" />;
    colorClass = "border-yellow-500/20 bg-yellow-500/5 text-yellow-600";
  } else if (message.toLowerCase().includes("error")) {
    icon = <AlertCircle className="h-4 w-4" />;
    colorClass = "border-destructive/20 bg-destructive/5 text-destructive";
  }
  
  return (
    <div className={cn("flex items-start gap-2 p-3 rounded-md border", colorClass)}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 text-sm">{message}</div>
    </div>
  );
};

/**
 * Widget for Task tool - displays sub-agent task information
 */
export const TaskWidget: React.FC<{ 
  description?: string; 
  prompt?: string;
  result?: any;
}> = ({ description, prompt, result: _result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="relative">
          <Bot className="h-4 w-4 text-purple-500" />
          <Sparkles className="h-2.5 w-2.5 text-purple-400 absolute -top-1 -right-1" />
        </div>
        <span className="text-sm font-medium">Spawning Sub-Agent Task</span>
      </div>
      
      <div className="ml-6 space-y-3">
        {description && (
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Task Description</span>
            </div>
            <p className="text-sm text-foreground">{description}</p>
          </div>
        )}
        
        {prompt && (
          <div className="space-y-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              <span>Task Instructions</span>
            </button>
            
            {isExpanded && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {prompt}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Widget for WebSearch tool
 */
export const WebSearchWidget: React.FC<{ 
  query: string; 
  result?: any;
}> = ({ query, result }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <Globe className="h-4 w-4 text-blue-500/70" />
        <span className="text-xs font-medium uppercase tracking-wider text-blue-600/70 dark:text-blue-400/70">Web Search</span>
        <span className="text-sm text-muted-foreground/80 flex-1 truncate">{query}</span>
      </div>
      
      {result && (
        <div className="rounded-lg border bg-background/50 p-3">
          <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for Edit tool - shows single file edits
 */
export const EditWidget: React.FC<{ 
  filePath?: string;
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
  result?: any;
}> = ({ filePath, oldString, newString, replaceAll, result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
        <Edit3 className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium">Editing file</span>
        {filePath && (
          <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
            {filePath}
          </code>
        )}
        {replaceAll && (
          <Badge variant="outline" className="text-xs">
            Replace All
          </Badge>
        )}
      </div>
      
      <div className="ml-6 space-y-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
          <span>Edit Details</span>
        </button>
        
        {isExpanded && (
          <div className="space-y-3">
            {oldString && (
              <div className="rounded-lg border bg-red-500/5 border-red-500/20 p-3">
                <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">Replace:</div>
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {oldString}
                </pre>
              </div>
            )}
            
            {newString && (
              <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-3">
                <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">With:</div>
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {newString}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
      
      {result && (
        <div className="ml-6 rounded-lg border bg-muted/20 p-3">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for MultiEdit tool - shows multiple file edits
 */
export const MultiEditWidget: React.FC<{ 
  filePath?: string;
  edits?: Array<{oldString: string; newString: string; replaceAll?: boolean}>;
  result?: any;
}> = ({ filePath, edits = [], result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <Layers className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium">Multi-editing file</span>
        {filePath && (
          <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
            {filePath}
          </code>
        )}
        <Badge variant="outline" className="text-xs">
          {edits.length} edits
        </Badge>
      </div>
      
      <div className="ml-6 space-y-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
          <span>Edit Details ({edits.length} operations)</span>
        </button>
        
        {isExpanded && (
          <div className="space-y-3">
            {edits.map((edit, index) => (
              <div key={index} className="border rounded-lg p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Edit #{index + 1}</div>
                
                <div className="rounded-lg border bg-red-500/5 border-red-500/20 p-2">
                  <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Replace:</div>
                  <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                    {edit.oldString}
                  </pre>
                </div>
                
                <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-2">
                  <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">With:</div>
                  <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                    {edit.newString}
                  </pre>
                </div>
                
                {edit.replaceAll && (
                  <Badge variant="outline" className="text-xs">
                    Replace All Occurrences
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {result && (
        <div className="ml-6 rounded-lg border bg-muted/20 p-3">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for Glob tool - shows file pattern matching
 */
export const GlobWidget: React.FC<{ 
  pattern?: string;
  path?: string;
  result?: any;
}> = ({ pattern, path, result }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
        <Files className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-medium">File pattern matching</span>
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-indigo-500 rounded-full animate-pulse" />
            <span>Searching...</span>
          </div>
        )}
      </div>
      
      <div className="ml-6 space-y-2">
        {pattern && (
          <div className="flex items-center gap-2">
            <Code className="h-3 w-3 text-indigo-500" />
            <span className="text-xs font-medium text-muted-foreground">Pattern:</span>
            <code className="font-mono text-sm bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded text-indigo-600 dark:text-indigo-400">
              {pattern}
            </code>
          </div>
        )}
        
        {path && (
          <div className="flex items-center gap-2">
            <FolderOpen className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Path:</span>
            <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
              {path}
            </code>
          </div>
        )}
      </div>
      
      {result && (
        <div className="ml-6 rounded-lg border bg-zinc-950 p-3">
          <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for Notebook Read/Edit tools
 */
export const NotebookWidget: React.FC<{ 
  notebookPath?: string;
  cellId?: string;
  cellType?: string;
  editMode?: string;
  newSource?: string;
  result?: any;
}> = ({ notebookPath, cellId, cellType, editMode, newSource, result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isEdit = editMode || newSource;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <FileText className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">
          {isEdit ? 'Editing notebook' : 'Reading notebook'}
        </span>
        {notebookPath && (
          <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
            {notebookPath}
          </code>
        )}
      </div>
      
      <div className="ml-6 space-y-2">
        {(cellId || cellType || editMode) && (
          <div className="flex flex-wrap items-center gap-2">
            {cellId && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Cell:</span>
                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                  {cellId}
                </code>
              </div>
            )}
            {cellType && (
              <Badge variant="outline" className="text-xs">
                {cellType}
              </Badge>
            )}
            {editMode && (
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600">
                {editMode}
              </Badge>
            )}
          </div>
        )}
        
        {newSource && (
          <div className="space-y-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              <span>New Cell Content</span>
            </button>
            
            {isExpanded && (
              <div className="rounded-lg border bg-muted/20 p-3 max-h-48 overflow-auto">
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {newSource}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
      
      {result && (
        <div className="ml-6 rounded-lg border bg-muted/20 p-3 max-h-64 overflow-auto">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for WebFetch tool
 */
export const WebFetchWidget: React.FC<{ 
  url?: string;
  prompt?: string;
  result?: any;
}> = ({ url, prompt, result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
        <ExternalLink className="h-4 w-4 text-cyan-500" />
        <span className="text-sm font-medium">Fetching web content</span>
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-cyan-500 rounded-full animate-pulse" />
            <span>Loading...</span>
          </div>
        )}
      </div>
      
      <div className="ml-6 space-y-2">
        {url && (
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3 text-cyan-500" />
            <span className="text-xs font-medium text-muted-foreground">URL:</span>
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs font-mono bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded text-cyan-600 dark:text-cyan-400 hover:underline flex-1 truncate"
            >
              {url}
            </a>
          </div>
        )}
        
        {prompt && (
          <div className="space-y-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              <span>Processing Instructions</span>
            </button>
            
            {isExpanded && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {prompt}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
      
      {result && (
        <div className="ml-6 rounded-lg border bg-muted/20 p-3 max-h-64 overflow-auto">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for MCP (Model Context Protocol) tools
 */
export const MCPWidget: React.FC<{ 
  toolName?: string;
  serverName?: string;
  input?: any;
  result?: any;
}> = ({ toolName, serverName, input, result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-pink-500/10 border border-pink-500/20">
        <Server className="h-4 w-4 text-pink-500" />
        <span className="text-sm font-medium">MCP Tool</span>
        {toolName && (
          <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
            {toolName}
          </code>
        )}
        {serverName && (
          <Badge variant="outline" className="text-xs bg-pink-500/10 text-pink-600">
            {serverName}
          </Badge>
        )}
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-pink-500 rounded-full animate-pulse" />
            <span>Running...</span>
          </div>
        )}
      </div>
      
      {input && (
        <div className="ml-6 space-y-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            <span>Tool Parameters</span>
          </button>
          
          {isExpanded && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
      
      {result && (
        <div className="ml-6 rounded-lg border bg-muted/20 p-3 max-h-64 overflow-auto">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
/**
 * Widget for Read tool result - shows file content with syntax highlighting and collapsible content
 */
export const ReadResultWidget: React.FC<{ content: string; filePath?: string }> = ({ content, filePath }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const language = getLanguageFromPath(filePath);
  const { codeContent, startLineNumber } = parseClaudeContent(content);
  // Use parsed content for line count calculation to ensure accuracy
  const lineCount = codeContent.split('\n').filter(line => line.trim()).length;
  const isLargeFile = lineCount > 20;

  return (
    <div className="rounded-lg overflow-hidden border bg-zinc-950 w-full">
      <div className="px-4 py-2 border-b bg-zinc-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">
            {filePath || "File content"}
          </span>
          {isLargeFile && (
            <span className="text-xs text-muted-foreground">
              ({lineCount} lines)
            </span>
          )}
        </div>
        {isLargeFile && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      
      {(!isLargeFile || isExpanded) && (
        <div className="relative overflow-x-auto">
          <SyntaxHighlighter
            language={language}
            style={claudeSyntaxTheme}
            showLineNumbers
            startingLineNumber={startLineNumber}
            wrapLongLines={false}
            customStyle={{
              margin: 0,
              background: "transparent",
              lineHeight: "1.6"
            }}
            codeTagProps={{
              style: {
                fontSize: "0.75rem"
              }
            }}
            lineNumberStyle={{
              minWidth: "3.5rem",
              paddingRight: "1rem",
              textAlign: "right",
              opacity: 0.5,
            }}
          >
            {codeContent}
          </SyntaxHighlighter>
        </div>
      )}
      
      {isLargeFile && !isExpanded && (
        <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-zinc-900/30">
          Click "Expand" to view the full file
        </div>
      )}
    </div>
  );
};

/**
 * Widget for Bash tool result - shows command output with syntax highlighting and collapsible content
 */
export const BashResultWidget: React.FC<{ output: string; command?: string }> = ({ output, command }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const lineCount = output.split('\n').filter(line => line.trim()).length;
  const isLargeOutput = lineCount > 20 || output.length > 1000;

  return (
    <div className="rounded-lg overflow-hidden border bg-zinc-950 w-full">
      <div className="px-4 py-2 border-b bg-zinc-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs font-mono text-muted-foreground">
            {command ? `$ ${command}` : "Command output"}
          </span>
          {isLargeOutput && (
            <span className="text-xs text-muted-foreground">
              ({lineCount} lines)
            </span>
          )}
        </div>
        {isLargeOutput && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      
      {(!isLargeOutput || isExpanded) && (
        <div className="relative overflow-x-auto">
          <SyntaxHighlighter
            language="bash"
            style={claudeSyntaxTheme}
            showLineNumbers={false}
            wrapLongLines={false}
            customStyle={{
              margin: 0,
              background: "transparent",
              lineHeight: "1.6"
            }}
            codeTagProps={{
              style: {
                fontSize: "0.75rem"
              }
            }}
          >
            {output || "No output"}
          </SyntaxHighlighter>
        </div>
      )}
      
      {isLargeOutput && !isExpanded && (
        <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-zinc-900/30">
          Click "Expand" to view the full output
        </div>
      )}
    </div>
  );
};

/**
 * Widget for Grep tool result - shows search results with syntax highlighting and collapsible content
 */
export const GrepResultWidget: React.FC<{ 
  content: string; 
  pattern?: string; 
  include?: string; 
  path?: string; 
}> = ({ content, pattern, include, path }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const lineCount = content.split('\n').filter(line => line.trim()).length;
  const isLargeOutput = lineCount > 20 || content.length > 1000;

  return (
    <div className="space-y-2">
      {/* Grep tool header */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
        <Search className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium">Search Results</span>
        {pattern && (
          <code className="text-xs font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded text-emerald-600 dark:text-emerald-400">
            {pattern}
          </code>
        )}
      </div>
      
      {/* Search parameters */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        {include && (
          <div className="flex items-center gap-2">
            <FileText className="h-3 w-3 text-green-500" />
            <span className="text-xs font-medium text-muted-foreground">Include:</span>
            <code className="font-mono text-xs bg-green-500/10 border border-green-500/20 px-2 py-1 rounded text-green-600 dark:text-green-400">
              {include}
            </code>
          </div>
        )}
        {path && (
          <div className="flex items-center gap-2">
            <FolderOpen className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Path:</span>
            <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
              {path}
            </code>
          </div>
        )}
      </div>
      
      {/* Results content with collapsible functionality */}
      <div className="rounded-lg overflow-hidden border bg-zinc-950 w-full">
        <div className="px-4 py-2 border-b bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs font-mono text-emerald-400">Results</span>
            {isLargeOutput && (
              <span className="text-xs text-muted-foreground">
                ({lineCount} lines)
              </span>
            )}
          </div>
          {isLargeOutput && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
        
        {(!isLargeOutput || isExpanded) && (
          <div className="relative overflow-x-auto">
            <SyntaxHighlighter
              language="bash"
              style={claudeSyntaxTheme}
              showLineNumbers={false}
              wrapLongLines={false}
              customStyle={{
                margin: 0,
                background: "transparent",
                lineHeight: "1.6"
              }}
              codeTagProps={{
                style: {
                  fontSize: "0.75rem"
                }
              }}
            >
              {content || "No matches found"}
            </SyntaxHighlighter>
          </div>
        )}
        
        {isLargeOutput && !isExpanded && (
          <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-zinc-900/30">
            Click "Expand" to view all results
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Widget for LS tool result - shows directory listing with collapsible content
 */
export const LSResultWidget: React.FC<{ content: string; path?: string }> = ({ content, path }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const lineCount = content.split('\n').filter(line => line.trim()).length;
  const isLargeOutput = lineCount > 20 || content.length > 1000;

  return (
    <div className="space-y-2">
      {/* LS tool header */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
        <FolderOpen className="h-4 w-4 text-primary" />
        <span className="text-sm">Directory listing:</span>
        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
          {path || "Current directory"}
        </code>
      </div>
      
      {/* Directory content with collapsible functionality */}
      <div className="rounded-lg overflow-hidden border bg-zinc-950 w-full">
        <div className="px-4 py-2 border-b bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-mono text-muted-foreground">Contents</span>
            {isLargeOutput && (
              <span className="text-xs text-muted-foreground">
                ({lineCount} items)
              </span>
            )}
          </div>
          {isLargeOutput && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
        
        {(!isLargeOutput || isExpanded) && (
          <div className="relative overflow-x-auto">
            <SyntaxHighlighter
              language="bash"
              style={claudeSyntaxTheme}
              showLineNumbers={false}
              wrapLongLines={false}
              customStyle={{
                margin: 0,
                background: "transparent",
                lineHeight: "1.6"
              }}
              codeTagProps={{
                style: {
                  fontSize: "0.75rem"
                }
              }}
            >
              {content || "Directory is empty"}
            </SyntaxHighlighter>
          </div>
        )}
        
        {isLargeOutput && !isExpanded && (
          <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-zinc-900/30">
            Click "Expand" to view all items
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Widget for Glob tool result - shows file pattern matches with collapsible content
 */
export const GlobResultWidget: React.FC<{ 
  content: string; 
  pattern?: string; 
  path?: string; 
}> = ({ content, pattern, path }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const lineCount = content.split('\n').filter(line => line.trim()).length;
  const isLargeOutput = lineCount > 20 || content.length > 1000;

  return (
    <div className="space-y-2">
      {/* Glob tool header */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
        <Files className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-medium">File Pattern Results</span>
        {pattern && (
          <code className="text-sm font-mono bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded text-indigo-600 dark:text-indigo-400">
            {pattern}
          </code>
        )}
      </div>
      
      {/* Pattern parameters */}
      {path && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Path:</span>
            <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
              {path}
            </code>
          </div>
        </div>
      )}
      
      {/* Results content with collapsible functionality */}
      <div className="rounded-lg overflow-hidden border bg-zinc-950 w-full">
        <div className="px-4 py-2 border-b bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Files className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-xs font-mono text-indigo-400">Matches</span>
            {isLargeOutput && (
              <span className="text-xs text-muted-foreground">
                ({lineCount} files)
              </span>
            )}
          </div>
          {isLargeOutput && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
        
        {(!isLargeOutput || isExpanded) && (
          <div className="relative overflow-x-auto">
            <SyntaxHighlighter
              language="bash"
              style={claudeSyntaxTheme}
              showLineNumbers={false}
              wrapLongLines={false}
              customStyle={{
                margin: 0,
                background: "transparent",
                lineHeight: "1.6"
              }}
              codeTagProps={{
                style: {
                  fontSize: "0.75rem"
                }
              }}
            >
              {content || "No files matched the pattern"}
            </SyntaxHighlighter>
          </div>
        )}
        
        {isLargeOutput && !isExpanded && (
          <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-zinc-900/30">
            Click "Expand" to view all matches
          </div>
        )}
      </div>
    </div>
  );
};
