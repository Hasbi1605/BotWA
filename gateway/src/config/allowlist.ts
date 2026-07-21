import type { Config } from './index.js';

export function isAllowlisted(jid: string, config: Config): boolean {
  return config.waGroupAllowlist.includes(jid);
}

export function getAllowlist(config: Config): string[] {
  return [...config.waGroupAllowlist];
}
