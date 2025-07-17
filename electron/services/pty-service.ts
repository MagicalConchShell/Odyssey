/**
 * PtyService - Clean PTY Process Lifecycle Management
 * 
 * This service implements the SOTA architecture from terminal_architecture_v1.md
 * It handles ONLY PTY process management - no UI knowledge, no complex recovery logic
 */

import * as pty from 'node-pty'
import { EventEmitter } from 'events'

interface PtyInstance {
  id: string
  ptyProcess: pty.IPty
  shell: string
  cwd: string
  cols: number
  rows: number
  createdAt: number
}

export class PtyService extends EventEmitter {
  private static instance: PtyService | null = null
  private ptyMap: Map<string, PtyInstance> = new Map()

  private constructor() {
    super()
  }

  static getInstance(): PtyService {
    if (!PtyService.instance) {
      PtyService.instance = new PtyService()
    }
    return PtyService.instance
  }

  /**
   * Create a new PTY process
   */
  create(id: string, shell: string, cwd: string, cols: number = 80, rows: number = 30): void {
    // Clean up any existing PTY with the same ID
    if (this.ptyMap.has(id)) {
      this.kill(id)
    }

    // Determine default shell based on platform
    const defaultShell = process.platform === 'win32' ? 'powershell.exe' : 
                         process.platform === 'darwin' ? process.env.SHELL || '/bin/zsh' :
                         '/bin/bash'
    
    const selectedShell = shell || defaultShell

    // Create PTY process
    const ptyProcess = pty.spawn(selectedShell, [], {
      cwd: cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        ODYSSEY_TERMINAL: '1',
        BASH_SILENCE_DEPRECATION_WARNING: '1',
        ZSH_DISABLE_COMPFIX: 'true',
      },
      cols: cols,
      rows: rows
    })

    // Store PTY instance
    const ptyInstance: PtyInstance = {
      id,
      ptyProcess,
      shell: selectedShell,
      cwd,
      cols,
      rows,
      createdAt: Date.now()
    }

    this.ptyMap.set(id, ptyInstance)

    // Set up event forwarding
    ptyProcess.onData((data) => {
      this.emit('data', { id, data })
    })

    ptyProcess.onExit(({ exitCode }) => {
      this.emit('exit', { id, exitCode })
      // Clean up from map
      this.ptyMap.delete(id)
    })

    console.log(`[PtyService] Created PTY ${id} with shell ${selectedShell} in ${cwd}`)
  }

  /**
   * Write data to PTY process
   */
  write(id: string, data: string): boolean {
    const ptyInstance = this.ptyMap.get(id)
    if (!ptyInstance) {
      console.warn(`[PtyService] Attempted to write to non-existent PTY ${id}`)
      return false
    }

    try {
      ptyInstance.ptyProcess.write(data)
      return true
    } catch (error) {
      console.error(`[PtyService] Error writing to PTY ${id}:`, error)
      return false
    }
  }

  /**
   * Resize PTY process
   */
  resize(id: string, cols: number, rows: number): boolean {
    const ptyInstance = this.ptyMap.get(id)
    if (!ptyInstance) {
      console.warn(`[PtyService] Attempted to resize non-existent PTY ${id}`)
      return false
    }

    try {
      ptyInstance.ptyProcess.resize(cols, rows)
      // Update stored dimensions
      ptyInstance.cols = cols
      ptyInstance.rows = rows
      return true
    } catch (error) {
      console.error(`[PtyService] Error resizing PTY ${id}:`, error)
      return false
    }
  }

  /**
   * Kill PTY process
   */
  kill(id: string): boolean {
    const ptyInstance = this.ptyMap.get(id)
    if (!ptyInstance) {
      console.warn(`[PtyService] Attempted to kill non-existent PTY ${id}`)
      return false
    }

    try {
      ptyInstance.ptyProcess.kill()
      this.ptyMap.delete(id)
      console.log(`[PtyService] Killed PTY ${id}`)
      return true
    } catch (error) {
      console.error(`[PtyService] Error killing PTY ${id}:`, error)
      return false
    }
  }

  /**
   * Cleanup all PTY processes
   */
  cleanup(): void {
    console.log(`[PtyService] Cleaning up ${this.ptyMap.size} PTY processes`)
    
    for (const [id, ptyInstance] of this.ptyMap) {
      try {
        ptyInstance.ptyProcess.kill()
      } catch (error) {
        console.error(`[PtyService] Error killing PTY ${id} during cleanup:`, error)
      }
    }
    
    this.ptyMap.clear()
    console.log('[PtyService] Cleanup complete')
  }
}

// Export singleton instance
export const ptyService = PtyService.getInstance()