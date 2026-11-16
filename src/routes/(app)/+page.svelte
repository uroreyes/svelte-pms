<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatMoney } from '$lib/shared/domain/money';
	import { SOURCE_LABEL } from '$lib/shared/domain/enums';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import StatusBadge from '$lib/shared/ui/StatusBadge.svelte';
	import { RunNightAudit } from '$lib/features/folio/run-night-audit/contract';
	import type { OpsRow } from '$lib/features/front-desk/get-daily-ops/contract';
	import { ModifyReservation } from '$lib/features/reservations/modify-reservation/contract';
	import { MarkNoShow } from '$lib/features/reservations/mark-no-show/contract';
	import { can } from '$lib/shared/domain/permissions';
	import { addDays } from '$lib/shared/domain/dates';

	let { data } = $props();
	const ops = $derived(data.ops);
	const audit = createAction(RunNightAudit, { invalidates: ['app:ops'] });
	let auditResult = $state('');
	const extend = createAction(ModifyReservation, { invalidates: ['app:ops'] });
	const noShow = createAction(MarkNoShow, { invalidates: ['app:ops'] });
	const canAudit = $derived(can(data.actor.permissions, 'folio.nightAudit'));
	const canManage = $derived(can(data.actor.permissions, 'reservations.manage'));

	async function runAudit() {
		if (!ops) return;
		if (!confirm(`Post room & tax for every in-house guest for ${ops.businessDate}?`)) return;
		const r = await audit.run({});
		if (r) auditResult = `Night audit ${r.businessDate}: posted ${r.posted} night(s) across ${r.reservations} stay(s) · ${r.noShows} no-show(s) released · ${r.overstays} overstay(s) need attention.`;
	}
</script>

<svelte:head><title>Front desk</title></svelte:head>

{#snippet list(title: string, rows: OpsRow[], empty: string, currency: string)}
	<section class="card">
		<h2 class="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 font-semibold">{title}<span class="text-sm font-normal text-slate-500">{rows.length}</span></h2>
		<table class="table">
			<tbody>
				{#each rows as r (r.reservationId)}
					<tr class="cursor-pointer hover:bg-slate-50" onclick={() => goto(`/reservations/${r.reservationId}`)}>
						<td><div class="font-medium">{r.guestName}</div><div class="text-xs text-slate-500">{r.confirmationCode} · {SOURCE_LABEL[r.source]}</div></td>
						<td class="text-sm">{r.roomNumber ? `Room ${r.roomNumber}` : r.roomTypeName}</td>
						<td><StatusBadge status={r.status} /></td>
						<td class="text-right text-sm tabular-nums {r.balanceCents > 0 ? 'text-rose-700' : 'text-slate-500'}">{formatMoney(r.balanceCents, currency)}</td>
					</tr>
				{:else}
					<tr><td class="py-6 text-center text-slate-400">{empty}</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
{/snippet}

{#if ops}
<PageHeader title="Front desk" subtitle="Business date {ops.businessDate}">
	{#snippet actions()}
		<input class="input w-auto" type="date" value={ops.date} onchange={(e) => goto(`?date=${e.currentTarget.value}`)} aria-label="Date" />
		{#if canManage}<a class="btn-secondary" href="/reservations?new=1">New reservation</a>{/if}
		{#if canAudit}<button class="btn-primary" onclick={runAudit} disabled={audit.pending}>Run night audit</button>{/if}
	{/snippet}
</PageHeader>
<ErrorNote error={audit.error ?? extend.error ?? noShow.error} />
{#if auditResult}<p class="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{auditResult}</p>{/if}

{#if ops.overstays.length > 0 || ops.pendingNoShows.length > 0}
	<div class="mb-4 grid gap-4 lg:grid-cols-2">
		{#if ops.overstays.length > 0}
			<section class="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
				<h2 class="mb-2 font-semibold text-amber-900">Overstays — not being billed</h2>
				<ul class="space-y-1.5">
					{#each ops.overstays as o (o.reservationId)}
						<li class="flex items-center justify-between gap-2">
							<a class="underline" href="/reservations/{o.reservationId}">{o.guestName}</a>
							<span class="text-xs text-amber-800">Room {o.roomNumber} · due out {o.checkOut}</span>
							{#if canManage}<button class="btn-secondary" disabled={extend.pending} onclick={() => extend.run({ reservationId: o.reservationId, checkOut: addDays(ops.businessDate, 1) })}>Extend to {addDays(ops.businessDate, 1)}</button>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if ops.pendingNoShows.length > 0}
			<section class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
				<h2 class="mb-2 font-semibold text-rose-900">Missed arrivals — holding inventory</h2>
				<ul class="space-y-1.5">
					{#each ops.pendingNoShows as o (o.reservationId)}
						<li class="flex items-center justify-between gap-2">
							<a class="underline" href="/reservations/{o.reservationId}">{o.guestName}</a>
							<span class="text-xs text-rose-800">arrival {o.checkIn} · {o.confirmationCode}</span>
							{#if canManage}<button class="btn-secondary" disabled={noShow.pending} onclick={() => noShow.run({ reservationId: o.reservationId })}>Mark no-show</button>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/if}

<div class="grid gap-4 lg:grid-cols-3">
	{@render list('Arrivals', ops.arrivals, 'No arrivals', ops.currency)}
	{@render list('Departures', ops.departures, 'No departures', ops.currency)}
	{@render list('In-house', ops.inHouse, 'No guests in house', ops.currency)}
</div>
{:else}
	<div class="card p-6 text-slate-600">Your role has no access yet — ask the Super admin to grant permissions.</div>
{/if}
