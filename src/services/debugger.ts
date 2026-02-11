/**
 * Debugger Service - Provides debugging utilities for Playwright automation
 */

import path from 'path';
import fs from 'fs';
import { Page, BrowserContext } from 'playwright';
import { DebugConfig } from '../core/types';
import { Logger } from './logger';

// =====================================================
// Element Information Types
// =====================================================

/**
 * Element information for debugging
 */
export interface ElementInfo {
  visible: boolean;
  present: boolean;
  tagName?: string;
  textContent?: string;
  attributes?: Record<string, string>;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Page state snapshot
 */
export interface PageSnapshot {
  url: string;
  title: string;
  viewport?: {
    width: number;
    height: number;
  };
  elementCount: number;
  screenshotPath?: string;
  htmlPath?: string;
}

// =====================================================
// Debugger Class
// =====================================================

/**
 * Debugger class for Playwright debugging utilities
 */
export class Debugger {
  private config: DebugConfig;
  private logger: Logger;
  private debugDir: string;

  constructor(config: Partial<DebugConfig> = {}, logger: Logger, debugDir: string = '.debug') {
    this.config = {
      enabled: config.enabled ?? false,
      screenshotOnSuccess: config.screenshotOnSuccess ?? false,
      screenshotOnError: config.screenshotOnError ?? true,
      saveTrace: config.saveTrace ?? false,
      slowMo: config.slowMo ?? 0
    };
    this.logger = logger;
    this.debugDir = debugDir;

    // Ensure debug directory exists
    this.ensureDebugDirectory();
  }

  /**
   * Ensure debug directory exists
   */
  private ensureDebugDirectory(): void {
    const dirs = [
      this.debugDir,
      path.join(this.debugDir, 'screenshots'),
      path.join(this.debugDir, 'html'),
      path.join(this.debugDir, 'traces')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Get timestamp for file naming
   */
  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('.')[0];
  }

  /**
   * Get safe filename from name
   */
  private safeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // =====================================================
  // Public API
  // =====================================================

  /**
   * Save screenshot
   */
  async saveScreenshot(name: string, page: Page, isError: boolean = false): Promise<string | undefined> {
    if (!this.config.enabled) {
      return undefined;
    }

    // Check if we should save screenshot based on config
    if (!isError && !this.config.screenshotOnSuccess) {
      return undefined;
    }
    if (isError && !this.config.screenshotOnError) {
      return undefined;
    }

    try {
      const timestamp = this.getTimestamp();
      const safeName = this.safeFilename(name);
      const filename = `${safeName}_${timestamp}.png`;
      const screenshotPath = path.join(this.debugDir, 'screenshots', filename);

      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });

      this.logger.debug(`Screenshot saved: ${screenshotPath}`, {
        module: 'debugger',
        action: 'screenshot'
      });

      return screenshotPath;
    } catch (error) {
      this.logger.warn(`Failed to save screenshot: ${error}`, {
        module: 'debugger',
        action: 'screenshot'
      });
      return undefined;
    }
  }

  /**
   * Save page HTML
   */
  async saveHTML(page: Page, name?: string): Promise<string | undefined> {
    if (!this.config.enabled) {
      return undefined;
    }

    try {
      const timestamp = this.getTimestamp();
      const safeName = name ? this.safeFilename(name) : 'page';
      const filename = `${safeName}_${timestamp}.html`;
      const htmlPath = path.join(this.debugDir, 'html', filename);

      const html = await page.content();
      fs.writeFileSync(htmlPath, html, 'utf-8');

      this.logger.debug(`HTML saved: ${htmlPath}`, {
        module: 'debugger',
        action: 'saveHTML'
      });

      return htmlPath;
    } catch (error) {
      this.logger.warn(`Failed to save HTML: ${error}`, {
        module: 'debugger',
        action: 'saveHTML'
      });
      return undefined;
    }
  }

  /**
   * Inspect element
   */
  async inspectElement(selector: string, page: Page): Promise<ElementInfo> {
    const info: ElementInfo = {
      visible: false,
      present: false
    };

    try {
      // Check if element is present
      const element = await page.$(selector);
      if (!element) {
        return info;
      }
      info.present = true;

      // Check if element is visible
      info.visible = await element.isVisible().catch(() => false);

      // Get tag name
      try {
        const tagName = await element.evaluate(el => el.tagName);
        info.tagName = tagName;
      } catch {
        // Tag name not available
      }

      // Get text content
      try {
        const textContent = await element.evaluate(el => el.textContent?.trim());
        info.textContent = textContent || undefined;
      } catch {
        // Text content not available
      }

      // Get attributes
      try {
        const attributes = await element.evaluate(el => {
          const attrs: Record<string, string> = {};
          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            attrs[attr.name] = attr.value;
          }
          return attrs;
        });
        info.attributes = attributes;
      } catch {
        // Attributes not available
      }

      // Get bounding box
      try {
        const box = await element.boundingBox();
        if (box) {
          info.boundingBox = box;
        }
      } catch {
        // Bounding box not available
      }

      this.logger.debug(`Element inspected: ${selector}`, {
        module: 'debugger',
        action: 'inspectElement',
        selector,
        ...info
      });

    } catch (error) {
      this.logger.warn(`Failed to inspect element: ${error}`, {
        module: 'debugger',
        action: 'inspectElement',
        selector
      });
    }

    return info;
  }

  /**
   * Create page snapshot
   */
  async createPageSnapshot(page: Page, name: string): Promise<PageSnapshot> {
    const snapshot: PageSnapshot = {
      url: page.url(),
      title: await page.title(),
      elementCount: 0
    };

    try {
      // Get viewport size
      const viewport = page.viewportSize();
      if (viewport) {
        snapshot.viewport = viewport;
      }

      // Count elements
      snapshot.elementCount = await page.evaluate(() => {
        return document.querySelectorAll('*').length;
      });

      // Save screenshot
      const screenshotPath = await this.saveScreenshot(name, page, false);
      if (screenshotPath) {
        snapshot.screenshotPath = screenshotPath;
      }

      // Save HTML
      const htmlPath = await this.saveHTML(page, name);
      if (htmlPath) {
        snapshot.htmlPath = htmlPath;
      }

      this.logger.debug(`Page snapshot created: ${name}`, {
        module: 'debugger',
        action: 'snapshot',
        ...snapshot
      });

    } catch (error) {
      this.logger.warn(`Failed to create page snapshot: ${error}`, {
        module: 'debugger',
        action: 'snapshot'
      });
    }

    return snapshot;
  }

  /**
   * Wait for element with timeout and debug info
   */
  async waitForElement(
    selector: string,
    page: Page,
    options: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' } = {}
  ): Promise<boolean> {
    const { timeout = 30000, state = 'visible' } = options;

    this.logger.debug(`Waiting for element: ${selector} (state: ${state}, timeout: ${timeout}ms)`, {
      module: 'debugger',
      action: 'waitForElement',
      selector,
      state,
      timeout
    });

    try {
      await page.waitForSelector(selector, { timeout, state });
      return true;
    } catch (error) {
      this.logger.warn(`Element not found: ${selector}`, {
        module: 'debugger',
        action: 'waitForElement',
        selector
      });

      // Debug: inspect element
      const info = await this.inspectElement(selector, page);
      this.logger.debug(`Element info for ${selector}: ${JSON.stringify(info)}`);

      return false;
    }
  }

  /**
   * Log console messages from page
   */
  logConsoleMessages(context: BrowserContext): void {
    context.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      switch (type) {
        case 'error':
          this.logger.error(`Browser console: ${text}`, undefined, {
            module: 'debugger',
            action: 'console'
          });
          break;
        case 'warning':
          this.logger.warn(`Browser console: ${text}`, {
            module: 'debugger',
            action: 'console'
          });
          break;
        default:
          this.logger.debug(`Browser console: ${text}`, {
            module: 'debugger',
            action: 'console'
          });
      }
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DebugConfig {
    return { ...this.config };
  }
}

/**
 * Create debugger instance
 */
export function createDebugger(
  config: Partial<DebugConfig>,
  logger: Logger,
  debugDir?: string
): Debugger {
  return new Debugger(config, logger, debugDir);
}
