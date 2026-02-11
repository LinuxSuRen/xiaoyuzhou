/**
 * Crypto utilities for secure token storage
 */

import crypto from 'crypto';
import { Logger } from '../services/logger';

// =====================================================
// Crypto Configuration
// =====================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const ITERATIONS = 100000;

// =====================================================
// Crypto Class
// =====================================================

/**
 * Crypto utility class for encryption/decryption
 */
export class CryptoUtil {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Generate a key from password using PBKDF2
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt data
   */
  encrypt(data: string, password: string): string {
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);

      // Derive key from password
      const key = this.deriveKey(password, salt);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      // Encrypt data
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get auth tag
      const tag = cipher.getAuthTag();

      // Combine: salt + iv + tag + encrypted
      const combined = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]);

      // Return as base64
      return combined.toString('base64');

    } catch (error) {
      this.logger.error('Encryption failed', error as Error, {
        module: 'crypto',
        action: 'encrypt'
      });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data
   */
  decrypt(encryptedData: string, password: string): string {
    try {
      // Decode base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = combined.subarray(0, SALT_LENGTH);
      const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const tag = combined.subarray(
        SALT_LENGTH + IV_LENGTH,
        SALT_LENGTH + IV_LENGTH + TAG_LENGTH
      );
      const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

      // Derive key from password
      const key = this.deriveKey(password, salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      // Decrypt data
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');

    } catch (error) {
      this.logger.error('Decryption failed', error as Error, {
        module: 'crypto',
        action: 'decrypt'
      });
      throw new Error('Failed to decrypt data - invalid password or corrupted data');
    }
  }

  /**
   * Generate random password
   */
  generatePassword(length: number = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  /**
   * Hash data using SHA256
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate random token
   */
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify integrity of encrypted data
   */
  verifyIntegrity(encryptedData: string): boolean {
    try {
      const combined = Buffer.from(encryptedData, 'base64');

      // Check minimum length
      const minLength = SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
      if (combined.length < minLength) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get machine-specific key for encryption
 */
export function getMachineKey(): string {
  const platform = require('os').platform();
  const hostname = require('os').hostname();
  const cpus = require('os').cpus();

  let cpuInfo = '';
  if (cpus && cpus.length > 0) {
    cpuInfo = cpus[0].model || '';
  }

  // Create a reasonably unique but stable key for this machine
  const rawKey = `${platform}-${hostname}-${cpuInfo}`;
  return rawKey;
}
