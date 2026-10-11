import type { ConvertResult } from './core/convert';

/**
 * 変換結果をどう扱うか。
 * 本文照合が一致しない EPUB は「成功」とせず、自動ダウンロードもしない。
 */
export function decideOutcome(r: Pick<ConvertResult, 'verify'>): { kind: 'success' | 'mismatch'; autoDownload: boolean } {
  return r.verify.ok ? { kind: 'success', autoDownload: true } : { kind: 'mismatch', autoDownload: false };
}
