<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatDateTime } from '$lib/shared/domain/dates';
	import { formatMoney } from '$lib/shared/domain/money';
	import { can } from '$lib/shared/domain/permissions';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';

	let { data } = $props();
	const r = $derived(data.report);
	const money = (c: number) => formatMoney(c, r.currency);
	const canExport = $derived(can(data.actor.permissions, 'reports.export'));
	// svelte-ignore state_referenced_locally
	let filters = $state({ from: data.report.from, to: data.report.to, staff: '' });

	function apply(e: SubmitEvent) {
		e.preventDefault();
		const qs = new URLSearchParams({ from: filters.from, to: filters.to });
		if (filters.staff) qs.set('staff', filters.staff);
		goto(`?${qs}`);
	}
	const exportHref = (dataset: string) => `/api/reports/export?dataset=${dataset}&from=${r.from}&to=${r.to}`;
</script>

<svelte:head><title>Reports</title></svelte:head>

<PageHeader title="Cashier report" subtitle="Payments, refunds and voids · {r.from} → {r.to} ({r.timezone})">
	{#snippet actions()}
		<form class="flex flex-wrap gap-2" onsubmit={apply}>
			<input class="input w-auto" type="date" bind:value={filters.from} aria-label="From" />
			<input class="input w-auto" type="date" bind:value={filters.to} aria-label="To" />
			<select class="input w-auto" bind:value={filters.staff} aria-label="Staff">
				<option value="">All staff</option>
				{#each r.staff as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
			</select>
			<button class="btn-secondary">Apply</button>
			<button type="button" class="btn-secondary" onclick={() => window.print()}>Print</button>
		</form>
	{/snippet}
</PageHeader>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	{#each r.byMethod as m (m.method)}
		<div class="card p-4"><div class="label">{m.method}</div><div class="text-xl font-semibold tabular-nums">{money(m.cents)}</div><div class="text-xs text-slate-500">{m.count} transaction(s)</div></div>
	{/each}
	<div class="card border-slate-300 p-4"><div class="label">Net collected</div><div class="text-xl font-semibold tabular-nums">{money(r.totalCents)}</div><div class="text-xs text-slate-500">{r.lines.length} line(s)</div></div>
</div>

<div class="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
	<section class="card overflow-x-auto">
		<table class="table">
			<thead><tr><th>Time</th><th>Reservation</th><th>Folio</th><th>Kind</th><th>Method</th><th>Reference</th><th>Staff</th><th class="text-right">Amount</th></tr></thead>
			<tbody>
				{#each r.lines as l (l.paymentId)}
					<tr>
						<td class="whitespace-nowrap">{formatDateTime(l.paidAt, r.timezone)}</td>
						<td><a class="text-brand-700 hover:underline" href="/reservations/{l.reservationId}">{l.confirmationCode}</a> <span class="text-xs text-slate-500">{l.guestName}</span></td>
						<td class="text-xs">{l.folioLabel}{l.invoiceNumber ? ` · ${l.invoiceNumber}` : ''}</td>
						<td class="text-xs">{l.kind}</td>
						<td class="text-xs">{l.method}</td>
						<td class="text-xs">{l.referenceNo ?? '—'}</td>
						<td class="text-xs">{l.staffName}</td>
						<td class="text-right tabular-nums">{money(l.amountCents)}</td>
					</tr>
				{:else}
					<tr><td colspan="8" class="py-8 text-center text-slate-400">No payments in this period</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
	<aside class="space-y-4">
		<section class="card p-4 text-sm">
			<h2 class="mb-2 font-semibold">By staff</h2>
			{#each r.byStaff as s (s.staffName)}
				<div class="flex justify-between"><span>{s.staffName} <span class="text-slate-400">({s.count})</span></span><span class="tabular-nums">{money(s.cents)}</span></div>
			{:else}<p class="text-slate-400">—</p>{/each}
		</section>
		{#if canExport}
			<section class="card no-print space-y-2 p-4 text-sm">
				<h2 class="font-semibold">Export CSV</h2>
				<a class="btn-secondary w-full" href={exportHref('payments')} download>Payments</a>
				<a class="btn-secondary w-full" href={exportHref('folio-items')} download>Folio lines</a>
				<a class="btn-secondary w-full" href={exportHref('reservations')} download>Reservations</a>
			</section>
		{/if}
	</aside>
</div>
