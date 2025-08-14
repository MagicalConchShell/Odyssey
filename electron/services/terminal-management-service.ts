/**
 * TerminalManagementService - TerminalInstance Lifecycle Manager
 */

import { EventEmitter } from 'events'
import { WebContents } from 'electron'
import { TerminalInstance } from './terminal-instance'

export class TerminalManagementService extends EventEmitter {
  private terminalMap: Map<string, TerminalInstance> = new Map()
  private webContentsMap: Map<string, WebContents> = new Map()

  constructor() {
    super()
  }

  /**
   * Create a new terminal instance
   */
  create(id: string, shell: string, cwd: string, cols: number = 80, rows: number = 30, customEnv?: Record<string, string>): void {
    // Clean up any existing terminal with the same ID
    if (this.terminalMap.has(id)) {
      this.kill(id)
    }

    // Create new terminal instance
    const terminalInstance = new TerminalInstance({
      id,
      shell: shell || undefined,
      cwd,
      cols,
      rows,
      customEnv
    })

    // Store instance
    this.terminalMap.set(id, terminalInstance)

    // Forward events from terminal instance
    terminalInstance.on('data', (data) => {
      this.emit('data', data)
    })

    terminalInstance.on('exit', (data) => {
      this.emit('exit', data)
      this.terminalMap.delete(id)
    })


    // Forward dynamic tracking events
    terminalInstance.on('cwd-changed', (data) => {
      this.emit('cwd-changed', data)
    })

    terminalInstance.on('process-changed', (data) => {
      this.emit('process-changed', data)
    })

    console.log(`[TerminalManagementService] Created terminal ${id} with shell ${shell || 'default'} in ${cwd}`)
  }

  /**
   * Write data to a terminal instance
   */
  write(id: string, data: string): boolean {
    const terminalInstance = this.terminalMap.get(id)
    if (!terminalInstance) {
      console.warn(`[TerminalManagementService] Attempted to write to non-existent terminal ${id}`)
      return false
    }

    return terminalInstance.write(data)
  }

  /**
   * Resize a terminal instance
   */
  resize(id: string, cols: number, rows: number): boolean {
    const terminalInstance = this.terminalMap.get(id)
    if (!terminalInstance) {
      console.warn(`[TerminalManagementService] Attempted to resize non-existent terminal ${id}`)
      return false
    }

    return terminalInstance.resize(cols, rows)
  }

  /**
   * Kill a terminal instance
   */
  kill(id: string): boolean {
    const terminalInstance = this.terminalMap.get(id)
    if (!terminalInstance) {
      console.warn(`[TerminalManagementService] Attempted to kill non-existent terminal ${id}`)
      return false
    }

    try {
      terminalInstance.kill()
      this.terminalMap.delete(id)
      this.webContentsMap.delete(id)
      console.log(`[TerminalManagementService] Killed terminal ${id}`)
      return true
    } catch (error) {
      console.error(`[TerminalManagementService] Error killing terminal ${id}:`, error)
      return false
    }
  }

  /**
   * Get a terminal instance by ID
   */
  getTerminal(id: string): TerminalInstance | undefined {
    return this.terminalMap.get(id)
  }

  /**
   * Get all terminal instances (for persistence)
   */
  getAllInstances(): TerminalInstance[] {
    return Array.from(this.terminalMap.values())
  }

  /**
   * Get terminal count
   */
  getCount(): number {
    return this.terminalMap.size
  }

  /**
   * Register WebContents for a terminal
   */
  registerWebContents(terminalId: string, webContents: WebContents): void {
    this.webContentsMap.set(terminalId, webContents)
    console.log(`[TerminalManagementService] WebContents registered for terminal ${terminalId}`)
  }

  /**
   * Unregister WebContents for a terminal
   */
  unregisterWebContents(terminalId: string): void {
    this.webContentsMap.delete(terminalId)
    console.log(`[TerminalManagementService] WebContents unregistered for terminal ${terminalId}`)
  }

  /**
   * Get WebContents for a terminal
   */
  getWebContents(terminalId: string): WebContents | undefined {
    return this.webContentsMap.get(terminalId)
  }

  /**
   * Cleanup all terminal instances and WebContents
   */
  cleanup(): void {
    console.log(`[TerminalManagementService] Cleaning up ${this.terminalMap.size} terminal instances and ${this.webContentsMap.size} WebContents`)
    
    for (const [id, terminalInstance] of this.terminalMap) {
      try {
        terminalInstance.kill()
      } catch (error) {
        console.error(`[TerminalManagementService] Error killing terminal ${id} during cleanup:`, error)
      }
    }
    
    this.terminalMap.clear()
    this.webContentsMap.clear()
    console.log('[TerminalManagementService] Cleanup complete')
  }
}

