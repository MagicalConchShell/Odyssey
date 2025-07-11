import { spawn } from 'child_process'
import { ipcMain } from 'electron'

/**
 * A utility class for buffering and processing line-by-line output from streams.
 * Handles partial lines and ensures complete lines are processed.
 */
export class LineBuffer {
  private buffer: string = ''
  private onLine: (line: string) => void

  constructor(onLine: (line: string) => void) {
    this.onLine = onLine
  }

  /**
   * Push new data to the buffer and process any complete lines
   * @param data - The data to add to the buffer
   */
  push(data: string) {
    this.buffer += data
    let lineEnd = this.buffer.indexOf('\n')
    
    while (lineEnd !== -1) {
      const line = this.buffer.slice(0, lineEnd)
      this.buffer = this.buffer.slice(lineEnd + 1)
      
      if (line.trim()) {
        this.onLine(line)
      }
      
      lineEnd = this.buffer.indexOf('\n')
    }
  }

  /**
   * Flush any remaining data in the buffer as a final line
   */
  flush() {
    if (this.buffer.trim()) {
      this.onLine(this.buffer)
      this.buffer = ''
    }
  }
}

/**
 * Configuration for process execution with line buffering
 */
export interface ProcessConfig {
  command: string
  args: string[]
  options?: any
  sessionId?: string
  onStdout?: (line: string) => void
  onStderr?: (line: string) => void
  onExit?: (code: number | null) => void
}

/**
 * Execute a process with line buffering and optional IPC event emission
 * @param config - Process configuration
 * @returns Promise that resolves when the process completes
 */
export function executeWithLineBuffer(config: ProcessConfig): Promise<{ code: number | null, stdout: string, stderr: string }> {
  return new Promise((resolve, reject) => {
    const process = spawn(config.command, config.args, config.options)
    
    let stdoutData = ''
    let stderrData = ''
    
    // Set up line buffers for stdout and stderr
    const stdoutBuffer = new LineBuffer((line) => {
      stdoutData += line + '\n'
      if (config.onStdout) {
        config.onStdout(line)
      }
      if (config.sessionId) {
        // Emit IPC event for real-time updates
        ipcMain.emit('claude-output', null, { sessionId: config.sessionId, data: line + '\n' })
      }
    })
    
    const stderrBuffer = new LineBuffer((line) => {
      stderrData += line + '\n'
      if (config.onStderr) {
        config.onStderr(line)
      }
      if (config.sessionId) {
        // Emit IPC event for real-time updates
        ipcMain.emit('claude-error', null, { sessionId: config.sessionId, data: line + '\n' })
      }
    })
    
    // Handle process output
    process.stdout?.on('data', (data) => {
      stdoutBuffer.push(data.toString())
    })
    
    process.stderr?.on('data', (data) => {
      stderrBuffer.push(data.toString())
    })
    
    // Handle process completion
    process.on('close', (code) => {
      // Flush any remaining buffered data
      stdoutBuffer.flush()
      stderrBuffer.flush()
      
      if (config.onExit) {
        config.onExit(code)
      }
      
      if (config.sessionId) {
        // Emit IPC event for process completion
        ipcMain.emit('claude-process-end', null, { sessionId: config.sessionId, code })
      }
      
      resolve({ code, stdout: stdoutData, stderr: stderrData })
    })
    
    process.on('error', (error) => {
      reject(error)
    })
  })
}

/**
 * Common error handling pattern for IPC handlers
 * @param operation - The async operation to execute
 * @returns Promise with success/error result structure
 */
export async function handleIpcOperation<T>(operation: () => Promise<T>): Promise<{ success: boolean, data?: T, error?: string }> {
  try {
    const data = await operation()
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}