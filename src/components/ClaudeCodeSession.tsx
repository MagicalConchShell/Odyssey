import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft,
  Terminal,
  Loader2,
  FolderOpen,
  Copy,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  X,
  History
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'

// Import our components
import { StreamMessage } from './StreamMessage'
import { FloatingPromptInput, type FloatingPromptInputRef } from './FloatingPromptInput'
import { TokenCounter } from './TokenCounter'
import { ClaudeStreamMessage } from '../types/claude-stream'
import TimelineSidebar from './TimelineSidebar'
import type { GitTimelineTreeRef } from './GitTimelineTree'
// Note: CheckpointInfo types now used internally by Git checkpoint system
import { debugLog, MessageFlowTracker } from '@/lib/debug'
import { 
  filterDisplayableMessages, 
  normalizeMessageType
} from '@/lib/message-utils'

// Note: Auto-checkpoint tracking has been removed in favor of manual checkpoint management
// Note: Utility functions have been extracted to /src/lib/message-utils.ts for better maintainability


// Session interface
export interface Session {
  id: string
  project_id: string
  project_path: string
  created_at: number
  name?: string
}

interface ClaudeCodeSessionProps {
  session?: Session
  initialProjectPath?: string
  onBack: () => void
  className?: string
}

export const ClaudeCodeSession: React.FC<ClaudeCodeSessionProps> = ({
  session,
  initialProjectPath = '',
  onBack,
  className,
}) => {
  const [projectPath, setProjectPath] = useState(initialProjectPath || session?.project_path || '')
  // Enhanced message state with update tracking
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([])
  const [copyPopoverOpen, setCopyPopoverOpen] = useState(false)
  const [isFirstPrompt, setIsFirstPrompt] = useState(!session)
  const [totalTokens, setTotalTokens] = useState(0)
  const [tokenBreakdown, setTokenBreakdown] = useState({
    input: 0,
    output: 0,
    cache_creation: 0,
    cache_read: 0
  })
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(session?.id || null)
  const [hasUserScrolled, setHasUserScrolled] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(0) // Sidebar width state, used to adjust input box position
  const [timelineTreeRef, setTimelineTreeRef] = useState<GitTimelineTreeRef | null>(null)
  // Note: Checkpoint settings removed in favor of simplified checkpoint system
  // Note: Timeline refresh now handled internally by Git timeline system
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [availableSessions, setAvailableSessions] = useState<any[]>([])
  const [loadingSessionDetails, setLoadingSessionDetails] = useState(false)
  
  // Queued prompts state
  const [queuedPrompts, setQueuedPrompts] = useState<Array<{ id: string; prompt: string; model: "sonnet" | "opus" }>>([])
  const [queuedPromptsCollapsed, setQueuedPromptsCollapsed] = useState(false)
  
  const parentRef = useRef<HTMLDivElement>(null)
  const floatingPromptRef = useRef<FloatingPromptInputRef>(null)
  const unlistenRefs = useRef<Array<() => void>>([])
  const copyPopoverRef = useRef<HTMLDivElement>(null)

  /**
   * Filters messages to show only those with meaningful content to the user.
   * Uses the extracted utility function for better maintainability.
   */
  const displayableMessages = useMemo(() => filterDisplayableMessages(messages), [messages])

  // Height cache for accurate size estimation
  const heightCache = useRef<Map<string, number>>(new Map())
  
  /**
   * Enhanced size estimation with height caching for better virtual scrolling performance.
   * Uses ResizeObserver measurements when available, falls back to content-based estimation.
   */
  const estimateMessageSize = useCallback((index: number) => {
    const message = displayableMessages[index]
    if (!message) return 150
    
    // Check if we have a cached height for this message
    const cacheKey = message._processingId || `${message.type}_${index}`
    const cachedHeight = heightCache.current.get(cacheKey)
    
    if (cachedHeight) {
      return cachedHeight
    }
    
    // Content-based estimation for initial render
    let estimatedSize = 80
    
    // Adjust based on message type and content
    switch (message.type) {
      case 'assistant':
        if (message.message?.content && Array.isArray(message.message.content)) {
          const content = message.message.content
          const hasTools = content.some((c: any) => c.type === 'tool_use')
          const textLength = content.reduce((sum: number, c: any) => 
            sum + (c.type === 'text' ? (c.text?.length || 0) : 0), 0)
          
          if (hasTools) estimatedSize += 200
          if (textLength > 100) estimatedSize += Math.min(textLength / 10, 300)
        }
        break
      case 'user':
        estimatedSize = 100
        if (message.message?.content && Array.isArray(message.message.content)) {
          const textLength = message.message.content.reduce((sum: number, c: any) => 
            sum + (c.type === 'text' ? (c.text?.length || 0) : 0), 0)
          if (textLength > 50) estimatedSize += Math.min(textLength / 15, 200)
        }
        break
      case 'system':
        if (message.subtype === 'init') estimatedSize = 180
        else estimatedSize = 120
        break
      case 'result':
        estimatedSize = 200
        // Estimate based on result content size
        const resultContent = message.result || message.content || ''
        const resultLength = typeof resultContent === 'string' ? resultContent.length : 0
        if (resultLength > 200) estimatedSize += Math.min(resultLength / 20, 400)
        break
    }
    
    return Math.max(80, Math.min(estimatedSize, 1000))
  }, [displayableMessages])
  
  /**
   * Caches the actual measured height of a message for future estimations.
   */
  const cacheMessageHeight = useCallback((index: number, height: number) => {
    const message = displayableMessages[index]
    if (message) {
      const cacheKey = message._processingId || `${message.type}_${index}`
      heightCache.current.set(cacheKey, height)
    }
  }, [displayableMessages])

  const rowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateMessageSize,
    overscan: 8,
    measureElement: (element) => {
      // Measure actual element size and cache it for future use
      const height = element?.getBoundingClientRect().height || 150
      // Cache the height if we can determine the index
      const index = element?.getAttribute('data-index')
      if (index !== null && index !== undefined) {
        cacheMessageHeight(parseInt(index), height)
      }
      return height
    },
  })
  
  // Clean up height cache when messages change to prevent memory leaks
  useEffect(() => {
    const currentMessageIds = new Set(displayableMessages.map(msg => 
      msg._processingId || `${msg.type}_${displayableMessages.indexOf(msg)}`
    ))
    
    // Remove cached heights for messages that no longer exist
    for (const [key] of heightCache.current.entries()) {
      if (!currentMessageIds.has(key)) {
        heightCache.current.delete(key)
      }
    }
  }, [displayableMessages])

  // Load session history if resuming
  useEffect(() => {
    if (session) {
      loadSessionHistory()
    }
  }, [session])

  // Note: Auto-checkpoint configuration removed - checkpoints are now manual only

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (displayableMessages.length > 0 && !hasUserScrolled) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        try {
          rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { 
            align: 'end', 
            behavior: 'auto' // Use 'auto' instead of 'smooth' for better compatibility
          })
        } catch (error) {
          // Fallback to manual scroll if virtualizer fails
          const container = parentRef.current
          if (container) {
            container.scrollTop = container.scrollHeight
          }
        }
      }, 50)
    }
  }, [displayableMessages.length, rowVirtualizer, hasUserScrolled])

  // Calculate total tokens from messages
  useEffect(() => {
    const breakdown = messages.reduce((acc, msg) => {
      if (msg.message?.usage) {
        const usage = msg.message.usage
        acc.input += usage.input_tokens || 0
        acc.output += usage.output_tokens || 0
        acc.cache_creation += (usage as any).cache_creation_tokens || 0
        acc.cache_read += (usage as any).cache_read_tokens || 0
      }
      if (msg.usage) {
        const usage = msg.usage
        acc.input += usage.input_tokens || 0
        acc.output += usage.output_tokens || 0
        acc.cache_creation += (usage as any).cache_creation_tokens || 0
        acc.cache_read += (usage as any).cache_read_tokens || 0
      }
      return acc
    }, { input: 0, output: 0, cache_creation: 0, cache_read: 0 })
    
    setTokenBreakdown(breakdown)
    setTotalTokens(breakdown.input + breakdown.output + breakdown.cache_creation + breakdown.cache_read)
  }, [messages])



  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      unlistenRefs.current.forEach(unlisten => unlisten())
    }
  }, [])

  // Handle click outside for copy popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (copyPopoverRef.current && !copyPopoverRef.current.contains(event.target as Node)) {
        setCopyPopoverOpen(false)
      }
    }

    if (copyPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [copyPopoverOpen])


  const loadSessionHistory = async () => {
    if (!session) return
    
    try {
      setIsLoading(true)
      setError(null)
      
      const result = await window.electronAPI.claudeCodeSession.loadHistory(session.id, session.project_id)
      
      if (result.success && result.history) {
        // Convert history to messages format with proper type validation
        const loadedMessages: ClaudeStreamMessage[] = result.history.map((entry: any, index: number) => {
          const historyMessage = {
            ...entry,
            _processingId: entry._processingId || `history_${session.id}_${index}`,
            _processedAt: entry._processedAt || new Date().toISOString()
          }
          
          // Use the same validation logic as for streaming messages
          if (entry.message) {
            const normalizedType = normalizeMessageType(entry.type, entry.message)
            historyMessage.type = normalizedType
          } else {
            // For system messages or other types without message content
            historyMessage.type = entry.type === "system" || entry.type === "result" ? entry.type : "system"
          }
          
          return historyMessage
        })
        
        
        setMessages(loadedMessages)
        setRawJsonlOutput(result.history.map((h: any) => JSON.stringify(h)))
        
        // After loading history, we're continuing a conversation
        setIsFirstPrompt(false)
      }
    } catch (err) {
      console.error("Failed to load session history:", err)
      setError("Failed to load session history")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectPath = useCallback(async () => {
    try {
      // For now, let's use the project listing as a simple picker
      const projects = await window.electronAPI.projectManagement.listProjects()
      if (projects.length > 0) {
        // Simple rotation through projects for demo
        const currentIndex = projects.findIndex((p: any) => p.path === projectPath)
        const nextIndex = (currentIndex + 1) % projects.length
        setProjectPath(projects[nextIndex].path)
        setError(null)
      }
    } catch (err) {
      console.error("Failed to select directory:", err)
      setError("Failed to select directory")
    }
  }, [projectPath])


  const handleSendPrompt = async (prompt: string, model: "sonnet" | "opus") => {
    
    if (!projectPath) {
      setError("Please select a project directory first")
      return
    }

    // If already loading, queue the prompt
    if (isLoading) {
      const newPrompt = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        prompt,
        model
      }
      setQueuedPrompts(prev => [...prev, newPrompt])
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      
      // Clean up previous listeners
      unlistenRefs.current.forEach(unlisten => unlisten())
      unlistenRefs.current = []
      
      // Add the user message immediately to the UI
      const userMessage: ClaudeStreamMessage = {
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: prompt
            }
          ]
        },
        _processingId: `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        _processedAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      }
      
      // Track user message creation
      const tracker = MessageFlowTracker.getInstance()
      tracker.track(userMessage._processingId!, 'ClaudeCodeSession', 'user_message_created', 'user', {
        promptLength: prompt.length,
        projectPath
      })
      
      debugLog({
        component: 'ClaudeCodeSession',
        action: 'user_message_created',
        messageType: 'user',
        processingId: userMessage._processingId,
        details: {
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          projectPath
        }
      })
      
      setMessages(prev => {
        tracker.track(userMessage._processingId!, 'ClaudeCodeSession', 'user_message_added_to_state', 'user', {
          previousMessageCount: prev.length
        })
        return [...prev, userMessage]
      })

      let sessionId: string
      
      // Execute the appropriate command
      if (claudeSessionId && !isFirstPrompt) {
        const result = await window.electronAPI.claudeCodeSession.resume(projectPath, claudeSessionId, prompt, model)
        if (!result.success) {
          throw new Error(result.error || 'Failed to resume session')
        }
        sessionId = claudeSessionId
      } else {
        const result = await window.electronAPI.claudeCodeSession.execute(projectPath, prompt, model)
        if (!result.success) {
          throw new Error(result.error || 'Failed to start session')
        }
        sessionId = result.sessionId!
        setClaudeSessionId(sessionId)
        setIsFirstPrompt(false)
      }
      
      // Set up event listeners for this session
      
      // Note: Event listeners are no longer supported in the simplified API
      // Output will be handled differently in the new architecture
      const outputUnlisten = () => {}

      // Note: Event listeners are no longer supported in the simplified API  
      const errorUnlisten = () => {} 
      const completeUnlisten = () => {}

      unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten]
      
    } catch (err) {
      console.error("Failed to send prompt:", err)
      setError("Failed to send prompt")
      setIsLoading(false)
    }
  }

  const handleCopyAsMarkdown = useCallback(async () => {
    let markdown = `# Claude Code Session\n\n`
    markdown += `**Project:** ${projectPath}\n`
    markdown += `**Date:** ${new Date().toISOString()}\n\n`
    markdown += `---\n\n`

    for (const msg of displayableMessages) {
      if (msg.type === "system" && msg.subtype === "init") {
        markdown += `## System Initialization\n\n`
        markdown += `- Session ID: \`${msg.session_id || 'N/A'}\`\n`
        markdown += `- Model: \`${msg.model || 'default'}\`\n`
        if (msg.cwd) markdown += `- Working Directory: \`${msg.cwd}\`\n`
        if (msg.tools?.length) markdown += `- Tools: ${msg.tools.join(', ')}\n`
        markdown += `\n`
      } else if (msg.type === "assistant" && msg.message) {
        markdown += `## Assistant\n\n`
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text || content))
            markdown += `${textContent}\n\n`
          } else if (content.type === "tool_use") {
            markdown += `### Tool: ${content.name}\n\n`
            markdown += `\`\`\`json\n${JSON.stringify(content.input, null, 2)}\n\`\`\`\n\n`
          }
        }
        if (msg.message.usage) {
          markdown += `*Tokens: ${msg.message.usage.input_tokens} in, ${msg.message.usage.output_tokens} out*\n\n`
        }
      } else if (msg.type === "user" && msg.message) {
        markdown += `## User\n\n`
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text))
            markdown += `${textContent}\n\n`
          } else if (content.type === "tool_result") {
            markdown += `### Tool Result\n\n`
            let contentText = ''
            if (typeof content.content === 'string') {
              contentText = content.content
            } else if (content.content && typeof content.content === 'object') {
              if (content.content.text) {
                contentText = content.content.text
              } else if (Array.isArray(content.content)) {
                contentText = content.content
                  .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
                  .join('\n')
              } else {
                contentText = JSON.stringify(content.content, null, 2)
              }
            }
            markdown += `\`\`\`\n${contentText}\n\`\`\`\n\n`
          }
        }
      } else if (msg.type === "result") {
        markdown += `## Execution Result\n\n`
        if (msg.result) {
          markdown += `${msg.result}\n\n`
        }
        if (msg.error) {
          markdown += `**Error:** ${msg.error}\n\n`
        }
      }
    }

    await navigator.clipboard.writeText(markdown)
    setCopyPopoverOpen(false)
  }, [displayableMessages, projectPath])

  const handleCopyAsJsonl = useCallback(async () => {
    const jsonl = rawJsonlOutput.join('\n')
    await navigator.clipboard.writeText(jsonl)
    setCopyPopoverOpen(false)
  }, [rawJsonlOutput])

  const handleCancelExecution = useCallback(async () => {
    if (!isLoading) return
    
    try {
      await window.electronAPI.claudeCodeSession.cancel(claudeSessionId || undefined)
      
      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten())
      unlistenRefs.current = []
      
      // Add a system message indicating cancellation
      const cancelMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "cancelled",
        result: "Execution cancelled by user",
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, cancelMessage])
      
      // Reset states
      setIsLoading(false)
      setError(null)
      
      // Clear queued prompts
      setQueuedPrompts([])
    } catch (err) {
      console.error("Failed to cancel execution:", err)
      setError("Failed to cancel execution")
    }
  }, [claudeSessionId, isLoading])

  const handleCheckpointRestore = async (commitHash: string) => {
    try {
      const result = await window.electronAPI.gitCheckpoint.checkout(projectPath, commitHash)
      if (result.success) {
        // Optionally refresh the UI or show a success message
      } else {
        console.error('Failed to restore checkpoint:', result.error)
      }
    } catch (error) {
      console.error('Error restoring checkpoint:', error)
    }
  }

  const handleCheckpointCreate = async (description: string) => {
    try {
      const result = await window.electronAPI.gitCheckpoint.createCheckpoint(projectPath, description)
      if (result.success) {
        console.log('Checkpoint created successfully:', result)
        // Add a longer delay to ensure backend state is consistent before refreshing
        await new Promise(resolve => setTimeout(resolve, 300))
        const refreshSuccess = await refreshTimelineWithRetry(5) // Increase retry count for checkpoint creation
        if (!refreshSuccess) {
          console.warn('Checkpoint created but timeline refresh failed - user may need to manually refresh')
        }
      } else {
        console.error('Failed to create checkpoint:', result.error)
      }
    } catch (error) {
      console.error('Error creating checkpoint:', error)
    }
  }

  const handleCheckpointDelete = async (branchName: string) => {
    try {
      const result = await window.electronAPI.gitCheckpoint.deleteBranch(projectPath, branchName)
      if (result.success) {
        console.log('Branch deleted successfully:', branchName)
        await refreshTimelineWithRetry()
      } else {
        console.error('Failed to delete branch:', result.error)
      }
    } catch (error) {
      console.error('Error deleting branch:', error)
    }
  }

  const refreshTimeline = async () => {
    // Refresh the timeline by calling the GitTimelineTree's refresh method
    if (timelineTreeRef?.refreshTimeline) {
      try {
        await timelineTreeRef.refreshTimeline()
      } catch (error) {
        console.error('Failed to refresh timeline:', error)
      }
    } else {
      console.warn('Timeline ref not available for refresh')
    }
  }

  const refreshTimelineWithRetry = async (maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Refreshing timeline (attempt ${attempt}/${maxRetries})`)
        
        // Verify that the timelineTreeRef is available
        if (!timelineTreeRef?.refreshTimeline) {
          console.warn('Timeline ref not available, waiting for mount...')
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }
        
        await refreshTimeline()
        console.log('Timeline refresh successful')
        return true
      } catch (error) {
        console.error(`Timeline refresh attempt ${attempt} failed:`, error)
        if (attempt < maxRetries) {
          // Wait progressively longer between retries (500ms, 1s, 1.5s, 2s, 2.5s)
          await new Promise(resolve => setTimeout(resolve, attempt * 500))
        }
      }
    }
    console.error('All timeline refresh attempts failed')
    return false
  }

  // Helper function to format relative time
  const formatRelativeTime = (timestamp: string | number) => {
    const now = Date.now()
    const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
    const diff = now - time
    
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) {
      return days === 1 ? '1 day ago' : `${days} days ago`
    } else if (hours > 0) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`
    } else if (minutes > 0) {
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
    } else {
      return 'Just now'
    }
  }

  // Helper function to extract first user message as summary
  const extractSummary = (messages: any[]) => {
    for (const msg of messages) {
      if (msg.type === 'user' && msg.message?.content) {
        const content = msg.message.content
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              const text = typeof item.text === 'string' ? item.text : item.text?.text || ''
              return text.substring(0, 100).trim() + (text.length > 100 ? '...' : '')
            }
          }
        } else if (typeof content === 'string') {
          return content.substring(0, 100).trim() + (content.length > 100 ? '...' : '')
        }
      }
    }
    return 'No user messages found'
  }

  const loadAvailableSessions = async () => {
    if (!projectPath) return
    
    try {
      setLoadingSessionDetails(true)
      
      // Extract project ID from path - same logic as in App.tsx
      const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-')
      const sessions = await window.electronAPI.projectManagement.getProjectSessions(projectId)
      
      
      // Load detailed information for each session
      const enhancedSessions = await Promise.all(
        sessions.map(async (session: any) => {
          try {
            // Load session history to get detailed stats
            const historyResult = await window.electronAPI.claudeCodeSession.loadHistory(session.id, projectId)
            
            if (historyResult.success && historyResult.history) {
              const messages = historyResult.history
              
              // Count messages
              const totalMessages = messages.length
              const userMessages = messages.filter((msg: any) => msg.type === 'user').length
              const assistantMessages = messages.filter((msg: any) => msg.type === 'assistant').length
              
              // Find last modified time (last message timestamp)
              let lastModified = session.created_at ? new Date(session.created_at).getTime() : Date.now()
              if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1]
                const lastMsgTime = lastMessage.timestamp || lastMessage._processedAt || lastMessage.created_at
                if (lastMsgTime) {
                  lastModified = new Date(lastMsgTime).getTime()
                }
              }
              
              // Extract summary from first user message
              const summary = extractSummary(messages)
              
              // Get the last message type for context
              const lastMessage = messages[messages.length - 1]
              const lastMessageType = lastMessage?.type || 'unknown'
              
              return {
                ...session,
                // Enhanced information
                totalMessages,
                userMessages,
                assistantMessages,
                lastModified,
                summary,
                lastMessageType,
                // For display purposes
                modifiedAgo: formatRelativeTime(lastModified),
                createdAgo: formatRelativeTime(session.created_at ? new Date(session.created_at).getTime() : Date.now())
              }
            } else {
              // Fallback for sessions without history
              return {
                ...session,
                totalMessages: 0,
                userMessages: 0,
                assistantMessages: 0,
                lastModified: session.created_at ? new Date(session.created_at).getTime() : Date.now(),
                summary: 'No messages available',
                lastMessageType: 'none',
                modifiedAgo: 'Unknown',
                createdAgo: formatRelativeTime(session.created_at ? new Date(session.created_at).getTime() : Date.now())
              }
            }
          } catch (err) {
            console.error(`Failed to load details for session ${session.id}:`, err)
            // Return basic session info on error
            return {
              ...session,
              totalMessages: 0,
              userMessages: 0,
              assistantMessages: 0,
              lastModified: session.created_at ? new Date(session.created_at).getTime() : Date.now(),
              summary: 'Failed to load details',
              lastMessageType: 'error',
              modifiedAgo: 'Unknown',
              createdAgo: formatRelativeTime(session.created_at ? new Date(session.created_at).getTime() : Date.now())
            }
          }
        })
      )
      
      // Sort sessions by last modified time (most recent first)
      const sortedSessions = enhancedSessions.sort((a: any, b: any) => b.lastModified - a.lastModified)
      
      setAvailableSessions(sortedSessions)
    } catch (err) {
      console.error('Failed to load available sessions:', err)
      setError('Failed to load available sessions')
    } finally {
      setLoadingSessionDetails(false)
    }
  }

  const handleResumeSession = async (sessionToResume: any) => {
    try {
      // Convert electron Session to ClaudeSession format
      const claudeSession: Session = {
        id: sessionToResume.id,
        project_id: projectPath.replace(/[^a-zA-Z0-9]/g, '-'),
        project_path: projectPath,
        created_at: sessionToResume.created_at ? new Date(sessionToResume.created_at).getTime() / 1000 : Date.now() / 1000,
        name: sessionToResume.name
      }
      
      // Load the session history
      setIsLoading(true)
      setError(null)
      setShowResumeDialog(false)
      
      const result = await window.electronAPI.claudeCodeSession.loadHistory(sessionToResume.id, claudeSession.project_id)
      
      if (result.success && result.history) {
        // Convert history to messages format
        const loadedMessages: ClaudeStreamMessage[] = result.history.map((entry: any, index: number) => ({
          ...entry,
          _processingId: entry._processingId || `history_${sessionToResume.id}_${index}`,
          _processedAt: entry._processedAt || new Date().toISOString()
        }))
        
        setMessages(loadedMessages)
        setClaudeSessionId(sessionToResume.id)
        setIsFirstPrompt(false)
        
      } else {
        throw new Error(result.error || 'Failed to load session history')
      }
    } catch (err) {
      console.error('Failed to resume session:', err)
      setError(err instanceof Error ? err.message : 'Failed to resume session')
    } finally {
      setIsLoading(false)
    }
  }

  const isAtBottom = useCallback(() => {
    const container = parentRef.current
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      return distanceFromBottom < 1
    }
    return true
  }, [])

  const handleScroll = useCallback(() => {
    if (!hasUserScrolled) {
      setHasUserScrolled(true)
    }
    
    // If user scrolls back to bottom, re-enable auto-scroll
    if (isAtBottom()) {
      setHasUserScrolled(false)
    }
  }, [hasUserScrolled, isAtBottom])

  const messagesList = (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto relative"
      onScroll={handleScroll}
      style={{
        // Remove 'contain: strict' which can interfere with smooth scrolling
        contain: 'layout style',
      }}
    >
      <div
        className="relative w-full max-w-5xl mx-auto px-4 py-4"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        <AnimatePresence>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const message = displayableMessages[virtualItem.index]
            return (
              <motion.div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={(el) => el && rowVirtualizer.measureElement(el)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-x-4 pb-4"
                style={{
                  top: virtualItem.start,
                }}
              >
                <StreamMessage 
                  message={message} 
                  streamMessages={messages}
                  onLinkDetected={() => {
                    // TODO: Implement link detection callback
                  }}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Loading and Error indicators positioned relative to the scroll container */}
      <div className="sticky bottom-0 w-full flex flex-col items-center pb-48">
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center py-4 mt-4"
          >
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </motion.div>
        )}
        
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mt-4 w-full max-w-5xl mx-auto flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </motion.div>
        )}
      </div>
    </div>
  )

  const projectPathInput = !session && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="p-4 border-b border-border flex-shrink-0"
    >
      <label htmlFor="project-path" className="text-sm font-medium text-foreground">
        Project Directory
      </label>
      <div className="flex items-center gap-2 mt-1">
        <input
          id="project-path"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="/path/to/your/project"
          className="flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={isLoading}
        />
        <button
          onClick={handleSelectPath}
          className="p-2 border border-input rounded-md hover:bg-accent transition-colors"
          disabled={isLoading}
        >
          <FolderOpen className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )

  return (
    <div className={clsx("flex flex-col h-full bg-background text-foreground", className)}>
      <div className="w-full h-full flex flex-col">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        >
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="h-8 w-8 p-2 hover:bg-accent rounded-md transition-colors flex items-center justify-center"
              disabled={isLoading}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              <div>
                <h2 className="text-lg font-semibold">Claude Code Session</h2>
                <p className="text-xs text-muted-foreground">
                  {session ? `Resuming session ${session.id.slice(0, 8)}...` : 'Interactive session'}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Resume Button */}
            {projectPath && (
              <button
                onClick={async () => {
                  await loadAvailableSessions()
                  setShowResumeDialog(true)
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md transition-colors"
                disabled={isLoading}
              >
                <History className="h-4 w-4" />
                Resume
              </button>
            )}
            
            {/* Note: Timeline sidebar is always visible and collapsible */}
            
            {messages.length > 0 && (
              <div className="relative" ref={copyPopoverRef}>
                <button
                  onClick={() => setCopyPopoverOpen(!copyPopoverOpen)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  Copy Output
                  <ChevronDown className="h-3 w-3" />
                </button>
                <AnimatePresence>
                  {copyPopoverOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1 w-44 bg-popover border border-border rounded-md shadow-lg z-20"
                    >
                      <div className="p-1">
                        <button
                          onClick={handleCopyAsMarkdown}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded transition-colors text-popover-foreground"
                        >
                          Copy as Markdown
                        </button>
                        <button
                          onClick={handleCopyAsJsonl}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded transition-colors text-popover-foreground"
                        >
                          Copy as JSONL
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            
            <div className="relative group">
              <TokenCounter tokens={totalTokens} />
              {(tokenBreakdown.input > 0 || tokenBreakdown.output > 0) && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-popover border border-border rounded-lg shadow-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="p-3">
                    <h4 className="text-sm font-semibold text-popover-foreground mb-2">Token Breakdown</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Input:</span>
                        <span className="font-medium text-green-600">{tokenBreakdown.input.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Output:</span>
                        <span className="font-medium text-blue-600">{tokenBreakdown.output.toLocaleString()}</span>
                      </div>
                      {tokenBreakdown.cache_creation > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cache Write:</span>
                          <span className="font-medium text-purple-600">{tokenBreakdown.cache_creation.toLocaleString()}</span>
                        </div>
                      )}
                      {tokenBreakdown.cache_read > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cache Read:</span>
                          <span className="font-medium text-orange-600">{tokenBreakdown.cache_read.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="border-t border-border pt-1 mt-2">
                        <div className="flex justify-between font-semibold">
                          <span className="text-foreground">Total:</span>
                          <span className="text-foreground">{totalTokens.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {/* Timeline Sidebar - 始终显示，可折叠 */}
          <TimelineSidebar
            projectPath={projectPath}
            onCheckpointCreate={handleCheckpointCreate}
            onCheckpointRestore={handleCheckpointRestore}
            onCheckpointDelete={handleCheckpointDelete}
            onSidebarWidthChange={setSidebarWidth}
            onTimelineRef={setTimelineTreeRef}
          />
          
          {/* Main Content */}
          <div className="flex-1 overflow-hidden">
            <div className="h-full flex flex-col max-w-5xl mx-auto">
              {projectPathInput}
              {messagesList}
            </div>

            {isLoading && messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {session ? "Loading session history..." : "Initializing Claude Code..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Checkpoint Settings Modal */}
        {/* Note: CheckpointSettings modal removed - functionality now integrated in Git timeline system */}

        {/* Navigation Arrows - positioned above prompt bar with spacing */}
        {displayableMessages.length > 5 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ delay: 0.5 }}
            className="fixed bottom-32 right-6 z-50"
          >
            <div className="flex items-center bg-background/95 backdrop-blur-md border rounded-full shadow-lg overflow-hidden">
              <button
                onClick={() => {
                  // Use virtualizer to scroll to the first item
                  if (displayableMessages.length > 0) {
                    // Scroll to top of the container
                    parentRef.current?.scrollTo({
                      top: 0,
                      behavior: 'smooth'
                    })
                    
                    // After smooth scroll completes, trigger a small scroll to ensure rendering
                    setTimeout(() => {
                      if (parentRef.current) {
                        // Scroll down 1px then back to 0 to trigger virtualizer update
                        parentRef.current.scrollTop = 1
                        requestAnimationFrame(() => {
                          if (parentRef.current) {
                            parentRef.current.scrollTop = 0
                          }
                        })
                      }
                    }, 500) // Wait for smooth scroll to complete
                  }
                }}
                className="px-3 py-2 hover:bg-accent rounded-none text-sm transition-colors"
                title="Scroll to top"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <div className="w-px h-4 bg-border" />
              <button
                onClick={() => {
                  // Use virtualizer to scroll to the last item
                  if (displayableMessages.length > 0) {
                    // Scroll to bottom of the container
                    const scrollElement = parentRef.current
                    if (scrollElement) {
                      scrollElement.scrollTo({
                        top: scrollElement.scrollHeight,
                        behavior: 'smooth'
                      })
                    }
                  }
                }}
                className="px-3 py-2 hover:bg-accent rounded-none text-sm transition-colors"
                title="Scroll to bottom"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Queued Prompts Display */}
        <AnimatePresence>
          {queuedPrompts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4"
            >
              <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Queued Prompts ({queuedPrompts.length})
                  </div>
                  <button 
                    onClick={() => setQueuedPromptsCollapsed(prev => !prev)}
                    className="p-1 hover:bg-accent rounded-md transition-colors"
                  >
                    {queuedPromptsCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
                {!queuedPromptsCollapsed && queuedPrompts.map((queuedPrompt, index) => (
                  <motion.div
                    key={queuedPrompt.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-start gap-2 bg-muted/50 rounded-md p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                          {queuedPrompt.model === "opus" ? "Opus" : "Sonnet"}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2 break-words">{queuedPrompt.prompt}</p>
                    </div>
                    <button
                      onClick={() => setQueuedPrompts(prev => prev.filter(p => p.id !== queuedPrompt.id))}
                      className="p-1 hover:bg-accent rounded-md transition-colors flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Resume Session Dialog */}
        <AnimatePresence>
          {showResumeDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowResumeDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Resume Session
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Choose a previous session to continue from
                      </p>
                    </div>
                    <button
                      onClick={() => setShowResumeDialog(false)}
                      className="p-2 hover:bg-accent rounded-md transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="p-6 overflow-auto max-h-96">
                  {loadingSessionDetails ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading session details...</p>
                      </div>
                    </div>
                  ) : availableSessions.length > 0 ? (
                    <div className="space-y-3">
                      {availableSessions.map((sessionItem, index) => (
                        <motion.div
                          key={sessionItem.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="p-4 border border-border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                          onClick={() => handleResumeSession(sessionItem)}
                        >
                          <div className="space-y-3">
                            {/* Summary line */}
                            <div className="flex items-start justify-between">
                              <p className="text-sm font-medium text-foreground line-clamp-2 flex-1 pr-2">
                                "{sessionItem.summary}"
                              </p>
                              <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 flex-shrink-0 mt-0.5" />
                            </div>
                            
                            {/* Time and stats info */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex items-center space-x-4">
                                <span>Modified: {sessionItem.modifiedAgo}</span>
                                <span>•</span>
                                <span>Created: {sessionItem.createdAgo}</span>
                              </div>
                            </div>
                            
                            {/* Message stats and last action */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex items-center space-x-4">
                                <span className="font-medium">
                                  {sessionItem.totalMessages} message{sessionItem.totalMessages !== 1 ? 's' : ''}
                                </span>
                                {sessionItem.totalMessages > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>
                                      Last: {sessionItem.lastMessageType === 'user' ? 'Your message' : 
                                             sessionItem.lastMessageType === 'assistant' ? 'Assistant response' : 
                                             'System message'}
                                    </span>
                                  </>
                                )}
                              </div>
                              
                              {/* Session ID (smaller, right-aligned) */}
                              <span className="font-mono text-xs opacity-50">
                                {sessionItem.id.slice(0, 8)}...
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h4 className="text-sm font-medium text-foreground mb-2">No previous sessions found</h4>
                      <p className="text-xs text-muted-foreground">
                        Start a new conversation to create your first session
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Prompt Input - Always visible */}
        <FloatingPromptInput
          ref={floatingPromptRef}
          onSend={async (prompt, model) => {
            handleSendPrompt(prompt, model)
            await refreshTimeline() // Refresh timeline after sending prompt
          }}
          onCancel={handleCancelExecution}
          isLoading={isLoading}
          disabled={!projectPath}
          projectPath={projectPath}
          sidebarWidth={sidebarWidth}
        />
      </div>
    </div>
  )


}