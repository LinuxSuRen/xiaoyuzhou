/**
 * Check command implementation - Check for unpublished resources
 */

import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { XiaoYuzhouClient } from '../../core/client';
import { Show, Resource, ResourceStatus } from '../../core/types';
import * as prompts from '../prompts/auth.prompts';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';

// =====================================================
// Display Functions
// =====================================================

/**
 * Format duration in human-readable format
 */
function formatDuration(seconds?: number): string {
  if (!seconds) return '未知';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format date in Chinese locale
 */
function formatDate(dateString: string): string {
  try {
    return format(new Date(dateString), 'yyyy-MM-dd HH:mm', { locale: zhCN });
  } catch {
    return dateString;
  }
}

/**
 * Display a list of shows
 */
function displayShows(shows: Show[]): void {
  console.log(chalk.cyan(`\n  找到 ${shows.length} 个节目:\n`));

  shows.forEach((show, index) => {
    console.log(`  ${chalk.dim(`[${index + 1}]`)} ${chalk.bold(show.title)}`);
    if (show.description) {
      console.log(`      ${chalk.dim(show.description)}`);
    }
    console.log(`      ${chalk.dim(`已发布: ${show.episodeCount} 期 | 创建于: ${formatDate(show.createdAt)}`)}`);
  });

  console.log();
}

/**
 * Display unpublished resources
 */
function displayUnpublishedResources(resources: Resource[]): void {
  if (resources.length === 0) {
    console.log(chalk.green('\n  ✓ 所有资源都已发布!\n'));
    return;
  }

  console.log(chalk.yellow(`\n  发现 ${resources.length} 个未发布的草稿:\n`));

  resources.forEach((resource, index) => {
    const statusIcon = resource.status === ResourceStatus.SCHEDULED ? '📅' : '📝';
    const statusText = resource.status === ResourceStatus.SCHEDULED ? '定时发布' : '草稿';

    console.log(`  ${chalk.dim(`[${index + 1}]`)} ${statusIcon} ${chalk.bold(resource.title)}`);
    console.log(`      ${chalk.dim(`状态: ${statusText}`)}${resource.duration ? ` | 时长: ${formatDuration(resource.duration)}` : ''}`);

    if (resource.description) {
      console.log(`      ${chalk.dim(resource.description)}`);
    }

    console.log(`      ${chalk.dim(`创建于: ${formatDate(resource.createdAt)}`)}`);
  });

  console.log();
}

// =====================================================
// Check Command
// =====================================================

export async function checkCommand(client: XiaoYuzhouClient, options: { showId?: string; showName?: string; json?: boolean }): Promise<void> {
  console.log(chalk.cyan('\n  小宇宙创作者助手 - 检查未发布内容\n'));

  // Ensure authenticated
  if (!client.isAuthenticated()) {
    console.log(chalk.yellow('  ⚠ 您尚未登录'));
    console.log(chalk.dim('  请先运行: xiaoyuzhou login\n'));

    const retry = await prompts.promptRetry('需要登录才能继续');

    if (retry) {
      const { loginCommand } = await import('./login');
      await loginCommand(client, { force: false });

      if (!client.isAuthenticated()) {
        console.log(chalk.red('✗ 无法继续操作\n'));
        return;
      }
    } else {
      return;
    }
  }

  // Get shows
  const getShowsSpinner = ora('获取节目列表...').start();

  let shows: Show[];
  try {
    shows = await client.getShows();

    if (shows.length === 0) {
      getShowsSpinner.fail(chalk.red('未找到任何节目'));
      console.log(chalk.dim('  请确保您在小宇宙平台创建了节目\n'));
      return;
    }

    getShowsSpinner.succeed(chalk.green(`找到 ${shows.length} 个节目`));

  } catch (error) {
    getShowsSpinner.fail(chalk.red('获取节目列表失败'));
    await client.getErrorHandler().handle(error as Error, {
      module: 'cli',
      action: 'check'
    });
    return;
  }

  // Select show
  let showId: string;
  let selectedShow: Show;

  if (options.showId) {
    // Find show by ID
    selectedShow = shows.find(s => s.id === options.showId) || shows[0];
    showId = selectedShow.id;
  } else if (options.showName) {
    // Find show by name
    const found = shows.find(s => s.title === options.showName);
    if (found) {
      showId = found.id;
      selectedShow = found;
    } else {
      console.log(chalk.yellow(`  ⚠ 未找到名为 "${options.showName}" 的节目`));
      const searchMethod = await prompts.promptShowSelectionMethod();

      if (searchMethod === 'list') {
        showId = await prompts.promptShowSelection(shows);
        selectedShow = shows.find(s => s.id === showId)!;
      } else {
        const showName = await prompts.promptShowName(shows);
        const found = shows.find(s => s.title === showName);
        if (found) {
          showId = found.id;
          selectedShow = found;
        } else {
          console.log(chalk.red('  ✗ 未找到匹配的节目\n'));
          return;
        }
      }
    }
  } else {
    showId = await prompts.promptShowSelection(shows);
    selectedShow = shows.find(s => s.id === showId)!;
  }

  console.log(chalk.dim(`\n  正在检查 "${selectedShow.title}" 的资源库...\n`));

  // Get resources
  const getResourcesSpinner = ora('检查未发布内容...').start();

  let resources: Resource[];
  try {
    resources = await client.getUnpublishedResources(showId);

    getResourcesSpinner.succeed(chalk.green(`检查完成`));

  } catch (error) {
    getResourcesSpinner.fail(chalk.red('检查未发布内容失败'));
    await client.getErrorHandler().handle(error as Error, {
      module: 'cli',
      action: 'check'
    });
    return;
  }

  // Display results
  if (options.json) {
    console.log(JSON.stringify(resources, null, 2));
  } else {
    displayUnpublishedResources(resources);

    // Prompt for action if there are unpublished resources
    if (resources.length > 0) {
      const action = await prompts.promptAction();

      if (action === 'publish' || action === 'publish-all') {
        const { publishCommand } = await import('./publish');

        const resourceIds = action === 'publish-all'
          ? resources.map(r => r.id)
          : await prompts.promptResourceSelection(resources);

        await publishCommand(client, { resourceIds, showId });
      }
    }
  }
}
