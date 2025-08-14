/**
 * TerminalInstance
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
  customEnv?: Record<string, string>
}

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
    ptyService.create(this.id, this.shell, this.cwd, this.cols, this.rows, options.customEnv)

    // Set up event handlers for PtyService events
    this.setupEventHandlers()
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
}