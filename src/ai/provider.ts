/**
 * AI Provider - Interface for AI providers (OpenAI, Claude, etc.)
 */

// =====================================================
// AI Provider Types
// =====================================================

/**
 * Supported AI providers
 */
export enum AIProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  CUSTOM = 'custom'
}

/**
 * AI message role
 */
export enum AIRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant'
}

/**
 * AI message
 */
export interface AIMessage {
  role: AIRole;
  content: string;
}

/**
 * AI completion options
 */
export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}

/**
 * AI completion result
 */
export interface AICompletionResult {
  content: string;
  finishReason: 'stop' | 'length' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * AI embedding options
 */
export interface AIEmbeddingOptions {
  model?: string;
  dimensions?: number;
}

/**
 * AI embedding result
 */
export interface AIEmbeddingResult {
  embedding: number[];
  model: string;
}

/**
 * AI provider configuration
 */
export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseURL?: string;
  model?: string;
  embeddingModel?: string;
}

// =====================================================
// AI Provider Interface
// =====================================================

/**
 * Interface for AI providers
 */
export interface IAIProvider {
  /**
   * Get provider type
   */
  getProvider(): AIProvider;

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean;

  /**
   * Chat completion
   */
  chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult>;

  /**
   * Text completion
   */
  complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult>;

  /**
   * Generate embedding
   */
  embed(text: string, options?: AIEmbeddingOptions): Promise<AIEmbeddingResult>;

  /**
   * Stream chat completion
   */
  streamChat(
    messages: AIMessage[],
    options?: AICompletionOptions,
    onChunk?: (chunk: string) => void
  ): Promise<AICompletionResult>;
}

// =====================================================
// AI Configuration
// =====================================================

/**
 * AI configuration from environment or config file
 */
export interface AIConfig {
  enabled: boolean;
  defaultProvider?: AIProvider;
  providers: Partial<Record<AIProvider, AIProviderConfig>>;
}

/**
 * Default AI config
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: false,
  providers: {}
};
