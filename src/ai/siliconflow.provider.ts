/**
 * SiliconFlow Provider Implementation
 * https://siliconflow.cn/
 */

import { IAIProvider, AIProvider, AICompletionOptions, AICompletionResult, AIEmbeddingOptions, AIEmbeddingResult, AIMessage, AIRole, AIProviderConfig } from './provider';

// =====================================================
// SiliconFlow Types
// =====================================================

interface SiliconFlowMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface SiliconFlowChatRequest {
  model: string;
  messages: SiliconFlowMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

interface SiliconFlowChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface SiliconFlowEmbeddingRequest {
  model: string;
  input: string;
  dimensions?: number;
}

interface SiliconFlowEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// =====================================================
// SiliconFlow Provider
// =====================================================

/**
 * SiliconFlow provider implementation
 */
export class SiliconFlowProvider implements IAIProvider {
  private config: AIProviderConfig;
  private readonly DEFAULT_MODEL = 'Qwen/Qwen2.5-7B-Instruct';
  private readonly DEFAULT_EMBEDDING_MODEL = 'BAAI/bge-large-zh-v1.5';
  private readonly DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1';

  constructor(config: AIProviderConfig) {
    this.config = {
      ...config,
      baseURL: config.baseURL || this.DEFAULT_BASE_URL,
      model: config.model || this.DEFAULT_MODEL,
      embeddingModel: config.embeddingModel || this.DEFAULT_EMBEDDING_MODEL
    };
  }

  /**
   * Get provider type
   */
  getProvider(): AIProvider {
    return AIProvider.SILICONFLOW;
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    };
  }

  /**
   * Get base URL
   */
  private getBaseURL(): string {
    return this.config.baseURL || this.DEFAULT_BASE_URL;
  }

  /**
   * Get model
   */
  private getModel(): string {
    return this.config.model || this.DEFAULT_MODEL;
  }

  /**
   * Get embedding model
   */
  private getEmbeddingModel(): string {
    return this.config.embeddingModel || this.DEFAULT_EMBEDDING_MODEL;
  }

  /**
   * Convert AI messages to SiliconFlow format
   */
  private convertMessages(messages: AIMessage[]): SiliconFlowMessage[] {
    return messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    }));
  }

  /**
   * Chat completion
   */
  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const response = await fetch(`${this.getBaseURL()}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModel(),
        messages: this.convertMessages(messages),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        stop: options?.stopSequences
      } as SiliconFlowChatRequest)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SiliconFlow API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as SiliconFlowChatResponse;
    const choice = data.choices[0];

    return {
      content: choice.message.content,
      finishReason: choice.finish_reason as 'stop' | 'length' | 'content_filter',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }

  /**
   * Text completion
   */
  async complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult> {
    return this.chat([{ role: AIRole.USER, content: prompt }], options);
  }

  /**
   * Generate embedding
   */
  async embed(text: string, options?: AIEmbeddingOptions): Promise<AIEmbeddingResult> {
    const response = await fetch(`${this.getBaseURL()}/embeddings`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: options?.model || this.getEmbeddingModel(),
        input: text,
        dimensions: options?.dimensions
      } as SiliconFlowEmbeddingRequest)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SiliconFlow API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as SiliconFlowEmbeddingResponse;
    const embedding = data.data[0];

    return {
      embedding: embedding.embedding,
      model: data.model
    };
  }

  /**
   * Stream chat completion
   */
  async streamChat(
    messages: AIMessage[],
    options?: AICompletionOptions,
    onChunk?: (chunk: string) => void
  ): Promise<AICompletionResult> {
    const response = await fetch(`${this.getBaseURL()}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModel(),
        messages: this.convertMessages(messages),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        stop: options?.stopSequences,
        stream: true
      } as SiliconFlowChatRequest)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SiliconFlow API error: ${response.status} - ${error}`);
    }

    let fullContent = '';

    // Process streaming response
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                onChunk?.(delta);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    }

    return {
      content: fullContent,
      finishReason: 'stop'
    };
  }
}
