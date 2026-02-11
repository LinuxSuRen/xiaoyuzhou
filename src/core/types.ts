/**
 * Core type definitions for the Xiaoyuzhou automation tool
 */

// =====================================================
// Authentication Types
// =====================================================

/**
 * Login method enumeration
 */
export enum LoginMethod {
  QR_CODE = 'qr_code',
  PHONE_CODE = 'phone_code'
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  userId?: string;
  userName?: string;
  error?: string;
}

/**
 * Session information
 */
export interface SessionInfo {
  token: string;
  userId: string;
  userName: string;
  expiresAt: number;
  cookies: Array<{ name: string; value: string; domain: string; path: string }>;
  storage: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

// =====================================================
// Error Types
// =====================================================

/**
 * Error code enumeration
 */
export enum ErrorCode {
  // Authentication errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',

  // Data errors
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  PARSE_ERROR = 'PARSE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Operation errors
  LOGIN_FAILED = 'LOGIN_FAILED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  PUBLISH_FAILED = 'PUBLISH_FAILED',

  // Platform errors
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',

  // Unknown error
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// =====================================================
// Log Types
// =====================================================

/**
 * Log level enumeration
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

/**
 * Log context
 */
export interface LogContext {
  module: string;
  action: string;
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

/**
 * Error information
 */
export interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  screenshotPath?: string;
}

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: ErrorInfo;
}

// =====================================================
// Adapter Types
// =====================================================

/**
 * Adapter type enumeration
 */
export enum AdapterType {
  PLAYWRIGHT = 'playwright',
  HTTP = 'http'
}

/**
 * Adapter operation result
 */
export interface AdapterResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: ErrorCode;
}

/**
 * Adapter health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latency: number;
  error?: string;
}

// =====================================================
// Platform Types
// =====================================================

/**
 * Podcast show/episode
 */
export interface Show {
  id: string;
  title: string;
  description: string;
  coverUrl?: string;
  episodeCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resource from the library
 */
export interface Resource {
  id: string;
  title: string;
  description?: string;
  duration?: number; // in seconds
  coverUrl?: string;
  audioUrl?: string;
  status: ResourceStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resource status
 */
export enum ResourceStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  SCHEDULED = 'scheduled'
}

/**
 * Publish result
 */
export interface PublishResult {
  success: boolean;
  resourceId: string;
  publishedUrl?: string;
  error?: string;
}

// =====================================================
// Configuration Types
// =====================================================

/**
 * Application configuration
 */
export interface AppConfig {
  debug: boolean;
  logLevel: LogLevel;
  enableScreenshots: boolean;
  headless: boolean;
  slowMo: number;
  apiBaseUrl: string;
  apiTimeout: number;
  storageDir: string;
  logDir: string;
  debugDir: string;
}

/**
 * Debug configuration
 */
export interface DebugConfig {
  enabled: boolean;
  screenshotOnSuccess: boolean;
  screenshotOnError: boolean;
  saveTrace: boolean;
  slowMo: number;
}
