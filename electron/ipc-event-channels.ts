/**
 * Event Channel Definitions for Backend -> Frontend Communication
 * 
 * This file only defines event channels for backend-initiated communication (on/send pattern).
 * All API call channels (invoke/handle pattern) are now automatically managed by the API router.
 */

// Event channels for terminal-related notifications
export const TERMINAL_EVENT_CHANNELS = {
  // Backend -> Frontend (Events)
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_HISTORY_REPLAY: 'terminal:history-replay', // New structured history replay
} as const

// Helper function to get channel name for terminal data event
export function getTerminalDataChannel(terminalId: string): string {
  return `${TERMINAL_EVENT_CHANNELS.TERMINAL_DATA}:${terminalId}`
}

// Helper function to get channel name for terminal exit event
export function getTerminalExitChannel(terminalId: string): string {
  return `${TERMINAL_EVENT_CHANNELS.TERMINAL_EXIT}:${terminalId}`
}

// Helper function to get channel name for terminal history replay event
export function getTerminalHistoryReplayChannel(terminalId: string): string {
  return `${TERMINAL_EVENT_CHANNELS.TERMINAL_HISTORY_REPLAY}:${terminalId}`
}
