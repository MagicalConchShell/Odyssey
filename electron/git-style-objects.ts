import { promises as fs } from 'fs';
import { join, dirname, relative } from 'path';
import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import micromatch from 'micromatch';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Git风格的对象类型
 */
export type GitObjectType = 'blob' | 'tree' | 'commit';

/**
 * Git对象接口
 */
export interface GitObject {
  type: GitObjectType;
  hash: string;
  size: number;
}

/**
 * Blob对象 - 存储文件内容
 */
export interface BlobObject extends GitObject {
  type: 'blob';
  content: Buffer;
}

/**
 * Tree条目 - 目录中的文件或子目录
 */
export interface TreeEntry {
  name: string;           // 文件/目录名
  mode: number;           // 文件权限
  type: 'blob' | 'tree';  // 对象类型
  hash: string;           // 对象哈希
  size: number;           // 对象大小
}

/**
 * Tree对象 - 存储目录结构
 */
export interface TreeObject extends GitObject {
  type: 'tree';
  entries: TreeEntry[];
}

/**
 * Commit对象 - 存储检查点信息
 */
export interface CommitObject extends GitObject {
  type: 'commit';
  tree: string;           // 根tree对象哈希
  parents: string[];      // 父commit哈希列表
  author: string;         // 作者
  timestamp: string;      // 时间戳
  message: string;        // 提交消息
}

/**
 * 对象存储统计信息
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
 * Git风格的对象存储系统
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
   * 初始化对象存储
   */
  async init(): Promise<void> {
    await fs.mkdir(this.objectsDir, { recursive: true });
  }

  /**
   * 清除对象缓存
   */
  private invalidateCache(): void {
    this.objectsCache = null;
  }

  /**
   * 存储Blob对象
   */
  async storeBlob(content: Buffer): Promise<string> {
    const hash = this.hashContent('blob', content);
    const objectPath = this.getObjectPath(hash);
    
    // 检查是否已存在
    try {
      await fs.access(objectPath);
      return hash;
    } catch {
      // 不存在，需要创建
    }

    // 创建对象内容
    const header = Buffer.from(`blob ${content.length}\0`);
    const fullContent = Buffer.concat([header, content]);
    
    // 压缩存储
    const compressed = await gzipAsync(fullContent, { level: this.compressionLevel });
    
    // 原子写入
    await this.atomicWrite(objectPath, compressed);
    
    // 清除缓存因为添加了新对象
    this.invalidateCache();
    
    return hash;
  }

  /**
   * 存储Tree对象
   */
  async storeTree(entries: TreeEntry[]): Promise<string> {
    // 按名称排序条目（Git兼容）
    const sortedEntries = [...entries].sort((a, b) => {
      // 目录名后面加'/'进行排序
      const aName = a.type === 'tree' ? a.name + '/' : a.name;
      const bName = b.type === 'tree' ? b.name + '/' : b.name;
      return aName.localeCompare(bName);
    });

    // 创建tree内容
    const treeContent = this.serializeTreeEntries(sortedEntries);
    const hash = this.hashContent('tree', treeContent);
    const objectPath = this.getObjectPath(hash);
    
    // 检查是否已存在
    try {
      await fs.access(objectPath);
      return hash;
    } catch {
      // 不存在，需要创建
    }

    // 创建对象内容
    const header = Buffer.from(`tree ${treeContent.length}\0`);
    const fullContent = Buffer.concat([header, treeContent]);
    
    // 压缩存储
    const compressed = await gzipAsync(fullContent, { level: this.compressionLevel });
    
    // 原子写入
    await this.atomicWrite(objectPath, compressed);
    
    // 清除缓存因为添加了新对象
    this.invalidateCache();
    
    return hash;
  }

  /**
   * 存储Commit对象
   */
  async storeCommit(commit: Omit<CommitObject, 'type' | 'hash' | 'size'>): Promise<string> {
    const commitContent = this.serializeCommit(commit);
    const hash = this.hashContent('commit', commitContent);
    const objectPath = this.getObjectPath(hash);
    
    // 检查是否已存在
    try {
      await fs.access(objectPath);
      return hash;
    } catch {
      // 不存在，需要创建
    }

    // 创建对象内容
    const header = Buffer.from(`commit ${commitContent.length}\0`);
    const fullContent = Buffer.concat([header, commitContent]);
    
    // 压缩存储
    const compressed = await gzipAsync(fullContent, { level: this.compressionLevel });
    
    // 原子写入
    await this.atomicWrite(objectPath, compressed);
    
    // 清除缓存因为添加了新对象
    this.invalidateCache();
    
    return hash;
  }

  /**
   * 读取对象
   */
  async readObject(hash: string): Promise<GitObject | null> {
    const objectPath = this.getObjectPath(hash);
    
    try {
      const compressed = await fs.readFile(objectPath);
      const content = await gunzipAsync(compressed);
      
      // 解析对象头部
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
   * 检查对象是否存在
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
   * 列出所有对象
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
      // 目录不存在或为空
    }
    
    // Update cache
    this.objectsCache = {
      objects: objects,
      timestamp: now
    };
    
    return objects;
  }

  /**
   * 获取存储统计信息
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
        
        // 计算压缩后的大小
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
   * 删除对象
   */
  async deleteObject(hash: string): Promise<void> {
    const objectPath = this.getObjectPath(hash);
    await fs.unlink(objectPath);
  }

  /**
   * 计算内容哈希
   */
  private hashContent(type: GitObjectType, content: Buffer): string {
    const header = Buffer.from(`${type} ${content.length}\0`);
    const fullContent = Buffer.concat([header, content]);
    return createHash('sha256').update(fullContent).digest('hex');
  }

  /**
   * 获取对象文件路径
   */
  private getObjectPath(hash: string): string {
    const dir = hash.substring(0, 2);
    const file = hash.substring(2);
    return join(this.objectsDir, dir, file);
  }

  /**
   * 序列化Tree条目
   */
  private serializeTreeEntries(entries: TreeEntry[]): Buffer {
    const buffers: Buffer[] = [];
    
    for (const entry of entries) {
      // 模式 + 空格 + 名称 + 空格 + 大小 + NULL + 哈希(二进制)
      const mode = entry.mode.toString(8);
      const modeBuffer = Buffer.from(mode + ' ' + entry.name + ' ' + entry.size + '\0');
      const hashBuffer = Buffer.from(entry.hash, 'hex');
      
      buffers.push(modeBuffer, hashBuffer);
    }
    
    return Buffer.concat(buffers);
  }

  /**
   * 解析Tree条目
   */
  private parseTreeEntries(content: Buffer): TreeEntry[] {
    const entries: TreeEntry[] = [];
    let offset = 0;
    
    while (offset < content.length) {
      // 找到第一个空格（模式结束）
      const spaceIndex = content.indexOf(32, offset); // 32 = ' '
      if (spaceIndex === -1) break;
      
      const mode = parseInt(content.subarray(offset, spaceIndex).toString('utf8'), 8);
      
      // 找到第二个空格（名称结束）
      const secondSpaceIndex = content.indexOf(32, spaceIndex + 1);
      if (secondSpaceIndex === -1) {
        // 旧格式兼容：如果没有第二个空格，使用NULL字符作为名称结束
        const nullIndex = content.indexOf(0, spaceIndex + 1);
        if (nullIndex === -1) break;
        
        const name = content.subarray(spaceIndex + 1, nullIndex).toString('utf8');
        
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
          size: 0 // 旧格式默认为0
        });
        
        offset = nullIndex + 33;
        continue;
      }
      
      // 新格式：模式 + 空格 + 名称 + 空格 + 大小 + NULL + 哈希
      const name = content.subarray(spaceIndex + 1, secondSpaceIndex).toString('utf8');
      
      // 找到NULL字符（大小结束）
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
   * 序列化Commit对象
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
   * 解析Commit对象
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
   * 原子写入文件
   */
  private async atomicWrite(filePath: string, content: Buffer): Promise<void> {
    const dir = dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    
    try {
      await fs.writeFile(tempPath, content);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // 清理临时文件
      try {
        await fs.unlink(tempPath);
      } catch {
        // 忽略清理错误
      }
      throw error;
    }
  }
}

/**
 * 目录扫描器 - 构建Tree对象
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
   * 构建目录树
   */
  async buildTree(directoryPath: string): Promise<string> {
    const entries = await this.scanDirectory(directoryPath);
    return this.objectStore.storeTree(entries);
  }

  /**
   * 扫描目录
   */
  private async scanDirectory(dirPath: string): Promise<TreeEntry[]> {
    const entries: TreeEntry[] = [];
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = join(dirPath, item.name);
        const relativePath = relative(dirPath, itemPath);
        
        // 检查是否应该忽略
        if (this.shouldIgnore(relativePath)) {
          continue;
        }
        
        if (item.isFile()) {
          const stat = await fs.stat(itemPath);
          
          // 跳过过大的文件
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