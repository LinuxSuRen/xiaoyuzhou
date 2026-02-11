/**
 * Error Handler - Provides user-friendly error messages and recovery suggestions
 */

import path from 'path';
import fs from 'fs';
import { Page } from 'playwright';
import { ErrorCode, LogLevel, LogContext } from '../core/types';
import { Logger } from './logger';

// =====================================================
// Error Suggestions Mapping
// =====================================================

const ERROR_SUGGESTIONS: Record<ErrorCode, string[]> = {
  [ErrorCode.AUTH_REQUIRED]: [
    '您需要先登录才能执行此操作',
    '请运行 "xiaoyuzhou login" 命令进行登录',
    '如果您已经登录，请检查登录状态是否已过期'
  ],
  [ErrorCode.AUTH_FAILED]: [
    '登录认证失败',
    '请检查您的账号信息是否正确',
    '尝试使用另一种登录方式（扫码或验证码）',
    '检查网络连接是否正常'
  ],
  [ErrorCode.TOKEN_EXPIRED]: [
    '您的登录已过期',
    '请重新登录',
    '运行 "xiaoyuzhou login" 命令'
  ],
  [ErrorCode.TOKEN_INVALID]: [
    '登录令牌无效',
    '请清除本地数据后重新登录',
    '运行 "xiaoyuzhou login --force" 命令强制重新登录'
  ],
  [ErrorCode.NETWORK_ERROR]: [
    '网络连接失败',
    '请检查您的网络连接',
    '检查代理设置',
    '稍后重试'
  ],
  [ErrorCode.REQUEST_TIMEOUT]: [
    '请求超时',
    '请检查网络连接',
    '网络可能较慢，请稍后重试',
    '尝试使用 --timeout 参数增加超时时间'
  ],
  [ErrorCode.RATE_LIMITED]: [
    '请求过于频繁，触发了限流',
    '请稍等片刻再试',
    '已自动启用重试机制'
  ],
  [ErrorCode.INVALID_RESPONSE]: [
    '服务器返回了无效的响应',
    '可能是平台出现了问题',
    '请稍后重试',
    '如果问题持续，请联系小宇宙客服'
  ],
  [ErrorCode.PARSE_ERROR]: [
    '数据解析失败',
    '可能是平台接口发生了变化',
    '请检查是否有更新版本可用',
    '如果问题持续，请提交 issue'
  ],
  [ErrorCode.VALIDATION_ERROR]: [
    '数据验证失败',
    '请检查输入的数据格式是否正确',
    '确保所有必填字段都已填写'
  ],
  [ErrorCode.LOGIN_FAILED]: [
    '登录失败',
    '请检查登录方式是否正确',
    '尝试使用另一种登录方式',
    '检查账号是否正常'
  ],
  [ErrorCode.UPLOAD_FAILED]: [
    '文件上传失败',
    '请检查文件大小是否超过限制',
    '检查文件格式是否正确',
    '检查网络连接'
  ],
  [ErrorCode.PUBLISH_FAILED]: [
    '发布失败',
    '请检查内容是否符合平台规范',
    '检查网络连接',
    '稍后重试'
  ],
  [ErrorCode.PLATFORM_ERROR]: [
    '平台返回了错误',
    '可能是平台暂时出现了问题',
    '请稍后重试',
    '如果问题持续，请联系小宇宙客服'
  ],
  [ErrorCode.CAPTCHA_REQUIRED]: [
    '需要验证码验证',
    '请在浏览器窗口中完成验证',
    '如果验证码未出现，请刷新页面重试'
  ],
  [ErrorCode.UNKNOWN_ERROR]: [
    '发生了未知错误',
    '请检查日志文件获取详细信息',
    '尝试使用 --debug 模式运行',
    '如果问题持续，请提交 issue 并附上日志'
  ]
};

// =====================================================
// Custom Error Classes
// =====================================================

/**
 * Application specific error class
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable: boolean = false,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Get user-friendly error description
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Get suggestions for resolving this error
   */
  getSuggestions(): string[] {
    return ERROR_SUGGESTIONS[this.code] || ERROR_SUGGESTIONS[ErrorCode.UNKNOWN_ERROR];
  }

  /**
   * Check if error should be retried
   */
  isRetryable(): boolean {
    return this.retryable;
  }
}

/**
 * Authentication error
 */
export class AuthError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(ErrorCode.AUTH_FAILED, message, false, context);
    this.name = 'AuthError';
  }
}

/**
 * Network error
 */
export class NetworkError extends AppError {
  constructor(message: string, retryable: boolean = true, context?: Record<string, any>) {
    super(ErrorCode.NETWORK_ERROR, message, retryable, context);
    this.name = 'NetworkError';
  }
}

/**
 * ValidationError
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(ErrorCode.VALIDATION_ERROR, message, false, context);
    this.name = 'ValidationError';
  }
}

/**
 * Platform error
 */
export class PlatformError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(ErrorCode.PLATFORM_ERROR, message, false, context);
    this.name = 'PlatformError';
  }
}

// =====================================================
// Error Handler
// =====================================================

/**
 * Error handling options
 */
export interface ErrorHandlerOptions {
  debug?: boolean;
  debugDir?: string;
  logger?: Logger;
}

/**
 * Formatted error output for user
 */
export interface FormattedError {
  title: string;
  code: ErrorCode;
  message: string;
  suggestions: string[];
  debugInfo?: {
    logFile?: string;
    screenshotPath?: string;
    stackTrace?: string;
  };
}

/**
 * Error Handler class
 */
export class ErrorHandler {
  private logger: Logger;
  private debug: boolean;
  private debugDir: string;

  constructor(options: ErrorHandlerOptions = {}) {
    this.debug = options.debug ?? false;
    this.debugDir = options.debugDir ?? '.debug';
    this.logger = options.logger ?? new Logger({
      logLevel: LogLevel.INFO,
      logDir: '.storage/logs',
      debug: false
    });

    // Ensure debug directory exists
    this.ensureDebugDirectory();
  }

  /**
   * Ensure debug directory exists
   */
  private ensureDebugDirectory(): void {
    if (!fs.existsSync(this.debugDir)) {
      fs.mkdirSync(this.debugDir, { recursive: true });
    }
  }

  /**
   * Save screenshot on error
   */
  private async saveScreenshot(page: Page): Promise<string | undefined> {
    try {
      const timestamp = Date.now();
      const filename = `error-${timestamp}.png`;
      const screenshotPath = path.join(this.debugDir, 'screenshots', filename);

      const screenshotDir = path.dirname(screenshotPath);
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      await page.screenshot({ path: screenshotPath, fullPage: true });
      return screenshotPath;
    } catch (error) {
      // Fail silently
      return undefined;
    }
  }

  /**
   * Format error for display
   */
  private formatError(error: Error | AppError): FormattedError {
    if (error instanceof AppError) {
      return {
        title: this.getErrorTitle(error.code),
        code: error.code,
        message: error.getUserMessage(),
        suggestions: error.getSuggestions(),
        debugInfo: this.debug ? {
          logFile: this.logger.getErrorLogFile(),
          stackTrace: error.stack
        } : undefined
      };
    }

    // Generic error
    return {
      title: '操作失败',
      code: ErrorCode.UNKNOWN_ERROR,
      message: error.message,
      suggestions: ERROR_SUGGESTIONS[ErrorCode.UNKNOWN_ERROR],
      debugInfo: this.debug ? {
        logFile: this.logger.getErrorLogFile(),
        stackTrace: error.stack
      } : undefined
    };
  }

  /**
   * Get error title from code
   */
  private getErrorTitle(code: ErrorCode): string {
    const titles: Record<ErrorCode, string> = {
      [ErrorCode.AUTH_REQUIRED]: '需要登录',
      [ErrorCode.AUTH_FAILED]: '认证失败',
      [ErrorCode.TOKEN_EXPIRED]: '登录已过期',
      [ErrorCode.TOKEN_INVALID]: '令牌无效',
      [ErrorCode.NETWORK_ERROR]: '网络错误',
      [ErrorCode.REQUEST_TIMEOUT]: '请求超时',
      [ErrorCode.RATE_LIMITED]: '请求过于频繁',
      [ErrorCode.INVALID_RESPONSE]: '响应无效',
      [ErrorCode.PARSE_ERROR]: '解析失败',
      [ErrorCode.VALIDATION_ERROR]: '验证失败',
      [ErrorCode.LOGIN_FAILED]: '登录失败',
      [ErrorCode.UPLOAD_FAILED]: '上传失败',
      [ErrorCode.PUBLISH_FAILED]: '发布失败',
      [ErrorCode.PLATFORM_ERROR]: '平台错误',
      [ErrorCode.CAPTCHA_REQUIRED]: '需要验证',
      [ErrorCode.UNKNOWN_ERROR]: '未知错误'
    };

    return titles[code] || '操作失败';
  }

  /**
   * Display formatted error to user
   */
  private displayError(formatted: FormattedError): void {
    console.error('\n');
    console.error(`✗ ${formatted.title}`);
    console.error(`  错误代码: ${formatted.code}`);
    if (formatted.message) {
      console.error(`  错误详情: ${formatted.message}`);
    }
    console.error(`\n  可能的解决方案:`);
    formatted.suggestions.forEach((suggestion, index) => {
      console.error(`    ${index + 1}. ${suggestion}`);
    });

    if (formatted.debugInfo) {
      console.error(`\n  调试信息:`);
      if (formatted.debugInfo.logFile) {
        console.error(`    - 日志: ${formatted.debugInfo.logFile}`);
      }
      if (formatted.debugInfo.screenshotPath) {
        console.error(`    - 截图: ${formatted.debugInfo.screenshotPath}`);
      }
    }
    console.error('\n');
  }

  // =====================================================
  // Public API
  // =====================================================

  /**
   * Handle an error
   */
  async handle(error: Error | AppError, context?: LogContext & { page?: Page }): Promise<void> {
    let screenshotPath: string | undefined;

    // Save screenshot if page is available
    if (context?.page && this.debug) {
      screenshotPath = await this.saveScreenshot(context.page);
    }

    // Create error info for logging
    const errorInfo: LogContext = {
      module: context?.module || 'unknown',
      action: context?.action || 'unknown',
      ...context
    };

    // Log the error
    if (error instanceof AppError) {
      this.logger.error(error.message, {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        screenshotPath,
        ...error.context
      } as any, errorInfo);
    } else {
      this.logger.error(error.message, {
        name: error.name,
        message: error.message,
        stack: error.stack,
        screenshotPath
      }, errorInfo);
    }

    // Format and display error
    const formatted = this.formatError(error);
    if (screenshotPath) {
      formatted.debugInfo = formatted.debugInfo || {};
      formatted.debugInfo.screenshotPath = screenshotPath;
    }
    this.displayError(formatted);
  }

  /**
   * Get suggestions for an error
   */
  getSuggestions(error: Error | AppError): string[] {
    if (error instanceof AppError) {
      return error.getSuggestions();
    }
    return ERROR_SUGGESTIONS[ErrorCode.UNKNOWN_ERROR];
  }

  /**
   * Wrap a function with error handling
   */
  async wrap<T>(
    fn: () => Promise<T>,
    context?: LogContext & { page?: Page }
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      await this.handle(error as Error, context);
      throw error;
    }
  }
}

// Default error handler instance
let defaultErrorHandler: ErrorHandler | null = null;

/**
 * Get or create default error handler instance
 */
export function getErrorHandler(options?: ErrorHandlerOptions): ErrorHandler {
  if (!defaultErrorHandler) {
    defaultErrorHandler = new ErrorHandler(options);
  }
  return defaultErrorHandler;
}
