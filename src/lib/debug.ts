// Debug utilities for message processing
// Set to true to enable detailed debugging logs
const DEBUG_MESSAGES = process.env.NODE_ENV === 'development'

export interface MessageDebugInfo {
  component: string
  action: string
  messageType?: string
  processingId?: string
  sessionId?: string
  timestamp?: string | number
  details?: Record<string, unknown>
}

export const debugLog = (info: MessageDebugInfo) => {
  if (!DEBUG_MESSAGES) return
  
  const timestamp = new Date().toISOString()
  const prefix = `[${info.component}] ${info.action}:`
  
  console.log(
    `%c${prefix}`,
    'color: #10b981; font-weight: bold',
    {
      ...info,
      timestamp
    }
  )
}

export const debugWarn = (info: MessageDebugInfo) => {
  if (!DEBUG_MESSAGES) return
  
  const timestamp = new Date().toISOString()
  const prefix = `[${info.component}] ${info.action}:`
  
  console.warn(
    `%c${prefix}`,
    'color: #f59e0b; font-weight: bold',
    {
      ...info,
      timestamp
    }
  )
}

export const debugError = (info: MessageDebugInfo) => {
  // Always log errors, even in production
  const timestamp = new Date().toISOString()
  const prefix = `[${info.component}] ${info.action}:`
  
  console.error(
    `%c${prefix}`,
    'color: #ef4444; font-weight: bold',
    {
      ...info,
      timestamp
    }
  )
}

// Message flow tracking
export class MessageFlowTracker {
  private static instance: MessageFlowTracker
  private messageFlow: Array<{
    id: string
    timestamp: string
    component: string
    action: string
    messageType?: string
    details?: Record<string, unknown>
  }> = []

  static getInstance(): MessageFlowTracker {
    if (!MessageFlowTracker.instance) {
      MessageFlowTracker.instance = new MessageFlowTracker()
    }
    return MessageFlowTracker.instance
  }

  track(id: string, component: string, action: string, messageType?: string, details?: Record<string, unknown>) {
    if (!DEBUG_MESSAGES) return

    this.messageFlow.push({
      id,
      timestamp: new Date().toISOString(),
      component,
      action,
      messageType,
      details
    })

    // Keep only last 100 entries to prevent memory issues
    if (this.messageFlow.length > 100) {
      this.messageFlow = this.messageFlow.slice(-100)
    }
  }

  getFlow(messageId?: string): Array<{
    id: string;
    timestamp: string;
    component: string;
    action: string;
    messageType?: string;
    details?: Record<string, unknown>;
  }> {
    if (messageId) {
      return this.messageFlow.filter(entry => entry.id === messageId)
    }
    return this.messageFlow
  }

  printFlow(messageId?: string) {
    if (!DEBUG_MESSAGES) return

    const flow = this.getFlow(messageId)
    console.group(`Message Flow ${messageId ? `for ${messageId}` : '(All Messages)'}`)
    flow.forEach(entry => {
      console.log(`${entry.timestamp}: [${entry.component}] ${entry.action}`, entry.details || '')
    })
    console.groupEnd()
  }

  clear() {
    this.messageFlow = []
  }
}

// Add to window for debugging purposes
if (typeof window !== 'undefined' && DEBUG_MESSAGES) {
  ;(window as unknown as Record<string, unknown>).debugMessageFlow = MessageFlowTracker.getInstance()
}