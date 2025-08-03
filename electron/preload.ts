import { contextBridge, ipcRenderer } from 'electron';
import { IElectronAPI } from './types/api-contract.js';
import { ApiResponse } from './types/api.js';

// Helper type that wraps all API methods with ApiResponse
type WrappedElectronAPI = {
  [K in keyof IElectronAPI]: IElectronAPI[K] extends (...args: any[]) => Promise<infer R>
    ? (...args: Parameters<IElectronAPI[K]>) => Promise<ApiResponse<R>>
    : IElectronAPI[K] extends Record<string, any>
    ? {
        [M in keyof IElectronAPI[K]]: IElectronAPI[K][M] extends (...args: any[]) => Promise<infer R>
          ? (...args: Parameters<IElectronAPI[K][M]>) => Promise<ApiResponse<R>>
          : IElectronAPI[K][M]
      }
    : IElectronAPI[K]
};

// Helper function to wrap API calls with ApiResponse structure
function wrapApiCall<T extends (...args: any[]) => Promise<any>>(
  channel: string
): (...args: Parameters<T>) => Promise<ApiResponse<Awaited<ReturnType<T>>>> {
  return (...args: Parameters<T>) => ipcRenderer.invoke(channel, ...args);
}

// Helper function to wrap API modules
function wrapApiModule<T extends Record<string, string>>(
  methods: T
): { [K in keyof T]: (...args: any[]) => Promise<ApiResponse<any>> } {
  const wrappedModule = {} as any;
  
  for (const methodName in methods) {
    const channel = methods[methodName];
    wrappedModule[methodName] = (...args: any[]) => ipcRenderer.invoke(channel, ...args);
  }
  
  return wrappedModule;
}

const electronAPI: WrappedElectronAPI = {
  // System utilities
  ping: wrapApiCall('ping'),
  getPlatform: wrapApiCall('get-platform'),
  openExternal: wrapApiCall('open-external'),
  captureWebviewScreenshot: wrapApiCall('capture-webview-screenshot'),

  // Terminal handlers
  terminal: wrapApiModule({
    create: 'terminal:create',
    write: 'terminal:write',
    resize: 'terminal:resize',
    close: 'terminal:close',
    info: 'terminal:info',
    list: 'terminal:list',
    pause: 'terminal:pause',
    resume: 'terminal:resume',
    getState: 'terminal:getState',
    cwdChanged: 'terminal:cwdChanged',
    registerWebContents: 'terminal:registerWebContents',
    updateCleanBuffer: 'terminal:updateCleanBuffer',
  }),

  // Claude CLI handlers
  claudeCli: wrapApiModule({
    getBinaryPath: 'claudeCli:getBinaryPath',
    setBinaryPath: 'claudeCli:setBinaryPath',
    getInfo: 'claudeCli:getInfo',
    executeCommand: 'claudeCli:executeCommand',
  }),

  // Event listeners
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),

  // Settings handlers
  settings: wrapApiModule({
    getClaudeSettings: 'settings:getClaudeSettings',
    saveClaudeSettings: 'settings:saveClaudeSettings',
  }),

  // MCP handlers
  mcp: wrapApiModule({
    list: 'mcp:list',
    clearCache: 'mcp:clearCache',
    add: 'mcp:add',
    remove: 'mcp:remove',
    testConnection: 'mcp:testConnection',
    addFromClaudeDesktop: 'mcp:addFromClaudeDesktop',
    addJson: 'mcp:addJson',
    serve: 'mcp:serve',
  }),

  // Usage analytics handlers
  usage: wrapApiModule({
    createEntry: 'usage:createEntry',
    getAllEntries: 'usage:getAllEntries',
    getStats: 'usage:getStats',
    getByDateRange: 'usage:getByDateRange',
    clearCache: 'usage:clearCache',
    getCacheStats: 'usage:getCacheStats',
  }),

  // Project management handlers
  projectManagement: wrapApiModule({
    openFolder: 'projectManagement:openFolder',
    listProjects: 'projectManagement:listProjects',
    createProject: 'projectManagement:createProject',
    updateProject: 'projectManagement:updateProject',
    deleteProject: 'projectManagement:deleteProject',
    openProject: 'projectManagement:openProject',
    getClaudeProjectImportCandidates: 'projectManagement:getClaudeProjectImportCandidates',
    importClaudeProjects: 'projectManagement:importClaudeProjects',
    getProjectSessions: 'projectManagement:getProjectSessions',
    getProjectStats: 'projectManagement:getProjectStats',
  }),

  // Business-oriented workspace operations
  workspace: wrapApiModule({
    load: 'workspace:load',
    save: 'workspace:save',
    listProjects: 'workspace:listProjects',
    cleanupOrphanedStates: 'workspace:cleanupOrphanedStates',
  }),

};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);