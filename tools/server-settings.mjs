#!/usr/bin/env node
// Local server-owner administration; no server restart, public write endpoint or copied installation default.
// i18n-ignore-file: owner CLI usage and output, never player-facing UI text
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseAiLimit, readServerSettings, serverSettingsDirectory, writeServerSettings } from '../server/serverSettings.js';

const USAGE = `服务器配置（UTF-8）：
  node tools/server-settings.mjs ai-limit <整数|unlimited> [--dir <目录>]
  node tools/server-settings.mjs show [--json] [--dir <目录>]
  默认目录：runtime；可用 SP_SERVER_SETTINGS_DIR 指定持久化目录。
  ai-limit 会持久保存，运行中的服务器约 1 秒内读取；进行中的对局结束后再应用。
  未配置时不限制 AI；SP_MAX_AI_PER_ROOM 仅作为没有持久配置时的启动默认值。`;
const writeUtf8 = (stream, value) => stream.write(Buffer.from(`${value}\n`, 'utf8'));

/** Interactive Windows cmd uses UTF-8 too; redirected output always remains explicit UTF-8. */
export function prepareServerSettingsConsole({ platform = process.platform, stdout = process.stdout, stderr = process.stderr, run = spawnSync } = {}) {
  if (platform !== 'win32' || (!stdout.isTTY && !stderr.isTTY)) return;
  try { run('cmd.exe', ['/d', '/c', 'chcp', '65001'], { stdio: 'ignore', windowsHide: true, timeout: 1000 }); }
  catch { /* A missing console utility never prevents server administration. */ }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') return { command: 'help' };
  if (!['ai-limit', 'show'].includes(command)) throw new Error(`未知命令 ${command}`);
  const options = { command, dir: undefined, json: false, value: undefined };
  const seen = new Set();
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      if (command !== 'ai-limit' || options.value !== undefined) throw new Error(`不支持的参数 ${token}`);
      options.value = parseAiLimit(token);
    } else {
      if (seen.has(token)) throw new Error(`参数 ${token} 重复`);
      seen.add(token);
      if (token === '--dir') {
        const value = rest[++index];
        if (!value || value.startsWith('--')) throw new Error('参数 --dir 缺少值');
        options.dir = value;
      } else if (token === '--json' && command === 'show') options.json = true;
      else throw new Error(`不支持的参数 ${token}`);
    }
  }
  if (command === 'ai-limit' && options.value === undefined) throw new Error('ai-limit 需要指定整数或 unlimited');
  return options;
}

export function main(argv) {
  prepareServerSettingsConsole();
  let options;
  try { options = parseArgs(argv); }
  catch (error) { writeUtf8(process.stderr, `服务器配置：${error.message}\n${USAGE}`); return 2; }
  if (options.command === 'help') { writeUtf8(process.stdout, USAGE); return 0; }
  try {
    if (options.command === 'ai-limit') {
      const dir = serverSettingsDirectory({ dir: options.dir });
      writeServerSettings(dir, options.value);
      writeUtf8(process.stdout, `已保存每房 AI 上限：${options.value === null ? '不限' : options.value}。运行中的服务器约 1 秒内读取。`);
    } else {
      const dir = serverSettingsDirectory({ dir: options.dir });
      const initial = String(process.env.SP_MAX_AI_PER_ROOM ?? '').trim();
      const state = readServerSettings(dir) || { maxAiPerRoom: initial ? parseAiLimit(initial) : null };
      writeUtf8(process.stdout, options.json ? JSON.stringify(state, null, 2)
        : `每房 AI 上限：${state.maxAiPerRoom === null ? '不限' : state.maxAiPerRoom}`);
    }
    return 0;
  } catch (error) { writeUtf8(process.stderr, `服务器配置：${error.message}`); return 1; }
}

const invoked = (() => { try { return pathToFileURL(fs.realpathSync(process.argv[1] || '')).href; } catch { return null; } })();
if (invoked === import.meta.url) process.exitCode = main(process.argv.slice(2));
