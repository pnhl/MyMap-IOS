export type AdLoadFailure = {
  code?: string | number;
  message?: string;
  userInfo?: { nativeCode?: number; responseInfo?: string };
};

export function classifyAdFailure(error: AdLoadFailure): 'no-fill' | 'invalid-request' | 'transient' {
  const code = String(error.code ?? '').toLowerCase();
  if (code.includes('no-fill') || code === '3' || error.userInfo?.nativeCode === 3) return 'no-fill';
  if (code.includes('invalid-request')) return 'invalid-request';
  return 'transient';
}

// Shared per ad unit, so changing screens cannot bypass a no-fill cooldown or
// start a second request while the previous screen's native request is pending.
export class AdRequestPolicy {
  private pending = false;
  private failures = 0;
  private retryAt = 0;

  waitMs(now = Date.now()): number {
    if (this.retryAt === Infinity) return Infinity;
    if (this.pending) return 1000;
    return Math.max(0, this.retryAt - now);
  }

  begin(now = Date.now()): boolean {
    if (this.waitMs(now) !== 0) return false;
    this.pending = true;
    return true;
  }

  release(): void {
    this.pending = false;
  }

  succeed(): void {
    this.pending = false;
    this.failures = 0;
    this.retryAt = 0;
  }

  fail(error: AdLoadFailure, now = Date.now()): void {
    this.pending = false;
    const kind = classifyAdFailure(error);
    if (kind === 'invalid-request') {
      this.retryAt = Infinity;
      return;
    }
    const baseMs = kind === 'no-fill' ? 60000 : 30000;
    const delay = Math.min(300000, baseMs * 2 ** Math.min(this.failures, 4));
    this.failures = Math.min(this.failures + 1, 5);
    this.retryAt = now + delay;
  }
}

const policies = new Map<string, AdRequestPolicy>();
export function getAdRequestPolicy(adUnitId: string): AdRequestPolicy {
  let policy = policies.get(adUnitId);
  if (!policy) {
    policy = new AdRequestPolicy();
    policies.set(adUnitId, policy);
  }
  return policy;
}
