/**
 * Token Storage - Secure storage for authentication tokens
 */

import fs from 'fs';
import path from 'path';
import { CryptoUtil, getMachineKey } from './crypto';
import { Logger } from '../services/logger';

// =====================================================
// Token Storage Types
// =====================================================

/**
 * Stored token data
 */
interface StoredToken {
  token: string;
  userId: string;
  userName: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Token storage options
 */
interface TokenStorageOptions {
  storageDir?: string;
  password?: string;
}

// =====================================================
// Token Storage Class
// =====================================================

/**
 * Token Storage class for secure token persistence
 */
export class TokenStorage {
  private logger: Logger;
  private crypto: CryptoUtil;
  private storageDir: string;
  private password: string;
  private tokenFile: string;

  constructor(logger: Logger, options: TokenStorageOptions = {}) {
    this.logger = logger;
    this.storageDir = options.storageDir || '.storage';
    this.password = options.password || getMachineKey();
    this.crypto = new CryptoUtil(logger);
    this.tokenFile = path.join(this.storageDir, 'token.encrypted');

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
   * Check if token file exists
   */
  exists(): boolean {
    return fs.existsSync(this.tokenFile);
  }

  /**
   * Save token to storage
   */
  save(tokenData: StoredToken): void {
    try {
      const data = JSON.stringify(tokenData, null, 2);
      const encrypted = this.crypto.encrypt(data, this.password);

      fs.writeFileSync(this.tokenFile, encrypted, 'utf-8');

      // Set restrictive permissions (Unix-like systems)
      if (process.platform !== 'win32') {
        fs.chmodSync(this.tokenFile, 0o600);
      }

      this.logger.info('Token saved successfully', {
        module: 'token-storage',
        action: 'save',
        userId: tokenData.userId
      });

    } catch (error) {
      this.logger.error('Failed to save token', error as Error, {
        module: 'token-storage',
        action: 'save'
      });
      throw new Error('Failed to save token');
    }
  }

  /**
   * Load token from storage
   */
  load(): StoredToken | null {
    try {
      if (!this.exists()) {
        return null;
      }

      const encrypted = fs.readFileSync(this.tokenFile, 'utf-8');

      // Verify integrity
      if (!this.crypto.verifyIntegrity(encrypted)) {
        this.logger.warn('Token file integrity check failed', {
          module: 'token-storage',
          action: 'load'
        });
        this.clear();
        return null;
      }

      const decrypted = this.crypto.decrypt(encrypted, this.password);
      const tokenData = JSON.parse(decrypted) as StoredToken;

      this.logger.info('Token loaded successfully', {
        module: 'token-storage',
        action: 'load',
        userId: tokenData.userId
      });

      return tokenData;

    } catch (error) {
      this.logger.error('Failed to load token', error as Error, {
        module: 'token-storage',
        action: 'load'
      });
      return null;
    }
  }

  /**
   * Clear token from storage
   */
  clear(): void {
    try {
      if (this.exists()) {
        fs.unlinkSync(this.tokenFile);
        this.logger.info('Token cleared', {
          module: 'token-storage',
          action: 'clear'
        });
      }
    } catch (error) {
      this.logger.error('Failed to clear token', error as Error, {
        module: 'token-storage',
        action: 'clear'
      });
    }
  }

  /**
   * Check if token is expired
   */
  isExpired(tokenData?: StoredToken): boolean {
    const token = tokenData || this.load();
    if (!token) {
      return true;
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Date.now();
    const expiresAt = token.expiresAt - (5 * 60 * 1000);
    return now > expiresAt;
  }

  /**
   * Get token from storage
   */
  getToken(): string | null {
    const tokenData = this.load();
    if (!tokenData) {
      return null;
    }

    if (this.isExpired(tokenData)) {
      this.logger.info('Token is expired', {
        module: 'token-storage',
        action: 'getToken'
      });
      return null;
    }

    return tokenData.token;
  }

  /**
   * Get user info from token
   */
  getUserInfo(): { userId: string; userName: string } | null {
    const tokenData = this.load();
    if (!tokenData) {
      return null;
    }

    return {
      userId: tokenData.userId,
      userName: tokenData.userName
    };
  }

  /**
   * Update token
   */
  updateToken(token: string, expiresAt: number): void {
    const tokenData = this.load();
    if (!tokenData) {
      throw new Error('No existing token to update');
    }

    const updated: StoredToken = {
      ...tokenData,
      token,
      expiresAt,
      updatedAt: Date.now()
    };

    this.save(updated);
  }

  /**
   * Validate token
   */
  validate(): boolean {
    const token = this.getToken();
    return token !== null && token.length > 0;
  }

  /**
   * Get token age in milliseconds
   */
  getTokenAge(): number | null {
    const tokenData = this.load();
    if (!tokenData) {
      return null;
    }

    return Date.now() - tokenData.createdAt;
  }

  /**
   * Get time until expiration in milliseconds
   */
  getTimeUntilExpiration(): number | null {
    const tokenData = this.load();
    if (!tokenData) {
      return null;
    }

    return Math.max(0, tokenData.expiresAt - Date.now());
  }

  /**
   * Export token data (for backup)
   */
  export(): string | null {
    const tokenData = this.load();
    if (!tokenData) {
      return null;
    }

    return JSON.stringify(tokenData, null, 2);
  }

  /**
   * Import token data (from backup)
   */
  import(data: string): void {
    try {
      const tokenData = JSON.parse(data) as StoredToken;

      // Validate required fields
      if (!tokenData.token || !tokenData.userId || !tokenData.expiresAt) {
        throw new Error('Invalid token data');
      }

      this.save(tokenData);

      this.logger.info('Token imported successfully', {
        module: 'token-storage',
        action: 'import',
        userId: tokenData.userId
      });

    } catch (error) {
      this.logger.error('Failed to import token', error as Error, {
        module: 'token-storage',
        action: 'import'
      });
      throw new Error('Failed to import token');
    }
  }
}

/**
 * Get default token storage instance
 */
let defaultTokenStorage: TokenStorage | null = null;

export function getTokenStorage(logger: Logger, options?: TokenStorageOptions): TokenStorage {
  if (!defaultTokenStorage) {
    defaultTokenStorage = new TokenStorage(logger, options);
  }
  return defaultTokenStorage;
}
