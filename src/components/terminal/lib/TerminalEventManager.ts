/**
 * Terminal Event Manager
 * 
 * Centralized event handling for terminal instances
 * Manages lifecycle events, data flow, and cleanup
 */

import { getTerminalDataChannel, getTerminalExitChannel } from '../../../../electron/ipc-channels'
import { eventLogger } from '@/utils/logger'

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
    eventLogger.debug('Subscribing to events', {
      frontendId: terminalId,
      backendId: backendSessionId,
      existingSubscriptions: this.subscriptions.size
    })

    // Clean up any existing subscription for this terminal
    this.unsubscribe(terminalId)

    // Create event channels
    const dataChannel = getTerminalDataChannel(backendSessionId)
    const exitChannel = getTerminalExitChannel(backendSessionId)
    
    eventLogger.verbose('Event channels configured', {
      terminalId,
      dataChannel,
      exitChannel
    })

    // Create event handlers with error handling
    const handleData = (_: any, data: string) => {
      try {
        eventLogger.verbose('Received data', {
          terminalId,
          dataLength: data.length
        })
        handlers.onData(data)
      } catch (error) {
        eventLogger.error('Error handling data', { terminalId, error })
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    }

    const handleExit = (_: any, exitCode: number) => {
      try {
        eventLogger.info('Terminal exited', { terminalId, exitCode })
        handlers.onExit(exitCode)
        // Clean up subscription on exit
        this.unsubscribe(terminalId)
      } catch (error) {
        eventLogger.error('Error handling exit', { terminalId, error })
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    }

    // Set up event listeners directly
    if (!window.electronAPI?.on) {
      const error = new Error('electronAPI.on not available')
      eventLogger.error('electronAPI.on not available')
      handlers.onError?.(error)
      throw error
    }

    try {
      eventLogger.debug('Adding event listeners', {
        dataChannel,
        exitChannel
      })
      window.electronAPI.on(dataChannel, handleData)
      window.electronAPI.on(exitChannel, handleExit)
      eventLogger.debug('Listeners setup successfully', { terminalId })
    } catch (error) {
      eventLogger.error('Failed to setup listeners', { terminalId, error })
      const errorObj = error instanceof Error ? error : new Error(String(error))
      handlers.onError?.(errorObj)
      throw errorObj
    }

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
        this.subscriptions.delete(terminalId)
        eventLogger.debug('Unsubscribed from terminal', { terminalId })
      }
    })

    eventLogger.debug('Successfully subscribed to terminal', {
      terminalId,
      totalSubscriptions: this.subscriptions.size
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
    eventLogger.info('Cleaning up all subscriptions')
    const terminalIds = Array.from(this.subscriptions.keys())
    terminalIds.forEach(terminalId => this.unsubscribe(terminalId))
  }

  /**
   * Validate subscription health for a terminal
   */
  validateSubscription(terminalId: string): boolean {
    const isSubscribed = this.isSubscribed(terminalId)
    
    eventLogger.debug('Subscription health check', {
      terminalId,
      isSubscribed
    })
    
    return isSubscribed
  }

  /**
   * Health check for all subscriptions
   */
  healthCheck(): void {
    eventLogger.debug('System health check', {
      totalSubscriptions: this.subscriptions.size,
      subscribedTerminals: this.getSubscribedTerminals(),
      electronAPIAvailable: !!window.electronAPI?.on
    })
  }

  /**
   * Debugging method to log current state
   */
  debug(): void {
    this.healthCheck()
  }
}

// Export singleton instance
export const terminalEventManager = TerminalEventManager.getInstance()