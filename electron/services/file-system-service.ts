
import { promises as fs } from 'fs';
import { dirname } from 'path';

export class FileSystemService {
  private static locks = new Set<string>();

  static async acquireLock(path: string): Promise<void> {
    while (FileSystemService.locks.has(path)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    FileSystemService.locks.add(path);
  }

  static releaseLock(path: string): void {
    FileSystemService.locks.delete(path);
  }

  static async atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
    const lockPath = dirname(filePath);
    await FileSystemService.acquireLock(lockPath);
    try {
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(tempPath, content);
      await fs.rename(tempPath, filePath);
    } finally {
      FileSystemService.releaseLock(lockPath);
    }
  }
}
