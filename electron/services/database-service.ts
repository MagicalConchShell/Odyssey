import Database from 'better-sqlite3'
import {join} from 'path'
import {homedir} from 'os'
import {existsSync, mkdirSync} from 'fs'



export interface Project {
  id: string
  name: string
  path: string
  type: 'manual' | 'claude-imported'
  last_opened: number
  is_pinned: boolean
  tags?: string[]
  claude_project_id?: string
  created_at: number
  updated_at: number
}

/**
 * Manages SQLite database operations for Odyssey.
 * Handles project management and environment variables.
 * Uses better-sqlite3 with WAL mode for better performance and concurrency.
 */
class DatabaseManager {
  private db: Database.Database | null = null
  private readonly dbPath: string

  constructor() {
    const odysseyDir = join(homedir(), '.odyssey')
    this.dbPath = join(odysseyDir, 'odyssey.db')
  }

  /**
   * Initializes the database connection and creates tables if they don't exist.
   * Sets up SQLite pragmas for optimal performance (WAL mode, memory temp store, etc.).
   */
  initialize(): void {
    if (this.db) return

    // Ensure .odyssey directory exists
    this.ensureOdysseyDirectory()

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = 1000')
    this.db.pragma('temp_store = MEMORY')

    this.createTables()
  }

  /**
   * Creates all required database tables with proper schemas.
   * Includes tables for project management and environment variables.
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized')

    // Create projects table
    this.db.exec(`
        CREATE TABLE IF NOT EXISTS projects
        (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL DEFAULT 'manual',
            last_opened INTEGER NOT NULL,
            is_pinned BOOLEAN DEFAULT FALSE,
            tags TEXT,
            claude_project_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `)


    // Create environment_variables table
    this.db.exec(`
        CREATE TABLE IF NOT EXISTS environment_variables
        (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `)

    // Create indexes for better performance
    this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened);
        CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
        CREATE INDEX IF NOT EXISTS idx_environment_variables_key ON environment_variables(key);
    `)

  }

  /**
   * Ensures the .odyssey directory exists in the user's home directory.
   */
  private ensureOdysseyDirectory(): void {
    const odysseyDir = join(homedir(), '.odyssey')

    if (!existsSync(odysseyDir)) {
      try {
        mkdirSync(odysseyDir, {recursive: true})
        console.log(`Created .odyssey directory at: ${odysseyDir}`)
      } catch (error) {
        console.error(`Failed to create .odyssey directory: ${error}`)
        throw new Error(`Failed to create .odyssey directory: ${error}`)
      }
    }
  }


  // Project operations
  createProject(project: Omit<Project, 'created_at' | 'updated_at'>): Project {
    if (!this.db) throw new Error('Database not initialized')

    const now = Date.now()
    const stmt = this.db.prepare(`
        INSERT INTO projects (id, name, path, type, last_opened, is_pinned, tags, claude_project_id, created_at,
                              updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      project.id,
      project.name,
      project.path,
      project.type,
      project.last_opened,
      project.is_pinned ? 1 : 0,  // Convert boolean to integer for SQLite
      project.tags ? JSON.stringify(project.tags) : null,
      project.claude_project_id || null,
      now,
      now
    )

    return this.getProject(project.id)!
  }

  getProject(id: string): Project | null {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?')
    const result = stmt.get(id) as any

    if (!result) return null

    return {
      ...result,
      is_pinned: Boolean(result.is_pinned),
      tags: result.tags ? JSON.parse(result.tags) : undefined
    }
  }

  getAllProjects(): Project[] {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const stmt = this.db.prepare('SELECT * FROM projects ORDER BY is_pinned DESC, last_opened DESC')
      const results = stmt.all() as any[]

      return results.map(result => ({
        ...result,
        is_pinned: Boolean(result.is_pinned),
        tags: result.tags ? JSON.parse(result.tags) : undefined
      }))
    } catch (error) {
      console.error('Error getting projects from database:', error)
      // If table doesn't exist yet, return empty array
      if (error instanceof Error && error.message.includes('no such table')) {
        console.warn('Projects table does not exist yet, returning empty array')
        return []
      }
      throw error
    }
  }

  updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'last_opened' | 'is_pinned' | 'tags'>>): Project | null {
    if (!this.db) throw new Error('Database not initialized')

    const fields = []
    const values = []

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.last_opened !== undefined) {
      fields.push('last_opened = ?')
      values.push(updates.last_opened)
    }
    if (updates.is_pinned !== undefined) {
      fields.push('is_pinned = ?')
      values.push(updates.is_pinned ? 1 : 0)  // Convert boolean to integer for SQLite
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?')
      values.push(updates.tags ? JSON.stringify(updates.tags) : null)
    }

    if (fields.length === 0) return this.getProject(id)

    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = this.db.prepare(`UPDATE projects
                                  SET ${fields.join(', ')}
                                  WHERE id = ?`)
    stmt.run(...values)

    return this.getProject(id)
  }

  deleteProject(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?')
    const result = stmt.run(id)

    return result.changes > 0
  }

  getProjectByPath(path: string): Project | null {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const stmt = this.db.prepare('SELECT * FROM projects WHERE path = ?')
      const result = stmt.get(path) as any

      if (!result) return null

      return {
        ...result,
        is_pinned: Boolean(result.is_pinned),
        tags: result.tags ? JSON.parse(result.tags) : undefined
      }
    } catch (error) {
      console.error('Error getting project by path from database:', error)
      // If table doesn't exist yet, return null
      if (error instanceof Error && error.message.includes('no such table')) {
        console.warn('Projects table does not exist yet, returning null')
        return null
      }
      throw error
    }
  }

  /**
   * Get all environment variables from the database
   */
  getEnvironmentVariables(): Record<string, string> {
    if (!this.db) {
      this.initialize()
    }

    if (!this.db) throw new Error('Database not initialized')

    try {
      const stmt = this.db.prepare('SELECT key, value FROM environment_variables ORDER BY key')
      const rows = stmt.all() as Array<{ key: string; value: string }>
      
      const result: Record<string, string> = {}
      for (const row of rows) {
        result[row.key] = row.value
      }
      
      return result
    } catch (error) {
      console.error('Error getting environment variables from database:', error)
      // If table doesn't exist yet, return empty object
      if (error instanceof Error && error.message.includes('no such table')) {
        console.warn('Environment variables table does not exist yet, returning empty object')
        return {}
      }
      throw error
    }
  }

  /**
   * Save environment variables to the database (replaces all existing)
   */
  saveEnvironmentVariables(env: Record<string, string>): void {
    if (!this.db) {
      this.initialize()
    }

    if (!this.db) throw new Error('Database not initialized')

    try {
      // Use transaction for consistency
      this.db.transaction(() => {
        // Clear all existing environment variables
        this.db!.prepare('DELETE FROM environment_variables').run()
        
        // Insert new environment variables
        const insertStmt = this.db!.prepare(`
          INSERT INTO environment_variables (key, value, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `)
        
        const now = Date.now()
        
        for (const [key, value] of Object.entries(env)) {
          if (key.trim() && value.trim()) {
            insertStmt.run(key, value, now, now)
          }
        }
      })()
    } catch (error) {
      console.error('Error saving environment variables to database:', error)
      throw error
    }
  }


  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export const dbManager = new DatabaseManager()