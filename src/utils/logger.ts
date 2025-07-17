/**
 * Logger utility with level control
 * Provides centralized logging with configurable verbosity
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1, 
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4
}

class Logger {
  private static instance: Logger | null = null
  private currentLevel: LogLevel = LogLevel.INFO // Default to INFO level

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level
    console.log(`[Logger] Log level set to ${LogLevel[level]}`)
  }

  getLevel(): LogLevel {
    return this.currentLevel
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.currentLevel
  }

  error(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`[${component}] ❌ ${message}`, ...args)
    }
  }

  warn(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`[${component}] ⚠️ ${message}`, ...args)
    }
  }

  info(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`[${component}] ℹ️ ${message}`, ...args)
    }
  }

  debug(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(`[${component}] 🔍 ${message}`, ...args)
    }
  }

  verbose(component: string, message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      console.log(`[${component}] 📝 ${message}`, ...args)
    }
  }
}

// Export singleton instance and utility functions
export const logger = Logger.getInstance()

// Convenience functions for common components
export const terminalLogger = {
  error: (message: string, ...args: any[]) => logger.error('Terminal', message, ...args),
  warn: (message: string, ...args: any[]) => logger.warn('Terminal', message, ...args),
  info: (message: string, ...args: any[]) => logger.info('Terminal', message, ...args),
  debug: (message: string, ...args: any[]) => logger.debug('Terminal', message, ...args),
  verbose: (message: string, ...args: any[]) => logger.verbose('Terminal', message, ...args),
}

export const storeLogger = {
  error: (message: string, ...args: any[]) => logger.error('TerminalStore', message, ...args),
  warn: (message: string, ...args: any[]) => logger.warn('TerminalStore', message, ...args),
  info: (message: string, ...args: any[]) => logger.info('TerminalStore', message, ...args),
  debug: (message: string, ...args: any[]) => logger.debug('TerminalStore', message, ...args),
  verbose: (message: string, ...args: any[]) => logger.verbose('TerminalStore', message, ...args),
}

export const eventLogger = {
  error: (message: string, ...args: any[]) => logger.error('TerminalEventManager', message, ...args),
  warn: (message: string, ...args: any[]) => logger.warn('TerminalEventManager', message, ...args),
  info: (message: string, ...args: any[]) => logger.info('TerminalEventManager', message, ...args),
  debug: (message: string, ...args: any[]) => logger.debug('TerminalEventManager', message, ...args),
  verbose: (message: string, ...args: any[]) => logger.verbose('TerminalEventManager', message, ...args),
}

// Initialize with environment-based log level
const initLogLevel = () => {
  const envLevel = process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  logger.setLevel(envLevel)
}

initLogLevel()