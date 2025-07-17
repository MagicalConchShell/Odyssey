import {execFile, spawn, ChildProcess} from 'child_process';
import {access, constants} from 'fs/promises';
import {join} from 'path';
import {homedir} from 'os';

export interface ClaudeCliInfo {
  path: string;
  version: string;
  isAvailable: boolean;
  error?: string;
  installMethod?: string;
  isAuthenticated?: boolean;
  apiKeySet?: boolean;
}

export interface ClaudeExecutionOptions {
  cwd?: string;
  timeout?: number;
  args?: string[];
}

export interface ClaudeExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export class ClaudeCliManager {
  private claudePath: string | null = null;
  private runningProcesses: Map<string, ChildProcess> = new Map();

  async findClaudeCli(): Promise<ClaudeCliInfo> {
    const possiblePaths = this.generatePossiblePaths();
    for (const path of possiblePaths) {
      try {
        await access(path, constants.F_OK | constants.X_OK);
        const version = await this.getClaudeVersion(path);
        if (version) {
          this.claudePath = path;
          const installMethod = this.detectInstallMethod(path);
          const authStatus = await this.checkAuthenticationStatus(path);
          return {
            path,
            version,
            isAvailable: true,
            installMethod,
            isAuthenticated: authStatus.isAuthenticated,
            apiKeySet: authStatus.apiKeySet
          };
        }
      } catch (error) {
        // Continue to next path
        continue;
      }
    }
    return {
      path: '',
      version: '',
      isAvailable: false,
      error: 'Claude CLI not found. Please install it first: npm install -g @anthropic-ai/claude-3-cli'
    };
  }

  /**   * Generates a list of possible installation paths for the Claude CLI binary.   * Covers common installation methods including npm global, Homebrew, system packages,   * and user-specific installations.   *    * @returns Array of possible Claude CLI binary paths   */  private generatePossiblePaths(): string[] {
    const home = homedir();
    const paths: string[] = [];    // Common installation paths
    paths.push(
      // System paths
      '/usr/local/bin/claude', '/usr/bin/claude', '/opt/homebrew/bin/claude', '/home/linuxbrew/.linuxbrew/bin/claude',
// User-specific paths
      join(home, '.local/bin/claude'), join(home, 'bin/claude'),
// NVM paths (Node Version Manager)
      join(home, '.nvm/versions/node/current/bin/claude'),
// Homebrew paths
      '/opt/homebrew/bin/claude', '/usr/local/Homebrew/bin/claude',
// Windows paths
      join(home, 'AppData/Roaming/npm/claude.cmd'), join(home, 'AppData/Local/npm/claude.cmd'), 'C:\Program Files\nodejs\claude.cmd', 'C:\Program Files (x86)\nodejs\claude.cmd');
    // Add NVM node versions
    try {
      const fs = require('fs');
      const nvmVersionsPath = join(home, '.nvm/versions/node');
      if (fs.existsSync(nvmVersionsPath)) {
        const versions = fs.readdirSync(nvmVersionsPath);
        for (const version of versions) {
          paths.push(join(nvmVersionsPath, version, 'bin/claude'));
        }
      }
    } catch (error) {      // Ignore NVM detection errors
    }
    // Check PATH environment variable
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(process.platform === 'win32' ? ';' : ':');
    for (const dir of pathDirs) {
      if (dir) {
        const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
        paths.push(join(dir, claudeCmd));
      }
    }
    return [...new Set(paths)]; // Remove duplicates
  }

  private async getClaudeVersion(claudePath: string): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(claudePath, ['--version'], {timeout: 5000}, (error, stdout, stderr) => {
        if (error) {
          resolve(null);
          return;
        }
        const output = (stdout || stderr || '').trim();
        // Extract version from output like "claude 0.8.10" or "claude-3-cli 1.0.0"
        const versionMatch = output.match(/claude(?:-3-cli)?\s+(\d+\.\d+\.\d+)/i);
        resolve(versionMatch ? versionMatch[1] : output);
      });
    });
  }

  /**   * Detects the installation method used for Claude CLI based on its path.   * Uses heuristics to determine if it was installed via npm, Homebrew, pip, etc.   *    * @param claudePath - The path where Claude CLI was found   * @returns Human-readable description of the installation method   */  private detectInstallMethod(claudePath: string): string {
    if (claudePath.includes('node_modules')) {
      return 'npm (global)';
    } else if (claudePath.includes('homebrew') || claudePath.includes('/opt/homebrew')) {
      return 'Homebrew';
    } else if (claudePath.includes('.local/bin')) {
      return 'pip (user)';
    } else if (claudePath.includes('/usr/local/bin') || claudePath.includes('/usr/bin')) {
      return 'System package';
    } else if (claudePath.includes('.nvm')) {
      return 'npm (via NVM)';
    } else {
      return 'Unknown';
    }
  }

  /**   * Checks the authentication status of Claude CLI by running 'claude auth status'.   * Determines if the user is authenticated and if an API key is properly configured.   *    * @param claudePath - Path to the Claude CLI binary   * @returns Object with authentication and API key status   */  private async checkAuthenticationStatus(claudePath: string): Promise<{
    isAuthenticated: boolean,
    apiKeySet: boolean
  }> {
    try {
      // Check if API key is set
      const result = await this.executeSimpleCommand(claudePath, ['auth', 'status']);
      if (result.success) {
        const output = result.stdout || '';
        const isAuthenticated = !output.includes('not authenticated') && !output.includes('No API key');
        const apiKeySet = output.includes('API key') || output.includes('authenticated');
        return {isAuthenticated, apiKeySet};
      }
    } catch (error) {
      // Command might not exist in older versions
    }
    // Fallback: check environment variable or config file
    const hasEnvKey = !!process.env.ANTHROPIC_API_KEY;
    const hasConfigKey = await this.checkConfigFile();
    return {isAuthenticated: hasEnvKey || hasConfigKey, apiKeySet: hasEnvKey || hasConfigKey};
  }

  private async executeSimpleCommand(claudePath: string, args: string[]): Promise<ClaudeExecutionResult> {
    return new Promise((resolve) => {
      execFile(claudePath, args, {timeout: 10000}, (error, stdout, stderr) => {
        resolve({success: !error, stdout, stderr, error: error?.message});
      });
    });
  }

  private async checkConfigFile(): Promise<boolean> {
    try {
      const configPath = join(homedir(), '.claude', 'config.json');
      await access(configPath, constants.F_OK);
      const fs = await import('fs/promises');
      const config = await fs.readFile(configPath, 'utf8');
      const configData = JSON.parse(config);
      return !!(configData.api_key || configData.apiKey || configData.anthropic_api_key);
    } catch (error) {
      return false;
    }
  }

  async executeClaudeCommand(args: string[], options: ClaudeExecutionOptions = {}): Promise<ClaudeExecutionResult> {
    if (!this.claudePath) {
      const claudeInfo = await this.findClaudeCli();
      if (!claudeInfo.isAvailable) {
        return {success: false, error: 'Claude CLI not found. Please install Claude CLI first.'};
      }
    }
    // Require working directory to be explicitly provided
    if (!options.cwd) {
      throw new Error('Working directory (cwd) must be provided for Claude execution');
    }
    // Log the working directory for debugging
    console.log('Claude CLI executing in directory:', options.cwd);
    return new Promise((resolve) => {
      execFile(this.claudePath!, args, {
        cwd: options.cwd, timeout: options.timeout || 60000, maxBuffer: 1024 * 1024 * 10
// 10MB buffer
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({success: false, stdout, stderr, error: error.message});
        } else {
          resolve({success: true, stdout, stderr});
        }
      });
    });
  }

  spawnClaudeProcess(args: string[], options: ClaudeExecutionOptions = {}): ChildProcess | null {
    if (!this.claudePath) {
      return null;
    }
    // Require working directory to be explicitly provided
    if (!options.cwd) {
      throw new Error('Working directory (cwd) must be provided for Claude execution');
    }
    // Log the working directory for debugging
    console.log('Claude CLI executing in directory:', options.cwd);
    const processId = Date.now().toString();
    const claudeProcess = spawn(this.claudePath, args, {
      cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'],
      // pipe stdin instead of inherit to prevent hanging
      shell: false, env: {
        ...process.env,
        // Ensure Claude CLI has access to all environment variables
        PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      }
    });
    // Close stdin immediately to prevent Claude from waiting for input
    if (claudeProcess.stdin) {
      claudeProcess.stdin.end();
    }
    this.runningProcesses.set(processId, claudeProcess);
    claudeProcess.on('close', () => {
      this.runningProcesses.delete(processId);
    });
    return claudeProcess;
  }

  killProcess(processId: string): boolean {
    const process = this.runningProcesses.get(processId);
    if (process && !process.killed) {
      process.kill();
      this.runningProcesses.delete(processId);
      return true;
    }
    return false;
  }

  killAllProcesses(): void {
    for (const [, process] of this.runningProcesses) {
      if (!process.killed) {
        process.kill();
      }
    }
    this.runningProcesses.clear();
  }

  getClaudePath(): string | null {
    return this.claudePath;
  }

  isClaudeAvailable(): boolean {
    return this.claudePath !== null;
  }

  setClaudePath(path: string): void {
    this.claudePath = path;
  }
}

// Export singleton instance
export const claudeCliManager = new ClaudeCliManager();