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
   * Initialize adapter
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
      this.logger.info('Navigating to dashboard', {
        module: 'playwright-adapter',
        action: 'getShows'
      });

      await page.goto('https://podcaster.xiaoyuzhoufm.com/dashboard', { waitUntil: 'networkidle', timeout: this.timeout });

      // Wait for page to fully load
      await page.waitForLoadState('domcontentloaded', { timeout: this.timeout });

      // Wait for initial content and scroll to load more
      await page.waitForTimeout(5000);

      this.logger.debug('Page loaded, starting show extraction', {
        module: 'playwright-adapter',
        action: 'getShows'
      });

      // Take screenshot in debug mode
      if (this.debug && this.debugger) {
        const screenshotPath = await this.debugger.saveScreenshot('dashboard', page);
        this.logger.debug(`Screenshot saved: ${screenshotPath}`, {
          module: 'playwright-adapter',
          action: 'getShows'
        });
      }

      // Extract shows with scrolling to handle pagination
      const shows: Show[] = [];
      let lastCount = 0;
      let noNewItemsCount = 0;
      const maxScrollAttempts = 5;

      for (let scrollAttempt = 0; scrollAttempt < maxScrollAttempts; scrollAttempt++) {
        // Get current show elements from the page
        const currentShows = await page.evaluate(() => {
          const result: Array<{ id: string; title: string; description: string; episodeCount: number; createdAt: string; updatedAt: string }> = [];

          // Try to find show cards - look for links containing /podcasts/ and /home
          const elements = document.querySelectorAll('a[href*="/podcasts/"], a[href*="/podcast/"], a[href*="/home"]');

          console.log(`Found ${elements.length} potential show elements`);

          if (elements.length > 0) {
            elements.forEach((el: any, index) => {
              // Try to find title - try many selectors
              const titleSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[class*="title"]', '[class*="name"]', '[class*="header"]', 'strong'];
              let titleEl = null;
              for (const titleSel of titleSelectors) {
                titleEl = el.querySelector(titleSel);
                if (titleEl?.textContent) break;
              }

              // Try to find description
              const descSelectors = ['p', '[class*="description"]', '[class*="desc"]', 'span', 'div[class*="content"]', '[class*="summary"]'];
              let descEl = null;
              for (const descSel of descSelectors) {
                descEl = el.querySelector(descSel);
                if (descEl?.textContent && descEl.textContent.length > 0) break;
              }

              // Try to find link and extract ID
              const linkEl = el.querySelector('a[href]') || el;
              const href = linkEl?.getAttribute('href') || '';

              // Extract ID from URL - support both /podcasts/xxx and /podcasts/xxx/home patterns
              let id = href;
              const idPatterns = [
                /\/podcasts\/([^\/\?\/]+)/,
                /\/podcasts\/([^\/\?\/]+)\/home/,
                /\/podcast\/([^\/\?#]+)/,
                /\/show\/([^\/\?#]+)/,
                /id=([a-zA-Z0-9-]+)/
              ];

              for (const pattern of idPatterns) {
                const match = href.match(pattern);
                if (match) {
                  id = match[1];
                  break;
                }
              }

              // Only add if we found a valid ID (link exists and ID was extracted)
              if (titleEl?.textContent && id) {
                result.push({
                  id: id,
                  title: titleEl.textContent.trim(),
                  description: descEl?.textContent?.trim().substring(0, 200) || '',
                  episodeCount: 0,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                });
              }
            });
          }

          return result;
        });

        // Check if we got new items
        if (currentShows.length === lastCount) {
          noNewItemsCount++;

          if (noNewItemsCount >= 2) {
            this.logger.debug(`No new items found after ${scrollAttempt + 1} scrolls`, {
              module: 'playwright-adapter',
              action: 'getShows'
            });
            break; // No more items likely loaded
          }

          // Scroll down to load more content
          const scrollHeight = await page.evaluate(() => window.innerHeight);
          await page.evaluate((height: number) => window.scrollBy(0, height));

          // Wait for content to load after scrolling
          await page.waitForTimeout(1500);

          lastCount = currentShows.length;
        }

        // Merge all unique shows by ID
        const uniqueShows = shows.filter((show, index, self) =>
          index === shows.findIndex(s => s.id === show.id)
        );

        if (uniqueShows.length === 0) {
          this.logger.warn('No shows found on dashboard', {
            module: 'playwright-adapter',
            action: 'getShows'
          });
        } else {
          this.logger.info(`Found ${uniqueShows.length} shows`, {
            module: 'playwright-adapter',
            action: 'getShows'
          });
        }

        return this.success(uniqueShows);

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
      await this.navigateTo(`/podcasts/${showId}/home`);

      // Wait for episodes/resources to load on show page
      await this.waitForSelector('[class*="episode"], [class*="item"], [class*="draft"], [class*="resource"]', 10000);

      // Extract resources from page
      const resources = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="episode"], [class*="item"], [class*="draft"], [class*="resource"]');
        const result: Resource[] = [];

        elements.forEach((el: any, index) => {
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
