/**
 * Utility functions for Claude stream message processing and validation.
 * Shared utilities for Claude AI interaction components.
 */

import { ClaudeStreamMessage } from '../types/claude-stream'

/**
 * Parses streaming JSON data with multiple fallback strategies.
 * Handles partial data, line-by-line parsing, and regex extraction.
 * 
 * @param data - Raw string data from the Claude CLI
 * @returns Parsed JSON object or null if parsing fails
 */
export const parseStreamingJSON = (data: string): any | null => {
  // Strategy 1: Try parsing as complete JSON
  try {
    return JSON.parse(data)
  } catch (error) {
    // Strategy 2: Parse line by line (handles newline-delimited JSON)
    const lines = data.split('\n').filter(line => line.trim())
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim())
        return parsed // Return the first valid JSON we find
      } catch {
        // Continue to next line
      }
    }
    
    // Strategy 3: Extract JSON objects using regex
    const jsonRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
    const matches = data.match(jsonRegex)
    
    if (matches) {
      for (const match of matches) {
        try {
          return JSON.parse(match)
        } catch {
          // Continue to next match
        }
      }
    }
    
    // Log parsing failures in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.warn('[parseStreamingJSON] Failed to parse data:', {
        data: data.substring(0, 200) + (data.length > 200 ? '...' : ''),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
    
    return null
  }
}

/**
 * Normalizes message types from the Claude CLI to ensure consistent typing.
 * Handles edge cases and validates message structure.
 * 
 * @param type - Original message type from CLI
 * @param message - Message content for validation
 * @returns Normalized message type
 */
export const normalizeMessageType = (type: string, message?: any): "system" | "assistant" | "user" | "result" => {
  // Handle system messages first (they may not have a message field)
  if (type === "system") {
    return "system"
  }
  
  // Handle result messages
  if (type === "result") {
    return "result"
  }
  
  // If no message object, default to system
  if (!message) {
    return "system"
  }
  
  // Detect tool results disguised as user messages
  if (type === "user" && message.content && Array.isArray(message.content)) {
    const allToolResults = message.content.every((item: any) => item.type === "tool_result")
    if (allToolResults && message.content.length > 0) {
      return "result"
    }
  }
  
  // Validate standard message types
  if (type === "user" || type === "assistant") {
    // Reconcile type with message role if available
    if (message.role && message.role !== type) {
      return message.role === "user" ? "user" : "assistant"
    }
    return type
  }
  
  // Handle edge cases based on message role
  if (message.role === "user") {
    return "user"
  }
  
  if (message.role === "assistant") {
    return "assistant"
  }
  
  // Default to system for unknown types
  return "system"
}

/**
 * Validates and normalizes a message from the Claude CLI stream.
 * Adds processing metadata and ensures message structure consistency.
 * 
 * @param data - Raw JSON string from the CLI
 * @param messageId - Optional custom message ID
 * @returns Normalized message or null if validation fails
 */
export const validateAndNormalizeMessage = (data: string, messageId?: string): ClaudeStreamMessage | null => {
  try {
    const parsed = parseStreamingJSON(data)
    
    if (!parsed) {
      return null
    }
    
    const processingId = messageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    
    // Validate required fields
    if (!parsed.type) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[validateAndNormalizeMessage] Message missing type field:', parsed)
      }
      return null
    }
    
    // Validate message content based on type
    if (parsed.type !== "system" && parsed.type !== "result" && !parsed.message) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[validateAndNormalizeMessage] Non-system message missing message field:', parsed)
      }
      return null
    }
    
    // Normalize message type using business logic
    const normalizedType = normalizeMessageType(parsed.type, parsed.message)
    
    // Create normalized message with processing metadata
    const normalizedMessage: ClaudeStreamMessage = {
      ...parsed,
      type: normalizedType,
      _processingId: processingId,
      _processedAt: new Date().toISOString()
    }
    
    return normalizedMessage
  } catch (error) {
    console.error('[validateAndNormalizeMessage] Message validation failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      data: data.substring(0, 200) + (data.length > 200 ? '...' : '')
    })
    
    return null
  }
}

/**
 * Finds a message that should be updated instead of creating a new one.
 * Implements logic for tool_use -> tool_result updates and similar patterns.
 * 
 * @param messages - Current messages array
 * @param newMessage - New message to potentially update an existing one
 * @returns Index of message to update, or -1 if no update needed
 */
export const findMessageToUpdate = (messages: ClaudeStreamMessage[], newMessage: ClaudeStreamMessage): number => {
  // Look for tool_use messages that should be updated with tool_result
  if (newMessage.type === 'result' || (newMessage.type === 'user' && newMessage.message?.content?.[0]?.type === 'tool_result')) {
    // Find the most recent tool_use message that doesn't have a corresponding result
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content) && msg.message.content.some((content: any) => content.type === 'tool_use')) {
        // Check if this tool_use already has a result
        const hasResult = messages.slice(i + 1).some(laterMsg => 
          laterMsg.type === 'result' || 
          (laterMsg.type === 'user' && laterMsg.message?.content?.[0]?.type === 'tool_result')
        )
        
        if (!hasResult) {
          return i
        }
      }
    }
  }
  
  // Look for streaming text updates (content_block_delta)
  if (newMessage.type === 'assistant' && Array.isArray(newMessage.message?.content) && newMessage.message.content.some((content: any) => content.type === 'text')) {
    // Find the most recent assistant message that might be getting updated
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content) && msg.message.content.some((content: any) => content.type === 'text')) {
        // Check if this might be a streaming update
        if (msg.message?.id && newMessage.message?.id && msg.message.id === newMessage.message.id) {
          return i
        }
      }
    }
  }
  
  return -1
}

/**
 * Filters messages to show only those with meaningful content to the user.
 * Simplified filtering logic that focuses on content relevance rather than complex widget interactions.
 * 
 * @param messages - Array of all messages
 * @returns Array of messages that should be displayed in the UI
 */
export const filterDisplayableMessages = (messages: ClaudeStreamMessage[]): ClaudeStreamMessage[] => {
  // Tools that have dedicated UI widgets and shouldn't show raw tool results
  const toolsWithWidgets = [
    'task', 'edit', 'multiedit', 'todowrite', 'ls', 'read', 
    'glob', 'bash', 'write', 'grep', 'webfetch', 'notebookread', 'notebookedit'
  ]
  
  return messages.filter((message, index) => {
    // Always show system messages - they provide important context
    if (message.type === "system") {
      return true
    }

    // Always show assistant messages - they contain Claude's responses
    if (message.type === "assistant") {
      return true
    }

    // Always show user messages with text content
    if (message.type === "user" && message.message?.content) {
      const hasTextContent = Array.isArray(message.message.content) 
        ? message.message.content.some((content: any) => content.type === "text")
        : true
      
      if (hasTextContent) {
        return true
      }
    }

    // Handle tool result messages
    if (message.type === "result" || (message.type === "user" && message.message?.content?.[0]?.type === "tool_result")) {
      // Find the corresponding tool_use to determine if it should be shown
      const toolResult = message.type === "result" ? message : message.message?.content?.[0]
      
      if (toolResult?.tool_use_id) {
        // Look for the matching tool_use in previous messages
        for (let i = index - 1; i >= 0; i--) {
          const prevMsg = messages[i]
          if (prevMsg.type === 'assistant' && Array.isArray(prevMsg.message?.content)) {
            const toolUse = prevMsg.message.content.find((c: any) => 
              c.type === 'tool_use' && c.id === toolResult.tool_use_id
            )
            if (toolUse) {
              const toolName = toolUse.name?.toLowerCase()
              // Hide tool results for tools with widgets, show others
              return !toolsWithWidgets.includes(toolName) && !toolUse.name?.startsWith('mcp__')
            }
          }
        }
      }
      
      // Show tool results that don't have a corresponding tool_use (fallback)
      return true
    }

    // Skip meta messages without meaningful content
    if (message.isMeta && !message.leafUuid && !message.summary) {
      return false
    }

    // Skip empty messages
    if (!message.message && !message.content && !message.result) {
      return false
    }

    // Show everything else by default
    return true
  })
}

/**
 * Creates a system message from plain text content.
 * 
 * @param content - Text content for the system message
 * @returns System message object
 */
export const createSystemMessage = (content: string): ClaudeStreamMessage => {
  return {
    type: "system",
    content: content,
    timestamp: new Date().toISOString(),
    _processingId: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    _processedAt: new Date().toISOString()
  }
}

/**
 * Checks if two messages are duplicates based on various criteria.
 * 
 * @param msg1 - First message to compare
 * @param msg2 - Second message to compare
 * @returns True if messages are considered duplicates
 */
export const areMessagesDuplicate = (msg1: ClaudeStreamMessage, msg2: ClaudeStreamMessage): boolean => {
  // Check Claude message ID if available
  if (msg1.message?.id && msg2.message?.id) {
    return msg1.message.id === msg2.message.id
  }
  
  // Check UUID if available
  if (msg1.uuid && msg2.uuid) {
    return msg1.uuid === msg2.uuid
  }
  
  // For system messages, check session_id + type + subtype combination
  if (msg1.type === 'system' && msg2.type === 'system') {
    return msg1.session_id === msg2.session_id && msg1.subtype === msg2.subtype
  }
  
  // Check if it's exactly the same content (fallback)
  if (msg1.type === msg2.type && 
      JSON.stringify(msg1.message) === JSON.stringify(msg2.message)) {
    return true
  }
  
  return false
}