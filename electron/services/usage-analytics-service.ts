import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

export interface ParsedUsageEntry {
  timestamp: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  cost: number
  session_id: string
  project_path: string
}

export interface RawUsageData {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  timestamp?: string
  model?: string
  cwd?: string
  session_id?: string
}

export interface CacheEntry {
  data: ParsedUsageEntry[]
  lastModified: number
  expires: number
}

export interface FileInfo {
  path: string
  lastModified: number
}

export class UsageDataCache {
  private cache = new Map<string, CacheEntry>()
  private fileInfoCache = new Map<string, FileInfo[]>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly MAX_CACHE_SIZE = 100 // Maximum number of cached entries

  constructor() {
    // Clean up expired cache entries every minute
    setInterval(() => this.cleanup(), 60 * 1000)
  }

  async getCachedUsageData(): Promise<ParsedUsageEntry[]> {
    const cacheKey = 'all_usage_data'
    
    // Check if we have valid cached data
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() < cached.expires) {
      // Verify that source files haven't changed
      if (await this.hasDataChanged(cached.lastModified)) {
        this.cache.delete(cacheKey)
      } else {
        console.log('🚀 Using cached usage data')
        return cached.data
      }
    }

    // Cache miss or expired - reload data
    console.log('📊 Loading fresh usage data...')
    const data = await this.loadUsageDataFromFiles()
    
    // Cache the result
    this.cache.set(cacheKey, {
      data,
      lastModified: Date.now(),
      expires: Date.now() + this.CACHE_TTL
    })

    // Cleanup cache if it gets too large
    this.enforceMaxCacheSize()

    return data
  }

  async getFilteredUsageData(startDate: string, endDate: string): Promise<ParsedUsageEntry[]> {
    // Get all data from cache
    const allData = await this.getCachedUsageData()
    
    // Filter by date range
    return allData.filter(entry => {
      const entryDate = entry.timestamp.split('T')[0]
      const start = startDate.split('T')[0]
      const end = endDate.split('T')[0]
      return entryDate >= start && entryDate <= end
    })
  }

  private async hasDataChanged(lastCacheTime: number): Promise<boolean> {
    try {
      const claudeProjectsPath = join(homedir(), '.claude', 'projects')
      const currentFiles = await this.getFileInfoRecursive(claudeProjectsPath)
      
      // Check if any file has been modified since last cache
      for (const file of currentFiles) {
        if (file.lastModified > lastCacheTime) {
          console.log(`📝 File changed: ${file.path}`)
          return true
        }
      }
      
      return false
    } catch (error) {
      console.error('Error checking file changes:', error)
      return true // Assume changed if we can't check
    }
  }

  /**
   * Recursively scans directories for JSONL files with optimized parallel processing.
   * Uses Promise.allSettled to handle errors gracefully and process directories in parallel.
   * 
   * @param dirPath - The directory path to scan
   * @returns Array of file information for JSONL files
   */
  private async getFileInfoRecursive(dirPath: string): Promise<FileInfo[]> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      
      // Separate files and directories for parallel processing
      const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
      const directories = entries.filter(entry => entry.isDirectory())
      
      // Process files in parallel
      const filePromises = files.map(async (entry) => {
        try {
          const fullPath = join(dirPath, entry.name)
          const stats = await stat(fullPath)
          return {
            path: fullPath,
            lastModified: stats.mtime.getTime()
          }
        } catch {
          return null // Ignore individual file errors
        }
      })
      
      // Process subdirectories in parallel
      const dirPromises = directories.map(entry => 
        this.getFileInfoRecursive(join(dirPath, entry.name))
      )
      
      // Wait for all operations to complete
      const [fileResults, dirResults] = await Promise.all([
        Promise.allSettled(filePromises),
        Promise.allSettled(dirPromises)
      ])
      
      // Collect successful results
      const fileInfos: FileInfo[] = []
      
      // Add file results
      fileResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          fileInfos.push(result.value)
        }
      })
      
      // Add directory results
      dirResults.forEach(result => {
        if (result.status === 'fulfilled') {
          fileInfos.push(...result.value)
        }
      })
      
      return fileInfos
    } catch (error) {
      // Return empty array if directory can't be read
      return []
    }
  }

  private async loadUsageDataFromFiles(): Promise<ParsedUsageEntry[]> {
    const claudeProjectsPath = join(homedir(), '.claude', 'projects')
    const allEntries: ParsedUsageEntry[] = []
    const processedHashes = new Set<string>()

    try {
      const projectDirs = await readdir(claudeProjectsPath, { withFileTypes: true })
      
      // Process files in parallel for better performance
      const filePromises: Promise<ParsedUsageEntry[]>[] = []
      
      for (const projectDir of projectDirs) {
        if (!projectDir.isDirectory()) continue

        const projectPath = join(claudeProjectsPath, projectDir.name)
        
        try {
          const files = await readdir(projectPath, { withFileTypes: true })
          
          for (const file of files) {
            if (file.name.endsWith('.jsonl')) {
              const filePath = join(projectPath, file.name)
              filePromises.push(
                this.parseJsonlFile(filePath, projectDir.name, processedHashes)
              )
            }
          }
        } catch (error) {
          console.error(`Failed to read project directory ${projectPath}:`, error)
        }
      }

      // Wait for all files to be processed
      const results = await Promise.all(filePromises)
      for (const entries of results) {
        allEntries.push(...entries)
      }
      
    } catch (error) {
      console.error('Failed to read Claude projects directory:', error)
    }

    // Sort by timestamp
    allEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    return allEntries
  }

  private async parseJsonlFile(
    filePath: string, 
    encodedProjectName: string, 
    processedHashes: Set<string>
  ): Promise<ParsedUsageEntry[]> {
    const entries: ParsedUsageEntry[] = []
    let actualProjectPath: string | null = null

    try {
      const content = await readFile(filePath, 'utf8')
      
      // Extract session ID from the file path
      const sessionId = filePath.split('/').pop()?.replace('.jsonl', '') || 'unknown'

      for (const line of content.split('\n')) {
        if (!line.trim()) continue

        try {
          const jsonValue = JSON.parse(line)

          // Extract the actual project path from cwd if we haven't already
          if (!actualProjectPath && jsonValue.cwd) {
            actualProjectPath = jsonValue.cwd
          }

          // Check if this entry has usage data
          if (jsonValue.message?.usage) {
            const message = jsonValue.message
            const usage = message.usage

            // Deduplication based on message ID and request ID
            if (message.id && jsonValue.requestId) {
              const uniqueHash = `${message.id}:${jsonValue.requestId}`
              if (processedHashes.has(uniqueHash)) {
                continue // Skip duplicate entry
              }
              processedHashes.add(uniqueHash)
            }

            // Skip entries without meaningful token usage
            if (!(usage.input_tokens || 0) && !(usage.output_tokens || 0) && 
                !(usage.cache_creation_input_tokens || 0) && !(usage.cache_read_input_tokens || 0)) {
              continue
            }

            const cost = jsonValue.costUSD || (message.model ? this.calculateCost(message.model, usage) : 0)

            // Use actual project path if found, otherwise use encoded name
            const projectPath = actualProjectPath || encodedProjectName

            entries.push({
              timestamp: jsonValue.timestamp,
              model: message.model || 'unknown',
              input_tokens: usage.input_tokens || 0,
              output_tokens: usage.output_tokens || 0,
              cache_creation_tokens: usage.cache_creation_input_tokens || 0,
              cache_read_tokens: usage.cache_read_input_tokens || 0,
              cost,
              session_id: jsonValue.sessionId || sessionId,
              project_path: projectPath
            })
          }
        } catch (parseError) {
          // Skip malformed JSON lines
          continue
        }
      }
    } catch (error) {
      console.error(`Failed to parse JSONL file ${filePath}:`, error)
    }

    return entries
  }

  private calculateCost(model: string, usage: RawUsageData): number {
    const inputTokens = usage.input_tokens || 0
    const outputTokens = usage.output_tokens || 0
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0
    const cacheReadTokens = usage.cache_read_input_tokens || 0

    // Claude 4 pricing constants (per million tokens)
    let inputPrice = 0, outputPrice = 0, cacheWritePrice = 0, cacheReadPrice = 0

    if (model.includes('opus-4') || model.includes('claude-opus-4')) {
      inputPrice = 15.0
      outputPrice = 75.0
      cacheWritePrice = 18.75
      cacheReadPrice = 1.50
    } else if (model.includes('sonnet-4') || model.includes('claude-sonnet-4')) {
      inputPrice = 3.0
      outputPrice = 15.0
      cacheWritePrice = 3.75
      cacheReadPrice = 0.30
    }

    // Calculate cost (prices are per million tokens)
    const cost = (inputTokens * inputPrice / 1_000_000) +
                 (outputTokens * outputPrice / 1_000_000) +
                 (cacheCreationTokens * cacheWritePrice / 1_000_000) +
                 (cacheReadTokens * cacheReadPrice / 1_000_000)

    return cost
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expires) {
        this.cache.delete(key)
      }
    }
  }

  private enforceMaxCacheSize(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) return

    // Remove oldest entries first
    const entries = Array.from(this.cache.entries())
    entries.sort((a, b) => a[1].lastModified - b[1].lastModified)
    
    const toRemove = this.cache.size - this.MAX_CACHE_SIZE
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0])
    }
  }

  public clearCache(): void {
    this.cache.clear()
    this.fileInfoCache.clear()
    console.log('🗑️ Usage data cache cleared')
  }

  public getCacheStats(): { size: number, entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    }
  }

  /**
   * Add a new entry to the cache immediately
   * This allows for real-time cache updates when new entries are created
   */
  public async addEntry(entry: ParsedUsageEntry): Promise<void> {
    const cacheKey = 'all_usage_data'
    const cached = this.cache.get(cacheKey)
    
    if (cached && Date.now() < cached.expires) {
      // Add the new entry to existing cache
      cached.data.push(entry)
      // Resort by timestamp to maintain order
      cached.data.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      console.log('📝 Added new entry to cache')
    } else {
      // Cache is expired or doesn't exist, clear it so next request will reload fresh data
      this.cache.delete(cacheKey)
      console.log('🔄 Cache expired, cleared for fresh reload')
    }
  }

  /**
   * Get pre-calculated usage statistics
   * This method provides a high-level overview of cached data
   */
  public async getStats(): Promise<{
    total_entries: number;
    total_cost: number;
    total_tokens: number;
    unique_sessions: number;
    unique_models: number;
    unique_projects: number;
    date_range: { start: string; end: string } | null;
    cache_info: { size: number; last_updated: number | null };
  }> {
    const data = await this.getCachedUsageData()
    
    if (data.length === 0) {
      return {
        total_entries: 0,
        total_cost: 0,
        total_tokens: 0,
        unique_sessions: 0,
        unique_models: 0,
        unique_projects: 0,
        date_range: null,
        cache_info: { size: this.cache.size, last_updated: null }
      }
    }
    
    const totalCost = data.reduce((sum, entry) => sum + entry.cost, 0)
    const totalTokens = data.reduce((sum, entry) => 
      sum + entry.input_tokens + entry.output_tokens + entry.cache_creation_tokens + entry.cache_read_tokens, 0
    )
    
    const uniqueSessions = new Set(data.map(entry => entry.session_id))
    const uniqueModels = new Set(data.map(entry => entry.model))
    const uniqueProjects = new Set(data.map(entry => entry.project_path))
    
    // Find date range
    const dates = data.map(entry => entry.timestamp.split('T')[0]).sort()
    const dateRange = dates.length > 0 ? {
      start: dates[0],
      end: dates[dates.length - 1]
    } : null
    
    const cacheKey = 'all_usage_data'
    const cached = this.cache.get(cacheKey)
    
    return {
      total_entries: data.length,
      total_cost: totalCost,
      total_tokens: totalTokens,
      unique_sessions: uniqueSessions.size,
      unique_models: uniqueModels.size,
      unique_projects: uniqueProjects.size,
      date_range: dateRange,
      cache_info: {
        size: this.cache.size,
        last_updated: cached?.lastModified || null
      }
    }
  }
}

// Export singleton instance
export const usageDataCache = new UsageDataCache()