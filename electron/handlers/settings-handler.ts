import { IpcMainInvokeEvent } from 'electron';
import { dbManager } from '../services/database-service.js';

/**
 * Get environment variables from the database
 */
export async function getEnvironmentVariables(_event: IpcMainInvokeEvent): Promise<Record<string, string>> {
  try {
    return dbManager.getEnvironmentVariables();
  } catch (error) {
    console.error('Failed to get environment variables:', error);
    throw error;
  }
}

/**
 * Save environment variables to the database
 */
export async function saveEnvironmentVariables(_event: IpcMainInvokeEvent, env: Record<string, string>): Promise<void> {
  try {
    dbManager.saveEnvironmentVariables(env);
  } catch (error) {
    console.error('Failed to save environment variables:', error);
    throw error;
  }
}