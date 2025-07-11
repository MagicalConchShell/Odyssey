import { IpcMain } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { registerHandler } from './base-handler.js';
import {
  ApiResponse
} from './types.js';

/**
 * Get Claude settings from ~/.claude/settings.json
 */
async function getClaudeSettings(): Promise<ApiResponse<any>> {
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json');

    try {
      const content = await readFile(settingsPath, 'utf8');
      const settings = JSON.parse(content);
      return { success: true, data: settings };
    } catch (err: any) {
      // If settings file doesn't exist, return empty settings
      if (err.code === 'ENOENT') {
        return { success: true, data: {} };
      }
      throw err;
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Save Claude settings to ~/.claude/settings.json
 */
async function saveClaudeSettings(settings: any): Promise<ApiResponse<void>> {
  try {
    const claudeDir = join(homedir(), '.claude');
    const settingsPath = join(claudeDir, 'settings.json');

    // Ensure .claude directory exists
    try {
      await mkdir(claudeDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, ignore error
    }

    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}


/**
 * Validate settings object structure
 */
function validateSettings(settings: any): boolean {
  // Add validation logic here if needed
  // For now, just check if it's an object
  return typeof settings === 'object' && settings !== null;
}

/**
 * Get default settings
 */
function getDefaultSettings(): any {
  return {
    theme: 'system',
    autoSave: true,
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4000,
    temperature: 0.7
  };
}

/**
 * Merge settings with defaults
 */
function mergeWithDefaults(settings: any): any {
  const defaults = getDefaultSettings();
  return { ...defaults, ...settings };
}

/**
 * Register all settings related IPC handlers
 */
export function setupSettingsHandlers(ipcMain: IpcMain): void {
  // Get Claude settings
  registerHandler(
    ipcMain,
    'get-claude-settings',
    getClaudeSettings,
    { requiresValidation: false, timeout: 5000 }
  );

  // Save Claude settings
  registerHandler(
    ipcMain,
    'save-claude-settings',
    saveClaudeSettings,
    { requiresValidation: true, timeout: 5000 }
  );


  
}

// Export utility functions for use in other modules
export { 
  validateSettings, 
  getDefaultSettings, 
  mergeWithDefaults 
};