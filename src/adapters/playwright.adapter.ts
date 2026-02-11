/**
 * Playwright Adapter - Browser automation adapter
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { BaseAdapter, PlaywrightConfig, PublishOptions } from './base';
import { AdapterType, HealthCheckResult, Show, Resource, PublishResult, ResourceStatus, AdapterResult } from '../core/types';
import { Logger } from '../services/logger';
import { Debugger } from '../services/debugger';

// =====================================================
// Playwright Adapter Class
// =====================================================

/**
 * Playwright adapter for browser automation
 */
export class PlaywrightAdapter extends BaseAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private playwrightConfig: PlaywrightConfig;
  private debugger?: Debugger;
  private readonly BASE_URL = 'https://podcaster.xiaoyuzhoufm.com';

  constructor(config: PlaywrightConfig = {}) {
    super(config);
    this.playwrightConfig = {
      headless: config.headless ?? false,
      slowMo: config.slowMo ?? 50,
      viewport: config.viewport ?? { width: 1280, height: 720 },
      ...config
    };
  }

  /**
   * Get adapter type
   */
  getType(): AdapterType {
    return AdapterType.PLAYWRIGHT;
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Playwright adapter', {
        module: 'playwright-adapter',
        action: 'initialize'
      });

      // Launch browser
      this.browser = await chromium.launch({
        headless: this.playwrightConfig.headless,
        slowMo: this.playwrightConfig.slowMo
      });

      // Create context
      this.context = await this.browser.newContext({
        viewport: this.playwrightConfig.viewport,
        userAgent: this.playwrightConfig.userAgent
      });

      // Create page
      this.page = await this.context.newPage();

      // Set default timeout
      this.page.setDefaultTimeout(this.timeout);

      // Initialize debugger if debug mode is enabled
      if (this.debug) {
        this.debugger = new Debugger({
          enabled: true,
          screenshotOnError: true,
          saveTrace: false
        }, this.logger, '.debug');

        // Log console messages
        this.debugger.logConsoleMessages(this.context);
      }

      this.logger.info('Playwright adapter initialized', {
        module: 'playwright-adapter',
        action: 'initialize'
      });

    } catch (error) {
      throw new Error(`Failed to initialize Playwright adapter: ${error}`);
    }
  }

  /**
   * Get or create page
   */
  private async getPage(): Promise<Page> {
    if (!this.page) {
      await this.initialize();
    }
    return this.page!;
  }

  /**
   * Get or create context
   */
  private getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }
    return this.context;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const page = await this.getPage();

      // Try to navigate to a simple page
      await page.goto(this.BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });

      const latency = Date.now() - startTime;

      return {
        healthy: true,
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
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.logger.info('Playwright adapter disposed', {
        module: 'playwright-adapter',
        action: 'dispose'
      });

    } catch (error) {
      this.logger.error('Error disposing Playwright adapter', error as Error, {
        module: 'playwright-adapter',
        action: 'dispose'
      });
    }
  }

  /**
   * Navigate to URL
   */
  private async navigateTo(path: string): Promise<void> {
    const page = await this.getPage();
    const url = `${this.BASE_URL}${path}`;

    this.logger.debug(`Navigating to: ${url}`, {
      module: 'playwright-adapter',
      action: 'navigate'
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: this.timeout });
  }

  /**
   * Wait for selector and return element
   */
  private async waitForSelector(selector: string, timeout?: number): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { timeout: timeout || this.timeout });
  }

  /**
   * Extract token from localStorage or cookies
   */
  async extractToken(): Promise<string | null> {
    try {
      const page = await this.getPage();

      // Try to get token from localStorage
      const token = await page.evaluate(() => {
        // Check common token keys
        const keys = ['token', 'authToken', 'access_token', 'jwt'];
        for (const key of keys) {
          const value = localStorage.getItem(key);
          if (value) {
            return value;
          }
        }

        // Try from sessionStorage
        for (const key of keys) {
          const value = sessionStorage.getItem(key);
          if (value) {
            return value;
          }
        }

        return null;
      });

      if (token) {
        this.logger.info('Token extracted from storage', {
          module: 'playwright-adapter',
          action: 'extractToken'
        });
        return token;
      }

      // Try to get from cookies
      const cookies = await this.context!.cookies();
      const tokenCookie = cookies.find(c =>
        c.name.includes('token') ||
        c.name.includes('auth') ||
        c.name.includes('session')
      );

      if (tokenCookie?.value) {
        this.logger.info('Token extracted from cookie', {
          module: 'playwright-adapter',
          action: 'extractToken'
        });
        return tokenCookie.value;
      }

      this.logger.warn('Could not extract token', {
        module: 'playwright-adapter',
        action: 'extractToken'
      });

      return null;

    } catch (error) {
      this.logger.error('Error extracting token', error as Error, {
        module: 'playwright-adapter',
        action: 'extractToken'
      });
      return null;
    }
  }

  /**
   * Set token in browser storage
   */
  async setTokenInBrowser(token: string): Promise<void> {
    try {
      const page = await this.getPage();

      await page.evaluate((t) => {
        localStorage.setItem('token', t);
      }, token);

      this.logger.debug('Token set in browser', {
        module: 'playwright-adapter',
        action: 'setTokenInBrowser'
      });

    } catch (error) {
      this.logger.error('Error setting token in browser', error as Error, {
        module: 'playwright-adapter',
        action: 'setTokenInBrowser'
      });
    }
  }

  // =====================================================
  // API Methods
  // =====================================================

  /**
   * Get user shows
   */
  async getShows(): Promise<AdapterResult<Show[]>> {
    try {
      this.logger.debug('Getting shows', {
        module: 'playwright-adapter',
        action: 'getShows'
      });

      const page = await this.getPage();

      // Navigate to creator dashboard
      await this.navigateTo('/dashboard');

      // Wait for shows to load
      await this.waitForSelector('[class*="podcast"], [class*="show"], [class*="episode"]', 10000);

      // Extract shows from page
      const shows = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="podcast"], [class*="show"]');
        const result: Show[] = [];

        elements.forEach((el, index) => {
          const titleEl = el.querySelector('[class*="title"], h2, h3');
          const descEl = el.querySelector('[class*="description"], p');
          const linkEl = el.querySelector('a');

          if (titleEl && titleEl.textContent) {
            const href = linkEl?.getAttribute('href') || '';
            const idMatch = href.match(/\/podcasts\/([^\/]+)/);

            result.push({
              id: idMatch?.[1] || `show_${index}`,
              title: titleEl.textContent.trim(),
              description: descEl?.textContent?.trim() || '',
              episodeCount: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        });

        return result;
      });

      this.logger.info(`Found ${shows.length} shows`, {
        module: 'playwright-adapter',
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
      this.logger.debug(`Getting resources for show: ${showId}`, {
        module: 'playwright-adapter',
        action: 'getResources',
        showId
      });

      const page = await this.getPage();

      // Navigate to show page
      await this.navigateTo(`/dashboard/podcasts/${showId}/episodes`);

      // Wait for episodes to load
      await this.waitForSelector('[class*="episode"], [class*="item"]', 10000);

      // Extract resources from page
      const resources = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="episode"], [class*="item"]');
        const result: Resource[] = [];

        elements.forEach((el, index) => {
          const titleEl = el.querySelector('[class*="title"], h2, h3');
          const statusEl = el.querySelector('[class*="status"], [class*="state"]');
          const timeEl = el.querySelector('[class*="duration"], [class*="time"]');

          if (titleEl && titleEl.textContent) {
            // Determine status from element text or class
            let status = ResourceStatus.PUBLISHED;
            const statusText = statusEl?.textContent?.toLowerCase() || '';
            const className = (el as HTMLElement).className.toLowerCase();

            if (statusText.includes('草稿') || className.includes('draft')) {
              status = ResourceStatus.DRAFT;
            } else if (statusText.includes('定时') || className.includes('schedule')) {
              status = ResourceStatus.SCHEDULED;
            }

            // Parse duration
            let duration: number | undefined;
            if (timeEl?.textContent) {
              const timeMatch = timeEl.textContent.match(/(\d+):(\d+)/);
              if (timeMatch) {
                duration = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
              }
            }

            result.push({
              id: `resource_${index}`,
              title: titleEl.textContent.trim(),
              status,
              duration,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        });

        return result;
      });

      this.logger.info(`Found ${resources.length} resources`, {
        module: 'playwright-adapter',
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
      this.logger.debug(`Publishing resource: ${resourceId}`, {
        module: 'playwright-adapter',
        action: 'publishResource',
        resourceId
      });

      const page = await this.getPage();

      // Find and click publish button for the resource
      const publishButton = await page.$(`[data-resource-id="${resourceId}"] [class*="publish"], button[class*="publish"]`);

      if (!publishButton) {
        return this.failure('Publish button not found');
      }

      await publishButton.click();

      // Wait for confirmation dialog or success message
      await page.waitForSelector('[class*="success"], [class*="published"], .success-message', { timeout: 10000 });

      // Get published URL if available
      const publishedUrl = await page.evaluate(() => {
        const linkEl = document.querySelector('[class*="success"] a[href*="episode"]');
        return linkEl?.getAttribute('href') || undefined;
      });

      this.logger.info(`Resource published: ${resourceId}`, {
        module: 'playwright-adapter',
        action: 'publishResource',
        resourceId
      });

      return this.success({
        success: true,
        resourceId,
        publishedUrl
      });

    } catch (error) {
      return this.handleException(error, 'publishResource');
    }
  }
}
