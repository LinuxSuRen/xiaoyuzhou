/**
 * HTTP Adapter - Direct API calls adapter
 */

import { BaseAdapter, HttpConfig, PublishOptions } from './base';
import { AdapterType, HealthCheckResult, Show, Resource, PublishResult, ResourceStatus, AdapterResult } from '../core/types';
import { Logger } from '../services/logger';

// =====================================================
// HTTP Adapter Class
// =====================================================

/**
 * HTTP adapter for direct API calls
 */
export class HttpAdapter extends BaseAdapter {
  private httpConfig: HttpConfig;
  private readonly DEFAULT_BASE_URL = 'https://api.xiaoyuzhoufm.com';
  private readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private readonly DEFAULT_RETRY_DELAY = 1000;

  constructor(config: HttpConfig = {}) {
    super(config);
    this.httpConfig = {
      baseUrl: config.baseUrl || this.DEFAULT_BASE_URL,
      headers: config.headers || {},
      retryAttempts: config.retryAttempts || this.DEFAULT_RETRY_ATTEMPTS,
      retryDelay: config.retryDelay || this.DEFAULT_RETRY_DELAY,
      ...config
    };
  }

  /**
   * Get adapter type
   */
  getType(): AdapterType {
    return AdapterType.HTTP;
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    this.logger.info('HTTP adapter initialized', {
      module: 'http-adapter',
      action: 'initialize'
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Simple health check - try to fetch a public endpoint
      const response = await this.fetchWithTimeout('/', {
        method: 'HEAD'
      });

      const latency = Date.now() - startTime;

      return {
        healthy: response.ok || response.status < 500,
        latency
      };

    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.logger.info('HTTP adapter disposed', {
      module: 'http-adapter',
      action: 'dispose'
    });
  }

  // =====================================================
  // HTTP Methods
  // =====================================================

  /**
   * Build full URL
   */
  private buildUrl(path: string): string {
    const baseUrl = this.httpConfig.baseUrl || this.DEFAULT_BASE_URL;
    return `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  /**
   * Build request headers
   */
  private buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.httpConfig.headers,
      ...additionalHeaders
    };

    // Add auth token if available
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    const { timeout = this.timeout, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make HTTP request with retry
   */
  private async request<T>(
    method: string,
    path: string,
    data?: any,
    options: {
      headers?: Record<string, string>;
      retryAttempts?: number;
      retryDelay?: number;
    } = {}
  ): Promise<T> {
    const {
      headers = {},
      retryAttempts = this.httpConfig.retryAttempts,
      retryDelay = this.httpConfig.retryDelay
    } = options;

    const url = this.buildUrl(path);

    this.logger.apiRequest(method, url, data);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryAttempts!; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method,
          headers: this.buildHeaders(headers),
          body: data ? JSON.stringify(data) : undefined,
          timeout: this.timeout
        });

        const duration = Date.now();

        // Log response
        this.logger.apiResponse(response.status, duration);

        // Handle error responses
        if (!response.ok) {
          // Handle 401 - token expired
          if (response.status === 401) {
            this.authToken = null;
            throw new Error('Authentication failed - token may be expired');
          }

          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay! * (attempt + 1);

            this.logger.warn(`Rate limited, retrying after ${delay}ms`, {
              module: 'http-adapter',
              action: 'request'
            });

            await this.sleep(delay);
            continue;
          }

          // Other errors
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Parse response
        const responseData = await response.json();
        return responseData as T;

      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (error instanceof TypeError && error.message.includes('abort')) {
          throw new Error('Request timeout');
        }

        if (error instanceof Error && error.message.includes('Authentication failed')) {
          throw error;
        }

        // Wait before retry (except on last attempt)
        if (attempt < retryAttempts! - 1) {
          const delay = retryDelay! * (attempt + 1);
          this.logger.debug(`Retry attempt ${attempt + 1}/${retryAttempts} after ${delay}ms`, {
            module: 'http-adapter',
            action: 'request'
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * GET request
   */
  private async get<T>(path: string, options?: { headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  /**
   * POST request
   */
  private async post<T>(path: string, data?: any, options?: { headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('POST', path, data, options);
  }

  /**
   * PUT request
   */
  private async put<T>(path: string, data?: any, options?: { headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('PUT', path, data, options);
  }

  /**
   * DELETE request
   */
  private async delete<T>(path: string, options?: { headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =====================================================
  // API Methods
  // =====================================================

  /**
   * Get user shows
   */
  async getShows(): Promise<AdapterResult<Show[]>> {
    try {
      this.logger.debug('Getting shows via HTTP API', {
        module: 'http-adapter',
        action: 'getShows'
      });

      // Note: The actual API endpoint and response format may differ
      // This is a placeholder implementation
      const response = await this.get<{ data?: Show[]; items?: Show[] }>('/podcasts');

      // Handle different response formats
      const shows = response.data || response.items || [];

      this.logger.info(`Found ${shows.length} shows via HTTP API`, {
        module: 'http-adapter',
        action: 'getShows'
      });

      return this.success(shows);

    } catch (error) {
      return this.handleException(error, 'getShows');
    }
  }

  /**
   * Get resources for a show
   */
  async getResources(showId: string): Promise<AdapterResult<Resource[]>> {
    try {
      this.logger.debug(`Getting resources for show: ${showId} via HTTP API`, {
        module: 'http-adapter',
        action: 'getResources',
        showId
      });

      // Note: The actual API endpoint and response format may differ
      const response = await this.get<{ data?: Resource[]; items?: Resource[]; episodes?: Resource[] }>(
        `/podcasts/${showId}/episodes`
      );

      // Handle different response formats
      const resources = response.data || response.items || response.episodes || [];

      this.logger.info(`Found ${resources.length} resources via HTTP API`, {
        module: 'http-adapter',
        action: 'getResources',
        showId
      });

      return this.success(resources);

    } catch (error) {
      return this.handleException(error, 'getResources');
    }
  }

  /**
   * Publish a resource
   */
  async publishResource(resourceId: string, options?: PublishOptions): Promise<AdapterResult<PublishResult>> {
    try {
      this.logger.debug(`Publishing resource: ${resourceId} via HTTP API`, {
        module: 'http-adapter',
        action: 'publishResource',
        resourceId
      });

      // Note: The actual API endpoint and request format may differ
      const response = await this.post<{ success: boolean; url?: string }>(
        `/episodes/${resourceId}/publish`,
        {
          scheduledAt: options?.scheduledAt?.toISOString(),
          notify: options?.notify ?? true
        }
      );

      this.logger.info(`Resource published via HTTP API: ${resourceId}`, {
        module: 'http-adapter',
        action: 'publishResource',
        resourceId
      });

      return this.success({
        success: response.success,
        resourceId,
        publishedUrl: response.url
      });

    } catch (error) {
      return this.handleException(error, 'publishResource');
    }
  }

  /**
   * Publish multiple resources (optimized for batch operations)
   */
  async publishResources(resourceIds: string[], options?: PublishOptions): Promise<AdapterResult<PublishResult[]>> {
    try {
      this.logger.debug(`Publishing ${resourceIds.length} resources via HTTP API`, {
        module: 'http-adapter',
        action: 'publishResources',
        count: resourceIds.length
      });

      // Try batch publish endpoint first
      try {
        const response = await this.post<{ results: Array<{ id: string; success: boolean; url?: string }> }>(
          '/episodes/batch-publish',
          {
            episodeIds: resourceIds,
            scheduledAt: options?.scheduledAt?.toISOString(),
            notify: options?.notify ?? true
          }
        );

        const results = response.results.map(r => ({
          success: r.success,
          resourceId: r.id,
          publishedUrl: r.url
        }));

        return this.success(results);

      } catch (batchError) {
        // Fall back to individual publishes if batch endpoint fails
        this.logger.warn('Batch publish failed, falling back to individual publishes', {
          module: 'http-adapter',
          action: 'publishResources'
        });

        return super.publishResources(resourceIds, options);
      }

    } catch (error) {
      return this.handleException(error, 'publishResources');
    }
  }
}
