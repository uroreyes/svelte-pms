<script lang="ts">
	/** Module-level UI: renders audit events (used by the full log and a reservation's history). */
	import { auditLabel } from '$lib/shared/domain/audit-labels';
	import { formatDateTime } from '$lib/shared/domain/dates';
	import type { AuditEventView } from './get-audit-log/contract';

	let { events, timezone, showReservation = true }: { events: AuditEventView[]; timezone: string; showReservation?: boolean } = $props();

	/** Compact, human-readable summary of the (already redacted) input. */
	function summary(input: unknown): string {
		if (!input || typeof input !== 'object') return '';
		const skip = new Set(['reservationId', 'folioId', 'itemId', 'paymentId', 'roomUnitId', 'roomTypeId', 'ratePlanId', 'id']);
		return Object.entries(input as Record<string, unknown>)
			.filter(([k, v]) => !skip.has(k) && v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
			.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
			.join(' · ')
			.slice(0, 220);
	}
</script>

<div class="overflow-x-auto">
	<table class="table">
		<thead><tr><th>When</th><th>Who</th><th>Action</th>{#if showReservation}<th>Reservation</th>{/if}<th>Details</th></tr></thead>
		<tbody>
			{#each events as e (e.id)}
				<tr class="align-top">
					<td class="whitespace-nowrap text-xs">{formatDateTime(e.occurredAt, timezone, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
					<td class="text-xs whitespace-nowrap">{e.actorLabel}</td>
					<td class="text-sm whitespace-nowrap {e.command === 'auth.loginFailed' ? 'text-rose-700' : ''}">{auditLabel(e.command)}</td>
					{#if showReservation}
						<td class="text-xs">{#if e.reservationId}<a class="font-mono text-brand-700 hover:underline" href="/reservations/{e.reservationId}">{e.confirmationCode}</a>{:else}—{/if}</td>
					{/if}
					<td class="max-w-xl text-xs break-words text-slate-600">
						{summary(e.input)}
						<details class="mt-0.5">
							<summary class="cursor-pointer text-slate-400">raw</summary>
							<pre class="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify({ input: e.input, result: e.result }, null, 2)}</pre>
						</details>
					</td>
				</tr>
			{:else}
				<tr><td colspan="5" class="py-6 text-center text-slate-400">No events</td></tr>
			{/each}
		</tbody>
	</table>
</div>
