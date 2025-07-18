/**
 * IPC Channel Definitions for Terminal Communication
 * 
 * This file defines the contract between frontend and backend for terminal operations.
 * Based on the SOTA architecture from terminal_architecture_v1.md
 */

// Channel names for IPC communication
export const IPC_CHANNELS = {
  // Frontend -> Backend (Commands)
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  
  // Backend -> Frontend (Events)
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
} as const

// File System Channel Names for optimized file tree operations
export const FS_CHANNELS = {
  GET_DIRECTORY_CHILDREN: 'fs:get-directory-children',
} as const

// Helper function to get channel name for terminal data event
export function getTerminalDataChannel(terminalId: string): string {
  return `${IPC_CHANNELS.TERMINAL_DATA}:${terminalId}`
}

// Helper function to get channel name for terminal exit event
export function getTerminalExitChannel(terminalId: string): string {
  return `${IPC_CHANNELS.TERMINAL_EXIT}:${terminalId}`
}
