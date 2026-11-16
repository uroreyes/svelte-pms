/** Message without SQL text or bound params (Drizzle wraps the driver error as `cause`). */
export function errorSummary(e: unknown): string {
	const inner = e instanceof Error && e.cause instanceof Error ? e.cause : e;
	const message = inner instanceof Error ? inner.message : String(inner);
	return (message.split('\n')[0] ?? '').split(/\s+params:|\s+Query:/)[0]!.trim();
}
