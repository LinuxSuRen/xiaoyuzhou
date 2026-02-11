/**
 * Helper utility functions
 */

import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';

// =====================================================
// String Helpers
// =====================================================

/**
 * Truncate string to max length
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert to title case
 */
export function titleCase(str: string): string {
  return str.toLowerCase().split(' ').map(capitalize).join(' ');
}

/**
 * Generate random string
 */
export function randomString(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate slug from string
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// =====================================================
// Array Helpers
// =====================================================

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Shuffle array
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Remove duplicates from array
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

// =====================================================
// Number Helpers
// =====================================================

/**
 * Clamp number between min and max
 */
export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

/**
 * Round to decimal places
 */
export function round(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Generate range of numbers
 */
export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}

/**
 * Parse integer with fallback
 */
export function parseIntSafe(value: string, fallback: number = 0): number {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse float with fallback
 */
export function parseFloatSafe(value: string, fallback: number = 0): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

// =====================================================
// Date Helpers
// =====================================================

/**
 * Format date in Chinese locale
 */
export function formatDate(date: Date | string, formatStr: string = 'yyyy-MM-dd HH:mm'): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, formatStr, { locale: zhCN });
  } catch {
    return String(date);
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${round(size, 2)} ${units[unitIndex]}`;
}

/**
 * Get relative time string
 */
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return formatDate(d);
  } else if (days > 0) {
    return `${days} 天前`;
  } else if (hours > 0) {
    return `${hours} 小时前`;
  } else if (minutes > 0) {
    return `${minutes} 分钟前`;
  } else {
    return '刚刚';
  }
}

// =====================================================
// File System Helpers
// =====================================================

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get file extension
 */
export function getExtension(filePath: string): string {
  return path.extname(filePath).slice(1);
}

/**
 * Get file name without extension
 */
export function getFileName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Check if path exists
 */
export function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Read JSON file safely
 */
export function readJSON<T = any>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch {
    // Return fallback on error
  }
  return fallback;
}

/**
 * Write JSON file safely
 */
export function writeJSON(filePath: string, data: any): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// =====================================================
// Validation Helpers
// =====================================================

/**
 * Check if value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Check if string is empty
 */
export function isEmpty(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}

/**
 * Check if value is a valid email
 */
export function isEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Check if value is a valid URL
 */
export function isURL(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if value is a valid phone number (Chinese)
 */
export function isPhone(value: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(value);
}

// =====================================================
// Async Helpers
// =====================================================

/**
 * Delay execution
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute functions in parallel with concurrency limit
 */
export async function parallel<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  concurrency: number = 5
): Promise<void> {
  const executing: Promise<any>[] = [];

  for (const item of items) {
    const promise = fn(item).then(() => {
      executing.splice(executing.indexOf(promise), 1);
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

/**
 * Execute functions sequentially
 */
export async function sequential<T>(
  items: T[],
  fn: (item: T) => Promise<any>
): Promise<void> {
  for (const item of items) {
    await fn(item);
  }
}

// =====================================================
// Object Helpers
// =====================================================

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      const targetValue = (result as any)[key];
      result[key as keyof T] = deepMerge(targetValue && typeof targetValue === 'object' ? targetValue : {}, source[key] as any) as any;
    } else {
      result[key as keyof T] = source[key] as any;
    }
  }

  return result;
}

/**
 * Pick properties from object
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit properties from object
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}
