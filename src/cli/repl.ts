/**
 * Interactive REPL Mode - Continuous conversation-based CLI experience
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { XiaoYuzhouClient } from '../core/client';
import { Show, Resource } from '../core/types';
import * as prompts from './prompts/auth.prompts';

// =====================================================
// REPL Command Types
// =====================================================

/**
 * Available REPL commands
 */
export enum REPLCommand {
  LOGIN = 'login',
  LOGOUT = 'logout',
  STATUS = 'status',
  SHOWS = 'shows',
  CHECK = 'check',
  PUBLISH = 'publish',
  HELP = 'help',
  EXIT = 'exit',
  CONFIG = 'config'
}

/**
 * Parsed command
 */
export interface ParsedCommand {
  command: REPLCommand;
  args: string[];
  raw: string;
}

// =====================================================
// REPL History
// =====================================================

/**
 * Command history for REPL
 */
class CommandHistory {
  private history: string[] = [];
  private index: number = -1;
  private readonly maxSize = 100;

  add(command: string): void {
    if (command && command.trim() && command !== this.history[this.history.length - 1]) {
      this.history.push(command);
      if (this.history.length > this.maxSize) {
        this.history.shift();
      }
    }
    this.index = this.history.length;
  }

  getPrevious(): string | null {
    if (this.index > 0) {
      this.index--;
      return this.history[this.index];
    }
    return null;
  }

  getNext(): string | null {
    if (this.index < this.history.length - 1) {
      this.index++;
      return this.history[this.index];
    }
    this.index = this.history.length;
    return null;
  }

  getAll(): string[] {
    return [...this.history];
  }
}

// =====================================================
// REPL Class
// =====================================================

/**
 * Interactive REPL mode
 */
export class InteractiveREPL {
  private client: XiaoYuzhouClient;
  private running: boolean = false;
  private history: CommandHistory;
  private currentShow: Show | null = null;
  private unpublishedResources: Resource[] = [];

  constructor(client: XiaoYuzhouClient) {
    this.client = client;
    this.history = new CommandHistory();
  }

  /**
   * Start the REPL
   */
  async start(): Promise<void> {
    this.running = true;

    // Show welcome message
    this.showWelcome();

    // Main loop
    while (this.running) {
      const input = await this.readLine();

      if (!input) {
        continue;
      }

      const parsed = this.parseCommand(input);
      await this.executeCommand(parsed);
    }

    console.log(chalk.dim('\n再见！\n'));
  }

  /**
   * Stop the REPL
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Show welcome message
   */
  private showWelcome(): void {
    console.log(chalk.cyan('\n  🎙️ 小宇宙创作者助手 - 交互模式\n'));
    console.log(chalk.dim('  输入 ') + chalk.yellow('help') + chalk.dim(' 查看可用命令'));
    console.log(chalk.dim('  输入 ') + chalk.yellow('exit') + chalk.dim(' 退出\n'));
  }

  /**
   * Read line from user
   */
  private async readLine(): Promise<string> {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: this.getPrompt(),
        prefix: ''
      }
    ]);

    this.history.add(input);
    return input.trim();
  }

  /**
   * Get prompt string
   */
  private getPrompt(): string {
    const userInfo = this.client.getUserInfo();
    const authenticated = this.client.isAuthenticated();

    if (authenticated && userInfo) {
      const showPart = this.currentShow ? `/${this.currentShow.title}` : '';
      return chalk.cyan(`xiaoyuzhou${showPart}> `);
    }

    return chalk.gray('xiaoyuzhou> ');
  }

  /**
   * Parse command from input
   */
  private parseCommand(input: string): ParsedCommand {
    const parts = input.trim().split(/\s+/);
    const commandStr = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    let command: REPLCommand;

    // Handle command aliases
    switch (commandStr) {
      case 'l':
      case 'login':
        command = REPLCommand.LOGIN;
        break;
      case 'lo':
      case 'logout':
        command = REPLCommand.LOGOUT;
        break;
      case 's':
      case 'st':
      case 'status':
        command = REPLCommand.STATUS;
        break;
      case 'sh':
      case 'shows':
        command = REPLCommand.SHOWS;
        break;
      case 'c':
      case 'check':
        command = REPLCommand.CHECK;
        break;
      case 'p':
      case 'pub':
      case 'publish':
        command = REPLCommand.PUBLISH;
        break;
      case 'h':
      case 'help':
      case '?':
        command = REPLCommand.HELP;
        break;
      case 'e':
      case 'q':
      case 'exit':
      case 'quit':
        command = REPLCommand.EXIT;
        break;
      case 'cfg':
      case 'config':
        command = REPLCommand.CONFIG;
        break;
      default:
        // Unknown command, treat as help
        command = REPLCommand.HELP;
    }

    return { command, args, raw: input };
  }

  /**
   * Execute command
   */
  private async executeCommand(parsed: ParsedCommand): Promise<void> {
    switch (parsed.command) {
      case REPLCommand.LOGIN:
        await this.cmdLogin();
        break;

      case REPLCommand.LOGOUT:
        await this.cmdLogout();
        break;

      case REPLCommand.STATUS:
        await this.cmdStatus();
        break;

      case REPLCommand.SHOWS:
        await this.cmdShows();
        break;

      case REPLCommand.CHECK:
        await this.cmdCheck();
        break;

      case REPLCommand.PUBLISH:
        await this.cmdPublish(parsed.args);
        break;

      case REPLCommand.HELP:
        this.cmdHelp();
        break;

      case REPLCommand.CONFIG:
        await this.cmdConfig();
        break;

      case REPLCommand.EXIT:
        this.cmdExit();
        break;
    }
  }

  // =====================================================
  // Command Implementations
  // =====================================================

  /**
   * Login command
   */
  private async cmdLogin(): Promise<void> {
    const { loginCommand } = await import('./commands/login');
    await loginCommand(this.client, { force: false });
  }

  /**
   * Logout command
   */
  private async cmdLogout(): Promise<void> {
    const { logoutCommand } = await import('./commands/login');
    await logoutCommand(this.client);
    this.currentShow = null;
    this.unpublishedResources = [];
  }

  /**
   * Status command
   */
  private async cmdStatus(): Promise<void> {
    const { statusCommand } = await import('./commands/login');
    await statusCommand(this.client);
  }

  /**
   * Shows command - list and select show
   */
  private async cmdShows(): Promise<void> {
    if (!this.client.isAuthenticated()) {
      console.log(chalk.yellow('  ⚠ 请先登录'));
      return;
    }

    const shows = await this.client.getShows();

    if (shows.length === 0) {
      console.log(chalk.yellow('  没有找到任何节目'));
      return;
    }

    console.log(chalk.cyan(`\n  找到 ${shows.length} 个节目:\n`));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '选择操作:',
        choices: [
          { name: '选择节目', value: 'select' },
          { name: '返回', value: 'back' }
        ]
      }
    ]);

    if (action === 'select') {
      const showId = await prompts.promptShowSelection(shows);
      this.currentShow = shows.find(s => s.id === showId) || null;
      console.log(chalk.green(`  ✓ 已选择: ${this.currentShow?.title}\n`));
    }
  }

  /**
   * Check command - check unpublished resources
   */
  private async cmdCheck(): Promise<void> {
    if (!this.currentShow) {
      console.log(chalk.yellow('  ⚠ 请先选择一个节目 (输入 "shows")'));
      return;
    }

    if (!this.client.isAuthenticated()) {
      console.log(chalk.yellow('  ⚠ 请先登录'));
      return;
    }

    const spinner = chalk.dim('检查中...');
    console.log(`  ${spinner}\n`);

    this.unpublishedResources = await this.client.getUnpublishedResources(this.currentShow.id);

    if (this.unpublishedResources.length === 0) {
      console.log(chalk.green('  ✓ 所有内容都已发布！\n'));
    } else {
      console.log(chalk.yellow(`  找到 ${this.unpublishedResources.length} 个未发布的内容:\n`));

      this.unpublishedResources.forEach((resource, index) => {
        console.log(`  ${chalk.dim(`[${index + 1}]`)} ${resource.title}`);
        if (resource.description) {
          console.log(`      ${chalk.dim(resource.description)}`);
        }
      });
      console.log();
    }
  }

  /**
   * Publish command
   */
  private async cmdPublish(args: string[]): Promise<void> {
    if (!this.client.isAuthenticated()) {
      console.log(chalk.yellow('  ⚠ 请先登录'));
      return;
    }

    // If no resources checked, run check first
    if (this.unpublishedResources.length === 0) {
      if (this.currentShow) {
        await this.cmdCheck();
        if (this.unpublishedResources.length === 0) {
          return;
        }
      } else {
        console.log(chalk.yellow('  ⚠ 请先选择一个节目 (输入 "shows")'));
        return;
      }
    }

    const resourceIds = await prompts.promptResourceSelection(this.unpublishedResources);

    if (resourceIds.length === 0) {
      console.log(chalk.dim('  已取消发布\n'));
      return;
    }

    const confirmed = await prompts.promptPublishConfirmation(resourceIds.length);

    if (!confirmed) {
      console.log(chalk.dim('  已取消发布\n'));
      return;
    }

    // Publish
    const results = await this.client.publishResources(resourceIds, { notify: true });

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    if (failures.length === 0) {
      console.log(chalk.green(`\n  ✓ 成功发布 ${successes.length} 个内容！\n`));

      // Clear published resources from list
      this.unpublishedResources = this.unpublishedResources.filter(
        r => !resourceIds.includes(r.id)
      );
    } else {
      console.log(chalk.red(`\n  ✗ 部分发布失败 (${successes.length}/${results.length} 成功)\n`));
    }
  }

  /**
   * Help command
   */
  private cmdHelp(): void {
    console.log(chalk.cyan('\n  可用命令:\n'));

    const commands = [
      { cmd: 'login, l', desc: '登录小宇宙账号' },
      { cmd: 'logout, lo', desc: '退出登录' },
      { cmd: 'status, st', desc: '查看登录状态' },
      { cmd: 'shows, sh', desc: '查看并选择节目' },
      { cmd: 'check, c', desc: '检查未发布的内容' },
      { cmd: 'publish, p', desc: '发布内容' },
      { cmd: 'config, cfg', desc: '打开配置界面' },
      { cmd: 'help, h, ?', desc: '显示帮助信息' },
      { cmd: 'exit, e, q', desc: '退出交互模式' }
    ];

    commands.forEach(({ cmd, desc }) => {
      console.log(`  ${chalk.yellow(cmd.padEnd(15))} ${chalk.dim(desc)}`);
    });

    console.log();
  }

  /**
   * Config command - open web config
   */
  private async cmdConfig(): Promise<void> {
    const { startConfigServer } = await import('../web/server');
    const server = await startConfigServer({
      port: 3737,
      storageDir: '.storage',
      logger: this.client.getLogger()
    });

    console.log(chalk.dim('  按 Ctrl+C 停止配置服务器\n'));

    // Wait for user to stop
    await inquirer.prompt([
      {
        type: 'input',
        name: 'stop',
        message: '按回车键停止配置服务器...',
        prefix: ''
      }
    ]);

    await server.stop();
    console.log(chalk.green('  ✓ 配置服务器已停止\n'));
  }

  /**
   * Exit command
   */
  private cmdExit(): void {
    console.log(chalk.dim('\n  正在退出...'));
    this.stop();
  }
}

/**
 * Start interactive REPL mode
 */
export async function startREPL(client: XiaoYuzhouClient): Promise<void> {
  const repl = new InteractiveREPL(client);

  try {
    await repl.start();
  } finally {
    await client.dispose();
  }
}
