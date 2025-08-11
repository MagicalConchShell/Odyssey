/**
 * TerminalInstance - Core terminal representation with persistence support
 * 
 * This implements the SOTA architecture from terminal_persistence_refactor_plan_v2.md
 * Each instance represents a single terminal with its complete state including output history.
 * Enhanced with shell integration for real-time CWD tracking via OSC sequences.
 */

import { EventEmitter } from 'events'
import { ptyService } from './pty-service'

// Command history entry for structured terminal history
export interface CommandHistoryEntry {
  command: string
  output: string
  exitCode: number
  timestamp: number
  cwd: string
}

export interface TerminalInstanceOptions {
  id: string
  shell?: string
  cwd: string
  cols?: number
  rows?: number
  title?: string
}

export interface SerializedTerminalInstance {
  id: string
  title: string
  cwd: string
  shell: string
  cols: number
  rows: number
  isAlive: boolean
  commandHistory: CommandHistoryEntry[] // Replace buffer with structured history
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

  private commandHistory: CommandHistoryEntry[] = []
  private currentCommandOutput: string = ''
  private isCapturingCommand: boolean = false
  private tempCommand: Partial<CommandHistoryEntry> | null = null
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

    // Process data internally for command history tracking
    this.processOscSequences(data)
  }

  /**
   * Process OSC sequences for command tracking and CWD updates
   */
  private processOscSequences(data: string): void {
    // Check if data contains any OSC 633 sequences
    if (data.includes('\x1b]633;')) {
      console.log(`[TerminalInstance] 📡 OSC 633 sequence detected in terminal ${this.id}`)
    }
    
    // OSC 633;A -> Command Start
    // OSC 633;B -> Command End  
    // OSC 633;P -> CWD/Process info
    // Pattern matches: \x1b]633;A;....\x07 or \x1b]633;B;....\x07 or \x1b]633;P;....\x07
    const oscRegex = /\x1b]633;([ABP]);([^]*?)\x07/g
    let match
    let lastIndex = 0

    while ((match = oscRegex.exec(data)) !== null) {
      // Append text between OSC sequences to the current command's output
      const textBeforeMatch = data.substring(lastIndex, match.index)
      if (this.isCapturingCommand) {
        this.currentCommandOutput += textBeforeMatch
      }
      lastIndex = oscRegex.lastIndex

      const type = match[1]
      const payload = match[2]
      
      console.log(`[TerminalInstance] 🔍 Processing OSC 633;${type} sequence:`, payload.substring(0, 100) + (payload.length > 100 ? '...' : ''))
      
      if (type === 'A' || type === 'B') {
        this.handleCommandOsc(type, payload)
      } else if (type === 'P') {
        this.handleInfoOsc(payload)
      }
    }

    // Append any remaining text after the last OSC sequence
    const remainingText = data.substring(lastIndex)
    if (this.isCapturingCommand) {
      this.currentCommandOutput += remainingText
    }
  }

  /**
   * Handle info OSC sequences (OSC 633;P) for CWD and process updates
   */
  private handleInfoOsc(payload: string): void {
    try {
      // Parse parameters from payload (format: ;Cwd=file://hostname/path)
      const params = new URLSearchParams(payload.replace(/;/g, '&'))
      
      const cwdUrl = params.get('Cwd')
      if (cwdUrl) {
        // Parse the file:// URL to extract the path
        const url = new URL(cwdUrl)
        let newCwd = decodeURIComponent(url.pathname)
        
        // Handle Windows paths: remove leading slash from /C:/path
        if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(newCwd)) {
          newCwd = newCwd.substring(1)
        }
        
        // Update current CWD using existing method
        this.updateCurrentCwd(newCwd)
      }
    } catch (error) {
      console.error(`[TerminalInstance] Error parsing info OSC sequence:`, error)
    }
  }

  /**
   * Handle command-related OSC sequences
   */
  private handleCommandOsc(type: string, payload: string): void {
    try {
      // Parse URL-encoded parameters (C=command&T=timestamp&Cwd=cwd)
      const params = new URLSearchParams(payload.replace(/;/g, '&'))
      
      if (type === 'A') { // Command Start
        this.isCapturingCommand = true
        this.currentCommandOutput = '' // Reset output capture
        
        this.tempCommand = {
          command: decodeURIComponent(params.get('C') || ''),
          timestamp: parseInt(params.get('T') || '0', 10) * 1000, // Convert to ms
          cwd: decodeURIComponent(params.get('Cwd') || this.currentCwd),
        }
        
        console.log(`[TerminalInstance] Command started: ${this.tempCommand.command}`)
        
      } else if (type === 'B') { // Command End
        if (this.tempCommand) {
          const exitCode = parseInt(params.get('E') || '0', 10)
          
          const historyEntry: CommandHistoryEntry = {
            command: this.tempCommand.command || '',
            output: this.currentCommandOutput,
            exitCode,
            timestamp: this.tempCommand.timestamp || Date.now(),
            cwd: this.tempCommand.cwd || this.currentCwd,
          }
          
          this.commandHistory.push(historyEntry)
          
          // Limit history size (configurable, default 500)
          const maxHistorySize = 500
          if (this.commandHistory.length > maxHistorySize) {
            this.commandHistory.shift()
          }
          
          console.log(`[TerminalInstance] ✅ Command completed: ${historyEntry.command} (exit: ${exitCode})`)
          console.log(`[TerminalInstance] 📊 Total command history entries: ${this.commandHistory.length}`)
        }
        
        this.isCapturingCommand = false
        this.tempCommand = null
        this.currentCommandOutput = ''
      }
    } catch (error) {
      console.error(`[TerminalInstance] Error parsing OSC sequence:`, error)
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
    console.log(`[TerminalInstance] 📋 Serializing terminal ${this.id} with ${this.commandHistory.length} command history entries`)
    
    return {
      id: this.id,
      title: this.title,
      cwd: this.cwd,
      shell: this.shell,
      cols: this.cols,
      rows: this.rows,
      isAlive: this.isAlive,
      commandHistory: this.commandHistory,
      createdAt: this.createdAt,
      currentCwd: this.currentCwd,
      runningProcess: this.runningProcess || undefined
    }
  }

  /**
   * Create a TerminalInstance from serialized data
   * This creates a new PTY process but restores the historical state
   */
  static fromSerialized(data: SerializedTerminalInstance): TerminalInstance {
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

    // Restore command history
    if (data.commandHistory && data.commandHistory.length > 0) {
      instance.commandHistory = [...data.commandHistory]
      console.log(`[TerminalInstance] Restored command history with ${data.commandHistory.length} entries for ${instance.id}`)
    }

    console.log(`[TerminalInstance] Restored terminal ${instance.id} with CWD: ${cwdToUse}${data.runningProcess ? `, process: ${data.runningProcess}` : ''}`)

    return instance
  }

  /**
   * Get command history for frontend restoration
   */
  getCommandHistory(): CommandHistoryEntry[] {
    return [...this.commandHistory]
  }

  /**
   * Clear command history (called after successful restoration)
   */
  clearCommandHistory(): void {
    this.commandHistory = []
    console.log(`[TerminalInstance] Command history cleared for ${this.id}`)
  }
}