/**
 * Session Storage - Store and manage browser session data
 *
 * Supports two modes:
 * 1. Token-based sessions (legacy)
 * 2. Browser-based sessions (primary)
 */

import fs from 'fs';
import path from 'path';
import { SessionInfo } from '../core/types';
import { Logger } from '../services/logger';

// =====================================================
// Session Storage Types
// =====================================================

/**
 * Session storage options
 */
interface SessionStorageOptions {
  storageDir?: string;
}

/**
 * Stored session data with metadata (token-based)
 */
interface StoredSessionData extends SessionInfo {
  version: string;
}

/**
 * User info storage (browser-based)
 */
interface StoredUserInfo {
  userId: string;
  userName: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Playwright storage state (browser-based)
 */
interface PlaywrightStorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

// =====================================================
// Session Storage Class
// =====================================================

/**
 * Session Storage class for persisting browser sessions
 */
export class SessionStorage {
  private logger: Logger;
  private storageDir: string;
  private sessionFile: string;
  private browserStateFile: string;
  private userInfoFile: string;
  private readonly VERSION = '1.0';

  constructor(logger: Logger, options: SessionStorageOptions = {}) {
    this.logger = logger;
    this.storageDir = options.storageDir || '.storage';
    this.sessionFile = path.join(this.storageDir, 'session.json');
    this.browserStateFile = path.join(this.storageDir, 'browser-state.json');
    this.userInfoFile = path.join(this.storageDir, 'user-info.json');

    // Ensure storage directory exists
    this.ensureStorageDirectory();
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Check if session file exists
   */
  exists(): boolean {
    return fs.existsSync(this.sessionFile);
  }

  /**
   * Save session to storage
   */
  save(sessionInfo: SessionInfo): void {
    try {
      const storedSession: StoredSessionData = {
        ...sessionInfo,
        version: this.VERSION
      };

      const data = JSON.stringify(storedSession, null, 2);
      fs.writeFileSync(this.sessionFile, data, 'utf-8');

      // Set restrictive permissions (Unix-like systems)
      if (process.platform !== 'win32') {
        fs.chmodSync(this.sessionFile, 0o600);
      }

      this.logger.info('Session saved successfully', {
        module: 'session-storage',
        action: 'save',
        userId: sessionInfo.userId
      });

    } catch (error) {
      this.logger.error('Failed to save session', error as Error, {
        module: 'session-storage',
        action: 'save'
      });
      throw new Error('Failed to save session');
    }
  }

  /**
   * Load session from storage
   */
  load(): SessionInfo | null {
    try {
      if (!this.exists()) {
        return null;
      }

      const data = fs.readFileSync(this.sessionFile, 'utf-8');
      const storedSession = JSON.parse(data) as StoredSessionData;

      // Validate version
      if (storedSession.version !== this.VERSION) {
        this.logger.warn('Session version mismatch', {
          module: 'session-storage',
          action: 'load',
          storedVersion: storedSession.version,
          currentVersion: this.VERSION
        });
        return null;
      }

      // Extract session info
      const { version, ...sessionInfo } = storedSession;

      this.logger.info('Session loaded successfully', {
        module: 'session-storage',
        action: 'load',
        userId: sessionInfo.userId
      });

      return sessionInfo;

    } catch (error) {
      this.logger.error('Failed to load session', error as Error, {
        module: 'session-storage',
        action: 'load'
      });
      return null;
    }
  }

  /**
   * Clear session from storage (both token-based and browser-based)
   */
  clear(): void {
    // Clear token-based session
    try {
      if (this.exists()) {
        fs.unlinkSync(this.sessionFile);
        this.logger.info('Session cleared', {
          module: 'session-storage',
          action: 'clear'
        });
      }
    } catch (error) {
      this.logger.error('Failed to clear session', error as Error, {
        module: 'session-storage',
        action: 'clear'
      });
    }

    // Clear browser session
    this.clearBrowserSession();
  }

  /**
   * Check if session is expired
   */
  isExpired(sessionInfo?: SessionInfo): boolean {
    const session = sessionInfo || this.load();
    if (!session) {
      return true;
    }

    // Check if session is expired (with 5 minute buffer)
    const now = Date.now();
    const expiresAt = session.expiresAt - (5 * 60 * 1000);
    return now > expiresAt;
  }

  /**
   * Get session token
   */
  getToken(): string | null {
    const session = this.load();
    if (!session) {
      return null;
    }

    if (this.isExpired(session)) {
      this.logger.info('Session is expired', {
        module: 'session-storage',
        action: 'getToken'
      });
      return null;
    }

    return session.token;
  }

  /**
   * Get user info from session
   */
  getUserInfo(): { userId: string; userName: string } | null {
    const session = this.load();
    if (!session) {
      return null;
    }

    return {
      userId: session.userId,
      userName: session.userName
    };
  }

  /**
   * Update session token
   */
  updateToken(token: string, expiresAt?: number): void {
    const session = this.load();
    if (!session) {
      throw new Error('No existing session to update');
    }

    const updated: SessionInfo = {
      ...session,
      token,
      expiresAt: expiresAt || session.expiresAt,
      updatedAt: Date.now()
    };

    this.save(updated);
  }

  /**
   * Validate session
   */
  validate(): boolean {
    const token = this.getToken();
    return token !== null && token.length > 0;
  }

  /**
   * Get session age in milliseconds
   */
  getSessionAge(): number | null {
    const session = this.load();
    if (!session) {
      return null;
    }

    return Date.now() - session.createdAt;
  }

  /**
   * Get time until expiration in milliseconds
   */
  getTimeUntilExpiration(): number | null {
    const session = this.load();
    if (!session) {
      return null;
    }

    return Math.max(0, session.expiresAt - Date.now());
  }

  /**
   * Export session data (for backup)
   */
  export(): string | null {
    const session = this.load();
    if (!session) {
      return null;
    }

    return JSON.stringify(session, null, 2);
  }

  /**
   * Import session data (from backup)
   */
  import(data: string): void {
    try {
      const sessionInfo = JSON.parse(data) as SessionInfo;

      // Validate required fields
      if (!sessionInfo.token || !sessionInfo.userId || !sessionInfo.expiresAt) {
        throw new Error('Invalid session data');
      }

      this.save(sessionInfo);

      this.logger.info('Session imported successfully', {
        module: 'session-storage',
        action: 'import',
        userId: sessionInfo.userId
      });

    } catch (error) {
      this.logger.error('Failed to import session', error as Error, {
        module: 'session-storage',
        action: 'import'
      });
      throw new Error('Failed to import session');
    }
  }

  /**
   * Get cookies for browser context
   */
  getCookies(): Array<{ name: string; value: string; domain: string; path: string }> {
    const session = this.load();
    if (!session) {
      return [];
    }

    return session.cookies || [];
  }

  /**
   * Get storage state for browser context
   */
  getStorageState(): Record<string, string> {
    const session = this.load();
    if (!session) {
      return {};
    }

    return session.storage || {};
  }

  // =====================================================
  // Browser Session Methods (Playwright-based)
  // =====================================================

  /**
   * Check if we have a valid browser session
   */
  hasValidSession(): boolean {
    return fs.existsSync(this.browserStateFile) && fs.existsSync(this.userInfoFile);
  }

  /**
   * Save Playwright browser state
   */
  saveBrowserState(state: PlaywrightStorageState): void {
    try {
      const data = JSON.stringify(state, null, 2);
      fs.writeFileSync(this.browserStateFile, data, 'utf-8');

      if (process.platform !== 'win32') {
        fs.chmodSync(this.browserStateFile, 0o600);
      }

      this.logger.info('Browser state saved', {
        module: 'session-storage',
        action: 'saveBrowserState'
      });
    } catch (error) {
      this.logger.error('Failed to save browser state', error as Error, {
        module: 'session-storage',
        action: 'saveBrowserState'
      });
      throw new Error('Failed to save browser state');
    }
  }

  /**
   * Load Playwright browser state
   */
  loadBrowserState(): PlaywrightStorageState | null {
    try {
      if (!fs.existsSync(this.browserStateFile)) {
        return null;
      }

      const data = fs.readFileSync(this.browserStateFile, 'utf-8');
      return JSON.parse(data) as PlaywrightStorageState;
    } catch (error) {
      this.logger.error('Failed to load browser state', error as Error, {
        module: 'session-storage',
        action: 'loadBrowserState'
      });
      return null;
    }
  }

  /**
   * Save user info (browser-based)
   */
  saveUserInfo(userInfo: { userId: string; userName: string }): void {
    try {
      const storedUserInfo: StoredUserInfo = {
        ...userInfo,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const data = JSON.stringify(storedUserInfo, null, 2);
      fs.writeFileSync(this.userInfoFile, data, 'utf-8');

      this.logger.info('User info saved', {
        module: 'session-storage',
        action: 'saveUserInfo',
        userId: userInfo.userId
      });
    } catch (error) {
      this.logger.error('Failed to save user info', error as Error, {
        module: 'session-storage',
        action: 'saveUserInfo'
      });
    }
  }

  /**
   * Load user info (browser-based)
   */
  loadUserInfo(): { userId: string; userName: string } | null {
    try {
      if (!fs.existsSync(this.userInfoFile)) {
        return null;
      }

      const data = fs.readFileSync(this.userInfoFile, 'utf-8');
      const userInfo = JSON.parse(data) as StoredUserInfo;

      return {
        userId: userInfo.userId,
        userName: userInfo.userName
      };
    } catch (error) {
      this.logger.error('Failed to load user info', error as Error, {
        module: 'session-storage',
        action: 'loadUserInfo'
      });
      return null;
    }
  }

  /**
   * Clear browser session data
   */
  clearBrowserSession(): void {
    try {
      if (fs.existsSync(this.browserStateFile)) {
        fs.unlinkSync(this.browserStateFile);
      }

      if (fs.existsSync(this.userInfoFile)) {
        fs.unlinkSync(this.userInfoFile);
      }

      this.logger.info('Browser session cleared', {
        module: 'session-storage',
        action: 'clearBrowserSession'
      });
    } catch (error) {
      this.logger.error('Failed to clear browser session', error as Error, {
        module: 'session-storage',
        action: 'clearBrowserSession'
      });
    }
  }
}

/**
 * Get default session storage instance
 */
let defaultSessionStorage: SessionStorage | null = null;

export function getSessionStorage(logger: Logger, options?: SessionStorageOptions): SessionStorage {
  if (!defaultSessionStorage) {
    defaultSessionStorage = new SessionStorage(logger, options);
  }
  return defaultSessionStorage;
}
