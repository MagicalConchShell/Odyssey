import { contextBridge, ipcRenderer } from 'electron';


function createApiProxy(structure: any): any {
  const api: any = {};
  for (const key in structure) {
    const value = structure[key];
    if (typeof value === 'string') {
      api[key] = (...args: any[]) => ipcRenderer.invoke(value, ...args);
    } else if (typeof value === 'object' && value !== null) {
      api[key] = createApiProxy(value);
    }
  }
  return api;
}


ipcRenderer.invoke('get-api-structure').then(apiStructure => {
  console.log('🔄 Received API structure from backend:', apiStructure);

  const electronAPI = createApiProxy(apiStructure);


  electronAPI.on = (channel: string, listener: (...args: any[]) => void) =>
    ipcRenderer.on(channel, listener);
  electronAPI.removeListener = (channel: string, listener: (...args: any[]) => void) =>
    ipcRenderer.removeListener(channel, listener);
  electronAPI.removeAllListeners = (channel: string) =>
    ipcRenderer.removeAllListeners(channel);

  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  
  console.log('✅ ElectronAPI automatically generated and exposed to main world');
}).catch(error => {
  console.error('❌ Failed to initialize API structure:', error);
});