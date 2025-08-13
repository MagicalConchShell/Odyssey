/**
 * TerminalInstance - Core terminal representation with persistence support
 * 
 * This implements the SOTA architecture from terminal_persistence_refactor_plan_v2.md
 * Each instance represents a single terminal with its complete state including output history.
 * Enhanced with shell integration for real-time CWD tracking via OSC sequences.
 */

import { EventEmitter } from 'events'
import { ptyService } from './pty-service'


export interface TerminalInstanceOptions {
  id: string
  shell?: string
  cwd: string
  cols?: number
  rows?: number
  title?: string
}

// SerializedTerminalInstance interface removed - serialization is handled by frontend xterm-addon-serialize

/**
 * TerminalInstance - Single source of truth for terminal state
 */
export class TerminalInstance extends EventEmitter {
  public readonly id: string
  public title: string
  public readonly cwd: string
  public readonly shell: string
  public readonly createdAt: number

  private cols: number
  private rows: number
  private isAlive: boolean = true
  
  // Dynamic state tracking (updated via OSC sequences)
  private currentCwd: string
  private runningProcess: string | null = null

  constructor(options: TerminalInstanceOptions) {
    super()
    
    this.id = options.id
    this.title = options.title || 'Terminal'
    this.cwd = options.cwd
    this.currentCwd = options.cwd // Initialize current CWD to initial CWD
    this.cols = options.cols || 80
    this.rows = options.rows || 30
    this.createdAt = Date.now()

    // Determine shell
    const defaultShell = process.platform === 'win32' ? 'powershell.exe' : 
                         process.platform === 'darwin' ? process.env.SHELL || '/bin/zsh' :
                         '/bin/bash'
    this.shell = options.shell || defaultShell

    // Create PTY process through PtyService
    ptyService.create(this.id, this.shell, this.cwd, this.cols, this.rows)

    // Set up event handlers for PtyService events
    this.setupEventHandlers()

    console.log(`[TerminalInstance] Created ${this.id} with shell ${this.shell} in ${this.cwd}`)
  }

  /**
   * Setup PTY event handlers via PtyService
   */
  private setupEventHandlers(): void {
    // Listen to PtyService events for this terminal ID
    const onData = ({ id, data }: { id: string; data: string }) => {
      if (id === this.id) {
        this.onData(data)
      }
    }

    const onExit = ({ id, exitCode }: { id: string; exitCode: number }) => {
      if (id === this.id) {
        console.log(`[TerminalInstance] PTY ${this.id} exited with code ${exitCode}`)
        this.isAlive = false
        this.emit('exit', { id: this.id, exitCode })
        
        // Clean up event listeners
        ptyService.removeListener('data', onData)
        ptyService.removeListener('exit', onExit)
      }
    }

    // Register event listeners
    ptyService.on('data', onData)
    ptyService.on('exit', onExit)
  }

  /**
   * Core data handling logic - processes PTY output and manages command history
   * This is where OSC sequence parsing for command tracking happens
   */
  private onData(data: string): void {
    // Always forward all raw data to the frontend for rendering
    this.emit('data', { id: this.id, data })
  }



  /**
   * Write data to the PTY process via PtyService
   */
  write(data: string): boolean {
    if (!this.isAlive) {
      console.warn(`[TerminalInstance] Attempted to write to dead terminal ${this.id}`)
      return false
    }

    return ptyService.write(this.id, data)
  }

  /**
   * Resize the PTY process via PtyService
   */
  resize(cols: number, rows: number): boolean {
    if (!this.isAlive) {
      console.warn(`[TerminalInstance] Attempted to resize dead terminal ${this.id}`)
      return false
    }

    const success = ptyService.resize(this.id, cols, rows)
    if (success) {
      this.cols = cols
      this.rows = rows
    }
    return success
  }

  /**
   * Kill the PTY process and clean up resources
   */
  kill(): void {
    try {
      if (this.isAlive) {
        ptyService.kill(this.id)
        this.isAlive = false
        console.log(`[TerminalInstance] Killed PTY ${this.id}`)
      }
    } catch (error) {
      console.error(`[TerminalInstance] Error killing PTY ${this.id}:`, error)
    }
  }

  /**
   * Update current working directory (called via OSC sequence from frontend)
   */
  updateCurrentCwd(newCwd: string): void {
    if (newCwd !== this.currentCwd) {
      const oldCwd = this.currentCwd
      this.currentCwd = newCwd
      console.log(`[TerminalInstance] CWD updated for ${this.id}: ${oldCwd} -> ${newCwd}`)
      this.emit('cwd-changed', { id: this.id, oldCwd, newCwd })
    }
  }

  /**
   * Update running process (for future process tracking enhancement)
   */
  updateRunningProcess(newProcess: string | null): void {
    if (newProcess !== this.runningProcess) {
      const oldProcess = this.runningProcess
      this.runningProcess = newProcess
      console.log(`[TerminalInstance] Running process updated for ${this.id}: ${oldProcess || 'none'} -> ${newProcess || 'none'}`)
      this.emit('process-changed', { id: this.id, oldProcess, newProcess })
    }
  }






  /**
   * Check if PTY process is still alive
   */
  getIsAlive(): boolean {
    return this.isAlive
  }

  /**
   * Get current terminal dimensions
   */
  getDimensions(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows }
  }

  /**
   * Get current working directory (dynamic)
   */
  getCurrentCwd(): string {
    return this.currentCwd
  }

  /**
   * Get currently running process
   */
  getRunningProcess(): string | null {
    return this.runningProcess
  }

  // toJSON method removed - terminal serialization is handled by frontend xterm-addon-serialize

  // fromSerialized method removed - terminal restoration is handled by frontend xterm-addon-serialize

}