/**
 * CircularBuffer - Fixed-size circular buffer for terminal output history
 * 
 * Optimized for terminal use case where we need to store a fixed number of 
 * output lines and efficiently add new lines while automatically discarding old ones.
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[]
  private head: number = 0  // Points to the next write position
  private size: number = 0  // Current number of elements
  private readonly capacity: number

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('CircularBuffer capacity must be positive')
    }
    this.capacity = capacity
    this.buffer = new Array(capacity)
  }

  /**
   * Add an item to the buffer
   * If buffer is full, overwrites the oldest item
   */
  push(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    
    if (this.size < this.capacity) {
      this.size++
    }
  }

  /**
   * Get all items in chronological order (oldest first)
   */
  toArray(): T[] {
    if (this.size === 0) {
      return []
    }

    const result: T[] = []
    
    if (this.size < this.capacity) {
      // Buffer not full yet, items are from 0 to size-1
      for (let i = 0; i < this.size; i++) {
        result.push(this.buffer[i]!)
      }
    } else {
      // Buffer is full, start from head (oldest) and wrap around
      for (let i = 0; i < this.capacity; i++) {
        const index = (this.head + i) % this.capacity
        result.push(this.buffer[index]!)
      }
    }
    
    return result
  }

  /**
   * Clear all items from the buffer
   */
  clear(): void {
    this.head = 0
    this.size = 0
    // Don't need to actually clear the array, just reset pointers
  }

  /**
   * Get current number of items in buffer
   */
  getSize(): number {
    return this.size
  }

  /**
   * Get maximum capacity of buffer
   */
  getCapacity(): number {
    return this.capacity
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.size === 0
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.size === this.capacity
  }

  /**
   * Get the most recent item without removing it
   * Returns undefined if buffer is empty
   */
  peek(): T | undefined {
    if (this.size === 0) {
      return undefined
    }
    
    const lastIndex = this.head === 0 ? this.capacity - 1 : this.head - 1
    return this.buffer[lastIndex]
  }

  /**
   * Create a new CircularBuffer from an existing array
   * If array is larger than capacity, only the last 'capacity' items are kept
   */
  static fromArray<T>(items: T[], capacity: number): CircularBuffer<T> {
    const buffer = new CircularBuffer<T>(capacity)
    
    // If items array is larger than capacity, take only the last 'capacity' items
    const startIndex = Math.max(0, items.length - capacity)
    
    for (let i = startIndex; i < items.length; i++) {
      buffer.push(items[i])
    }
    
    return buffer
  }
}