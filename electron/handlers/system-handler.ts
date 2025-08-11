import {shell, IpcMainInvokeEvent} from 'electron';
import {spawn} from 'child_process';
import {writeFile} from 'fs/promises';
import {join} from 'path';
import {tmpdir} from 'os';

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
 * Capture a screenshot of a webview URL
 */
export async function captureWebviewScreenshot(_event: IpcMainInvokeEvent, _url: string): Promise<{ path: string }> {
  // This is a placeholder implementation
  // In a real implementation, you would use a headless browser like Puppeteer
  // or integrate with Electron's webContents.capturePage()
  
  const timestamp = Date.now();
  const filename = `screenshot_${timestamp}.png`;
  const screenshotPath = join(tmpdir(), filename);
  
  // For now, create a dummy file
  // In real implementation, this would capture the actual screenshot
  await writeFile(screenshotPath, Buffer.from('dummy screenshot data'));
  
  return {
    path: screenshotPath
  };
}

/**
 * Open a URL in the default external browser
 */
export async function openExternal(_event: IpcMainInvokeEvent, url: string): Promise<void> {
  await shell.openExternal(url);
}

/**
 * Execute a system command (utility function)
 */
async function executeCommand(
  command: string, 
  args: string[], 
  options?: { 
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
  }
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd || process.cwd(),
      env: { ...process.env, ...options?.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = options?.timeout || 30000;
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({ stdout, stderr, code: code || 0 });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

/**
 * Get system information
 */
async function getSystemInfo(): Promise<any> {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    v8Version: process.versions.v8,
    osType: process.platform,
    totalMemory: process.memoryUsage(),
    uptime: process.uptime(),
    pid: process.pid,
    cwd: process.cwd(),
    execPath: process.execPath,
    argv: process.argv
  };
}

/**
 * Check if a command exists in the system PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where' : 'which';
    
    const result = await executeCommand(whichCommand, [command], { timeout: 5000 });
    return result.code === 0 && result.stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get environment variables
 */
async function getEnvironmentVariables(): Promise<Record<string, string>> {
  return process.env as Record<string, string>;
}


// Export utility functions for use in other modules
export { 
  executeCommand,
  commandExists,
  getSystemInfo,
  getEnvironmentVariables 
};