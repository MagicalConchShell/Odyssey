import {app, BrowserWindow, ipcMain, session} from 'electron';
import {join} from 'path';
import {dbManager} from './services/database-service.js';
import {usageDataCache} from './services/usage-analytics-service.js';
import {setupAllHandlers, cleanupHandlers} from './handlers/index.js';
import {TerminalManagementService} from "./services/terminal-management-service";
import {WorkspaceStateService} from "./services/workspace-state-service";

let mainWindow: BrowserWindow;
let terminalManagementService: TerminalManagementService;

/**
 * Create the main application window
 */
const createWindow = async () => {
  console.log('🪟 Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false // Don't show until ready
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('✅ Main window ready and visible');

  });


  // Load the renderer (always use built files for proper Electron integration)
  const rendererPath = join(__dirname, '../renderer/index.html');
  console.log(`🔍 Loading renderer from: ${rendererPath}`);
  // Load the app
  try {
    await mainWindow.loadFile(rendererPath);
    console.log('✅ Renderer loaded successfully');

    // Open dev tools in development mode
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
      console.log('🔧 Development mode: DevTools opened');
    }
  } catch (error) {
    console.error('❌ Failed to load renderer:', error);
  }


  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null as any;
  });
}


/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  console.log('🚀 Initializing application...');

  // Create service instances
  terminalManagementService = new TerminalManagementService();
  const workspaceStateService = new WorkspaceStateService();

  // Setup all IPC handlers with dependency injection
  setupAllHandlers(ipcMain, { terminalManagementService, workspaceStateService });

  // Initialize database
  dbManager.initialize()
  console.log('✅ Database initialized');

  // Initialize usage data cache (placeholder)
  // TODO: Implement usageDataCache.init() method
  console.log('✅ Usage data cache initialization skipped (placeholder)');

  // Terminal state restoration is now handled by frontend via IPC
  console.log('📝 Terminal state restoration will be handled by frontend');

  console.log('✅ Application initialization complete');
}

/**
 * Main application entry point
 */
app.whenReady().then(async () => {
  try {
    await initialize();

    // Set Content Security Policy
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp = process.env.NODE_ENV === 'development'
        ? "default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-eval' http://localhost:5173; connect-src 'self' http://localhost:5173 ws://localhost:5173; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
        : "default-src 'self' 'unsafe-inline' data:; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;";

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      });
    });

    await createWindow();
  } catch (error) {
    console.error('Failed to initialize application:', error);
    app.quit();
  }
});

// Handle app activation (macOS)
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

// Handle all windows closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app shutdown
app.on('before-quit', async () => {
  console.log('🚪 Application is shutting down, cleaning up resources...');

  // Save terminal state before shutdown
  try {
    const workspaceService = new WorkspaceStateService();
    const currentProjectPath = process.cwd(); // Use current working directory as default
    
    // Only save if there are active terminals
    if (terminalManagementService.getCount() > 0) {
      console.log(`💾 Saving terminal state for ${terminalManagementService.getCount()} terminals...`);
      await workspaceService.saveFromTerminalService(currentProjectPath, terminalManagementService);
      console.log('✅ Terminal state saved successfully');
    } else {
      console.log('📭 No terminals to save');
    }
  } catch (error) {
    console.error('❌ Failed to save terminal state during shutdown:', error);
    // Don't prevent shutdown due to save failure
  }

  // Clean up database connection
  dbManager.close();

  // Clear usage data cache
  usageDataCache.clearCache();

  // Clean up IPC handlers
  cleanupHandlers(ipcMain);

  // Clean up terminal management service
  terminalManagementService.cleanup();

  console.log('✅ Cleanup completed');
});

// All exports are now handled by the handlers module