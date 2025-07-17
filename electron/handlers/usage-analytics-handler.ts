import {IpcMain} from 'electron';
import {dbManager} from '../services/database-service.js';
import {usageDataCache} from '../services/usage-analytics-service.js';
import {registerHandler} from './base-handler.js';
import {DateUsageStats, ModelUsageStats, ProjectUsageStats, UsageEntry, UsageStats} from './types.js';

/**
 * Create a new usage entry
 */
async function createUsageEntry(
  entryData: Omit<UsageEntry, 'id' | 'created_at'>
): Promise<UsageEntry> {
  const entry = await dbManager.createUsageEntry(entryData);
  
  // Invalidate cache to ensure fresh data on next request
  usageDataCache.clearCache();
  console.log('📝 Created new usage entry and invalidated cache');
  
  return entry;
}

/**
 * Get all usage entries
 */
async function getAllUsageEntries(): Promise<UsageEntry[]> {
  return dbManager.getAllUsageEntries();
}

/**
 * Calculate usage statistics from an array of usage entries
 */
function calculateUsageStatistics(entries: UsageEntry[]): UsageStats {
  // Calculate totals
  const totalCost = entries.reduce((sum, entry) => sum + entry.cost, 0);
  const totalInputTokens = entries.reduce((sum, entry) => sum + entry.input_tokens, 0);
  const totalOutputTokens = entries.reduce((sum, entry) => sum + entry.output_tokens, 0);
  const totalCacheCreationTokens = entries.reduce((sum, entry) => sum + entry.cache_creation_tokens, 0);
  const totalCacheReadTokens = entries.reduce((sum, entry) => sum + entry.cache_read_tokens, 0);
  const totalTokens = totalInputTokens + totalOutputTokens + totalCacheCreationTokens + totalCacheReadTokens;
  
  // Get unique sessions
  const uniqueSessions = new Set(entries.map(entry => entry.session_id));
  
  // Group by model
  const byModel = new Map<string, ModelUsageStats>();
  entries.forEach(entry => {
    if (!byModel.has(entry.model)) {
      byModel.set(entry.model, {
        model: entry.model,
        total_cost: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        session_count: 0
      });
    }
    const modelStats = byModel.get(entry.model)!;
    modelStats.total_cost += entry.cost;
    modelStats.input_tokens += entry.input_tokens;
    modelStats.output_tokens += entry.output_tokens;
    modelStats.cache_creation_tokens += entry.cache_creation_tokens;
    modelStats.cache_read_tokens += entry.cache_read_tokens;
  });
  
  // Count unique sessions per model
  const sessionsByModel = new Map<string, Set<string>>();
  entries.forEach(entry => {
    if (!sessionsByModel.has(entry.model)) {
      sessionsByModel.set(entry.model, new Set());
    }
    sessionsByModel.get(entry.model)!.add(entry.session_id);
  });
  
  // Update session counts
  byModel.forEach((stats, model) => {
    stats.session_count = sessionsByModel.get(model)?.size || 0;
  });
  
  // Group by project
  const byProject = new Map<string, ProjectUsageStats>();
  entries.forEach(entry => {
    if (!byProject.has(entry.project_path)) {
      byProject.set(entry.project_path, {
        project_path: entry.project_path,
        total_cost: 0,
        total_tokens: 0,
        session_count: 0
      });
    }
    const projectStats = byProject.get(entry.project_path)!;
    projectStats.total_cost += entry.cost;
    projectStats.total_tokens += entry.input_tokens + entry.output_tokens + entry.cache_creation_tokens + entry.cache_read_tokens;
  });
  
  // Count unique sessions per project
  const sessionsByProject = new Map<string, Set<string>>();
  entries.forEach(entry => {
    if (!sessionsByProject.has(entry.project_path)) {
      sessionsByProject.set(entry.project_path, new Set());
    }
    sessionsByProject.get(entry.project_path)!.add(entry.session_id);
  });
  
  // Update session counts
  byProject.forEach((stats, project) => {
    stats.session_count = sessionsByProject.get(project)?.size || 0;
  });
  
  // Group by date
  const byDate = new Map<string, DateUsageStats>();
  entries.forEach(entry => {
    const date = entry.timestamp.split('T')[0];
    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        total_cost: 0,
        total_tokens: 0,
        models_used: []
      });
    }
    const dateStats = byDate.get(date)!;
    dateStats.total_cost += entry.cost;
    dateStats.total_tokens += entry.input_tokens + entry.output_tokens + entry.cache_creation_tokens + entry.cache_read_tokens;
    
    // Track unique models used per date
    if (!dateStats.models_used.includes(entry.model)) {
      dateStats.models_used.push(entry.model);
    }
  });

  return {
    total_cost: totalCost,
    total_sessions: uniqueSessions.size,
    total_tokens: totalTokens,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_cache_creation_tokens: totalCacheCreationTokens,
    total_cache_read_tokens: totalCacheReadTokens,
    by_model: Array.from(byModel.values()).sort((a, b) => b.total_cost - a.total_cost),
    by_project: Array.from(byProject.values()).sort((a, b) => b.total_cost - a.total_cost),
    by_date: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  };
}

/**
 * Get usage statistics
 */
async function getUsageStats(): Promise<UsageStats> {
  const allData = await usageDataCache.getCachedUsageData();
  return calculateUsageStatistics(allData);
}

/**
 * Get usage statistics by date range
 */
async function getUsageByDateRange(
  startDate: string,
  endDate: string
): Promise<UsageStats> {
  // Validate date inputs
  if (!startDate || !endDate) {
    throw new Error('Start date and end date are required');
  }
  
  // Get filtered data using cache
  const filteredData = await usageDataCache.getFilteredUsageData(startDate, endDate);
  return calculateUsageStatistics(filteredData);
}

/**
 * Clear usage cache
 */
async function clearUsageCache(): Promise<void> {
  usageDataCache.clearCache();
}

/**
 * Get cache statistics
 */
async function getCacheStats(): Promise<any> {
  return usageDataCache.getCacheStats();
}

/**
 * Register all usage analytics related IPC handlers
 */
export function setupUsageAnalyticsHandlers(ipcMain: IpcMain): void {
  // Create usage entry
  registerHandler(
    ipcMain,
    'create-usage-entry',
    createUsageEntry,
    { requiresValidation: true, timeout: 5000 }
  );

  // Get all usage entries
  registerHandler(
    ipcMain,
    'get-all-usage-entries',
    getAllUsageEntries,
    { requiresValidation: false, timeout: 10000 }
  );

  // Get usage statistics
  registerHandler(
    ipcMain,
    'get-usage-stats',
    getUsageStats,
    { requiresValidation: false, timeout: 10000 }
  );

  // Get usage statistics by date range
  registerHandler(
    ipcMain,
    'get-usage-by-date-range',
    getUsageByDateRange,
    { requiresValidation: true, timeout: 10000 }
  );

  // Clear usage cache
  registerHandler(
    ipcMain,
    'clear-usage-cache',
    clearUsageCache,
    { requiresValidation: false, timeout: 5000 }
  );

  // Get cache statistics
  registerHandler(
    ipcMain,
    'get-cache-stats',
    getCacheStats,
    { requiresValidation: false, timeout: 5000 }
  );

  
}