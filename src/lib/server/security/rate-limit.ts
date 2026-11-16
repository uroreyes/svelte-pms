/** Fixed-window in-memory limiter (per process). Swap for Redis when scaling out. */
const windows = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
	if (now - lastSweep > 60_000) {
		for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
		lastSweep = now;
	}
	const w = windows.get(key);
	if (!w || w.resetAt <= now) {
		windows.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	w.count += 1;
	return w.count <= limit;
}
