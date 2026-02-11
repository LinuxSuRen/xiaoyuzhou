/**
 * Publish command implementation - Publish unpublished resources
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { XiaoYuzhouClient } from '../../core/client';
import { PublishResult } from '../../core/types';
import * as prompts from '../prompts/auth.prompts';

// =====================================================
// Publish Command
// =====================================================

export async function publishCommand(
  client: XiaoYuzhouClient,
  options: { resourceIds?: string[]; showId?: string; showName?: string; all?: boolean; notify?: boolean }
): Promise<void> {
  console.log(chalk.cyan('\n  小宇宙创作者助手 - 发布内容\n'));

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

  let resourceIds: string[];
  let targetShowId: string | undefined;

  // Resolve show ID from either --show-id or --show-name
  if (options.showId) {
    targetShowId = options.showId;
  } else if (options.showName) {
    // Need to find show by name - first get all shows
    const spinner = ora('正在查找节目...').start();

    try {
      const allShows = await client.getShows();

      const found = allShows.find(s => s.title === options.showName);

      if (found) {
        targetShowId = found.id;
        spinner.succeed(chalk.green(`找到节目: ${found.title}`));
      } else {
        spinner.fail(chalk.red(`未找到名为 "${options.showName}" 的节目`));
        console.log(chalk.dim('  可用节目:'));
        allShows.forEach(show => {
          console.log(chalk.dim(`    - ${show.title}`));
        });
        return;
      }
    } catch (error) {
      spinner.fail(chalk.red('查找节目失败'));
      await client.getErrorHandler().handle(error as Error, {
        module: 'cli',
        action: 'publish'
      });
      return;
    }
  }

  // Get resource IDs
  if (options.resourceIds && options.resourceIds.length > 0) {
    resourceIds = options.resourceIds;
  } else if (targetShowId) {
    // Get unpublished resources for the show
    const spinner = ora('获取未发布内容...').start();

    try {
      const resources = await client.getUnpublishedResources(targetShowId);

      if (resources.length === 0) {
        spinner.succeed(chalk.green('没有未发布的内容'));
        return;
      }

      spinner.succeed(chalk.green(`找到 ${resources.length} 个未发布的内容`));

      // Select resources to publish
      if (options.all) {
        resourceIds = resources.map(r => r.id);
      } else {
        resourceIds = await prompts.promptResourceSelection(resources);
      }

    } catch (error) {
      spinner.fail(chalk.red('获取未发布内容失败'));
      await client.getErrorHandler().handle(error as Error, {
        module: 'cli',
        action: 'publish'
      });
      return;
    }
  } else {
    console.log(chalk.red('✗ 请指定资源ID或节目ID'));
    console.log(chalk.dim('  使用方式: xiaoyuzhou publish --resource-id <id>'));
    console.log(chalk.dim('          xiaoyuzhou publish --show-id <id>\n'));
    return;
  }

  if (resourceIds.length === 0) {
    console.log(chalk.yellow('  ⚠ 未选择任何内容\n'));
    return;
  }

  // Confirm publish
  const confirmed = await prompts.promptPublishConfirmation(resourceIds.length);

  if (!confirmed) {
    console.log(chalk.dim('  已取消发布\n'));
    return;
  }

  // Publish resources
  const publishSpinner = ora(`正在发布 ${resourceIds.length} 个内容...`).start();

  // Format resource IDs to include showId if available
  const formattedResourceIds = targetShowId
    ? resourceIds.map(id => id.includes(':') ? id : `${targetShowId}:${id}`)
    : resourceIds;

  try {
    const results = await client.publishResources(formattedResourceIds, {
      notify: options.notify ?? true,
      showId: targetShowId
    });

    // Count successes and failures
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    if (failures.length === 0) {
      publishSpinner.succeed(chalk.green(`成功发布 ${successes.length} 个内容!`));

      // Display published URLs
      if (options.notify !== false) {
        console.log();
        successes.forEach((result, index) => {
          if (result.publishedUrl) {
            console.log(`  ${chalk.dim(`[${index + 1}]`)} ${chalk.cyan(result.publishedUrl)}`);
          }
        });
      }
      console.log();

    } else if (successes.length === 0) {
      publishSpinner.fail(chalk.red('发布全部失败'));

      // Display errors
      console.log(chalk.red('\n  错误详情:\n'));
      failures.forEach((result, index) => {
        console.log(`  ${chalk.dim(`[${index + 1}]`)} 资源ID: ${result.resourceId}`);
        if (result.error) {
          console.log(`      ${chalk.red(result.error)}`);
        }
      });
      console.log();

    } else {
      publishSpinner.warn(chalk.yellow(`部分发布失败 (${successes.length}/${results.length} 成功)`));

      // Display results
      console.log(chalk.green('\n  成功发布:\n'));
      successes.forEach((result, index) => {
        console.log(`  ${chalk.dim(`[${index + 1}]`)} ${chalk.green('✓')} ${result.resourceId}`);
        if (result.publishedUrl) {
          console.log(`      ${chalk.cyan(result.publishedUrl)}`);
        }
      });

      console.log(chalk.red('\n  发布失败:\n'));
      failures.forEach((result, index) => {
        console.log(`  ${chalk.dim(`[${index + 1}]`)} ${chalk.red('✗')} ${result.resourceId}`);
        if (result.error) {
          console.log(`      ${chalk.red(result.error)}`);
        }
      });
      console.log();
    }

  } catch (error) {
    publishSpinner.fail(chalk.red('发布失败'));
    await client.getErrorHandler().handle(error as Error, {
      module: 'cli',
      action: 'publish'
    });

    // Ask if user wants to retry
    const retry = await prompts.promptRetry(error instanceof Error ? error.message : String(error));

    if (retry) {
      await publishCommand(client, options);
    }
  }
}
