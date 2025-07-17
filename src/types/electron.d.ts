// Import backend types for consistency
export type {
  Project,
  Session,
  ClaudeCliInfo,
  ClaudeExecutionOptions,
  ClaudeExecutionResult,
  UsageEntry,
  UsageStats,
  ModelUsageStats,
  ProjectUsageStats,
  DateUsageStats,
  McpServer,
  McpResponse,
  FileResponse,
  ApiResponse,
  ClaudeMdFile,
  ProjectStats,
  GitHistory,
  GitBranch,
  GitCheckpoint,
  GitFileInfo,
  GitDiff,
  GitStorageStats,
  GitStatusResult,
  ScreenshotResponse,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ClaudeProjectImportCandidate
} from '../../electron/handlers/types';

// Additional frontend-specific types
export interface ClaudeSettings {
  includeCoAuthoredBy?: boolean;
  verbose?: boolean;
  cleanupPeriodDays?: number;
  apiKeyHelper?: string;
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  env?: Record<string, string>;
}

export interface MessageDebugInfo {
  component: string;
  action: string;
  timestamp?: number | string;
  messageType?: string;
  processingId?: string;
  details?: Record<string, any>;
}

declare global {
  interface Window {
    electronAPI: {
      // System utilities
      ping: () => Promise<ApiResponse<string>>;
      getPlatform: () => Promise<ApiResponse<string>>;
      openExternal: (url: string) => Promise<ApiResponse<void>>;
      captureWebviewScreenshot: (selector: string) => Promise<ScreenshotResponse>;

      // Terminal handlers
      terminal: {
        create: (workingDirectory: string, shell?: string, projectPath?: string) => Promise<ApiResponse<{ terminalId: string }>>;
        write: (terminalId: string, data: string) => Promise<ApiResponse<void>>;
        resize: (terminalId: string, cols: number, rows: number) => Promise<ApiResponse<void>>;
        close: (terminalId: string) => Promise<ApiResponse<void>>;
        info: (terminalId: string) => Promise<ApiResponse<any>>;
        list: () => Promise<ApiResponse<any[]>>;
        pause: (terminalId: string) => Promise<ApiResponse<void>>;
        resume: (terminalId: string) => Promise<ApiResponse<void>>;
        getState: (terminalId: string) => Promise<ApiResponse<any>>;
      };

      // Event listeners
      on?: (channel: string, listener: (...args: any[]) => void) => void;
      removeListener?: (channel: string, listener: (...args: any[]) => void) => void;

      // Claude CLI handlers
      claudeCli: {
        getBinaryPath: () => Promise<ApiResponse<string | null>>;
        setBinaryPath: (path: string) => Promise<ApiResponse<void>>;
        getInfo: () => Promise<ApiResponse<ClaudeCliInfo>>;
        executeCommand: (args: string[], options?: ClaudeExecutionOptions) => Promise<ClaudeExecutionResult>;
      };

      // File system handlers
      fileSystem: {
        readFile: (filePath: string) => Promise<FileResponse>;
        writeFile: (filePath: string, content: string) => Promise<FileResponse>;
        readDirectory: (dirPath: string) => Promise<ApiResponse<any[]>>;
        getSystemPrompt: () => Promise<FileResponse>;
        saveSystemPrompt: (content: string) => Promise<FileResponse>;
        findClaudeMdFiles: (directory: string) => Promise<ApiResponse<ClaudeMdFile[]>>;
        readClaudeMdFile: (filePath: string) => Promise<FileResponse>;
        saveClaudeMdFile: (filePath: string, content: string) => Promise<FileResponse>;
        startFileSystemWatcher: (projectPath: string) => Promise<ApiResponse<void>>;
        stopFileSystemWatcher: (projectPath: string) => Promise<ApiResponse<void>>;
      };

      // Settings handlers
      settings: {
        getClaudeSettings: () => Promise<ApiResponse<any>>;
        saveClaudeSettings: (settings: any) => Promise<ApiResponse<void>>;
      };

      // MCP handlers
      mcp: {
        list: () => Promise<ApiResponse<McpServer[]>>;
        clearCache: () => Promise<ApiResponse<void>>;
        add: (name: string, command: string, transport?: string, args?: string[], env?: Record<string, string>, url?: string, scope?: string) => Promise<McpResponse>;
        remove: (name: string) => Promise<McpResponse>;
        testConnection: (name: string) => Promise<McpResponse>;
        addFromClaudeDesktop: (configPath?: string) => Promise<McpResponse>;
        addJson: (name: string, configJson: string, scope?: string) => Promise<McpResponse>;
        serve: () => Promise<McpResponse>;
      };

      // Claude Code session handlers
      claudeCodeSession: {
        execute: (projectPath: string, prompt: string, model?: string) => Promise<ApiResponse<{ sessionId: string }>>;
        resume: (projectPath: string, sessionId: string, prompt: string, model?: string) => Promise<ApiResponse<void>>;
        cancel: (sessionId?: string) => Promise<ApiResponse<void>>;
        loadHistory: (sessionId: string, projectId: string) => Promise<ApiResponse<any[]>>;
      };

      // Usage analytics handlers
      usage: {
        createEntry: (entry: Omit<UsageEntry, 'id' | 'created_at'>) => Promise<ApiResponse<UsageEntry>>;
        getAllEntries: () => Promise<ApiResponse<UsageEntry[]>>;
        getStats: () => Promise<ApiResponse<UsageStats>>;
        getByDateRange: (startDate: string, endDate: string) => Promise<ApiResponse<UsageStats>>;
        clearCache: () => Promise<ApiResponse<void>>;
        getCacheStats: () => Promise<ApiResponse<any>>;
      };

      // Git checkpoint handlers
      gitCheckpoint: {
        createCheckpoint: (projectPath: string, description?: string, author?: string) => Promise<ApiResponse<{ commitHash: string }>>;
        checkout: (projectPath: string, ref: string, options?: any) => Promise<ApiResponse<void>>;
        getHistory: (projectPath: string, branch?: string) => Promise<ApiResponse<GitHistory>>;
        createBranch: (projectPath: string, branchName: string, startPoint?: string) => Promise<ApiResponse<void>>;
        switchBranch: (projectPath: string, branchName: string) => Promise<ApiResponse<void>>;
        listBranches: (projectPath: string) => Promise<ApiResponse<GitBranch[]>>;
        deleteBranch: (projectPath: string, branchName: string) => Promise<ApiResponse<void>>;
        getCheckpointInfo: (projectPath: string, ref: string) => Promise<ApiResponse<GitCheckpoint | null>>;
        listFiles: (projectPath: string, ref: string) => Promise<ApiResponse<GitFileInfo[]>>;
        getFileDiff: (projectPath: string, fromRef: string, toRef: string) => Promise<ApiResponse<GitDiff>>;
        getCheckpointChanges: (projectPath: string, ref: string) => Promise<ApiResponse<any>>;
        getFileContent: (projectPath: string, ref: string, filePath: string) => Promise<ApiResponse<string>>;
        getFileContentByHash: (projectPath: string, hash: string) => Promise<ApiResponse<string>>;
        getFileContentDiff: (projectPath: string, fromRef: string, toRef: string, filePath: string) => Promise<ApiResponse<GitDiff>>;
        getStorageStats: (projectPath: string) => Promise<ApiResponse<GitStorageStats>>;
        garbageCollect: (projectPath: string) => Promise<ApiResponse<void>>;
        optimizeStorage: (projectPath: string) => Promise<ApiResponse<void>>;
        getGitStatus: (projectPath: string) => Promise<ApiResponse<GitStatusResult>>;
      };

      // Project management handlers
      projectManagement: {
        // New database-driven project management
        openFolder: () => Promise<ApiResponse<Project>>;
        listProjects: () => Promise<ApiResponse<Project[]>>;
        createProject: (request: ProjectCreateRequest) => Promise<ApiResponse<Project>>;
        updateProject: (id: string, request: ProjectUpdateRequest) => Promise<ApiResponse<Project>>;
        deleteProject: (id: string) => Promise<ApiResponse<boolean>>;
        openProject: (id: string) => Promise<ApiResponse<Project>>;
        
        // Claude project import functionality  
        getClaudeProjectImportCandidates: () => Promise<ApiResponse<ClaudeProjectImportCandidate[]>>;
        importClaudeProjects: (claudeProjectIds: string[]) => Promise<ApiResponse<{ imported: number, failed: number }>>;
        
        // Legacy support
        getProjectSessions: (projectId: string) => Promise<Session[]>;
        getProjectStats: (projectPath: string) => Promise<ProjectStats>;
      };
    };
  }
}

export {};