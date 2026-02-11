/**
 * Base adapter interface and abstract class
 */

import { Browser, Page, BrowserContext } from 'playwright';
import { AdapterType, AdapterResult, HealthCheckResult, Show, Resource, PublishResult } from '../core/types';
import { Logger } from '../services/logger';

// =====================================================
// Adapter Configuration
// =====================================================

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
  logger?: Logger;
  debug?: boolean;
  timeout?: number;
}

/**
 * Playwright-specific configuration
 */
export interface PlaywrightConfig extends BaseAdapterConfig {
  headless?: boolean;
  slowMo?: number;
  userDataDir?: string;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

/**
 * HTTP-specific configuration
 */
export interface HttpConfig extends BaseAdapterConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
  retryAttempts?: number;
  retryDelay?: number;
}

// =====================================================
// Base Adapter Interface
// =====================================================

/**
 * Interface for all adapters
 */
export interface IAdapter {
  /**
   * Get adapter type
   */
  getType(): AdapterType;

  /**
   * Initialize the adapter
   */
  initialize(): Promise<void>;

  /**
   * Check if adapter is healthy
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void;

  /**
   * Get authentication token
   */
  getAuthToken(): string | null;

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean;

  /**
   * Get user shows
   */
  getShows(): Promise<AdapterResult<Show[]>>;

  /**
   * Get resources for a show
   */
  getResources(showId: string): Promise<AdapterResult<Resource[]>>;

  /**
   * Publish a resource
   */
  publishResource(resourceId: string, options?: PublishOptions): Promise<AdapterResult<PublishResult>>;

  /**
   * Publish multiple resources
   */
  publishResources(resourceIds: string[], options?: PublishOptions): Promise<AdapterResult<PublishResult[]>>;
}

/**
 * Options for publishing a resource
 */
export interface PublishOptions {
  scheduledAt?: Date;
  notify?: boolean;
  description?: string;
  showId?: string;  // Show ID for the resource being published
}

// =====================================================
// Abstract Base Adapter
// =====================================================

/**
 * Abstract base adapter with common functionality
 */
export abstract class BaseAdapter implements IAdapter {
  protected logger: Logger;
  protected debug: boolean;
  protected timeout: number;
  protected authToken: string | null;

  constructor(config: BaseAdapterConfig = {}) {
    this.logger = config.logger || new Logger({
      logLevel: 1, // INFO
      logDir: '.storage/logs',
      debug: false
    });
    this.debug = config.debug || false;
    this.timeout = config.timeout || 30000;
    this.authToken = null;
  }

  /**
   * Get adapter type (must be implemented by subclasses)
   */
  abstract getType(): AdapterType;

  /**
   * Initialize the adapter (must be implemented by subclasses)
   */
  abstract initialize(): Promise<void>;

  /**
   * Check if adapter is healthy (must be implemented by subclasses)
   */
  abstract healthCheck(): Promise<HealthCheckResult>;

  /**
   * Clean up resources (must be implemented by subclasses)
   */
  abstract dispose(): Promise<void>;

  /**
   * Get user shows (must be implemented by subclasses)
   */
  abstract getShows(): Promise<AdapterResult<Show[]>>;

  /**
   * Get resources for a show (must be implemented by subclasses)
   */
  abstract getResources(showId: string): Promise<AdapterResult<Resource[]>>;

  /**
   * Publish a resource (must be implemented by subclasses)
   */
  abstract publishResource(resourceId: string, options?: PublishOptions): Promise<AdapterResult<PublishResult>>;

  /**
   * Publish multiple resources (default implementation uses sequential calls)
   */
  async publishResources(resourceIds: string[], options?: PublishOptions): Promise<AdapterResult<PublishResult[]>> {
    const results: PublishResult[] = [];
    const errors: string[] = [];

    for (const resourceId of resourceIds) {
      const result = await this.publishResource(resourceId, options);

      if (result.success && result.data) {
        results.push(result.data);
      } else {
        errors.push(result.error || `Failed to publish resource ${resourceId}`);
        results.push({
          success: false,
          resourceId,
          error: result.error
        });
      }
    }

    return {
      success: errors.length === 0,
      data: results,
      error: errors.length > 0 ? errors.join('; ') : undefined
    };
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    this.logger.debug('Auth token set', {
      module: 'adapter',
      action: 'setAuthToken',
      tokenLength: token.length
    });
  }

  /**
   * Get authentication token
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authToken !== null && this.authToken.length > 0;
  }

  /**
   * Create a successful result
   */
  protected success<T>(data: T): AdapterResult<T> {
    return { success: true, data };
  }

  /**
   * Create a failed result
   */
  protected failure<T>(error: string, errorCode?: any): AdapterResult<T> {
    return { success: false, error, errorCode };
  }

  /**
   * Handle exception and return failure result
   */
  protected handleException<T>(error: unknown, context: string): AdapterResult<T> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`${context}: ${message}`, error instanceof Error ? error : undefined, {
      module: 'adapter',
      action: context
    });
    return this.failure(message);
  }
}
