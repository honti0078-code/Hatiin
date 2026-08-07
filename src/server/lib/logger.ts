import { env } from '@/server/config/env';

const TRUNCATE_KEY_LENGTH = 8;
const SUFFIX_LENGTH = 4;

function truncateKey(key: string | null | undefined): string {
  if (!key) return '<none>';
  if (key.length <= TRUNCATE_KEY_LENGTH + SUFFIX_LENGTH) return key;
  return `${key.slice(0, TRUNCATE_KEY_LENGTH)}…${key.slice(-SUFFIX_LENGTH)}`;
}

type Level = 'info' | 'warn' | 'error' | 'debug';

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (level === 'debug' && env.NODE_ENV === 'production') return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  pubkey: (key: string | null | undefined) => truncateKey(key),
};
