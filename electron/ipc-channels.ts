/**
 * IPC Channel Definitions for Application Communication
 * 
 * This file defines the contract between frontend and backend for various operations.
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
  TERMINAL_BUFFER_REPLAY: 'terminal:buffer-replay',
} as const

// File System Channel Names for optimized file tree operations
export const FS_CHANNELS = {
  GET_DIRECTORY_CHILDREN: 'fs:get-directory-children',
} as const

// Workspace State Channel Names for terminal state persistence (legacy)
export const WORKSPACE_STATE_CHANNELS = {
  // Core state operations
  SAVE: 'workspace-state:save',
  LOAD: 'workspace-state:load',
  RESTORE: 'workspace-state:restore',
  CLEAR: 'workspace-state:clear',
  HAS: 'workspace-state:has',
  
  // Project management
  LIST_PROJECTS: 'workspace-state:list-projects',
  CLEANUP_ORPHANED: 'workspace-state:cleanup-orphaned',
  GET_PROJECT_META: 'workspace-state:get-project-meta',
  
  // Utility operations
  CREATE_EMPTY: 'workspace-state:create-empty',
  INITIALIZE: 'workspace-state:initialize',
} as const

// Helper function to get channel name for terminal data event
export function getTerminalDataChannel(terminalId: string): string {
  return `${IPC_CHANNELS.TERMINAL_DATA}:${terminalId}`
}

// Helper function to get channel name for terminal exit event
export function getTerminalExitChannel(terminalId: string): string {
  return `${IPC_CHANNELS.TERMINAL_EXIT}:${terminalId}`
}

// Helper function to get channel name for terminal buffer replay event
export function getTerminalBufferReplayChannel(terminalId: string): string {
  return `${IPC_CHANNELS.TERMINAL_BUFFER_REPLAY}:${terminalId}`
}
