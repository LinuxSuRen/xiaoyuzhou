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
   * Navigate to a path
   */
  private async navigateTo(path: string): Promise<void> {
    const page = await this.getPage();
    await page.goto(`${this.BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: this.timeout });
  }

  /**
   * Wait for a selector to appear
   */
  private async waitForSelector(selector: string, timeout?: number): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, { timeout: timeout || this.timeout });
  }

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
        // Get current show elements from page
        const currentShows = await page.evaluate(() => {
          const result: Array<{ id: string; title: string; description: string; episodeCount: number; createdAt: string; updatedAt: string }> = [];

          // Try to find show cards - look for links containing /podcasts/ and /home
          const elements = document.querySelectorAll('a[href*="/podcasts/"], a[href*="/podcast/"], a[href*="/home"]');

          console.log(`Found ${elements.length} potential show elements`);

          if (elements.length > 0) {
            elements.forEach((el: any, index: number) => {
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

              // Prioritize links ending with /home (show homepage) over /episodes
              if (href.includes('/home')) {
                result.push({
                  id: id,
                  title: titleEl?.textContent?.trim() || el.textContent?.trim() || '',
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

        // Add new shows to accumulated list (avoiding duplicates)
        for (const show of currentShows) {
          if (!shows.some(s => s.id === show.id)) {
            shows.push(show);
          }
        }

        // Check if we got new items
        if (shows.length === lastCount) {
          noNewItemsCount++;

          if (noNewItemsCount >= 2) {
            this.logger.debug(`No new items found after ${scrollAttempt + 1} scrolls`, {
              module: 'playwright-adapter',
              action: 'getShows'
            });
            break; // No more items likely loaded
          }
        } else {
          noNewItemsCount = 0;
        }

        // Scroll down to load more content
        const scrollHeight = await page.evaluate(() => window.innerHeight);
        await page.evaluate((height: number) => window.scrollBy(0, height), scrollHeight);

        // Wait for content to load after scrolling
        await page.waitForTimeout(1500);

        lastCount = shows.length;
      }

      // Log final results
      if (shows.length === 0) {
        this.logger.warn('No shows found on dashboard', {
          module: 'playwright-adapter',
          action: 'getShows'
        });
      } else {
        this.logger.info(`Found ${shows.length} shows`, {
          module: 'playwright-adapter',
          action: 'getShows'
        });
      }

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
   * @param resourceId - Format: "showId:resourceIndex" or just resource ID
   * @param options - Publishing options, can include showId
   */
  async publishResource(resourceId: string, options?: PublishOptions): Promise<AdapterResult<PublishResult>> {
    try {
      // Parse showId from resourceId if format is "showId:resourceIndex"
      let showId: string;
      let resourceIndex: string;

      if (resourceId.includes(':')) {
        [showId, resourceIndex] = resourceId.split(':');
      } else if (options?.showId) {
        showId = options.showId;
        resourceIndex = resourceId;
      } else {
        return this.failure('Invalid resource ID format. Please provide showId:resourceIndex or include showId in options.');
      }

      this.logger.debug(`Publishing resource: ${resourceId} from show: ${showId}`, {
        module: 'playwright-adapter',
        action: 'publishResource',
        resourceId,
        showId
      });

      const page = await this.getPage();

      // Step 1: Navigate to show homepage
      this.logger.info(`Navigating to show homepage: ${showId}`, {
        module: 'playwright-adapter',
        action: 'publishResource'
      });
      await this.navigateTo(`/podcasts/${showId}/home`);

      // Step 2: Click "资源库" (Resource Library)
      this.logger.debug('Looking for 资源库 button', {
        module: 'playwright-adapter',
        action: 'publishResource'
      });

      // Wait for page to load and find the resource library button
      await page.waitForTimeout(2000);

      // Try multiple selectors for the resource library button
      const resourceLibrarySelectors = [
        'a:has-text("资源库")',
        'button:has-text("资源库")',
        '[class*="resource"]',
        'a[href*="resource"]',
        'a[href*="draft"]'
      ];

      let resourceLibraryButton = null;
      for (const selector of resourceLibrarySelectors) {
        try {
          resourceLibraryButton = await page.$(selector);
          if (resourceLibraryButton) {
            this.logger.debug(`Found resource library button with selector: ${selector}`, {
              module: 'playwright-adapter',
              action: 'publishResource'
            });
            break;
          }
        } catch (e) {
          // Selector not found, try next one
        }
      }

      if (!resourceLibraryButton) {
        // Try to find by text content using evaluate
        const found = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('a, button'));
          for (const btn of buttons) {
            if (btn.textContent?.includes('资源库')) {
              (btn as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (!found) {
          return this.failure('Resource library button not found');
        }
      } else {
        await resourceLibraryButton.click();
      }

      // Wait for resource library page to load
      await page.waitForTimeout(3000);

      // Step 3: Find and click "作为单集发布" for the target resource
      this.logger.debug('Looking for "作为单集发布" button', {
        module: 'playwright-adapter',
        action: 'publishResource'
      });

      // Find the publish button by index or text
      const publishFound = await page.evaluate((index) => {
        // Look for buttons with text containing "作为单集发布" or "发布"
        const buttons = Array.from(document.querySelectorAll('button, a'));
        let publishCount = 0;

        for (let i = 0; i < buttons.length; i++) {
          const btn = buttons[i];
          const text = btn.textContent || '';

          if (text.includes('作为单集发布') || text.includes('发布')) {
            if (publishCount === parseInt(index)) {
              (btn as HTMLElement).click();
              return true;
            }
            publishCount++;
          }
        }
        return false;
      }, resourceIndex);

      if (!publishFound) {
        return this.failure(`Publish button not found for resource index: ${resourceIndex}`);
      }

      // Wait for publish page to load
      await page.waitForTimeout(3000);

      // Step 4: On the publish page, modify title if needed (max 60 characters)
      this.logger.debug('Processing publish page', {
        module: 'playwright-adapter',
        action: 'publishResource'
      });

      const titleProcessed = await page.evaluate(() => {
        // Find title input
        const titleInput = document.querySelector('input[name*="title"], textarea[name*="title"], [class*="title"] input, [class*="title"] textarea') as HTMLInputElement | HTMLTextAreaElement | null;

        if (titleInput && titleInput.value) {
          const originalTitle = titleInput.value;
          // Truncate from the beginning if more than 60 characters (keep the last 60 chars)
          if (originalTitle.length > 60) {
            titleInput.value = originalTitle.substring(originalTitle.length - 60);
            return { truncated: true, originalLength: originalTitle.length, newLength: 60 };
          }
          return { truncated: false, length: originalTitle.length };
        }
        return { truncated: false, error: 'Title input not found' };
      });

      if (titleProcessed.error) {
        this.logger.warn('Could not find title input', {
          module: 'playwright-adapter',
          action: 'publishResource'
        });
      } else if (titleProcessed.truncated) {
        this.logger.info(`Title truncated from ${titleProcessed.originalLength} to ${titleProcessed.newLength} characters`, {
          module: 'playwright-adapter',
          action: 'publishResource'
        });
      }

      // Step 5: Check "阅读并同意" (Read and agree)
      this.logger.debug('Looking for agreement checkbox', {
        module: 'playwright-adapter',
        action: 'publishResource'
      });

      const agreementChecked = await page.evaluate(() => {
        // Look for checkbox with text containing "阅读" or "同意"
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        for (const checkbox of checkboxes) {
          const label = checkbox.parentElement?.textContent || '';
          if (label.includes('阅读') || label.includes('同意')) {
            if (!(checkbox as HTMLInputElement).checked) {
              (checkbox as HTMLInputElement).click();
            }
            return true;
          }
        }
        return false;
      });

      if (!agreementChecked) {
        this.logger.warn('Agreement checkbox not found, trying to continue', {
          module: 'playwright-adapter',
          action: 'publishResource'
        });
      }

      // Step 6: Click "创建" (Create) button
      this.logger.debug('Clicking create button', {
        module: 'playwright-adapter',
        action: 'publishResource'
      });

      const createClicked = await page.evaluate(() => {
        // Look for button with text containing "创建" or "发布"
        const buttons = Array.from(document.querySelectorAll('button[type="submit"], button:not([type]), button[type="button"]'));
        for (const btn of buttons) {
          const text = btn.textContent || '';
          if (text.includes('创建') || text.includes('发布')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!createClicked) {
        return this.failure('Create/Publish button not found');
      }

      // Wait for navigation or success message
      await page.waitForTimeout(5000);

      // Get published URL if available
      const publishedUrl = await page.evaluate(() => {
        // Try to find success message with link
        const linkEl = document.querySelector('[class*="success"] a[href*="episode"], a[href*="/episodes/"]');
        return linkEl?.getAttribute('href') || undefined;
      });

      this.logger.info(`Resource published: ${resourceId}`, {
        module: 'playwright-adapter',
        action: 'publishResource',
        resourceId,
        publishedUrl
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
