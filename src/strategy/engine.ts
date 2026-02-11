/**
 * Strategy Engine - Handles adapter selection and fallback logic
 */

import { AdapterType, HealthCheckResult, Show, Resource, PublishResult } from '../core/types';
import type { PublishOptions } from '../adapters/base';
import { IAdapter } from '../adapters/base';
import { PlaywrightAdapter } from '../adapters/playwright.adapter';
import { HttpAdapter } from '../adapters/http.adapter';
import { Logger } from '../services/logger';

// =====================================================
// Strategy Types
// =====================================================

/**
 * Strategy mode
 */
export enum StrategyMode {
  AUTO = 'auto',           // Automatically choose best adapter
  PLAYWRIGHT = 'playwright', // Prefer Playwright
  HTTP = 'http',           // Prefer HTTP
  PLAYWRIGHT_ONLY = 'playwright-only', // Only use Playwright
  HTTP_ONLY = 'http-only'  // Only use HTTP
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  mode: StrategyMode;
  healthCheckInterval: number;
  fallbackTimeout: number;
  retryAttempts: number;
}

/**
 * Adapter state
 */
interface AdapterState {
  adapter: IAdapter;
  healthy: boolean;
  lastHealthCheck: number;
  consecutiveFailures: number;
}

// =====================================================
// Strategy Engine Class
// =====================================================

/**
 * Strategy Engine for adapter selection and fallback
 */
export class StrategyEngine {
  private logger: Logger;
  private config: StrategyConfig;
  private adapters: Map<AdapterType, AdapterState>;
  private currentAdapter: AdapterType | null = null;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(
    private playwrightAdapter: PlaywrightAdapter,
    private httpAdapter: HttpAdapter,
    config: Partial<StrategyConfig> = {},
    logger: Logger
  ) {
    this.logger = logger;
    this.adapters = new Map();

    this.config = {
      mode: StrategyMode.AUTO,
      healthCheckInterval: 60000, // 1 minute
      fallbackTimeout: 5000, // 5 seconds
      retryAttempts: 3,
      ...config
    };

    // Initialize adapters
    this.adapters.set(AdapterType.PLAYWRIGHT, {
      adapter: this.playwrightAdapter,
      healthy: true,
      lastHealthCheck: 0,
      consecutiveFailures: 0
    });

    this.adapters.set(AdapterType.HTTP, {
      adapter: this.httpAdapter,
      healthy: true,
      lastHealthCheck: 0,
      consecutiveFailures: 0
    });
  }

  /**
   * Initialize the strategy engine
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing strategy engine', {
      module: 'strategy-engine',
      action: 'initialize',
      mode: this.config.mode
    });

    // Initialize adapters
    await this.playwrightAdapter.initialize();
    await this.httpAdapter.initialize();

    // Select initial adapter
    await this.selectBestAdapter();

    // Start health check timer
    this.startHealthCheck();
  }

  /**
   * Select the best adapter based on current configuration and health
   */
  private async selectBestAdapter(): Promise<AdapterType> {
    // Determine which adapters to use based on mode
    let candidateTypes: AdapterType[] = [];

    switch (this.config.mode) {
      case StrategyMode.PLAYWRIGHT_ONLY:
        candidateTypes = [AdapterType.PLAYWRIGHT];
        break;

      case StrategyMode.HTTP_ONLY:
        candidateTypes = [AdapterType.HTTP];
        break;

      case StrategyMode.PLAYWRIGHT:
        candidateTypes = [AdapterType.PLAYWRIGHT, AdapterType.HTTP];
        break;

      case StrategyMode.HTTP:
        candidateTypes = [AdapterType.HTTP, AdapterType.PLAYWRIGHT];
        break;

      case StrategyMode.AUTO:
      default:
        // Prefer HTTP for performance, fall back to Playwright
        candidateTypes = [AdapterType.HTTP, AdapterType.PLAYWRIGHT];
        break;
    }

    // Check health of candidates
    for (const type of candidateTypes) {
      const state = this.adapters.get(type);
      if (state && state.healthy) {
        this.currentAdapter = type;
        this.logger.debug(`Selected adapter: ${type}`, {
          module: 'strategy-engine',
          action: 'selectAdapter',
          adapter: type
        });
        return type;
      }
    }

    // All candidates unhealthy, try to recover
    this.logger.warn('All adapters unhealthy, attempting recovery', {
      module: 'strategy-engine',
      action: 'selectAdapter'
    });

    for (const type of candidateTypes) {
      const result = await this.checkAdapterHealth(type);
      if (result.healthy) {
        this.currentAdapter = type;
        return type;
      }
    }

    // Still unhealthy, use first candidate anyway
    this.currentAdapter = candidateTypes[0];
    return this.currentAdapter;
  }

  /**
   * Get current adapter
   */
  getCurrentAdapter(): IAdapter {
    if (!this.currentAdapter) {
      throw new Error('No adapter selected');
    }

    const state = this.adapters.get(this.currentAdapter);
    if (!state) {
      throw new Error(`Adapter not found: ${this.currentAdapter}`);
    }

    return state.adapter;
  }

  /**
   * Execute operation with automatic fallback
   */
  async execute<T>(
    operation: (adapter: IAdapter) => Promise<T>,
    options: {
      fallbackToPlaywright?: boolean;
      retryOnFailure?: boolean;
    } = {}
  ): Promise<T> {
    const { fallbackToPlaywright = true, retryOnFailure = true } = options;
    let attempts = 0;
    const maxAttempts = retryOnFailure ? this.config.retryAttempts : 1;

    while (attempts < maxAttempts) {
      try {
        const adapter = this.getCurrentAdapter();
        const result = await operation(adapter);
        this.recordSuccess(this.currentAdapter!);
        return result;

      } catch (error) {
        attempts++;
        this.logger.warn(`Operation failed (attempt ${attempts}/${maxAttempts})`, {
          module: 'strategy-engine',
          action: 'execute',
          error: error instanceof Error ? error.message : String(error)
        });

        this.recordFailure(this.currentAdapter!);

        // Try fallback to Playwright if configured
        if (fallbackToPlaywright && this.currentAdapter === AdapterType.HTTP) {
          this.logger.info('Falling back to Playwright adapter', {
            module: 'strategy-engine',
            action: 'execute'
          });

          const playwrightState = this.adapters.get(AdapterType.PLAYWRIGHT);
          if (playwrightState && playwrightState.healthy) {
            try {
              const result = await operation(playwrightState.adapter);
              this.recordSuccess(AdapterType.PLAYWRIGHT);
              return result;
            } catch {
              // Fall back didn't work, continue to retry
            }
          }
        }

        // Re-select adapter on failure
        await this.selectBestAdapter();

        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }

    throw new Error('Operation failed after retries');
  }

  /**
   * Record successful operation
   */
  private recordSuccess(adapterType: AdapterType): void {
    const state = this.adapters.get(adapterType);
    if (state) {
      state.consecutiveFailures = 0;
      state.healthy = true;
    }
  }

  /**
   * Record failed operation
   */
  private recordFailure(adapterType: AdapterType): void {
    const state = this.adapters.get(adapterType);
    if (state) {
      state.consecutiveFailures++;

      // Mark as unhealthy after 3 consecutive failures
      if (state.consecutiveFailures >= 3) {
        state.healthy = false;
        this.logger.warn(`Adapter marked as unhealthy: ${adapterType}`, {
          module: 'strategy-engine',
          action: 'recordFailure',
          adapter: adapterType,
          failures: state.consecutiveFailures
        });
      }
    }
  }

  /**
   * Check adapter health
   */
  async checkAdapterHealth(adapterType: AdapterType): Promise<HealthCheckResult> {
    const state = this.adapters.get(adapterType);
    if (!state) {
      return {
        healthy: false,
        latency: 0,
        error: 'Adapter not found'
      };
    }

    state.lastHealthCheck = Date.now();

    const result = await state.adapter.healthCheck();

    if (result.healthy) {
      state.consecutiveFailures = 0;
      state.healthy = true;
    } else {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= 3) {
        state.healthy = false;
      }
    }

    return result;
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      for (const type of this.adapters.keys()) {
        await this.checkAdapterHealth(type);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health checks
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Get all adapter states
   */
  getAdapterStates(): Map<AdapterType, AdapterState> {
    return new Map(this.adapters);
  }

  /**
   * Force switch to specific adapter
   */
  async forceAdapter(adapterType: AdapterType): Promise<void> {
    const state = this.adapters.get(adapterType);
    if (!state) {
      throw new Error(`Unknown adapter type: ${adapterType}`);
    }

    // Check health first
    if (!state.healthy) {
      const result = await this.checkAdapterHealth(adapterType);
      if (!result.healthy) {
        throw new Error(`Adapter ${adapterType} is not healthy`);
      }
    }

    this.currentAdapter = adapterType;
    this.logger.info(`Forced adapter switch to: ${adapterType}`, {
      module: 'strategy-engine',
      action: 'forceAdapter'
    });
  }

  /**
   * Set strategy mode
   */
  setMode(mode: StrategyMode): void {
    this.config.mode = mode;
    this.logger.info(`Strategy mode changed to: ${mode}`, {
      module: 'strategy-engine',
      action: 'setMode'
    });

    // Re-select adapter with new mode
    this.selectBestAdapter();
  }

  /**
   * Dispose of strategy engine
   */
  async dispose(): Promise<void> {
    this.stopHealthCheck();

    await this.playwrightAdapter.dispose();
    await this.httpAdapter.dispose();

    this.logger.info('Strategy engine disposed', {
      module: 'strategy-engine',
      action: 'dispose'
    });
  }
}
