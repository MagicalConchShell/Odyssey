/**
 * Terminal Type Definitions - Simplified Architecture
 *
 * This implements the SOTA architecture from terminal_architecture_v1.md
 * Clean, simple types that focus on essential terminal functionality
 */

// Command history entry for structured terminal history
export interface CommandHistoryEntry {
  command: string
  output: string
  exitCode: number
  timestamp: number
  cwd: string
}

// Core terminal interface - simple, direct terminal instance
export interface Terminal {
  id: string
  title: string
  type: 'claude-code' | 'gemini' | 'terminal'
  cwd: string
  shell?: string
  isActive: boolean
  createdAt: number
  commandHistory?: CommandHistoryEntry[] // For history restoration
}

// Terminal creation options
export interface CreateTerminalOptions {
  type: 'claude-code' | 'gemini' | 'terminal'
  title?: string
  cwd: string
  shell?: string
  makeActive?: boolean
}

// Terminal modes for UI state
export type TerminalMode = 'welcome' | 'active'

export interface TerminalTab {
  id: string
  title: string
  isActive: boolean
  createdAt: number
}
