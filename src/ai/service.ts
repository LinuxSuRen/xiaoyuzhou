/**
 * AI Service - High-level AI service for podcast automation
 */

import { IAIProvider, AIProvider as AIProviderType, AIConfig, AIMessage, AIRole, AICompletionOptions, DEFAULT_AI_CONFIG } from './provider';
import { OpenAIProvider } from './openai.provider';
import { Logger } from '../services/logger';

// =====================================================
// AI-Powered Features
// =====================================================

/**
 * Content generation options
 */
export interface ContentGenerationOptions {
  tone?: 'professional' | 'casual' | 'enthusiastic' | 'educational';
  length?: 'short' | 'medium' | 'long';
  includeTimestamps?: boolean;
  keywords?: string[];
}

/**
 * Show notes generation result
 */
export interface ShowNotesResult {
  title: string;
  summary: string;
  keyPoints: string[];
  hashtags: string[];
  timecodes?: Array<{ time: string; description: string }>;
}

/**
 * Transcript analysis result
 */
export interface TranscriptAnalysisResult {
  summary: string;
  keyTopics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestedTitle: string;
  suggestedDescription: string;
}

/**
 * SEO optimization result
 */
export interface SEOOptimizationResult {
  title: string;
  description: string;
  keywords: string[];
  tags: string[];
}

/**
 * Content suggestions
 */
export interface ContentSuggestions {
  titleIdeas: string[];
  descriptionIdeas: string[];
  tagSuggestions: string[];
}

// =====================================================
// AI Service Class
// =====================================================

/**
 * AI Service for podcast automation
 */
export class AIService {
  private logger: Logger;
  private config: AIConfig;
  private providers: Map<AIProviderType, IAIProvider>;
  private defaultProvider: IAIProvider | null = null;

  constructor(config: Partial<AIConfig> = {}, logger: Logger) {
    this.logger = logger;
    this.config = {
      ...DEFAULT_AI_CONFIG,
      ...config,
      providers: { ...DEFAULT_AI_CONFIG.providers, ...config.providers }
    };
    this.providers = new Map();

    // Initialize configured providers
    this.initializeProviders();
  }

  /**
   * Initialize AI providers
   */
  private initializeProviders(): void {
    for (const [providerType, providerConfig] of Object.entries(this.config.providers)) {
      if (!providerConfig || !providerConfig.apiKey) {
        continue;
      }

      let provider: IAIProvider | null = null;

      switch (providerType as AIProviderType) {
        case AIProviderType.OPENAI:
          provider = new OpenAIProvider(providerConfig);
          break;

        // Add other providers here
        // case AIProviderType.CLAUDE:
        //   provider = new ClaudeProvider(providerConfig);
        //   break;

        default:
          this.logger.warn(`Unsupported AI provider: ${providerType}`, {
            module: 'ai-service',
            action: 'initializeProviders'
          });
      }

      if (provider) {
        this.providers.set(providerType as AIProviderType, provider);
        this.logger.info(`Initialized AI provider: ${providerType}`, {
          module: 'ai-service',
          action: 'initializeProviders'
        });
      }
    }

    // Set default provider
    if (this.config.defaultProvider) {
      this.defaultProvider = this.providers.get(this.config.defaultProvider) || null;
    } else if (this.providers.size > 0) {
      const nextProvider = this.providers.values().next().value;
      if (nextProvider) {
        this.defaultProvider = nextProvider;
      }
    }
  }

  /**
   * Check if AI is available
   */
  isAvailable(): boolean {
    return this.config.enabled && this.defaultProvider !== null;
  }

  /**
   * Get current provider
   */
  private getProvider(): IAIProvider {
    if (!this.defaultProvider) {
      throw new Error('AI provider not configured. Please set up an AI provider.');
    }
    return this.defaultProvider!;
  }

  // =====================================================
  // Content Generation Features
  // =====================================================

  /**
   * Generate show notes from transcript
   */
  async generateShowNotes(
    transcript: string,
    options?: ContentGenerationOptions
  ): Promise<ShowNotesResult> {
    const provider = this.getProvider();

    const prompt = this.buildShowNotesPrompt(transcript, options);

    const response = await provider.chat([
      { role: AIRole.SYSTEM, content: this.getSystemPrompt() },
      { role: AIRole.USER, content: prompt }
    ]);

    return this.parseShowNotesResult(response.content);
  }

  /**
   * Generate episode title
   */
  async generateTitle(transcript: string, context?: string): Promise<string> {
    const provider = this.getProvider();

    const prompt = `Based on the following transcript, generate a catchy and descriptive title for a podcast episode.

Transcript:
${transcript.slice(0, 2000)}...

${context ? `Additional context: ${context}` : ''}

Return only the title, nothing else.`;

    const response = await provider.complete(prompt);

    return response.content.trim().replace(/^"|"$/g, '');
  }

  /**
   * Generate episode description
   */
  async generateDescription(
    transcript: string,
    title: string,
    options?: ContentGenerationOptions
  ): Promise<string> {
    const provider = this.getProvider();

    const prompt = `Write a compelling description for a podcast episode titled "${title}".

${transcript ? `Transcript excerpt:\n${transcript.slice(0, 1500)}...` : ''}

The description should be:
- Engaging and informative
- 2-3 paragraphs long
- Written in a ${options?.tone || 'professional'} tone
- Include relevant keywords naturally

Return only the description, nothing else.`;

    const response = await provider.complete(prompt, {
      maxTokens: 500
    });

    return response.content.trim();
  }

  /**
   * Analyze transcript for key insights
   */
  async analyzeTranscript(transcript: string): Promise<TranscriptAnalysisResult> {
    const provider = this.getProvider();

    const prompt = `Analyze the following podcast transcript and provide:

1. A brief summary (2-3 sentences)
2. Key topics discussed (3-5 topics)
3. Overall sentiment (positive/neutral/negative)
4. A suggested catchy title
5. A suggested episode description

Transcript:
${transcript.slice(0, 3000)}...

Return the results in JSON format:
{
  "summary": "...",
  "keyTopics": ["...", "..."],
  "sentiment": "positive/neutral/negative",
  "suggestedTitle": "...",
  "suggestedDescription": "..."
}`;

    const response = await provider.complete(prompt, {
      temperature: 0.3
    });

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as TranscriptAnalysisResult;
      }
    } catch {
      // Fall back to parsing
    }

    return this.parseTranscriptAnalysis(response.content);
  }

  /**
   * Generate SEO-optimized metadata
   */
  async optimizeForSEO(
    title: string,
    description: string,
    transcript?: string
  ): Promise<SEOOptimizationResult> {
    const provider = this.getProvider();

    const prompt = `Optimize the following podcast episode metadata for SEO.

Current Title: ${title}
Current Description: ${description}
${transcript ? `Transcript excerpt:\n${transcript.slice(0, 1000)}...` : ''}

Provide:
1. An optimized title (under 60 characters)
2. An optimized description (150-160 characters)
3. Relevant keywords (5-10)
4. Suggested tags (5-10)

Return in JSON format:
{
  "title": "...",
  "description": "...",
  "keywords": ["...", "..."],
  "tags": ["...", "..."]
}`;

    const response = await provider.complete(prompt, {
      temperature: 0.3
    });

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as SEOOptimizationResult;
      }
    } catch {
      // Fall back to parsing
    }

    return this.parseSEOResult(response.content);
  }

  /**
   * Get content suggestions
   */
  async getContentSuggestions(
    showTitle: string,
    recentTopics: string[],
    count: number = 5
  ): Promise<ContentSuggestions> {
    const provider = this.getProvider();

    const prompt = `Generate content suggestions for a podcast show titled "${showTitle}".

Recently covered topics:
${recentTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Provide:
1. ${count} new episode title ideas
2. ${count} episode description concepts
3. Relevant tag suggestions

Return in JSON format:
{
  "titleIdeas": ["...", "..."],
  "descriptionIdeas": ["...", "..."],
  "tagSuggestions": ["...", "..."]
}`;

    const response = await provider.complete(prompt);

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ContentSuggestions;
      }
    } catch {
      // Fall back to parsing
    }

    return this.parseContentSuggestions(response.content);
  }

  /**
   * Generate timestamps from transcript
   */
  async generateTimestamps(transcript: string): Promise<Array<{ time: string; description: string }>> {
    const provider = this.getProvider();

    const prompt = `Analyze the following transcript and generate timestamps for key topics.

Transcript:
${transcript.slice(0, 3000)}...

Return timestamps in JSON format:
[
  {"time": "0:00", "description": "Introduction"},
  {"time": "5:30", "description": "Topic 1"}
]`;

    const response = await provider.complete(prompt, {
      temperature: 0.2
    });

    try {
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as Array<{ time: string; description: string }>;
      }
    } catch {
      // Fall back
    }

    return [];
  }

  // =====================================================
  // Helper Methods
  // =====================================================

  /**
   * Get system prompt for the AI
   */
  private getSystemPrompt(): string {
    return `You are an expert podcast producer and content creator. You help creators generate compelling titles, descriptions, show notes, and metadata for their podcast episodes.

Your responses should be:
- Engaging and audience-focused
- Clear and concise
- SEO-optimized when appropriate
- Culturally sensitive and inclusive

Always provide practical, actionable suggestions.`;
  }

  /**
   * Build show notes prompt
   */
  private buildShowNotesPrompt(transcript: string, options?: ContentGenerationOptions): string {
    const tone = options?.tone || 'professional';
    const length = options?.length || 'medium';

    return `Generate comprehensive show notes for this podcast episode.

Transcript:
${transcript.slice(0, 3000)}...

Requirements:
- Tone: ${tone}
- Length: ${length}
- ${options?.includeTimestamps ? 'Include timestamps' : 'No timestamps needed'}
- ${options?.keywords ? `Keywords to include: ${options.keywords.join(', ')}` : ''}

Return in JSON format:
{
  "title": "Episode title",
  "summary": "Brief summary (2-3 sentences)",
  "keyPoints": ["Key point 1", "Key point 2", ...],
  "hashtags": ["#tag1", "#tag2", ...],
  "timecodes": [{"time": "0:00", "description": "Topic"}, ...]
}`;
  }

  /**
   * Parse show notes result
   */
  private parseShowNotesResult(content: string): ShowNotesResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ShowNotesResult;
      }
    } catch {
      // Fall back
    }

    return {
      title: 'Episode',
      summary: content.slice(0, 500),
      keyPoints: [],
      hashtags: []
    };
  }

  /**
   * Parse transcript analysis result
   */
  private parseTranscriptAnalysis(content: string): TranscriptAnalysisResult {
    return {
      summary: 'Analysis not available',
      keyTopics: [],
      sentiment: 'neutral',
      suggestedTitle: 'Episode',
      suggestedDescription: content.slice(0, 200)
    };
  }

  /**
   * Parse SEO result
   */
  private parseSEOResult(content: string): SEOOptimizationResult {
    return {
      title: 'Episode Title',
      description: content.slice(0, 160),
      keywords: [],
      tags: []
    };
  }

  /**
   * Parse content suggestions
   */
  private parseContentSuggestions(content: string): ContentSuggestions {
    return {
      titleIdeas: [],
      descriptionIdeas: [],
      tagSuggestions: []
    };
  }
}

/**
 * Create AI service
 */
export function createAIService(config: Partial<AIConfig>, logger: Logger): AIService {
  return new AIService(config, logger);
}
