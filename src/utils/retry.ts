/**
 * Retry utility functions
 */

import { Logger } from '../services/logger';

// =====================================================
// Retry Options
// =====================================================

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

// =====================================================
// Retry Function
// =====================================================

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  logger?: Logger
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();

    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < maxAttempts - 1 && shouldRetry(error)) {
        if (logger) {
          logger.debug(`Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms`, {
            module: 'retry',
            action: 'retry',
            attempt: attempt + 1,
            maxAttempts,
            delay
          });
        }

        if (onRetry) {
          onRetry(attempt + 1, error);
        }

        // Wait before retry
        await sleep(delay);

        // Calculate next delay with exponential backoff
        delay = Math.min(delay * backoffMultiplier, maxDelay);

      } else {
        // No more retries
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Retry with result object
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  logger?: Logger
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts: attempt + 1
      };

    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (attempt < maxAttempts - 1) {
        const { initialDelay = 1000, backoffMultiplier = 2 } = options;
        const delay = initialDelay * Math.pow(backoffMultiplier, attempt);

        if (logger) {
          logger.debug(`Retry attempt ${attempt + 1}/${maxAttempts}`, {
            module: 'retry',
            action: 'retryWithResult'
          });
        }

        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxAttempts
  };
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with specific condition
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    maxAttempts?: number;
    delay?: number;
    timeout?: number;
  } = {},
  logger?: Logger
): Promise<T> {
  const {
    maxAttempts = 30,
    delay = 1000,
    timeout = 30000
  } = options;

  const startTime = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout after ${timeout}ms`);
    }

    try {
      const result = await fn();

      if (condition(result)) {
        return result;
      }

      if (logger) {
        logger.debug(`Condition not met, attempt ${attempt + 1}/${maxAttempts}`, {
          module: 'retry',
          action: 'retryUntil'
        });
      }

    } catch (error) {
      if (logger) {
        logger.debug(`Error in retryUntil: ${error}`, {
          module: 'retry',
          action: 'retryUntil'
        });
      }

      // Throw error on last attempt
      if (attempt === maxAttempts - 1) {
        throw error;
      }
    }

    // Wait before next attempt
    await sleep(delay);
  }

  throw new Error('Max retry attempts reached');
}

/**
 * Create a debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function(this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Create a throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return function(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);

    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn.apply(this, args);
        timeoutId = null;
      }, delay - timeSinceLastCall);
    }
  };
}
