/**
 * Login command implementation
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { XiaoYuzhouClient } from '../../core/client';
import { LoginMethod } from '../../core/types';
import * as prompts from '../prompts/auth.prompts';

// =====================================================
// Banner
// =====================================================

function showBanner(): void {
  console.log(chalk.cyan('\n  小宇宙创作者助手 v1.0.0\n'));
}

// =====================================================
// Login Command
// =====================================================

export async function loginCommand(client: XiaoYuzhouClient, options: { force?: boolean; method?: string }): Promise<void> {
  showBanner();

  // Check if already logged in
  if (!options.force && client.isAuthenticated()) {
    const userInfo = client.getUserInfo();
    if (userInfo) {
      console.log(chalk.green(`✓ 已登录为: ${userInfo.userName}`));
      console.log(chalk.dim(`  用户ID: ${userInfo.userId}\n`));

      const cont = await prompts.promptContinue();

      if (!cont) {
        return;
      }

      // Prompt to re-login
      const inquirer = await import('inquirer');
      const { relogin } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'relogin',
          message: '是否重新登录?',
          default: false
        }
      ]);

      if (!relogin) {
        return;
      }
    }
  }

  // Determine login method
  let method: LoginMethod | undefined;

  if (options.method) {
    if (options.method === 'qr') {
      method = LoginMethod.QR_CODE;
    } else if (options.method === 'sms') {
      method = LoginMethod.PHONE_CODE;
    } else {
      console.log(chalk.red('✗ 无效的登录方式'));
      console.log(chalk.dim('  支持的登录方式: qr (扫码), sms (验证码)\n'));
      return;
    }
  }

  // Perform login
  const spinner = ora('正在登录...').start();

  try {
    const success = await client.login({
      force: options.force,
      method
    });

    if (success) {
      spinner.succeed(chalk.green('登录成功!'));

      const userInfo = client.getUserInfo();
      if (userInfo) {
        console.log(chalk.dim(`  用户: ${userInfo.userName}`));
        console.log(chalk.dim(`  ID: ${userInfo.userId}\n`));
      }

      console.log(chalk.green('✓ 您现在可以使用其他命令了\n'));

    } else {
      spinner.fail(chalk.red('登录失败'));
    }

  } catch (error) {
    spinner.fail(chalk.red('登录失败'));
    await client.getErrorHandler().handle(error as Error, {
      module: 'cli',
      action: 'login'
    });
  }
}

/**
 * Logout command
 */
export async function logoutCommand(client: XiaoYuzhouClient): Promise<void> {
  const spinner = ora('正在退出登录...').start();

  try {
    await client.logout();
    spinner.succeed(chalk.green('已退出登录\n'));

  } catch (error) {
    spinner.fail(chalk.red('退出登录失败'));
    await client.getErrorHandler().handle(error as Error, {
      module: 'cli',
      action: 'logout'
    });
  }
}

/**
 * Status command
 */
export async function statusCommand(client: XiaoYuzhouClient): Promise<void> {
  console.log(chalk.cyan('\n  小宇宙创作者助手 - 状态\n'));

  const authenticated = client.isAuthenticated();
  const currentAdapter = client.getCurrentAdapter();

  console.log(`  认证状态: ${authenticated ? chalk.green('已登录') : chalk.red('未登录')}`);

  if (authenticated) {
    const userInfo = client.getUserInfo();
    if (userInfo) {
      console.log(`  用户: ${chalk.dim(userInfo.userName)}`);
      console.log(`  用户ID: ${chalk.dim(userInfo.userId)}`);
    }
  }

  console.log(`  当前适配器: ${chalk.dim(currentAdapter)}\n`);
}
