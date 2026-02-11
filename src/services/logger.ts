/**
 * Logger Service - Provides structured logging with file rotation and console output
 */

import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import chalk from 'chalk';
import { LogLevel, LogEntry, LogContext, ErrorInfo, AppConfig } from '../core/types';

/**
 * Logger class for structured logging
 */
export class Logger {
  private level: LogLevel;
  private logDir: string;
  private enableConsole: boolean;
  private currentLogFile?: string;
  private currentErrorFile?: string;
  private currentDate?: string;

  constructor(config: Pick<AppConfig, 'logLevel' | 'logDir' | 'debug'>) {
    this.level = config.logLevel;
    this.logDir = config.logDir;
    this.enableConsole = true;

    // Ensure log directory exists
    this.ensureLogDirectory();

    // Initialize log files
    this.rotateLogFiles();
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Rotate log files based on date
   */
  private rotateLogFiles(): void {
    const today = format(new Date(), 'yyyy-MM-dd');

    if (this.currentDate !== today) {
      this.currentDate = today;
      this.currentLogFile = path.join(this.logDir, `app-${today}.log`);
      this.currentErrorFile = path.join(this.logDir, `error-${today}.log`);
    }
  }

  /**
   * Format log entry as string
   */
  private formatLogEntry(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp
    parts.push(`[${entry.timestamp}]`);

    // Level
    const levelStr = LogLevel[entry.level];
    parts.push(`[${levelStr.padEnd(5)}]`);

    // Module and action from context
    if (entry.context) {
      const contextParts: string[] = [];
      if (entry.context.module) {
        contextParts.push(entry.context.module);
      }
      if (entry.context.action) {
        contextParts.push(entry.context.action);
      }
      if (contextParts.length > 0) {
        parts.push(`[${contextParts.join(':')}]`);
      }
    }

    // Message
    parts.push(entry.message);

    // Additional context
    if (entry.context) {
      const contextStr = Object.entries(entry.context)
        .filter(([key]) => !['module', 'action', 'userId', 'requestId'].includes(key))
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      if (contextStr) {
        parts.push(`| ${contextStr}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Format log entry for console with colors
   */
  private formatConsoleEntry(entry: LogEntry): string {
    let message = entry.message;

    // Apply colors based on level
    switch (entry.level) {
      case LogLevel.DEBUG:
        message = chalk.gray(message);
        break;
      case LogLevel.INFO:
        message = chalk.blue(message);
        break;
      case LogLevel.WARN:
        message = chalk.yellow(message);
        break;
      case LogLevel.ERROR:
        message = chalk.red(message);
        break;
    }

    // Add context prefix
    if (entry.context && entry.context.module) {
      const prefix = chalk.dim(`[${entry.context.module}${entry.context.action ? ':' + entry.context.action : ''}]`);
      message = `${prefix} ${message}`;
    }

    return message;
  }

  /**
   * Write log entry to file
   */
  private writeToFile(entry: LogEntry, isError: boolean = false): void {
    this.rotateLogFiles();

    const logMessage = this.formatLogEntry(entry) + '\n';

    try {
      const file = isError ? this.currentErrorFile : this.currentLogFile;
      if (file) {
        fs.appendFileSync(file, logMessage, 'utf-8');
      }
    } catch (error) {
      // Silently fail if we can't write to file
      // to prevent infinite loop
    }
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(entry: LogEntry): void {
    if (this.enableConsole && entry.level >= this.level) {
      const message = this.formatConsoleEntry(entry);
      console.log(message);

      // Print error details if present
      if (entry.error) {
        if (entry.error.stack) {
          console.log(chalk.dim(entry.error.stack));
        }
        if (entry.error.screenshotPath) {
          console.log(chalk.dim(`Screenshot: ${entry.error.screenshotPath}`));
        }
      }
    }
  }

  /**
   * Create log entry
   */
  private createLogEntry(level: LogLevel, message: string, context?: LogContext, error?: ErrorInfo): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error
    };
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  // =====================================================
  // Public API
  // =====================================================

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
    this.writeToConsole(entry);
    this.writeToFile(entry);
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const entry = this.createLogEntry(LogLevel.INFO, message, context);
    this.writeToConsole(entry);
    this.writeToFile(entry);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const entry = this.createLogEntry(LogLevel.WARN, message, context);
    this.writeToConsole(entry);
    this.writeToFile(entry);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | ErrorInfo, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    let errorInfo: ErrorInfo | undefined;

    if (error instanceof Error) {
      errorInfo = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    } else if (error) {
      errorInfo = error;
    }

    const entry = this.createLogEntry(LogLevel.ERROR, message, context, errorInfo);
    this.writeToConsole(entry);
    this.writeToFile(entry, true);
  }

  /**
   * Log operation step
   */
  step(step: number, total: number, message: string, context?: LogContext): void {
    const prefix = chalk.dim(`[${step}/${total}]`);
    const entry = this.createLogEntry(LogLevel.INFO, `${prefix} ${message}`, context);
    this.writeToConsole(entry);
    this.writeToFile(entry);
  }

  /**
   * Log API request
   */
  apiRequest(method: string, url: string, data?: any): void {
    this.debug(`${method} ${url}`, {
      module: 'api',
      action: 'request',
      ...(data && { data: JSON.stringify(data) })
    });
  }

  /**
   * Log API response
   */
  apiResponse(status: number, duration: number, data?: any): void {
    this.debug(`Response ${status} (${duration}ms)`, {
      module: 'api',
      action: 'response',
      ...(data && { data: JSON.stringify(data).slice(0, 100) })
    });
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Enable/disable console output
   */
  setConsoleOutput(enabled: boolean): void {
    this.enableConsole = enabled;
  }

  /**
   * Get current log file path
   */
  getCurrentLogFile(): string | undefined {
    this.rotateLogFiles();
    return this.currentLogFile;
  }

  /**
   * Get current error log file path
   */
  getErrorLogFile(): string | undefined {
    this.rotateLogFiles();
    return this.currentErrorFile;
  }
}

// Default logger instance
let defaultLogger: Logger | null = null;

/**
 * Get or create default logger instance
 */
export function getLogger(config?: Pick<AppConfig, 'logLevel' | 'logDir' | 'debug'>): Logger {
  if (!defaultLogger && config) {
    defaultLogger = new Logger(config);
  }
  return defaultLogger!;
}
