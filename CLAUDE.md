# 小宇宙创作者平台自动化工具 - 设计文档

本文档记录项目的设计思想、架构决策和关键实现细节，确保后续开发保持一致性。

## 核心设计理念

### 1. 持久化浏览器会话
- 登录成功后**不关闭浏览器**，保持会话活跃
- 浏览器自身维护 cookies 和 localStorage
- 无需提取和存储 token
- 用户登录一次后可执行多个操作，无需重复登录

### 2. 登录成功判断标准
- **判断依据**：是否导航到 dashboard 页面
- URL：`https://podcaster.xiaoyuzhoufm.com/dashboard`
- **不依赖**：token 存在、localStorage 内容等不可靠

### 3. 自适应窗口大小
- 移除固定 viewport 配置
- 浏览器启动时添加 `--start-maximized` 参数
- 用户调整窗口大小后，页面自动适应
- 页面使用响应式布局

### 4. 正确的登录地址
- 登录页面：`https://podcaster.xiaoyuzhoufm.com/login`
- Dashboard：`https://podcaster.xiaoyuzhoufm.com/dashboard`

---

## 架构设计

### 混合架构（Playwright + HTTP）

```
CLI 命令
    ↓
统一客户端 (XiaoYuzhouClient)
    ↓
策略引擎 (StrategyEngine)
    ├ 自动选择适配器
    ├ 健康���查 + 降级
    └ 重试机制
    ↓
适配器层 (Adapters)
    ├ Playwright 适配器
    │   - 登录（扫码/验证码）
    │   - Token 提取（仅用于初始验证）
    │   - 复杂交互
    │   - 保持浏览器会话
    └ HTTP 适配器
        - API 调用
        - 高性能
        - 批量操作
```

### 适配器选择策略

| 场景 | 推荐适配器 | 降级条件 |
|------|------------|----------|
| 登录 | Playwright | 失败后仍可用 |
| API 操作 | HTTP | 更快、更可靠 |
| 批量发布 | HTTP | 并发能力 |
| 健康检查 | HTTP | 快速轻量 |

---

## 核心模块说明

### 认证管理器 (AuthManager)

**职责**：
- 管理登录流程（扫码/验证码）
- 维护浏览器会话生命周期
- 判断认证状态（基于浏览器会话而非 token）

**关键方法**：
- `login()` - 主登录入口
- `isAuthenticated()` - 检查是否有活跃浏览器会话
- `getPage()` - 获取当前浏览器页面（要求先登录）
- `getContext()` - 获取浏览器上下文
- `logout()` - 关闭浏览器会话

**登录成功检测**：
- 检查是否导航到 `https://podcaster.xiaoyuzhoufm.com/dashboard`
- 优先于 token 检查（因为 token 不可靠）

---

### 适配器层 (Adapters)

**BaseAdapter** - 适配器基类接口
- `getShows()` - 获取节��列表
- `getResources()` - 获取资源列表
- `publishResource()` - 发布单个资源
- `publishResources()` - 批量发布资源
- `healthCheck()` - 适配器健康检查
- `setAuthToken()` - 设置认证令牌
- `dispose()` - 清理资源

**PlaywrightAdapter** - 浏览器自动化
- 登录（扫码/验证码）
- 自动等待二维码生成和扫码确认
- 自动填写手机号和验证码
- 提取用户信息（从页面元素或 localStorage）
- 保持浏览器会话（不自动关闭）

**HTTPAdapter** - API 调用
- 使用 token 进行 API 请求
- 支持重试和超时处理
- 高性能批量操作

---

### 策略引擎 (StrategyEngine)

**职责**：
- 管理多个适配器
- 自动选择最佳适配器
- 失败后自动降级
- 健康检查和自动恢复

**策略模式**：
- `AUTO` - 自动选择（优先 HTTP）
- `PLAYWRIGHT` - 强制使用 Playwright
- `HTTP_ONLY` - 仅使用 HTTP
- `PLAYWRIGHT_ONLY` - 仅使用 Playwright

---

## 登录流程

### 扫码登录流程

```typescript
1. 导航到 https://podcaster.xiaoyuzhoufm.com/login
2. 等待二维码出现（最多 15 秒）
3. 提示用户扫码
4. 等待登录成功（最多 3 分钟）
5. 登录成功判定：导航到 dashboard 页面
6. 提取用户信息（从页面元素）
7. 保持浏览器打开状态（不关闭）
```

### 验证码登录流程

```typescript
1. 导航到 https://podcaster.xiaoyuzhoufm.com/login
2. 切换到手机登录标签页
3. 填写手机号
4. 点击发送验证码
5. 输入验证码
6. 点击提交/登录按钮
7. 等待登录成功
8. 提取用户信息
9. 保持浏览器打开状态
```

### 登出流程

```typescript
1. 关闭浏览器
2. 清空会话引用
3. 日志记录
```

---

## CLI 模式

### 普通命令模式 vs 交互式 REPL

**普通命令模式**：
- 每次操作都需要登录
- 操作完成后浏览器自动关闭

**交互式 REPL**：
- 登录一次，保持会话
- 连续对话操作（check、publish、shows 等）
- 浏览器保持打开状态
- 无需重复登录
- 支持命令历史

---

## AI 集成架构（可选功能）

### AI 提供商接口

```typescript
interface IAIProvider {
  getProvider(): AIProvider;
  isConfigured(): boolean;
  chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult>;
  complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult>;
  embed(text: string, options?: AIEmbeddingOptions): Promise<AIEmbeddingResult>;
  streamChat(messages, options, onChunk): Promise<AICompletionResult>;
}
```

### AI 功能特性

1. **内容生成**
   - 生成 episode 标题
   - 生成 episode 描述
   - 生成 show notes
   - 提取关键话题

2. **SEO 优化**
   - 生成搜索关键词
   - 优化标题和描述
   - 生成标签建议

3. **内容分析**
   - 分析文字稿/转录
   - 提取关键洞察
   - 情感分析

---

## 项目结构

```
E:\xiaoyuzhou/
├── src/
│   ├── core/                          # 核心模块
│   │   ├── auth.ts                   # 认证管理器（持久化会话）
│   │   ├── client.ts                 # 统一客户端
│   │   └── types.ts                  # 类型定义
│   ├── adapters/                     # 适配器层
│   │   ├── base.ts                   # 适配器基类接口
│   │   ├── playwright.adapter.ts      # Playwright 适配器
│   │   └── http.adapter.ts          # HTTP 适配器
│   ├── strategy/                    # 策略引擎
│   │   └── engine.ts                # 适配器选择和降级
│   ├── services/                    # 服务层
│   │   ├── logger.ts                # 日志服务
│   │   ├── error-handler.ts         # 错误处理器
│   │   └── debugger.ts             # 调试工具
│   ├── storage/                      # 持久化层
│   │   ├── token.ts                 # Token 存储（已移除主动使用）
│   │   ├── session.ts               # 会话存储（仅用于备份）
│   │   └── crypto.ts                # 加密工具
│   ├── cli/                         # CLI 层
│   │   ├── commands/               # 命令实现
│   │   │   ├── login.ts        # 登录/登出
│   │   │   ├── check.ts         # 检查命令
│   │   │   └── publish.ts       # 发布命令
│   │   ├── repl.ts                  # 交互式 REPL
│   │   └── prompts/               # 用户交互提示
│   ├── ai/                         # AI 模块（可选）
│   │   ├── provider.ts          # AI 提供商接口
│   │   ├── openai.provider.ts  # OpenAI 实现
│   │   └── service.ts         # AI 服务层
│   ├── web/                         # Web 配置界面
│   │   ├── server.ts            # Express 服务器
│   │   └── index.ts
│   └── utils/                      # 工具函数
│       ├── retry.ts             # 重试逻辑
│       └── helpers.ts           # 辅助函数
├── .storage/                     # 本地存储目录
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
└── CLAUDE.md                      # 本设计文档
```

---

## 开发规范

### 命名规范

- 类名：PascalCase（如 `XiaoYuzhouClient`）
- 接口/方法名：camelCase（如 `getPage()`）
- 私有字段：`private`
- 常量：UPPER_SNAKE_CASE（如 `DASHBOARD_URL`）

### 错误处理规范

```typescript
// 自定义错误类
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable: boolean = false
  );
}

// 使用 ErrorHandler
await this.errorHandler.handle(error, {
  module: 'current-module',
  action: 'current-action'
});
```

---

## 配置和部署

### 环境变量

```bash
# 开发模式
DEBUG=false                  # 是否启用调试
LOG_LEVEL=INFO             # 日志级别

# 运行模式
HEADLESS=false             # 是否无头浏览器模式
SLOW_MO=50                 # 操作延迟（毫秒）
```

---

## TODO / 未来优化

1. **错误恢复**
   - 实现操作重试队列
   - 支持断点续传

2. **更多登录方式**
   - 支持 Cookie 导入
   - 支持Session 恢复

3. **AI 功能增强**
   - 自动生成标题建议
   - 智能内容标签分类
   - 批量 SEO 优化

4. **性能优化**
   - 实现 API 结果缓存
   - 减少页面等待时间

---

## 版本历史

### v1.0.0 (初始实现)
- 双登录方式支持（扫码/验证码）
- 混合架构（Playwright + HTTP）
- 策略引擎
- 持久化浏览器会话
- 正确的登录地址
- 基础 CLI 命令
- 错误处理系统
