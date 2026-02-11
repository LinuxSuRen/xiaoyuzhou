/**
 * CLI entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { XiaoYuzhouClient } from '../core/client';
import { loginCommand, logoutCommand, statusCommand } from './commands/login';
import { checkCommand } from './commands/check';
import { publishCommand } from './commands/publish';
import { startREPL } from './repl';

// =====================================================
// Banner
// =====================================================

function showBanner(): void {
  console.log(
    chalk.cyan(
      figlet.textSync('XiaoYuzhou', {
        font: 'Small',
        horizontalLayout: 'default',
        verticalLayout: 'default'
      })
    )
  );
  console.log(chalk.cyan('  小宇宙创作者助手 v1.0.0\n'));
}

// =====================================================
// CLI Setup
// =====================================================

export function createCLI(): Command {
  const program = new Command();

  program
    .name('xiaoyuzhou')
    .description('小宇宙创作者平台自动化工具')
    .version('1.0.0');

  // Global options
  program
    .option('-d, --debug', '启用调试模式')
    .option('-v, --verbose', '详细输出')
    .option('-i, --interactive', '交互模式 (REPL)');

  // Config command - start web server
  program
    .command('config')
    .description('启动Web配置界面')
    .option('-p, --port <port>', '端口号', '3737')
    .action(async (options) => {
      const { startConfigServer } = await import('../web/server');
      const server = await startConfigServer({
        port: parseInt(options.port),
        storageDir: '.storage'
      });

      // Keep server running
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n  正在停止配置服务器...'));
        await server.stop();
        process.exit(0);
      });
    });

  // Interactive mode (REPL)
  program
    .command('repl')
    .description('启动交互模式')
    .alias('i')
    .action(async () => {
      showBanner();

      const client = createClient({ debug: false });
      try {
        await startREPL(client);
      } finally {
        await client.dispose();
      }
    });

  // Login command
  program
    .command('login')
    .description('登录小宇宙账号')
    .option('-f, --force', '强制重新登录')
    .option('-m, --method <method>', '登录方式 (qr=扫码, sms=验证码)')
    .action(async (options) => {
      if (!options.debug) {
        showBanner();
      }

      const client = createClient(options);
      try {
        await loginCommand(client, options);
      } finally {
        await client.dispose();
      }
    });

  // Logout command
  program
    .command('logout')
    .description('退出登录')
    .action(async () => {
      const client = createClient({});
      try {
        await logoutCommand(client);
      } finally {
        await client.dispose();
      }
    });

  // Status command
  program
    .command('status')
    .description('查看登录状态')
    .action(async () => {
      const client = createClient({});
      try {
        await statusCommand(client);
      } finally {
        await client.dispose();
      }
    });

  // Check command
  program
    .command('check')
    .description('检查未发布的内容')
    .option('-s, --show-id <showId>', '指定节目ID')
    .option('-n, --show-name <showName>', '指定节目名称')
    .option('-j, --json', '以JSON格式输出')
    .action(async (options) => {
      if (!options.debug) {
        showBanner();
      }

      const client = createClient(options);
      try {
        await checkCommand(client, options);
      } finally {
        await client.dispose();
      }
    });

  // Publish command
  program
    .command('publish')
    .description('发布内容')
    .option('-r, --resource-id <resourceId>', '指定资源ID (可多次使用)', (value, previous: string[] = []) => {
      return [...previous, value];
    })
    .option('-s, --show-id <showId>', '指定节目ID')
    .option('-n, --show-name <showName>', '指定节目名称')
    .option('-a, --all', '发布所有未发布内容')
    .option('--no-notify', '不通知订阅者')
    .action(async (options) => {
      const client = createClient(options);
      try {
        await publishCommand(client, options);
      } finally {
        await client.dispose();
      }
    });

  return program;
}

/**
 * Create client instance
 */
function createClient(options: { debug?: boolean }): XiaoYuzhouClient {
  return new XiaoYuzhouClient({
    debug: options.debug || false,
    logLevel: options.debug ? 0 : 1, // DEBUG or INFO
    headless: false,
    slowMo: 50
  });
}

// =====================================================
// Main Entry
// =====================================================

export async function run(argv: string[]): Promise<void> {
  const program = createCLI();
  await program.parseAsync(argv);

  // Check if interactive mode was requested via global option
  const options = program.opts();
  if (options.interactive) {
    const client = createClient({ debug: options.debug });
    try {
      await startREPL(client);
    } finally {
      await client.dispose();
    }
  }
}

// Run if executed directly
if (require.main === module) {
  run(process.argv).catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}
