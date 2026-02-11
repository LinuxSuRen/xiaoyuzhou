/**
 * Authentication Manager - Browser Session Based
 *
 * This module manages authentication through persistent browser sessions.
 * No token extraction or storage - the browser session is the source of truth.
 */

import { Browser, Page, BrowserContext } from 'playwright';
import { Logger } from '../services/logger';
import { ErrorHandler } from '../services/error-handler';
import { SessionStorage } from '../storage/session';
import { LoginMethod, AuthResult } from './types';

// =====================================================
// Authentication Configuration
// =====================================================

interface AuthConfig {
  logger: Logger;
  errorHandler: ErrorHandler;
  sessionStorage: SessionStorage;
  headless?: boolean;
  slowMo?: number;
}

// =====================================================
// Authentication Manager
// =====================================================

/**
 * Authentication Manager - Browser session based
 *
 * Core principle: Browser session is the source of truth.
 * No token extraction - rely on browser cookies and localStorage.
 */
export class AuthManager {
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private sessionStorage: SessionStorage;
  private headless: boolean;
  private slowMo: number;

  // Browser session (not exposed outside)
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  // User info (cached)
  private userInfo: { userId: string; userName: string } | null = null;

  constructor(config: AuthConfig) {
    this.logger = config.logger;
    this.errorHandler = config.errorHandler;
    this.sessionStorage = config.sessionStorage;
    this.headless = config.headless ?? false;
    this.slowMo = config.slowMo ?? 50;
  }

  // =====================================================
  // Public Methods
  // =====================================================

  /**
   * Login - Main entry point
   *
   * @param options - Login options
   * @returns Auth result with success flag
   */
  async login(options: { force?: boolean; method?: LoginMethod } = {}): Promise<AuthResult> {
    const { force = false, method = LoginMethod.QR_CODE } = options;

    try {
      this.logger.info('Starting login process', {
        module: 'auth',
        action: 'login',
        method,
        force
      });

      // Check if already logged in (via saved session)
      if (!force && this.sessionStorage.hasValidSession()) {
        this.logger.info('Valid session found, skipping login', {
          module: 'auth',
          action: 'login'
        });

        // Restore user info from session
        const savedUserInfo = this.sessionStorage.loadUserInfo();
        if (savedUserInfo) {
          this.userInfo = savedUserInfo;
        }

        return {
          success: true,
          userId: this.userInfo?.userId,
          userName: this.userInfo?.userName
        };
      }

      // Perform login based on method
      let loginSuccess = false;

      switch (method) {
        case LoginMethod.QR_CODE:
          loginSuccess = await this.loginByQRCode();
          break;

        case LoginMethod.PHONE_CODE:
          loginSuccess = await this.loginByPhoneCode();
          break;

        default:
          return {
            success: false,
            error: `Unsupported login method: ${method}`
          };
      }

      if (!loginSuccess) {
        return {
          success: false,
          error: 'Login failed'
        };
      }

      // Save session info
      await this.saveSession();

      return {
        success: true,
        userId: this.userInfo?.userId,
        userName: this.userInfo?.userName
      };

    } catch (error) {
      this.logger.error('Login process failed', error as Error, {
        module: 'auth',
        action: 'login'
      });

      return {
        success: false,
        error: (error as Error).message || 'Unknown error'
      };
    }
  }

  /**
   * Check if authenticated
   *
   * Checks if we have a valid browser session
   */
  isAuthenticated(): boolean {
    // Check if we have active browser/context
    if (this.browser && this.context) {
      return true;
    }

    // Check if we have saved session data
    return this.sessionStorage.hasValidSession();
  }

  /**
   * Get user info
   */
  getUserInfo(): { userId: string; userName: string } | null {
    return this.userInfo;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    this.logger.info('Logging out', {
      module: 'auth',
      action: 'logout'
    });

    // Clear browser session
    await this.closeBrowser();

    // Clear saved session (including browser session)
    this.sessionStorage.clearBrowserSession();

    // Clear user info
    this.userInfo = null;

    this.logger.info('Logged out successfully', {
      module: 'auth',
      action: 'logout'
    });
  }

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    await this.closeBrowser();
  }

  // =====================================================
  // Internal Methods
  // =====================================================

  /**
   * Check if we have a valid saved session
   */
  private async hasValidSession(): Promise<boolean> {
    // Try to restore session from storage
    const session = this.sessionStorage.load();

    if (!session) {
      return false;
    }

    // Try to validate session by attempting to use it
    // (This would be handled by the adapter when it needs the browser)
    return true;
  }

  /**
   * Login via QR Code
   */
  private async loginByQRCode(): Promise<boolean> {
    const playwright = await import('playwright');

    this.logger.info('Starting QR code login', {
      module: 'auth',
      action: 'loginByQRCode'
    });

    try {
      // Launch browser
      this.browser = await playwright.chromium.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        args: ['--start-maximized']
      });

      // Create context with persistent session
      this.context = await this.browser.newContext({
        viewport: null, // Auto-resize
        storageState: this.sessionStorage.loadBrowserState() as any
      });

      this.page = await this.context.newPage();

      // Navigate to login page
      await this.page.goto('https://podcaster.xiaoyuzhoufm.com/login', {
        waitUntil: 'networkidle'
      });

      this.logger.info('Browser opened, waiting for QR code scan', {
        module: 'auth',
        action: 'loginByQRCode'
      });

      // Wait for login - check if we reach the dashboard
      const loginSuccess = await this.page.waitForNavigation({
        url: /https:\/\/podcaster\.xiaoyuzhoufm\.com\/dashboard/,
        timeout: 120000 // 2 minutes
      }).then(() => true).catch(() => false);

      if (!loginSuccess) {
        // Check if URL changed to dashboard (might have already navigated)
        const currentUrl = this.page.url();
        if (currentUrl.includes('dashboard')) {
          return true;
        }

        this.logger.error('QR code login timeout or failed', undefined, {
          module: 'auth',
          action: 'loginByQRCode'
        });

        await this.closeBrowser();
        return false;
      }

      // Extract user info from dashboard
      await this.extractUserInfo();

      this.logger.info('QR code login successful', {
        module: 'auth',
        action: 'loginByQRCode',
        userId: this.userInfo?.userId
      });

      return true;

    } catch (error) {
      this.logger.error('QR code login failed', error as Error, {
        module: 'auth',
        action: 'loginByQRCode'
      });

      await this.closeBrowser();
      return false;
    }
  }

  /**
   * Login via Phone + SMS Code
   */
  private async loginByPhoneCode(): Promise<boolean> {
    const playwright = await import('playwright');

    this.logger.info('Starting phone code login', {
      module: 'auth',
      action: 'loginByPhoneCode'
    });

    try {
      // Launch browser
      this.browser = await playwright.chromium.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        args: ['--start-maximized']
      });

      // Create context
      this.context = await this.browser.newContext({
        viewport: null,
        storageState: this.sessionStorage.loadBrowserState() as any
      });

      this.page = await this.context.newPage();

      // Navigate to login page
      await this.page.goto('https://podcaster.xiaoyuzhoufm.com/login', {
        waitUntil: 'networkidle'
      });

      // Click phone login tab/button
      // Note: Selector depends on actual page structure
      await this.page.click('text=手机登录').catch(() => {
        this.logger.warn('Could not find phone login button', {
          module: 'auth',
          action: 'loginByPhoneCode'
        });
      });

      this.logger.info('Waiting for user to complete phone login', {
        module: 'auth',
        action: 'loginByPhoneCode'
      });

      // Wait for login to complete
      const loginSuccess = await this.page.waitForNavigation({
        url: /https:\/\/podcaster\.xiaoyuzhoufm\.com\/dashboard/,
        timeout: 120000
      }).then(() => true).catch(() => false);

      if (!loginSuccess) {
        const currentUrl = this.page.url();
        if (currentUrl.includes('dashboard')) {
          return true;
        }

        this.logger.error('Phone code login timeout or failed', undefined, {
          module: 'auth',
          action: 'loginByPhoneCode'
        });

        await this.closeBrowser();
        return false;
      }

      // Extract user info
      await this.extractUserInfo();

      this.logger.info('Phone code login successful', {
        module: 'auth',
        action: 'loginByPhoneCode',
        userId: this.userInfo?.userId
      });

      return true;

    } catch (error) {
      this.logger.error('Phone code login failed', error as Error, {
        module: 'auth',
        action: 'loginByPhoneCode'
      });

      await this.closeBrowser();
      return false;
    }
  }

  /**
   * Extract user info from dashboard
   */
  private async extractUserInfo(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      // Try to get user info from localStorage
      const userData = await this.page.evaluate(() => {
        // This depends on actual storage structure
        const storage = {
          userId: localStorage.getItem('userId') || '',
          userName: localStorage.getItem('userName') || '',
          userInfo: localStorage.getItem('userInfo') || ''
        };

        // Try parsing userInfo if available
        if (storage.userInfo) {
          try {
            const parsed = JSON.parse(storage.userInfo);
            return {
              userId: parsed.userId || storage.userId,
              userName: parsed.userName || storage.userName
            };
          } catch {
            // Fall back to individual keys
          }
        }

        return storage;
      });

      if (userData.userId || userData.userName) {
        this.userInfo = {
          userId: userData.userId || 'unknown',
          userName: userData.userName || 'User'
        };
      } else {
        // Default values
        this.userInfo = {
          userId: 'logged-in',
          userName: 'User'
        };
      }

    } catch (error) {
      this.logger.warn('Could not extract user info', {
        module: 'auth',
        action: 'extractUserInfo'
      });

      this.userInfo = {
        userId: 'logged-in',
        userName: 'User'
      };
    }
  }

  /**
   * Save session info
   */
  private async saveSession(): Promise<void> {
    if (!this.context) {
      return;
    }

    try {
      // Save browser state (cookies, localStorage, etc.)
      const state = await this.context.storageState();
      this.sessionStorage.saveBrowserState(state as any);

      // Save user info
      if (this.userInfo) {
        this.sessionStorage.saveUserInfo(this.userInfo);
      }

      this.logger.info('Session saved', {
        module: 'auth',
        action: 'saveSession'
      });

    } catch (error) {
      this.logger.error('Failed to save session', error as Error, {
        module: 'auth',
        action: 'saveSession'
      });
    }
  }

  /**
   * Close browser
   */
  private async closeBrowser(): Promise<void> {
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
    } catch (error) {
      this.logger.warn('Error closing browser', {
        module: 'auth',
        action: 'closeBrowser'
      });
    }
  }

  // =====================================================
  // Browser Access (for Adapters)
  // =====================================================

  /**
   * Get browser instance (for adapters to use)
   *
   * Note: This is intentionally not in the public interface.
   * It's meant to be used by the client to pass to adapters.
   *
   * @internal
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      // Try to restore session
      const session = this.sessionStorage.load();
      if (!session) {
        throw new Error('No active browser session. Please login first.');
      }

      // Create browser with saved session
      const playwright = await import('playwright');
      this.browser = await playwright.chromium.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        args: ['--start-maximized']
      });

      this.context = await this.browser.newContext({
        viewport: null,
        storageState: session as any
      });

      this.page = await this.context.newPage();
    }

    return this.browser;
  }

  /**
   * Get browser context (for adapters to use)
   *
   * @internal
   */
  async getContext(): Promise<BrowserContext> {
    await this.getBrowser(); // Ensure browser exists

    if (!this.context) {
      throw new Error('Browser context not available');
    }

    return this.context;
  }

  /**
   * Get page (for adapters to use)
   *
   * @internal
   */
  async getPage(): Promise<Page> {
    await this.getBrowser(); // Ensure browser exists

    if (!this.page) {
      throw new Error('Page not available');
    }

    return this.page;
  }

  /**
   * Check if browser is active
   *
   * @internal
   */
  isBrowserActive(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Reuse existing browser context for operations
   *
   * @internal
   */
  async reuseOrCreateContext(): Promise<BrowserContext> {
    if (this.context && this.browser?.isConnected()) {
      return this.context;
    }

    // Need to create new context with saved session
    const sessionState = this.sessionStorage.loadBrowserState();
    if (!sessionState) {
      throw new Error('No saved session found. Please login first.');
    }

    const playwright = await import('playwright');

    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await playwright.chromium.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        args: ['--start-maximized']
      });
    }

    this.context = await this.browser.newContext({
      viewport: null,
      storageState: sessionState as any
    });

    this.page = await this.context.newPage();

    return this.context;
  }
}
