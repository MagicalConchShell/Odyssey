/**
 * Terminal Event Manager
 * 
 * Centralized event handling for terminal instances
 * Manages lifecycle events, data flow, and cleanup
 */

import { getTerminalDataChannel, getTerminalExitChannel } from '../../electron/ipc-channels'

export interface TerminalEventHandlers {
  onData: (data: string) => void
  onExit: (exitCode: number) => void
  onError?: (error: Error) => void
}

export interface TerminalEventSubscription {
  unsubscribe: () => void
}

export class TerminalEventManager {
  private static instance: TerminalEventManager | null = null
  private subscriptions = new Map<string, TerminalEventSubscription>()
  private retryAttempts = new Map<string, number>()
  private maxRetryAttempts = 3
  private retryDelay = 1000

  private constructor() {}

  static getInstance(): TerminalEventManager {
    if (!TerminalEventManager.instance) {
      TerminalEventManager.instance = new TerminalEventManager()
    }
    return TerminalEventManager.instance
  }

  /**
   * Subscribe to terminal events for a specific backend session
   */
  subscribe(
    terminalId: string,
    backendSessionId: string,
    handlers: TerminalEventHandlers
  ): TerminalEventSubscription {
    console.log(`[TerminalEventManager] Subscribing to events for terminal ${terminalId} -> backend ${backendSessionId}`)

    // Clean up any existing subscription for this terminal
    this.unsubscribe(terminalId)

    // Create event channels
    const dataChannel = getTerminalDataChannel(backendSessionId)
    const exitChannel = getTerminalExitChannel(backendSessionId)

    // Create event handlers with error handling
    const handleData = (_: any, data: string) => {
      try {
        handlers.onData(data)
        // Reset retry attempts on successful data
        this.retryAttempts.delete(terminalId)
      } catch (error) {
        console.error(`[TerminalEventManager] Error handling data for terminal ${terminalId}:`, error)
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    }

    const handleExit = (_: any, exitCode: number) => {
      try {
        handlers.onExit(exitCode)
        // Clean up subscription on exit
        this.unsubscribe(terminalId)
      } catch (error) {
        console.error(`[TerminalEventManager] Error handling exit for terminal ${terminalId}:`, error)
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    }

    // Add event listeners with retry mechanism
    const setupListeners = () => {
      if (!window.electronAPI.on) {
        console.error('[TerminalEventManager] electronAPI.on not available')
        return false
      }

      try {
        window.electronAPI.on(dataChannel, handleData)
        window.electronAPI.on(exitChannel, handleExit)
        return true
      } catch (error) {
        console.error(`[TerminalEventManager] Failed to setup listeners for terminal ${terminalId}:`, error)
        return false
      }
    }

    // Retry setup if it fails
    const setupWithRetry = () => {
      const success = setupListeners()
      if (!success) {
        const attempts = this.retryAttempts.get(terminalId) || 0
        if (attempts < this.maxRetryAttempts) {
          this.retryAttempts.set(terminalId, attempts + 1)
          console.log(`[TerminalEventManager] Retrying setup for terminal ${terminalId} (attempt ${attempts + 1}/${this.maxRetryAttempts})`)
          setTimeout(setupWithRetry, this.retryDelay)
        } else {
          console.error(`[TerminalEventManager] Failed to setup listeners for terminal ${terminalId} after ${this.maxRetryAttempts} attempts`)
          handlers.onError?.(new Error('Failed to setup terminal event listeners'))
        }
      }
    }

    // Initial setup
    setupWithRetry()

    // Create subscription object
    const subscription: TerminalEventSubscription = {
      unsubscribe: () => {
        this.unsubscribe(terminalId)
      }
    }

    // Store subscription with cleanup function
    this.subscriptions.set(terminalId, {
      unsubscribe: () => {
        if (window.electronAPI.removeListener) {
          window.electronAPI.removeListener(dataChannel, handleData)
          window.electronAPI.removeListener(exitChannel, handleExit)
        }
        this.retryAttempts.delete(terminalId)
        this.subscriptions.delete(terminalId)
        console.log(`[TerminalEventManager] Unsubscribed from terminal ${terminalId}`)
      }
    })

    return subscription
  }

  /**
   * Unsubscribe from terminal events
   */
  unsubscribe(terminalId: string): void {
    const subscription = this.subscriptions.get(terminalId)
    if (subscription) {
      subscription.unsubscribe()
    }
  }

  /**
   * Check if a terminal is subscribed
   */
  isSubscribed(terminalId: string): boolean {
    return this.subscriptions.has(terminalId)
  }

  /**
   * Get all subscribed terminal IDs
   */
  getSubscribedTerminals(): string[] {
    return Array.from(this.subscriptions.keys())
  }

  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    console.log('[TerminalEventManager] Cleaning up all subscriptions')
    const terminalIds = Array.from(this.subscriptions.keys())
    terminalIds.forEach(terminalId => this.unsubscribe(terminalId))
  }

  /**
   * Debugging method to log current state
   */
  debug(): void {
    console.log('[TerminalEventManager] Current state:', {
      subscriptions: this.getSubscribedTerminals(),
      retryAttempts: Array.from(this.retryAttempts.entries())
    })
  }
}

// Export singleton instance
export const terminalEventManager = TerminalEventManager.getInstance()