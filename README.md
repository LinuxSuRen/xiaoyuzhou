# 小宇宙创作者平台自动化工具

帮助播客创作者管理小宇宙平台的内容发布流程。

## 功能

- 检查指定节目有哪些资源库里的资源没有发布
- 帮助用户发布未发布的资源
- 友好的命令行交互界面
- 支持扫码登录和手机号+验���码登录两种方式

## 安装

```bash
npm install
```

## 使用

```bash
# 开发模式
npm run dev check

# 编译
npm run build

# 生产模式
npm start check

# 调试模式
npm start check -- --debug
```

## 项目结构

```
src/
├── index.ts                      # CLI 入口
├── core/                         # 核心模块
│   ├── client.ts                # 统一客户端
│   ├── auth.ts                  # 认证管理器
│   └── types.ts                 # 核心类型定义
├── adapters/                     # 适配器层
│   ├── base.ts                  # 适配器基类接口
│   ├── playwright.adapter.ts    # Playwright 适配器
│   └── http.adapter.ts          # HTTP 适配器
├── strategy/                     # 策略模块
│   ├── engine.ts                # 策略引擎
│   └── fallback.ts              # 降级管理器
├── storage/                      # 持久化层
│   ├── token.ts                 # Token 存储
│   ├── session.ts               # 会话存储
│   └── crypto.ts                # 加密工具
├── services/                     # 服务层
│   ├── logger.ts                # 日志服务
│   ├── error-handler.ts         # 错误处理器
│   └── debugger.ts              # 调试工具
├── cli/                          # CLI 模块
│   ├── commands/                # 命令实现
│   │   ├── login.ts             # 登录命令
│   │   ├── check.ts             # 检查命令
│   │   └── publish.ts           # 发布命令
│   └── prompts/                 # 交互提示
│       └── auth.prompts.ts      # 登录交互提示
└── utils/                        # 工具模块
    ├── retry.ts                 # 重试逻辑
    └── helpers.ts               # 辅助函数
```

## 许可证

MIT
