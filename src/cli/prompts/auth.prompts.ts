/**
 * Auth prompts for CLI interaction
 */

import inquirer from 'inquirer';
import { LoginMethod } from '../../core/types';

// =====================================================
// Export Types
// =====================================================

export interface LoginMethodAnswer {
  method: LoginMethod;
}

export interface PhoneAnswer {
  phone: string;
}

export interface VerificationCodeAnswer {
  code: string;
}

export interface ShowSelectionAnswer {
  showId: string;
}

export interface ResourceSelectionAnswer {
  resourceIds: string[];
}

export interface PublishConfirmationAnswer {
  confirm: boolean;
}

export interface RetryAnswer {
  retry: boolean;
}

export interface ContinueAnswer {
  cont: boolean;
}

export interface ActionAnswer {
  action: string;
}

// =====================================================
// Prompt Functions
// =====================================================

/**
 * Prompt user to select login method
 */
export async function promptLoginMethod(): Promise<LoginMethod> {
  const { method } = await inquirer.prompt<LoginMethodAnswer>([
    {
      type: 'list',
      name: 'method',
      message: '请选择登录方式:',
      choices: [
        { name: '扫码登录 (推荐)', value: LoginMethod.QR_CODE, short: '扫码登录' },
        { name: '手机号 + 验证码登录', value: LoginMethod.PHONE_CODE, short: '验证码登录' }
      ]
    }
  ]);

  return method;
}

/**
 * Prompt user for phone number
 */
export async function promptPhoneNumber(): Promise<string> {
  const { phone } = await inquirer.prompt<PhoneAnswer>([
    {
      type: 'input',
      name: 'phone',
      message: '请输入手机号:',
      validate: (input: string) => {
        const phoneRegex = /^1[3-9]\d{9}$/;
        return phoneRegex.test(input) || '请输入正确的手机号格式 (11位数字，以1开头)';
      },
      filter: (input: string) => input.trim()
    }
  ]);

  return phone;
}

/**
 * Prompt user for verification code
 */
export async function promptVerificationCode(): Promise<string> {
  const { code } = await inquirer.prompt<VerificationCodeAnswer>([
    {
      type: 'input',
      name: 'code',
      message: '请输入验证码:',
      validate: (input: string) => {
        return /^\d{4,6}$/.test(input) || '请输入正确的验证码格式 (4-6位数字)';
      },
      filter: (input: string) => input.trim()
    }
  ]);

  return code;
}

/**
 * Prompt user to select a show
 */
export async function promptShowSelection(shows: Array<{ id: string; title: string; description?: string; episodeCount?: number }>): Promise<string> {
  const { showId } = await inquirer.prompt<ShowSelectionAnswer>([
    {
      type: 'list',
      name: 'showId',
      message: '请选择要检查的节目:',
      choices: shows.map(show => ({
        name: `${show.title}${show.episodeCount !== undefined ? ` (${show.episodeCount} 期已发布)` : ''}`,
        value: show.id,
        short: show.title
      })),
      pageSize: 10
    }
  ]);

  return showId;
}

/**
 * Prompt user to select resources
 */
export async function promptResourceSelection(resources: Array<{ id: string; title: string; description?: string; duration?: number }>): Promise<string[]> {
  const { resourceIds } = await inquirer.prompt<ResourceSelectionAnswer>([
    {
      type: 'checkbox',
      name: 'resourceIds',
      message: '请选择要发布的草稿:',
      choices: resources.map(resource => {
        let name = resource.title;
        if (resource.duration) {
          const minutes = Math.floor(resource.duration / 60);
          const seconds = resource.duration % 60;
          name += ` | 时长: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        if (resource.description) {
          name += `\n    ${resource.description}`;
        }
        return {
          name,
          value: resource.id,
          short: resource.title,
          checked: true
        };
      }),
      validate: (input: string[]) => {
        return input.length > 0 || '请至少选择一个草稿';
      },
      pageSize: 15
    }
  ]);

  return resourceIds;
}

/**
 * Prompt user to confirm publishing
 */
export async function promptPublishConfirmation(count: number): Promise<boolean> {
  const { confirm } = await inquirer.prompt<PublishConfirmationAnswer>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `确认发布选中的 ${count} 个草稿?`,
      default: true
    }
  ]);

  return confirm;
}

/**
 * Prompt user for publish options
 */
export async function promptPublishOptions(): Promise<{ scheduled: boolean; notify: boolean }> {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'scheduled',
      message: '是否定时发布?',
      default: false
    },
    {
      type: 'confirm',
      name: 'notify',
      message: '是否通知订阅者?',
      default: true,
      when: (answers: any) => !answers.scheduled
    }
  ]);

  return answers;
}

/**
 * Prompt user to retry on error
 */
export async function promptRetry(error: string): Promise<boolean> {
  const { retry } = await inquirer.prompt<RetryAnswer>([
    {
      type: 'confirm',
      name: 'retry',
      message: `操作失败: ${error}\n是否重试?`,
      default: true
    }
  ]);

  return retry;
}

/**
 * Prompt user to continue or exit
 */
export async function promptContinue(): Promise<boolean> {
  const { cont } = await inquirer.prompt<ContinueAnswer>([
    {
      type: 'confirm',
      name: 'cont',
      message: '是否继续?',
      default: true
    }
  ]);

  return cont;
}

/**
 * Prompt user for action selection
 */
export async function promptAction(): Promise<string> {
  const { action } = await inquirer.prompt<ActionAnswer>([
    {
      type: 'list',
      name: 'action',
      message: '请选择操作:',
      choices: [
        { name: '发布选中的草稿', value: 'publish' },
        { name: '全部发布', value: 'publish-all' },
        { name: '暂不发布', value: 'cancel' }
      ]
    }
  ]);

  return action;
}
