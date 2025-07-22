import { contextBridge, ipcRenderer } from 'electron';
import {
  Project,
  ApiResponse,
  GitHistory,
  GitBranch,
  GitCheckpoint,
  GitFileInfo,
  GitDiff,
  GitStorageStats,
  GitStatusResult,
  ProjectStats,
  Session,
  FileResponse,
  ClaudeMdFile,
  FileNode,
  McpServer,
  McpResponse,
  UsageEntry,
  UsageStats,
  ClaudeCliInfo,
  ClaudeExecutionOptions,
  ClaudeExecutionResult,
  ScreenshotResponse,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ClaudeProjectImportCandidate
} from './handlers/types';
import { FS_CHANNELS, WORKSPACE_STATE_CHANNELS } from './ipc-channels';
import type {
  WorkspaceState,
  ProjectWorkspaceMeta,
  WorkspaceStateConfig
} from './types/workspace-state';

// Define the API to be exposed to the renderer process
export interface IElectronAPI {
  // System utilities
  ping: () => Promise<ApiResponse<string>>;
  getPlatform: () => Promise<ApiResponse<string>>;
  openExternal: (url: string) => Promise<ApiResponse<void>>;
  captureWebviewScreenshot: (selector: string) => Promise<ScreenshotResponse>;

  // Terminal handlers
  terminal: {
    create: (workingDirectory: string, shell?: string, projectPath?: string, terminalId?: string) => Promise<ApiResponse<{ terminalId: string }>>;
    write: (terminalId: string, data: string) => Promise<ApiResponse<void>>;
    resize: (terminalId: string, cols: number, rows: number) => Promise<ApiResponse<void>>;
    close: (terminalId: string) => Promise<ApiResponse<void>>;
    info: (terminalId: string) => Promise<ApiResponse<{ isActive: boolean; workingDirectory: string; shell: string }>>;
    list: () => Promise<ApiResponse<string[]>>;
    pause: (terminalId: string) => Promise<ApiResponse<void>>;
    resume: (terminalId: string) => Promise<ApiResponse<void>>;
    getState: (terminalId: string) => Promise<ApiResponse<any>>;
  };

  // Claude CLI handlers
  claudeCli: {
    getBinaryPath: () => Promise<ApiResponse<string | null>>;
    setBinaryPath: (path: string) => Promise<ApiResponse<void>>;
    getInfo: () => Promise<ClaudeCliInfo>;
    executeCommand: (args: string[], options?: ClaudeExecutionOptions) => Promise<ClaudeExecutionResult>;
  };

  // File system handlers
  fileSystem: {
    readFile: (filePath: string) => Promise<FileResponse>;
    writeFile: (filePath: string, content: string) => Promise<FileResponse>;
    readDirectory: (dirPath: string) => Promise<ApiResponse<any[]>>;
    getDirectoryChildren: (dirPath: string) => Promise<ApiResponse<FileNode[]>>;
    getSystemPrompt: () => Promise<FileResponse>;
    saveSystemPrompt: (content: string) => Promise<FileResponse>;
    findClaudeMdFiles: (directory: string) => Promise<ApiResponse<ClaudeMdFile[]>>;
    readClaudeMdFile: (filePath: string) => Promise<FileResponse>;
    saveClaudeMdFile: (filePath: string, content: string) => Promise<FileResponse>;
    startFileSystemWatcher: (projectPath: string) => Promise<ApiResponse<void>>;
    stopFileSystemWatcher: (projectPath: string) => Promise<ApiResponse<void>>;
  };

  // Event listeners
  on?: (channel: string, listener: (...args: any[]) => void) => void;
  removeListener?: (channel: string, listener: (...args: any[]) => void) => void;

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

  // Workspace state handlers
  workspaceState: {
    save: (projectPath: string, state: WorkspaceState) => Promise<ApiResponse<void>>;
    load: (projectPath: string) => Promise<ApiResponse<WorkspaceState | null>>;
    clear: (projectPath: string) => Promise<ApiResponse<void>>;
    has: (projectPath: string) => Promise<ApiResponse<boolean>>;
    listProjects: () => Promise<ApiResponse<string[]>>;
    cleanupOrphaned: () => Promise<ApiResponse<number>>;
    getProjectMeta: (projectPath: string) => Promise<ApiResponse<ProjectWorkspaceMeta | null>>;
    createEmpty: () => Promise<ApiResponse<WorkspaceState>>;
    initialize: (config?: WorkspaceStateConfig) => Promise<ApiResponse<void>>;
  };
}

const electronAPI: IElectronAPI = {
  // System utilities
  ping: () => ipcRenderer.invoke('ping'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  captureWebviewScreenshot: (selector) => ipcRenderer.invoke('capture-webview-screenshot', selector),

  // Terminal handlers
  terminal: {
    create: (workingDirectory, shell, projectPath, terminalId) => ipcRenderer.invoke('terminal:create', workingDirectory, shell, projectPath, terminalId),
    write: (terminalId, data) => ipcRenderer.invoke('terminal:write', terminalId, data),
    resize: (terminalId, cols, rows) => ipcRenderer.invoke('terminal:resize', terminalId, cols, rows),
    close: (terminalId) => ipcRenderer.invoke('terminal:close', terminalId),
    info: (terminalId) => ipcRenderer.invoke('terminal:info', terminalId),
    list: () => ipcRenderer.invoke('terminal:list'),
    pause: (terminalId) => ipcRenderer.invoke('terminal:pause', terminalId),
    resume: (terminalId) => ipcRenderer.invoke('terminal:resume', terminalId),
    getState: (terminalId) => ipcRenderer.invoke('terminal:getState', terminalId),
  },

  // Claude CLI handlers
  claudeCli: {
    getBinaryPath: () => ipcRenderer.invoke('get-claude-binary-path'),
    setBinaryPath: (path) => ipcRenderer.invoke('set-claude-binary-path', path),
    getInfo: () => ipcRenderer.invoke('get-claude-cli-info'),
    executeCommand: (args, options) => ipcRenderer.invoke('execute-claude-command', args, options),
  },

  // File system handlers
  fileSystem: {
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
    readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
    getDirectoryChildren: (dirPath) => ipcRenderer.invoke(FS_CHANNELS.GET_DIRECTORY_CHILDREN, dirPath),
    getSystemPrompt: () => ipcRenderer.invoke('get-system-prompt'),
    saveSystemPrompt: (content) => ipcRenderer.invoke('save-system-prompt', content),
    findClaudeMdFiles: (directory) => ipcRenderer.invoke('find-claude-md-files', directory),
    readClaudeMdFile: (filePath) => ipcRenderer.invoke('read-claude-md-file', filePath),
    saveClaudeMdFile: (filePath, content) => ipcRenderer.invoke('save-claude-md-file', filePath, content),
    startFileSystemWatcher: (projectPath) => ipcRenderer.invoke('start-file-system-watcher', projectPath),
    stopFileSystemWatcher: (projectPath) => ipcRenderer.invoke('stop-file-system-watcher', projectPath),
  },

  // Event listeners
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),

  // Settings handlers
  settings: {
    getClaudeSettings: () => ipcRenderer.invoke('get-claude-settings'),
    saveClaudeSettings: (settings) => ipcRenderer.invoke('save-claude-settings', settings),
  },

  // MCP handlers
  mcp: {
    list: () => ipcRenderer.invoke('mcp-list'),
    clearCache: () => ipcRenderer.invoke('mcp-clear-cache'),
    add: (name, command, transport, args, env, url, scope) => ipcRenderer.invoke('mcp-add', name, command, transport, args, env, url, scope),
    remove: (name) => ipcRenderer.invoke('mcp-remove', name),
    testConnection: (name) => ipcRenderer.invoke('mcp-test-connection', name),
    addFromClaudeDesktop: (configPath) => ipcRenderer.invoke('mcp-add-from-claude-desktop', configPath),
    addJson: (name, configJson, scope) => ipcRenderer.invoke('mcp-add-json', name, configJson, scope),
    serve: () => ipcRenderer.invoke('mcp-serve'),
  },


  // Usage analytics handlers
  usage: {
    createEntry: (entry) => ipcRenderer.invoke('create-usage-entry', entry),
    getAllEntries: () => ipcRenderer.invoke('get-all-usage-entries'),
    getStats: () => ipcRenderer.invoke('get-usage-stats'),
    getByDateRange: (startDate, endDate) => ipcRenderer.invoke('get-usage-by-date-range', startDate, endDate),
    clearCache: () => ipcRenderer.invoke('clear-usage-cache'),
    getCacheStats: () => ipcRenderer.invoke('get-cache-stats'),
  },

  // Git checkpoint handlers
  gitCheckpoint: {
    createCheckpoint: (projectPath, description, author) => ipcRenderer.invoke('git-checkpoint:createCheckpoint', projectPath, description, author),
    checkout: (projectPath, ref, options) => ipcRenderer.invoke('git-checkpoint:checkout', projectPath, ref, options),
    getHistory: (projectPath, branch) => ipcRenderer.invoke('git-checkpoint:getHistory', projectPath, branch),
    createBranch: (projectPath, branchName, startPoint) => ipcRenderer.invoke('git-checkpoint:createBranch', projectPath, branchName, startPoint),
    switchBranch: (projectPath, branchName) => ipcRenderer.invoke('git-checkpoint:switchBranch', projectPath, branchName),
    listBranches: (projectPath) => ipcRenderer.invoke('git-checkpoint:listBranches', projectPath),
    deleteBranch: (projectPath, branchName) => ipcRenderer.invoke('git-checkpoint:deleteBranch', projectPath, branchName),
    getCheckpointInfo: (projectPath, ref) => ipcRenderer.invoke('git-checkpoint:getCheckpointInfo', projectPath, ref),
    listFiles: (projectPath, ref) => ipcRenderer.invoke('git-checkpoint:listFiles', projectPath, ref),
    getFileDiff: (projectPath, fromRef, toRef) => ipcRenderer.invoke('git-checkpoint:getFileDiff', projectPath, fromRef, toRef),
    getCheckpointChanges: (projectPath, ref) => ipcRenderer.invoke('git-checkpoint:getCheckpointChanges', projectPath, ref),
    getFileContent: (projectPath, ref, filePath) => ipcRenderer.invoke('git-checkpoint:getFileContent', projectPath, ref, filePath),
    getFileContentByHash: (projectPath, hash) => ipcRenderer.invoke('git-checkpoint:getFileContentByHash', projectPath, hash),
    getFileContentDiff: (projectPath, fromRef, toRef, filePath) => ipcRenderer.invoke('git-checkpoint:getFileContentDiff', projectPath, fromRef, toRef, filePath),
    getStorageStats: (projectPath) => ipcRenderer.invoke('git-checkpoint:getStorageStats', projectPath),
    garbageCollect: (projectPath) => ipcRenderer.invoke('git-checkpoint:garbageCollect', projectPath),
    optimizeStorage: (projectPath) => ipcRenderer.invoke('git-checkpoint:optimizeStorage', projectPath),
    getGitStatus: (projectPath) => ipcRenderer.invoke('git-checkpoint:getGitStatus', projectPath),
  },

  // Project management handlers
  projectManagement: {
    // New database-driven project management
    openFolder: () => ipcRenderer.invoke('open-folder'),
    listProjects: () => ipcRenderer.invoke('list-projects'),
    createProject: (request) => ipcRenderer.invoke('create-project', request),
    updateProject: (id, request) => ipcRenderer.invoke('update-project', id, request),
    deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
    openProject: (id) => ipcRenderer.invoke('open-project', id),
    
    // Claude project import functionality
    getClaudeProjectImportCandidates: () => ipcRenderer.invoke('get-claude-project-import-candidates'),
    importClaudeProjects: (claudeProjectIds) => ipcRenderer.invoke('import-claude-projects', claudeProjectIds),
    
    // Legacy support
    getProjectSessions: (projectId) => ipcRenderer.invoke('get-project-sessions', projectId),
    getProjectStats: (projectPath) => ipcRenderer.invoke('get-project-stats', projectPath),
  },

  // Workspace state handlers
  workspaceState: {
    save: (projectPath, state) => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.SAVE, projectPath, state),
    load: (projectPath) => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.LOAD, projectPath),
    clear: (projectPath) => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.CLEAR, projectPath),
    has: (projectPath) => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.HAS, projectPath),
    listProjects: () => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.LIST_PROJECTS),
    cleanupOrphaned: () => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.CLEANUP_ORPHANED),
    getProjectMeta: (projectPath) => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.GET_PROJECT_META, projectPath),
    createEmpty: () => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.CREATE_EMPTY),
    initialize: (config) => ipcRenderer.invoke(WORKSPACE_STATE_CHANNELS.INITIALIZE, config),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);