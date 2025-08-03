/**
 * TerminalInstance - Core terminal representation with persistence support
 * 
 * This implements the SOTA architecture from terminal_persistence_refactor_plan_v2.md
 * Each instance represents a single terminal with its complete state including output history.
 * Enhanced with shell integration for real-time CWD tracking via OSC sequences.
 */

import { EventEmitter } from 'events'
import { CircularBuffer } from '../utils/circular-buffer'
import { ptyService } from './pty-service'

// ANSI escape sequences for clear screen detection
const CLEAR_SCREEN_SEQUENCES = [
  '\x1b[H\x1b[2J',  // Clear screen and move cursor to top-left (most common)
  '\x1b[2J\x1b[H',  // Alternative order
  '\x1b[2J',        // Clear screen only
  '\x1bc',          // Full reset
  '\x1b[3J'         // Clear scrollback buffer
]

export interface TerminalInstanceOptions {
  id: string
  shell?: string
  cwd: string
  cols?: number
  rows?: number
  title?: string
  bufferSize?: number
}

export interface SerializedTerminalInstance {
  id: string
  title: string
  cwd: string
  shell: string
  cols: number
  rows: number
  isAlive: boolean
  buffer: string[]
  createdAt: number
  currentCwd?: string // Dynamic CWD that may differ from initial cwd
  runningProcess?: string // Currently running process name
}

/**
 * TerminalInstance - Single source of truth for terminal state
 */
export class TerminalInstance extends EventEmitter {
  public readonly id: string
  public title: string
  public readonly cwd: string
  public readonly shell: string
  public readonly createdAt: number

  private buffer: CircularBuffer<string>
  private cols: number
  private rows: number
  private isAlive: boolean = true
  
  // Dynamic state tracking (now updated via OSC sequences)
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
    
    // Initialize circular buffer (default 5000 lines as per plan)
    const bufferSize = options.bufferSize || 5000
    this.buffer = new CircularBuffer<string>(bufferSize)

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
   * Core data handling logic - processes PTY output and manages buffer
   * This is where ANSI clear sequence detection happens
   */
  private onData(data: string): void {
    // Check for clear screen sequences BEFORE adding to buffer
    const containsClearSequence = CLEAR_SCREEN_SEQUENCES.some(seq => 
      data.includes(seq)
    )

    if (containsClearSequence) {
      console.log(`[TerminalInstance] Clear screen sequence detected in ${this.id}`)
      this.clearBuffer()
      
      // Filter out the clear sequence from the data to avoid adding it to buffer
      let cleanedData = data
      CLEAR_SCREEN_SEQUENCES.forEach(seq => {
        cleanedData = cleanedData.replace(seq, '')
      })
      
      // Only add to buffer if there's remaining data after filtering
      if (cleanedData.trim().length > 0) {
        this.addToBuffer(cleanedData)
      }
    } else {
      // Normal data - add to buffer
      this.addToBuffer(data)
    }

    // Always forward data to renderer (including clear sequences for proper terminal rendering)
    this.emit('data', { id: this.id, data })
  }

  /**
   * Add data to the circular buffer
   * Splits data by lines to store line-by-line history
   */
  private addToBuffer(data: string): void {
    // Split data by newlines and add each line to buffer
    const lines = data.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // For the first line, it might be a continuation of the previous line
      // For now, we'll treat each chunk as a separate entry
      // In a more sophisticated implementation, we might want to handle line continuations
      
      if (i === lines.length - 1 && !data.endsWith('\n')) {
        // Last line without newline - might be partial, but add it anyway
        this.buffer.push(line)
      } else {
        // Complete line or line with newline
        this.buffer.push(line)
      }
    }
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
   * Replay buffer contents to frontend XTerm instance (for restoration)
   * This method emits buffer replay events on a dedicated channel to avoid mixing with live data
   */
  replayBuffer(): void {
    if (!this.isAlive) {
      console.warn(`[TerminalInstance] Cannot replay buffer to dead terminal ${this.id}`)
      return
    }

    const bufferContents = this.buffer.toArray()
    if (bufferContents.length === 0) {
      console.log(`[TerminalInstance] No buffer contents to replay for ${this.id}`)
      return
    }

    console.log(`[TerminalInstance] Replaying ${bufferContents.length} lines to frontend for terminal ${this.id}`)
    
    // Send buffer contents via dedicated buffer-replay event (not data event)
    // This separates historical data from live PTY output
    const combinedData = bufferContents.join('\r\n')
    if (combinedData.length > 0) {
      // Emit buffer-replay event with special flag
      this.emit('buffer-replay', { id: this.id, data: combinedData + '\r\n' })
      console.log(`[TerminalInstance] ✅ Buffer replay completed for terminal ${this.id}`)
    }
  }

  /**
   * Clear the internal buffer (called when clear screen sequence is detected)
   */
  clearBuffer(): void {
    this.buffer.clear()
    console.log(`[TerminalInstance] Buffer cleared for ${this.id}`)
  }

  /**
   * Update buffer with clean text from frontend XTerm (replaces ANSI-polluted data)
   */
  updateCleanBuffer(cleanLines: string[]): void {
    console.log(`[TerminalInstance] Updating buffer with ${cleanLines.length} clean lines for ${this.id}`)
    
    // Clear existing buffer and replace with clean text
    this.buffer.clear()
    
    // Add each clean line to the buffer
    for (const line of cleanLines) {
      this.buffer.push(line)
    }
    
    console.log(`[TerminalInstance] ✅ Buffer updated with clean text for ${this.id}`)
  }

  /**
   * Get current buffer contents as array
   */
  getBuffer(): string[] {
    return this.buffer.toArray()
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

  /**
   * Serialize terminal state for persistence
   * Excludes the ptyProcess as it cannot be serialized
   */
  toJSON(): SerializedTerminalInstance {
    return {
      id: this.id,
      title: this.title,
      cwd: this.cwd,
      shell: this.shell,
      cols: this.cols,
      rows: this.rows,
      isAlive: this.isAlive,
      buffer: this.buffer.toArray(),
      createdAt: this.createdAt,
      currentCwd: this.currentCwd,
      runningProcess: this.runningProcess || undefined
    }
  }

  /**
   * Create a TerminalInstance from serialized data
   * This creates a new PTY process but restores the historical state
   */
  static fromSerialized(data: SerializedTerminalInstance, options: { restoreBuffer?: boolean } = {}): TerminalInstance {
    // Use currentCwd if available, fallback to original cwd
    const cwdToUse = data.currentCwd || data.cwd
    
    const instance = new TerminalInstance({
      id: data.id,
      shell: data.shell,
      cwd: cwdToUse, // Use the most recent CWD for restoration
      cols: data.cols,
      rows: data.rows,
      title: data.title
    })

    // Restore dynamic state
    if (data.currentCwd) {
      instance.currentCwd = data.currentCwd
    }
    if (data.runningProcess) {
      instance.runningProcess = data.runningProcess
    }

    // Restore buffer if requested
    if (options.restoreBuffer && data.buffer && data.buffer.length > 0) {
      instance.buffer = CircularBuffer.fromArray(data.buffer, instance.buffer.getCapacity())
      console.log(`[TerminalInstance] Restored buffer with ${data.buffer.length} lines for ${instance.id}`)
    }

    console.log(`[TerminalInstance] Restored terminal ${instance.id} with CWD: ${cwdToUse}${data.runningProcess ? `, process: ${data.runningProcess}` : ''}`)

    return instance
  }
}