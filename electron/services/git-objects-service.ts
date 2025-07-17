import { promises as fs } from 'fs';
import { join, dirname, relative } from 'path';
import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import micromatch from 'micromatch';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Git-style object types
 */
export type GitObjectType = 'blob' | 'tree' | 'commit';

/**
 * Git object interface
 */
export interface GitObject {
  type: GitObjectType;
  hash: string;
  size: number;
}

/**
 * Blob object - stores file content
 */
export interface BlobObject extends GitObject {
  type: 'blob';
  content: Buffer;
}

/**
 * Tree entry - files or subdirectories in a directory
 */
export interface TreeEntry {
  name: string;           // File/directory name
  mode: number;           // File permissions
  type: 'blob' | 'tree';  // Object type
  hash: string;           // Object hash
  size: number;           // Object size
}

/**
 * Tree object - stores directory structure
 */
export interface TreeObject extends GitObject {
  type: 'tree';
  entries: TreeEntry[];
}

/**
 * Commit object - stores checkpoint information
 */
export interface CommitObject extends GitObject {
  type: 'commit';
  tree: string;           // Root tree object hash
  parents: string[];      // Parent commit hash list
  author: string;         // Author
  timestamp: string;      // Timestamp
  message: string;        // Commit message
}

/**
 * Object storage statistics
 */
export interface ObjectStoreStats {
  totalObjects: number;
  blobCount: number;
  treeCount: number;
  commitCount: number;
  totalSize: number;
  compressionRatio: number;
}

/**
 * Git-style object storage system
 */
export class GitObjectStore {
  private objectsDir: string;
  private compressionLevel: number;
  private objectsCache: { objects: string[], timestamp: number } | null = null;
  private readonly cacheTimeout = 5000; // 5 seconds cache timeout

  constructor(baseDir: string, compressionLevel = 6) {
    this.objectsDir = join(baseDir, 'objects');
    this.compressionLevel = compressionLevel;
  }

  /**
   * Initialize object storage
   */
  async init(): Promise<void> {
    await fs.mkdir(this.objectsDir, { recursive: true });
  }

  /**
   * Clear object cache
   */
  private invalidateCache(): void {
    this.objectsCache = null;
  }

  /**
   * Store Blob object
   */
  async storeBlob(content: Buffer): Promise<string> {
    const hash = this.hashContent('blob', content);
    const objectPath = this.getObjectPath(hash);
    
    // Check if already exists
    try {
      await fs.access(objectPath);
      return hash;
    } catch {
      // Does not exist, need to create
    }

    // Create object content
    const header = Buffer.from(`blob ${content.length}\0`);
    const fullContent = Buffer.concat([header, content]);
    
    // Compressed storage
    const compressed = await gzipAsync(fullContent, { level: this.compressionLevel });
    
    // Atomic write
    await this.atomicWrite(objectPath, compressed);
    
    // Clear cache because new object was added
    this.invalidateCache();
    
    return hash;
  }

  /**
   * Store Tree object
   */
  async storeTree(entries: TreeEntry[]): Promise<string> {
    // Sort entries by name (Git compatible)
    const sortedEntries = [...entries].sort((a, b) => {
      // Add '/' after directory names for sorting
      const aName = a.type === 'tree' ? a.name + '/' : a.name;
      const bName = b.type === 'tree' ? b.name + '/' : b.name;
      return aName.localeCompare(bName);
    });

    // Create tree content
    const treeContent = this.serializeTreeEntries(sortedEntries);
    const hash = this.hashContent('tree', treeContent);
    const objectPath = this.getObjectPath(hash);
    
    // Check if already exists
    try {
      await fs.access(objectPath);
      return hash;
    } catch {
      // Does not exist, need to create
    }

    // Create object content
    const header = Buffer.from(`tree ${treeContent.length}\0`);
    const fullContent = Buffer.concat([header, treeContent]);
    
    // Compressed storage
    const compressed = await gzipAsync(fullContent, { level: this.compressionLevel });
    
    // Atomic write
    await this.atomicWrite(objectPath, compressed);
    
    // Clear cache because new object was added
    this.invalidateCache();
    
    return hash;
  }

  /**
   * Store Commit object
   */
  async storeCommit(commit: Omit<CommitObject, 'type' | 'hash' | 'size'>): Promise<string> {
    const commitContent = this.serializeCommit(commit);
    const hash = this.hashContent('commit', commitContent);
    const objectPath = this.getObjectPath(hash);
    
    // Check if already exists
    try {
      await fs.access(objectPath);
      return hash;
    } catch {
      // Does not exist, need to create
    }

    // Create object content
    const header = Buffer.from(`commit ${commitContent.length}\0`);
    const fullContent = Buffer.concat([header, commitContent]);
    
    // Compressed storage
    const compressed = await gzipAsync(fullContent, { level: this.compressionLevel });
    
    // Atomic write
    await this.atomicWrite(objectPath, compressed);
    
    // Clear cache because new object was added
    this.invalidateCache();
    
    return hash;
  }

  /**
   * Read object
   */
  async readObject(hash: string): Promise<GitObject | null> {
    const objectPath = this.getObjectPath(hash);
    
    try {
      const compressed = await fs.readFile(objectPath);
      const content = await gunzipAsync(compressed);
      
      // Parse object header
      const nullIndex = content.indexOf(0);
      if (nullIndex === -1) {
        throw new Error('Invalid object format');
      }
      
      const header = content.subarray(0, nullIndex).toString('utf8');
      const body = content.subarray(nullIndex + 1);
      
      const [type, sizeStr] = header.split(' ');
      const size = parseInt(sizeStr, 10);
      
      if (body.length !== size) {
        throw new Error('Object size mismatch');
      }
      
      switch (type as GitObjectType) {
        case 'blob':
          return {
            type: 'blob',
            hash,
            size,
            content: body
          } as BlobObject;
          
        case 'tree':
          return {
            type: 'tree',
            hash,
            size,
            entries: this.parseTreeEntries(body)
          } as TreeObject;
          
        case 'commit':
          return {
            type: 'commit',
            hash,
            size,
            ...this.parseCommit(body)
          } as CommitObject;
          
        default:
          throw new Error(`Unknown object type: ${type}`);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if object exists
   */
  async hasObject(hash: string): Promise<boolean> {
    const objectPath = this.getObjectPath(hash);
    try {
      await fs.access(objectPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all objects
   */
  async listObjects(): Promise<string[]> {
    // Check cache first
    const now = Date.now();
    if (this.objectsCache && (now - this.objectsCache.timestamp) < this.cacheTimeout) {
      return this.objectsCache.objects;
    }
    
    const objects: string[] = [];
    
    try {
      const dirs = await fs.readdir(this.objectsDir, { withFileTypes: true });
      
      for (const dir of dirs) {
        if (dir.isDirectory() && dir.name.length === 2) {
          const subDir = join(this.objectsDir, dir.name);
          const files = await fs.readdir(subDir);
          
          for (const file of files) {
            if (file.length === 62) { // 64 - 2 = 62 (for SHA-256)
              objects.push(dir.name + file);
            }
          }
        }
      }
    } catch (error) {
      // Directory does not exist or is empty
    }
    
    // Update cache
    this.objectsCache = {
      objects: objects,
      timestamp: now
    };
    
    return objects;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<ObjectStoreStats> {
    const objects = await this.listObjects();
    
    let blobCount = 0;
    let treeCount = 0;
    let commitCount = 0;
    let totalSize = 0;
    let originalSize = 0;
    
    for (const hash of objects) {
      const obj = await this.readObject(hash);
      if (obj) {
        switch (obj.type) {
          case 'blob':
            blobCount++;
            originalSize += obj.size;
            break;
          case 'tree':
            treeCount++;
            break;
          case 'commit':
            commitCount++;
            break;
        }
        
        // Calculate compressed size
        const objectPath = this.getObjectPath(hash);
        const stat = await fs.stat(objectPath);
        totalSize += stat.size;
      }
    }
    
    return {
      totalObjects: objects.length,
      blobCount,
      treeCount,
      commitCount,
      totalSize,
      compressionRatio: originalSize > 0 ? totalSize / originalSize : 0
    };
  }

  /**
   * Delete object
   */
  async deleteObject(hash: string): Promise<void> {
    const objectPath = this.getObjectPath(hash);
    await fs.unlink(objectPath);
  }

  /**
   * Calculate content hash
   */
  private hashContent(type: GitObjectType, content: Buffer): string {
    const header = Buffer.from(`${type} ${content.length}\0`);
    const fullContent = Buffer.concat([header, content]);
    return createHash('sha256').update(fullContent).digest('hex');
  }

  /**
   * Get object file path
   */
  private getObjectPath(hash: string): string {
    const dir = hash.substring(0, 2);
    const file = hash.substring(2);
    return join(this.objectsDir, dir, file);
  }

  /**
   * Serialize Tree entries
   */
  private serializeTreeEntries(entries: TreeEntry[]): Buffer {
    const buffers: Buffer[] = [];
    
    for (const entry of entries) {
      // Mode + space + name + space + size + NULL + hash(binary)
      const mode = entry.mode.toString(8);
      const modeBuffer = Buffer.from(mode + ' ' + entry.name + ' ' + entry.size + '\0');
      const hashBuffer = Buffer.from(entry.hash, 'hex');
      
      buffers.push(modeBuffer, hashBuffer);
    }
    
    return Buffer.concat(buffers);
  }

  /**
   * Parse Tree entries
   */
  private parseTreeEntries(content: Buffer): TreeEntry[] {
    const entries: TreeEntry[] = [];
    let offset = 0;
    
    while (offset < content.length) {
      // Find first space (end of mode)
      const spaceIndex = content.indexOf(32, offset); // 32 = ' '
      if (spaceIndex === -1) break;
      
      const mode = parseInt(content.subarray(offset, spaceIndex).toString('utf8'), 8);
      
      // Find second space (end of name)
      const secondSpaceIndex = content.indexOf(32, spaceIndex + 1);
      if (secondSpaceIndex === -1) {
        // Legacy format compatibility: if no second space, use NULL character as name end
        const nullIndex = content.indexOf(0, spaceIndex + 1);
        if (nullIndex === -1) break;
        
        const name = content.subarray(spaceIndex + 1, nullIndex).toString('utf8');
        
        // Read hash (32 bytes)
        if (nullIndex + 32 > content.length) break;
        const hash = content.subarray(nullIndex + 1, nullIndex + 33).toString('hex');
        
        // Determine type based on mode
        const type = (mode & 0o170000) === 0o040000 ? 'tree' : 'blob';
        
        entries.push({
          name,
          mode,
          type,
          hash,
          size: 0 // Legacy format defaults to 0
        });
        
        offset = nullIndex + 33;
        continue;
      }
      
      // New format: mode + space + name + space + size + NULL + hash
      const name = content.subarray(spaceIndex + 1, secondSpaceIndex).toString('utf8');
      
      // Find NULL character (end of size)
      const nullIndex = content.indexOf(0, secondSpaceIndex + 1);
      if (nullIndex === -1) break;
      
      const size = parseInt(content.subarray(secondSpaceIndex + 1, nullIndex).toString('utf8'), 10);
      
      // 读取哈希（32字节）
      if (nullIndex + 32 > content.length) break;
      const hash = content.subarray(nullIndex + 1, nullIndex + 33).toString('hex');
      
      // 根据模式确定类型
      const type = (mode & 0o170000) === 0o040000 ? 'tree' : 'blob';
      
      entries.push({
        name,
        mode,
        type,
        hash,
        size: isNaN(size) ? 0 : size
      });
      
      offset = nullIndex + 33;
    }
    
    return entries;
  }

  /**
   * Serialize Commit object
   */
  private serializeCommit(commit: Omit<CommitObject, 'type' | 'hash' | 'size'>): Buffer {
    let content = `tree ${commit.tree}\n`;
    
    if (commit.parents) {
      for (const parent of commit.parents) {
        content += `parent ${parent}\n`;
      }
    }
    
    content += `author ${commit.author}\n`;
    content += `timestamp ${commit.timestamp}\n`;
    content += `\n${commit.message}`;
    
    return Buffer.from(content, 'utf8');
  }

  /**
   * Parse Commit object
   */
  private parseCommit(content: Buffer): Omit<CommitObject, 'type' | 'hash' | 'size'> {
    const text = content.toString('utf8');
    const lines = text.split('\n');
    
    const commit: any = { parents: [] };
    let messageStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line === '') {
        messageStart = i + 1;
        break;
      }
      
      if (line.startsWith('tree ')) {
        commit.tree = line.substring(5);
      } else if (line.startsWith('parent ')) {
        commit.parents.push(line.substring(7));
      } else if (line.startsWith('author ')) {
        commit.author = line.substring(7);
      } else if (line.startsWith('timestamp ')) {
        commit.timestamp = line.substring(10);
      }
    }
    
    if (messageStart >= 0) {
      commit.message = lines.slice(messageStart).join('\n');
    }
    
    return commit;
  }

  /**
   * Atomic file write
   */
  private async atomicWrite(filePath: string, content: Buffer): Promise<void> {
    const dir = dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    
    try {
      await fs.writeFile(tempPath, content);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temporary file
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}

/**
 * Directory scanner - build Tree objects
 */
export class DirectoryTreeBuilder {
  private objectStore: GitObjectStore;
  private ignorePatterns: string[];
  private maxFileSize: number;

  constructor(
    objectStore: GitObjectStore,
    ignorePatterns: string[] = [],
    maxFileSize = 100 * 1024 * 1024
  ) {
    this.objectStore = objectStore;
    this.ignorePatterns = ignorePatterns;
    this.maxFileSize = maxFileSize;
  }

  /**
   * Build directory tree
   */
  async buildTree(directoryPath: string): Promise<string> {
    const entries = await this.scanDirectory(directoryPath);
    return this.objectStore.storeTree(entries);
  }

  /**
   * Scan directory
   */
  private async scanDirectory(dirPath: string): Promise<TreeEntry[]> {
    const entries: TreeEntry[] = [];
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = join(dirPath, item.name);
        const relativePath = relative(dirPath, itemPath);
        
        // Check if should be ignored
        if (this.shouldIgnore(relativePath)) {
          continue;
        }
        
        if (item.isFile()) {
          const stat = await fs.stat(itemPath);
          
          // Skip oversized files
          if (stat.size > this.maxFileSize) {
            console.warn(`Skipping large file: ${relativePath} (${stat.size} bytes)`);
            continue;
          }
          
          // 存储文件内容
          const content = await fs.readFile(itemPath);
          const hash = await this.objectStore.storeBlob(content);
          
          entries.push({
            name: item.name,
            mode: stat.mode,
            type: 'blob',
            hash,
            size: stat.size
          });
        } else if (item.isDirectory()) {
          // 递归处理子目录
          const subEntries = await this.scanDirectory(itemPath);
          
          // 跳过空目录以匹配Git行为
          // Git不跟踪空目录，只有包含文件或子目录的目录才会被跟踪
          if (subEntries.length === 0) {
            continue;
          }
          
          const subTreeHash = await this.objectStore.storeTree(subEntries);
          const stat = await fs.stat(itemPath);
          
          entries.push({
            name: item.name,
            mode: stat.mode,
            type: 'tree',
            hash: subTreeHash,
            size: 0
          });
        }
      }
    } catch (error: any) {
      console.warn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
    
    return entries;
  }

  /**
   * 检查是否应该忽略文件 - 使用 micromatch 进行标准 glob 模式匹配
   */
  private shouldIgnore(relativePath: string): boolean {
    if (this.ignorePatterns.length === 0) {
      return false;
    }
    
    // 使用 micromatch 进行标准 glob 模式匹配
    // 支持标准的 gitignore 模式如：
    // - *.ts (所有 TypeScript 文件)
    // - src/**/*.js (src 目录下的所有 JavaScript 文件)
    // - node_modules/** (node_modules 目录下的所有文件)
    // - !important.js (排除特定文件)
    try {
      return micromatch.isMatch(relativePath, this.ignorePatterns, {
        dot: true,  // 匹配以 . 开头的文件
        matchBase: true,  // 匹配基础名称
        nobrace: false,  // 启用 brace expansion
        nocase: false,  // 区分大小写
        noext: false,  // 启用 extglob
        strictSlashes: false  // 不严格匹配斜杠
      });
    } catch (error) {
      // 如果模式匹配失败，记录错误并回退到简单匹配
      console.warn(`Error matching ignore pattern for ${relativePath}:`, error);
      return this.fallbackShouldIgnore(relativePath);
    }
  }
  
  /**
   * 回退的简单模式匹配（用于 micromatch 失败的情况）
   */
  private fallbackShouldIgnore(relativePath: string): boolean {
    return this.ignorePatterns.some(pattern => {
      if (pattern.endsWith('/**')) {
        const prefix = pattern.slice(0, -3);
        return relativePath.startsWith(prefix);
      }
      if (pattern.startsWith('*')) {
        const suffix = pattern.slice(1);
        return relativePath.endsWith(suffix);
      }
      return relativePath === pattern || relativePath.includes(pattern);
    });
  }
}