import { join } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { IpcMainInvokeEvent } from 'electron';

/**
 * Get Claude settings from ~/.claude/settings.json
 */
export async function getClaudeSettings(_event: IpcMainInvokeEvent): Promise<any> {
  const settingsPath = join(homedir(), '.claude', 'settings.json');

  try {
    const content = await readFile(settingsPath, 'utf8');
    const settings = JSON.parse(content);
    return settings;
  } catch (err: any) {
    // If settings file doesn't exist, return empty settings
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

/**
 * Save Claude settings to ~/.claude/settings.json
 */
export async function saveClaudeSettings(_event: IpcMainInvokeEvent, settings: any): Promise<void> {
  const claudeDir = join(homedir(), '.claude');
  const settingsPath = join(claudeDir, 'settings.json');

  // Ensure .claude directory exists
  try {
    await mkdir(claudeDir, { recursive: true });
  } catch (err) {
    // Directory might already exist, ignore error
  }

  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
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

// Export utility functions for use in other modules
export { 
  validateSettings, 
  getDefaultSettings, 
  mergeWithDefaults 
};