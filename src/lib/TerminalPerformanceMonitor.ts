/**
 * Terminal Performance Monitor
 * 
 * Collects performance metrics for terminal operations
 * Provides debugging and monitoring capabilities
 */

export interface TerminalMetrics {
  terminalId: string
  renderTime: number
  inputLatency: number
  outputLatency: number
  memoryUsage: number
  timestamp: number
}

export interface PerformanceEvent {
  type: 'render' | 'input' | 'output' | 'resize' | 'scroll'
  terminalId: string
  duration: number
  details?: any
  timestamp: number
}

export interface PerformanceStats {
  terminalId: string
  averageRenderTime: number
  averageInputLatency: number
  averageOutputLatency: number
  totalEvents: number
  memoryUsage: number
  uptime: number
  lastUpdate: number
}

export class TerminalPerformanceMonitor {
  private static instance: TerminalPerformanceMonitor | null = null
  private metrics: Map<string, TerminalMetrics[]> = new Map()
  private events: Map<string, PerformanceEvent[]> = new Map()
  private pendingOperations: Map<string, { type: string; startTime: number }> = new Map()
  private maxHistorySize = 1000

  private constructor() {}

  static getInstance(): TerminalPerformanceMonitor {
    if (!TerminalPerformanceMonitor.instance) {
      TerminalPerformanceMonitor.instance = new TerminalPerformanceMonitor()
    }
    return TerminalPerformanceMonitor.instance
  }

  /**
   * Start tracking a performance operation
   */
  startTracking(terminalId: string, operationType: string, _details?: any): string {
    const trackingId = `${terminalId}_${operationType}_${Date.now()}`
    this.pendingOperations.set(trackingId, {
      type: operationType,
      startTime: performance.now()
    })
    return trackingId
  }

  /**
   * End tracking and record the performance event
   */
  endTracking(trackingId: string, terminalId: string, details?: any): void {
    const pending = this.pendingOperations.get(trackingId)
    if (!pending) return

    const endTime = performance.now()
    const duration = endTime - pending.startTime

    const event: PerformanceEvent = {
      type: pending.type as any,
      terminalId,
      duration,
      details,
      timestamp: Date.now()
    }

    this.addEvent(terminalId, event)
    this.pendingOperations.delete(trackingId)
  }

  /**
   * Add a performance event directly
   */
  addEvent(terminalId: string, event: PerformanceEvent): void {
    if (!this.events.has(terminalId)) {
      this.events.set(terminalId, [])
    }

    const events = this.events.get(terminalId)!
    events.push(event)

    // Keep only recent events
    if (events.length > this.maxHistorySize) {
      events.splice(0, events.length - this.maxHistorySize)
    }

    // Update metrics
    this.updateMetrics(terminalId, event)
  }

  /**
   * Record terminal metrics
   */
  recordMetrics(terminalId: string, metrics: Partial<TerminalMetrics>): void {
    const fullMetrics: TerminalMetrics = {
      terminalId,
      renderTime: metrics.renderTime || 0,
      inputLatency: metrics.inputLatency || 0,
      outputLatency: metrics.outputLatency || 0,
      memoryUsage: metrics.memoryUsage || this.getMemoryUsage(),
      timestamp: Date.now()
    }

    if (!this.metrics.has(terminalId)) {
      this.metrics.set(terminalId, [])
    }

    const terminalMetrics = this.metrics.get(terminalId)!
    terminalMetrics.push(fullMetrics)

    // Keep only recent metrics
    if (terminalMetrics.length > this.maxHistorySize) {
      terminalMetrics.splice(0, terminalMetrics.length - this.maxHistorySize)
    }
  }

  /**
   * Get performance statistics for a terminal
   */
  getStats(terminalId: string): PerformanceStats | null {
    const events = this.events.get(terminalId) || []
    const metrics = this.metrics.get(terminalId) || []

    if (events.length === 0 && metrics.length === 0) {
      return null
    }

    // Calculate averages
    const renderEvents = events.filter(e => e.type === 'render')
    const inputEvents = events.filter(e => e.type === 'input')
    const outputEvents = events.filter(e => e.type === 'output')

    const averageRenderTime = renderEvents.length > 0 
      ? renderEvents.reduce((sum, e) => sum + e.duration, 0) / renderEvents.length
      : 0

    const averageInputLatency = inputEvents.length > 0
      ? inputEvents.reduce((sum, e) => sum + e.duration, 0) / inputEvents.length
      : 0

    const averageOutputLatency = outputEvents.length > 0
      ? outputEvents.reduce((sum, e) => sum + e.duration, 0) / outputEvents.length
      : 0

    const latestMetrics = metrics[metrics.length - 1]
    const oldestEvent = events[0]
    const uptime = oldestEvent ? Date.now() - oldestEvent.timestamp : 0

    return {
      terminalId,
      averageRenderTime,
      averageInputLatency,
      averageOutputLatency,
      totalEvents: events.length,
      memoryUsage: latestMetrics?.memoryUsage || 0,
      uptime,
      lastUpdate: Date.now()
    }
  }

  /**
   * Get all performance events for a terminal
   */
  getEvents(terminalId: string): PerformanceEvent[] {
    return this.events.get(terminalId) || []
  }

  /**
   * Get all metrics for a terminal
   */
  getMetrics(terminalId: string): TerminalMetrics[] {
    return this.metrics.get(terminalId) || []
  }

  /**
   * Get performance stats for all terminals
   */
  getAllStats(): PerformanceStats[] {
    const allTerminals = new Set([
      ...this.events.keys(),
      ...this.metrics.keys()
    ])

    return Array.from(allTerminals)
      .map(terminalId => this.getStats(terminalId))
      .filter(Boolean) as PerformanceStats[]
  }

  /**
   * Clear performance data for a terminal
   */
  clearTerminalData(terminalId: string): void {
    this.events.delete(terminalId)
    this.metrics.delete(terminalId)
    
    // Clear any pending operations for this terminal
    const keysToDelete = Array.from(this.pendingOperations.keys())
      .filter(key => key.startsWith(terminalId))
    
    keysToDelete.forEach(key => this.pendingOperations.delete(key))
  }

  /**
   * Clear all performance data
   */
  clearAllData(): void {
    this.events.clear()
    this.metrics.clear()
    this.pendingOperations.clear()
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    return {
      terminalsTracked: this.events.size,
      totalEvents: Array.from(this.events.values()).reduce((sum, events) => sum + events.length, 0),
      totalMetrics: Array.from(this.metrics.values()).reduce((sum, metrics) => sum + metrics.length, 0),
      pendingOperations: this.pendingOperations.size,
      memoryUsage: this.getMemoryUsage()
    }
  }

  /**
   * Export performance data for analysis
   */
  exportData(): any {
    return {
      events: Object.fromEntries(this.events),
      metrics: Object.fromEntries(this.metrics),
      timestamp: Date.now()
    }
  }

  /**
   * Private helper methods
   */
  private updateMetrics(terminalId: string, event: PerformanceEvent): void {
    const metrics: Partial<TerminalMetrics> = {
      terminalId,
      timestamp: Date.now()
    }

    switch (event.type) {
      case 'render':
        metrics.renderTime = event.duration
        break
      case 'input':
        metrics.inputLatency = event.duration
        break
      case 'output':
        metrics.outputLatency = event.duration
        break
    }

    this.recordMetrics(terminalId, metrics)
  }

  private getMemoryUsage(): number {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const memory = (performance as any).memory
      if (memory) {
        return memory.usedJSHeapSize / 1024 / 1024 // MB
      }
    }
    return 0
  }
}

// Export singleton instance
export const terminalPerformanceMonitor = TerminalPerformanceMonitor.getInstance()

// Performance monitoring utilities
export function withPerformanceTracking<T extends (...args: any[]) => any>(
  terminalId: string,
  operationType: string,
  fn: T
): T {
  return ((...args: any[]) => {
    const trackingId = terminalPerformanceMonitor.startTracking(terminalId, operationType)
    try {
      const result = fn(...args)
      
      // If result is a Promise, track async completion
      if (result && typeof result.then === 'function') {
        return result.finally(() => {
          terminalPerformanceMonitor.endTracking(trackingId, terminalId)
        })
      }
      
      terminalPerformanceMonitor.endTracking(trackingId, terminalId)
      return result
    } catch (error) {
      terminalPerformanceMonitor.endTracking(trackingId, terminalId, { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }) as T
}