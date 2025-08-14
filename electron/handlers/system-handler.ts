import {shell, IpcMainInvokeEvent} from 'electron';

/**
 * Simple ping handler for testing
 */
export async function ping(_event: IpcMainInvokeEvent): Promise<string> {
  return 'pong';
}

/**
 * Get platform information
 */
export async function getPlatform(_event: IpcMainInvokeEvent): Promise<string> {
  return process.platform;
}


/**
 * Open a URL in the default external browser
 */
export async function openExternal(_event: IpcMainInvokeEvent, url: string): Promise<void> {
  await shell.openExternal(url);
}