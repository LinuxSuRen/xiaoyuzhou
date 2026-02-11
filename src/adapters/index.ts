/**
 * Adapters module exports
 */

export { BaseAdapter, IAdapter, type PublishOptions, type BaseAdapterConfig, type PlaywrightConfig, type HttpConfig } from './base';
export { PlaywrightAdapter } from './playwright.adapter';
export { HttpAdapter } from './http.adapter';

// Re-export AdapterResult for convenience
export type { AdapterResult } from '../core/types';
