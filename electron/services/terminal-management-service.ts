/**
 * TerminalManagementService - TerminalInstance Lifecycle Manager
 * 
 * This service implements the SOTA architecture from terminal_persistence_refactor_plan_v2.md
 * It manages TerminalInstance objects and focuses purely on lifecycle management
 */

import { EventEmitter } from 'events'
import { TerminalInstance, SerializedTerminalInstance } from './terminal-instance'

export class TerminalManagementService extends EventEmitter {
  private terminalMap: Map<string, TerminalInstance> = new Map()

  constructor() {
    super()
  }

  /**
   * Create a new terminal instance
   */
  create(id: string, shell: string, cwd: string, cols: number = 80, rows: number = 30): void {
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
      rows
    })

    // Store instance
    this.terminalMap.set(id, terminalInstance)

    // Forward events from terminal instance
    terminalInstance.on('data', (data) => {
      this.emit('data', data)
    })

    terminalInstance.on('exit', (data) => {
      this.emit('exit', data)
      // Clean up from map when terminal exits
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
   * Get all terminal IDs
   */
  getAllIds(): string[] {
    return Array.from(this.terminalMap.keys())
  }

  /**
   * Get terminal count
   */
  getCount(): number {
    return this.terminalMap.size
  }

  /**
   * Check if terminal exists
   */
  hasTerminal(id: string): boolean {
    return this.terminalMap.has(id)
  }

  /**
   * Serialize all terminals for persistence
   */
  serializeAll(): SerializedTerminalInstance[] {
    try {
      const instances = this.getAllInstances()
      return instances.map(instance => instance.toJSON()).filter(serialized => serialized != null)
    } catch (error) {
      console.error('[TerminalManagementService] Error serializing terminals:', error)
      return []
    }
  }

  /**
   * Restore terminals from serialized data
   * This creates new PTY processes but restores historical state
   */
  restoreFromSerialized(serializedTerminals: SerializedTerminalInstance[]): void {
    console.log(`[TerminalManagementService] Restoring ${serializedTerminals.length} terminals`)

    for (const serializedTerminal of serializedTerminals) {
      try {
        // Skip if terminal already exists
        if (this.terminalMap.has(serializedTerminal.id)) {
          console.warn(`[TerminalManagementService] Terminal ${serializedTerminal.id} already exists, skipping restore`)
          continue
        }

        // Create terminal instance from serialized data
        const terminalInstance = TerminalInstance.fromSerialized(serializedTerminal)

        // Store instance
        this.terminalMap.set(serializedTerminal.id, terminalInstance)

        // Forward events from terminal instance
        terminalInstance.on('data', (data) => {
          this.emit('data', data)
        })

        terminalInstance.on('exit', (data) => {
          this.emit('exit', data)
          // Clean up from map when terminal exits
          this.terminalMap.delete(serializedTerminal.id)
        })


        // Forward dynamic tracking events
        terminalInstance.on('cwd-changed', (data) => {
          this.emit('cwd-changed', data)
        })

        terminalInstance.on('process-changed', (data) => {
          this.emit('process-changed', data)
        })

        // Command history is automatically restored in fromSerialized
        if (serializedTerminal.commandHistory && serializedTerminal.commandHistory.length > 0) {
          console.log(`[TerminalManagementService] Terminal ${serializedTerminal.id} restored with ${serializedTerminal.commandHistory.length} command history entries`)
        }

        console.log(`[TerminalManagementService] Restored terminal ${serializedTerminal.id}`)
      } catch (error) {
        console.error(`[TerminalManagementService] Failed to restore terminal ${serializedTerminal.id}:`, error)
      }
    }

    console.log(`[TerminalManagementService] Terminal restoration complete - ${this.getCount()} terminals active`)
  }


  /**
   * Cleanup all terminal instances
   */
  cleanup(): void {
    console.log(`[TerminalManagementService] Cleaning up ${this.terminalMap.size} terminal instances`)
    
    for (const [id, terminalInstance] of this.terminalMap) {
      try {
        terminalInstance.kill()
      } catch (error) {
        console.error(`[TerminalManagementService] Error killing terminal ${id} during cleanup:`, error)
      }
    }
    
    this.terminalMap.clear()
    console.log('[TerminalManagementService] Cleanup complete')
  }
}

