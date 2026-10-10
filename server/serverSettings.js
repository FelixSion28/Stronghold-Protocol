// Private per-server settings. CLI writes replace one small file atomically; no HTTP administration endpoint.
// i18n-ignore-file: filesystem administration errors and operator logs, never player-facing UI text
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_SEATS } from '../shared/constants.js';
import { ROOT } from './http/config.js';

export const SERVER_SETTINGS_FILE = 'server-settings.json';
export const SERVER_SETTINGS_POLL_MS = 1000;
const MAX_FILE_BYTES = 4096;
const decoder = new TextDecoder('utf-8', { fatal: true });

/** null means no server restriction; available room seats still bound the AI count. */
export function validAiLimit(value) {
  return value === null || (Number.isInteger(value) && value >= 0 && value < MAX_SEATS);
}

/** Strict CLI/environment value: 0…MAX_SEATS-1 or "unlimited". */
export function parseAiLimit(value) {
  const text = String(value ?? '').trim();
  if (text === 'unlimited') return null;
  if (/^(?:0|[1-9]\d*)$/.test(text) && validAiLimit(Number(text))) return Number(text);
  throw new RangeError(`AI 上限必须为 0–${MAX_SEATS - 1} 的整数或 unlimited`);
}

/** Explicit option, environment, then <root>/runtime. Relative paths resolve from the repository root. */
export function serverSettingsDirectory({ dir, root = ROOT, env = process.env } = {}) {
  return path.resolve(root, dir || env.SP_SERVER_SETTINGS_DIR || 'runtime');
}

function verifyDirectory(dir) {
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('服务器配置目录必须为普通目录，不能使用符号链接');
}

function checkedSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1
    || Object.keys(raw).length !== 2 || !validAiLimit(raw.maxAiPerRoom)) throw new Error('服务器配置格式无效');
  return Object.freeze({ maxAiPerRoom: raw.maxAiPerRoom });
}

/** Read-only startup and show operations never create a directory. null means no persistent override. */
export function readServerSettings(dir) {
  try {
    verifyDirectory(dir);
    const file = path.join(dir, SERVER_SETTINGS_FILE);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('服务器配置必须为普通文件，不能使用符号链接');
    if (stat.size > MAX_FILE_BYTES) throw new Error(`服务器配置超过 ${MAX_FILE_BYTES} 字节限制`);
    const bytes = fs.readFileSync(file);
    if (bytes.length > MAX_FILE_BYTES) throw new Error(`服务器配置超过 ${MAX_FILE_BYTES} 字节限制`);
    return checkedSettings(JSON.parse(decoder.decode(bytes)));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Only one setting is replaced: concurrent valid commands have atomic last-writer-wins semantics. */
export function writeServerSettings(dir, maxAiPerRoom) {
  if (!validAiLimit(maxAiPerRoom)) throw new RangeError(`AI 上限必须为 0–${MAX_SEATS - 1} 的整数或 null`);
  fs.mkdirSync(dir, { recursive: true });
  verifyDirectory(dir);
  const file = path.join(dir, SERVER_SETTINGS_FILE);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('服务器配置必须为普通文件，不能使用符号链接');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(dir, `.server-settings-${randomUUID()}.tmp`);
  let fd;
  let failure;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, Buffer.from(`${JSON.stringify({ version: 1, maxAiPerRoom }, null, 2)}\n`, 'utf8'));
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } catch (error) { failure = error; }
  finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (error) { failure ||= error; } }
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') failure ||= error; }
  }
  if (failure) throw failure;
  return Object.freeze({ maxAiPerRoom });
}

/**
 * Valid persisted values win over the initial environment fallback. A malformed replacement keeps the last valid
 * policy, so a partial manual edit cannot silently disable a restriction. Removing the file explicitly restores
 * the startup fallback. onChange is not invoked while constructing the controller.
 * @param {{ dir?: string, root?: string, env?: object, log?: {warn?: Function}, pollMs?: number,
 *   onChange?: (next: {maxAiPerRoom:number|null}, previous: {maxAiPerRoom:number|null}) => void }} [options]
 */
export function createServerSettings(options = {}) {
  const { env = process.env, log = console, pollMs = SERVER_SETTINGS_POLL_MS, onChange } = options;
  if (!Number.isSafeInteger(pollMs) || pollMs < 0) throw new RangeError('服务器配置检查间隔无效');
  const dir = serverSettingsDirectory({ ...options, env });
  const initial = String(env.SP_MAX_AI_PER_ROOM ?? '').trim();
  const fallback = Object.freeze({ maxAiPerRoom: initial ? parseAiLimit(initial) : null });
  // Startup has no last-good disk value to preserve. Refuse corrupt persistent settings rather than accidentally
  // booting an unrestricted public server. Only replacement errors during an already-running process are tolerated.
  let state = readServerSettings(dir) || fallback;
  let warning = '';
  let timer;
  let closed = false;
  let started = false;

  function refresh(notify = true) {
    if (closed) return false;
    let next;
    try { next = readServerSettings(dir) || fallback; warning = ''; }
    catch (error) {
      const message = String(error.message || error);
      if (message !== warning) { log.warn?.(`[server-settings] ${message}；保留最近有效设置。`); warning = message; }
      return false;
    }
    if (next.maxAiPerRoom === state.maxAiPerRoom) return false;
    const previous = state;
    state = next;
    if (notify) onChange?.(state, previous);
    return true;
  }
  const controller = {
    dir,
    get: () => state,
    poll: () => refresh(),
    start() {
      if (closed || started) return controller;
      started = true;
      refresh();
      if (pollMs > 0) { timer = setInterval(() => refresh(), pollMs); timer.unref?.(); }
      return controller;
    },
    close() { closed = true; clearInterval(timer); },
  };
  return controller;
}
