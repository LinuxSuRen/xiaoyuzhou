/**
 * Core Client - Unified client for all operations
 */

import { Show, Resource, PublishResult, AdapterType, LoginMethod } from './types';
import type { PublishOptions } from '../adapters/base';
import { Logger } from '../services/logger';
import { ErrorHandler } from '../services/error-handler';
import { SessionStorage } from '../storage';
import { AuthManager } from './auth';
import { PlaywrightAdapter, HttpAdapter } from '../adapters';
import { StrategyEngine, StrategyMode } from '../strategy/engine';

// =====================================================
// Client Configuration
// =====================================================

/**
 * Client configuration options
 */
export interface ClientConfig {
  logLevel?: number;
  logDir?: string;
  storageDir?: string;
  debug?: boolean;
  headless?: boolean;
  slowMo?: number;
  strategyMode?: StrategyMode;
  forceLogin?: boolean;
}

// =====================================================
// Core Client Class
// =====================================================

/**
 * Core client for Xiaoyuzhou operations
 */
export class XiaoYuzhouClient {
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private sessionStorage: SessionStorage;
  private authManager: AuthManager;
  private playwrightAdapter: PlaywrightAdapter;
  private httpAdapter: HttpAdapter;
  private strategyEngine: StrategyEngine;
  private initialized: boolean = false;

  constructor(config: ClientConfig = {}) {
    // Initialize logger
    this.logger = new Logger({
      logLevel: config.logLevel || 1, // INFO
      logDir: config.logDir || '.storage/logs',
      debug: config.debug || false
    });

    // Initialize error handler
    this.errorHandler = new ErrorHandler({
      logger: this.logger,
      debug: config.debug || false
    });

    // Initialize storage
    this.sessionStorage = new SessionStorage(this.logger, {
      storageDir: config.storageDir || '.storage'
    });

    // Initialize auth manager
    this.authManager = new AuthManager({
      logger: this.logger,
      errorHandler: this.errorHandler,
      sessionStorage: this.sessionStorage,
      headless: config.headless ?? false,
      slowMo: config.slowMo ?? 50
    });

    // Initialize adapters
    this.playwrightAdapter = new PlaywrightAdapter({
      logger: this.logger,
      debug: config.debug || false,
      headless: config.headless ?? false,
      slowMo: config.slowMo ?? 50
    });

    this.httpAdapter = new HttpAdapter({
      logger: this.logger,
      debug: config.debug || false
    });

    // Initialize strategy engine
    this.strategyEngine = new StrategyEngine(
      this.playwrightAdapter,
      this.httpAdapter,
      {
        mode: config.strategyMode || StrategyMode.PLAYWRIGHT
      },
      this.logger
    );
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing Xiaoyuzhou client', {
      module: 'client',
      action: 'initialize'
    });

    await this.strategyEngine.initialize();
    this.initialized = true;

    this.logger.info('Client initialized', {
      module: 'client',
      action: 'initialize'
    });
  }

  /**
   * Authenticate the user
   */
  async login(options: { force?: boolean; method?: LoginMethod } = {}): Promise<boolean> {
    try {
      await this.initialize();

      const result = await this.authManager.login({
        force: options.force,
        method: options.method
      });

      if (!result.success) {
        this.logger.error('Login failed', undefined, {
          module: 'client',
          action: 'login',
          error: result.error
        });
        return false;
      }

      // Browser session is now the source of truth
      // Adapters will use browser context when needed

      return true;

    } catch (error) {
      await this.errorHandler.handle(error as Error, {
        module: 'client',
        action: 'login'
      });
      return false;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authManager.isAuthenticated();
  }

  /**
   * Get user info
   */
  getUserInfo(): { userId: string; userName: string } | null {
    return this.authManager.getUserInfo();
  }

  /**
   * Get all shows
   */
  async getShows(): Promise<Show[]> {
    await this.ensureAuthenticated();

    return this.strategyEngine.execute(async (adapter) => {
      const result = await adapter.getShows();

      if (!result.success) {
        throw new Error(result.error || 'Failed to get shows');
      }

      return result.data || [];
    });
  }

  /**
   * Get resources for a show
   */
  async getResources(showId: string): Promise<Resource[]> {
    await this.ensureAuthenticated();

    return this.strategyEngine.execute(async (adapter) => {
      const result = await adapter.getResources(showId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to get resources');
      }

      return result.data || [];
    });
  }

  /**
   * Get unpublished resources for a show
   */
  async getUnpublishedResources(showId: string): Promise<Resource[]> {
    const allResources = await this.getResources(showId);
    return allResources.filter(r => r.status === 'draft' || r.status === 'scheduled');
  }

  /**
   * Publish a single resource
   */
  async publishResource(resourceId: string, options?: PublishOptions): Promise<PublishResult> {
    await this.ensureAuthenticated();

    return this.strategyEngine.execute(async (adapter) => {
      const result = await adapter.publishResource(resourceId, options);

      if (!result.success) {
        throw new Error(result.error || 'Failed to publish resource');
      }

      return result.data || {
        success: false,
        resourceId,
        error: 'Unknown error'
      };
    });
  }

  /**
   * Publish multiple resources
   */
  async publishResources(resourceIds: string[], options?: PublishOptions): Promise<PublishResult[]> {
    await this.ensureAuthenticated();

    return this.strategyEngine.execute(async (adapter) => {
      const result = await adapter.publishResources(resourceIds, options);

      if (!result.success) {
        throw new Error(result.error || 'Failed to publish resources');
      }

      return result.data || [];
    });
  }

  /**
   * Ensure user is authenticated
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated. Please login first.');
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await this.authManager.logout();
  }

  /**
   * Get current adapter type
   */
  getCurrentAdapter(): AdapterType {
    return (this.strategyEngine as any).currentAdapter || AdapterType.HTTP;
  }

  /**
   * Force switch to specific adapter
   */
  async switchAdapter(adapterType: AdapterType): Promise<void> {
    await this.strategyEngine.forceAdapter(adapterType);
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get error handler instance
   */
  getErrorHandler(): ErrorHandler {
    return this.errorHandler;
  }

  /**
   * Dispose of client
   */
  async dispose(): Promise<void> {
    await this.strategyEngine.dispose();
    await this.authManager.dispose();
    this.initialized = false;
  }
}
