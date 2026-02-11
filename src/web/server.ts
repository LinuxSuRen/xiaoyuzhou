/**
 * Web Configuration Server - Simple web interface for configuration
 */

import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Logger } from '../services/logger';
import { AIConfig, AIProvider, DEFAULT_AI_CONFIG } from '../ai/provider';

// =====================================================
// Web Server Types
// =====================================================

/**
 * Web server configuration
 */
export interface WebServerConfig {
  port?: number;
  host?: string;
  storageDir?: string;
  logger?: Logger;
}

/**
 * Configuration data from the web form
 */
export interface ConfigFormData {
  // AI Provider settings
  aiEnabled: boolean;
  aiProvider: string;
  aiApiKey: string;
  aiBaseURL?: string;
  aiModel?: string;

  // General settings
  debug: boolean;
  logLevel: string;
  headless: boolean;
}

// =====================================================
// Web Server Class
// =====================================================

/**
 * Web server for configuration
 */
export class ConfigWebServer {
  private app: express.Application;
  private server: any;
  private logger: Logger;
  private port: number;
  private host: string;
  private storageDir: string;
  private configPath: string;
  private aiConfigPath: string;

  constructor(config: WebServerConfig = {}) {
    this.port = config.port || 3737;
    this.host = config.host || 'localhost';
    this.storageDir = config.storageDir || '.storage';
    this.logger = config.logger || new Logger({
      logLevel: 1,
      logDir: '.storage/logs',
      debug: false
    });

    this.configPath = path.join(this.storageDir, 'config.json');
    this.aiConfigPath = path.join(this.storageDir, 'ai-config.json');

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Home page - configuration form
    this.app.get('/', this.handleIndex.bind(this));
    this.app.get('/config', this.handleGetConfig.bind(this));

    // Save configuration
    this.app.post('/config', this.handleSaveConfig.bind(this));

    // Test AI connection
    this.app.post('/test-ai', this.handleTestAI.bind(this));

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });
  }

  /**
   * Handle index page
   */
  private handleIndex(req: Request, res: Response): void {
    const html = this.getHTML();
    res.send(html);
  }

  /**
   * Handle get config
   */
  private handleGetConfig(req: Request, res: Response): void {
    const config = this.loadConfig();
    const aiConfig = this.loadAIConfig();

    res.json({
      ...config,
      ai: aiConfig
    });
  }

  /**
   * Handle save config
   */
  private handleSaveConfig(req: Request, res: Response): void {
    try {
      const data = req.body as ConfigFormData;

      // Save general config
      const config = {
        debug: data.debug,
        logLevel: parseInt(data.logLevel) || 1,
        headless: data.headless
      };

      // Save AI config
      const aiConfig: Partial<AIConfig> = {
        enabled: data.aiEnabled,
        defaultProvider: data.aiProvider as AIProvider,
        providers: {}
      };

      if (data.aiEnabled && data.aiProvider && data.aiApiKey) {
        aiConfig.providers = {
          [data.aiProvider as AIProvider]: {
            provider: data.aiProvider as AIProvider,
            apiKey: data.aiApiKey,
            baseURL: data.aiBaseURL,
            model: data.aiModel
          }
        };
      }

      // Ensure storage directory exists
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      // Write config files
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      fs.writeFileSync(this.aiConfigPath, JSON.stringify(aiConfig, null, 2));

      this.logger.info('Configuration saved from web interface', {
        module: 'web-server',
        action: 'saveConfig'
      });

      res.json({ success: true, message: '配置已保存！' });

    } catch (error) {
      this.logger.error('Failed to save configuration', error as Error, {
        module: 'web-server',
        action: 'saveConfig'
      });

      res.status(500).json({
        success: false,
        message: '保存配置失败',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle test AI connection
   */
  private async handleTestAI(req: Request, res: Response): Promise<void> {
    try {
      const { provider, apiKey, baseURL, model } = req.body;

      // Simple API test
      const testURL = baseURL || 'https://api.openai.com/v1';
      const testModel = model || 'gpt-4o-mini';

      const response = await fetch(`${testURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Hello!' }],
          max_tokens: 10
        })
      });

      if (response.ok) {
        res.json({ success: true, message: '连接成功！AI 配置有效。' });
      } else {
        const error = await response.text();
        res.json({ success: false, message: `连接失败: ${error}` });
      }

    } catch (error) {
      res.json({
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * Load config from file
   */
  private loadConfig(): any {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      }
    } catch {
      // Return defaults
    }
    return {
      debug: false,
      logLevel: 1,
      headless: false
    };
  }

  /**
   * Load AI config from file
   */
  private loadAIConfig(): Partial<AIConfig> {
    try {
      if (fs.existsSync(this.aiConfigPath)) {
        return JSON.parse(fs.readFileSync(this.aiConfigPath, 'utf-8'));
      }
    } catch {
      // Return defaults
    }
    return DEFAULT_AI_CONFIG;
  }

  /**
   * Get HTML for the configuration page
   */
  private getHTML(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>小宇宙创作者助手 - 配置</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header p {
      opacity: 0.9;
      font-size: 14px;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #333;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
    }
    .section-title::before {
      content: '';
      width: 4px;
      height: 16px;
      background: #667eea;
      margin-right: 8px;
      border-radius: 2px;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      font-size: 14px;
      color: #555;
      margin-bottom: 6px;
    }
    input, select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    input:focus, select:focus {
      outline: none;
      border-color: #667eea;
    }
    .checkbox-group {
      display: flex;
      align-items: center;
    }
    .checkbox-group input {
      width: auto;
      margin-right: 8px;
    }
    .button-group {
      display: flex;
      gap: 10px;
      margin-top: 25px;
    }
    button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.2s;
    }
    button:active {
      transform: scale(0.98);
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }
    .message {
      padding: 12px;
      border-radius: 6px;
      margin-top: 15px;
      display: none;
      font-size: 14px;
    }
    .message.success {
      background: #d4edda;
      color: #155724;
    }
    .message.error {
      background: #f8d7da;
      color: #721c24;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>小宇宙创作者助手</h1>
      <p>配置您的自动化工具</p>
    </div>
    <div class="content">
      <form id="configForm">
        <!-- AI 配置 -->
        <div class="section">
          <div class="section-title">AI 配置</div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="aiEnabled" name="aiEnabled">
            <label for="aiEnabled" style="margin:0;">启用 AI 功能</label>
          </div>
          <div class="form-group">
            <label for="aiProvider">AI 提供商</label>
            <select id="aiProvider" name="aiProvider">
              <option value="">选择提供商...</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (即将推出)</option>
              <option value="gemini">Gemini (即将推出)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="aiApiKey">API Key</label>
            <input type="password" id="aiApiKey" name="aiApiKey" placeholder="sk-...">
          </div>
          <div class="form-group">
            <label for="aiBaseURL">Base URL (可选)</label>
            <input type="text" id="aiBaseURL" name="aiBaseURL" placeholder="https://api.openai.com/v1">
          </div>
          <div class="form-group">
            <label for="aiModel">Model (可选)</label>
            <input type="text" id="aiModel" name="aiModel" placeholder="gpt-4o-mini">
          </div>
        </div>

        <!-- 通用配置 -->
        <div class="section">
          <div class="section-title">通用设置</div>
          <div class="form-group">
            <label for="logLevel">日志级别</label>
            <select id="logLevel" name="logLevel">
              <option value="0">DEBUG</option>
              <option value="1" selected>INFO</option>
              <option value="2">WARN</option>
              <option value="3">ERROR</option>
            </select>
          </div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="debug" name="debug">
            <label for="debug" style="margin:0;">调试模式</label>
          </div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="headless" name="headless">
            <label for="headless" style="margin:0;">无头浏览器模式</label>
          </div>
        </div>

        <div class="button-group">
          <button type="button" class="btn-secondary" id="testBtn">测试 AI 连接</button>
          <button type="submit" class="btn-primary">保存配置</button>
        </div>

        <div id="message" class="message"></div>
      </form>
    </div>
  </div>

  <script>
    const form = document.getElementById('configForm');
    const messageEl = document.getElementById('message');
    const testBtn = document.getElementById('testBtn');

    // Load existing config
    fetch('/config')
      .then(r => r.json())
      .then(data => {
        if (data.ai) {
          document.getElementById('aiEnabled').checked = data.ai.enabled;
          document.getElementById('aiProvider').value = data.ai.defaultProvider || '';
          if (data.ai.providers && data.ai.providers[data.ai.defaultProvider]) {
            const provider = data.ai.providers[data.ai.defaultProvider];
            document.getElementById('aiApiKey').value = provider.apiKey || '';
            document.getElementById('aiBaseURL').value = provider.baseURL || '';
            document.getElementById('aiModel').value = provider.model || '';
          }
        }
        document.getElementById('logLevel').value = data.logLevel || 1;
        document.getElementById('debug').checked = data.debug || false;
        document.getElementById('headless').checked = data.headless || false;
      });

    // Show message
    function showMessage(text, type) {
      messageEl.textContent = text;
      messageEl.className = 'message ' + type;
      messageEl.style.display = 'block';
      setTimeout(() => {
        messageEl.style.display = 'none';
      }, 5000);
    }

    // Test AI connection
    testBtn.addEventListener('click', async () => {
      const provider = document.getElementById('aiProvider').value;
      const apiKey = document.getElementById('aiApiKey').value;
      const baseURL = document.getElementById('aiBaseURL').value;
      const model = document.getElementById('aiModel').value;

      if (!provider || !apiKey) {
        showMessage('请先填写 AI 提供商和 API Key', 'error');
        return;
      }

      testBtn.disabled = true;
      testBtn.textContent = '测试中...';

      try {
        const response = await fetch('/test-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey, baseURL, model })
        });
        const data = await response.json();

        if (data.success) {
          showMessage(data.message, 'success');
        } else {
          showMessage(data.message, 'error');
        }
      } catch (error) {
        showMessage('测试请求失败', 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = '测试 AI 连接';
      }
    });

    // Save configuration
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = {
        aiEnabled: document.getElementById('aiEnabled').checked,
        aiProvider: document.getElementById('aiProvider').value,
        aiApiKey: document.getElementById('aiApiKey').value,
        aiBaseURL: document.getElementById('aiBaseURL').value,
        aiModel: document.getElementById('aiModel').value,
        logLevel: document.getElementById('logLevel').value,
        debug: document.getElementById('debug').checked,
        headless: document.getElementById('headless').checked
      };

      try {
        const response = await fetch('/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await response.json();

        if (result.success) {
          showMessage(result.message, 'success');
        } else {
          showMessage(result.message, 'error');
        }
      } catch (error) {
        showMessage('保存失败', 'error');
      }
    });
  </script>
</body>
</html>`;
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        this.logger.info(`Configuration web server started at ${url}`, {
          module: 'web-server',
          action: 'start'
        });
        console.log(`\n  配置界面已启动: ${url}`);
        console.log(`  在浏览器中打开此地址进行配置\n`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Configuration web server stopped', {
            module: 'web-server',
            action: 'stop'
          });
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * Start config web server
 */
export async function startConfigServer(config?: WebServerConfig): Promise<ConfigWebServer> {
  const server = new ConfigWebServer(config);
  await server.start();
  return server;
}
