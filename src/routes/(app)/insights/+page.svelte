<script lang="ts">
	import { goto } from '$app/navigation';
	import { SOURCE_LABEL } from '$lib/shared/domain/enums';
	import { formatMoney } from '$lib/shared/domain/money';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import DailyBars from '$lib/features/insights/get-dashboard/DailyBars.svelte';

	let { data } = $props();
	const d = $derived(data.dashboard);
	const money = (c: number) => formatMoney(c, d.currency);
	let from = $state(data.dashboard.from);
	let to = $state(data.dashboard.to);
	let showTable = $state(false);
	const maxChannel = $derived(Math.max(1, ...d.channels.map((c) => c.revenueCents)));
	const tiles = $derived([
		{ label: 'Occupancy', value: `${d.kpis.occupancyPct.toFixed(1)}%`, sub: `${d.kpis.roomsSold} of ${d.kpis.totalAvailableRoomNights} room-nights` },
		{ label: 'ADR', value: money(d.kpis.adrCents), sub: 'Room revenue ÷ rooms sold' },
		{ label: 'RevPAR', value: money(d.kpis.revparCents), sub: 'Room revenue ÷ available rooms' },
		{ label: 'Room revenue', value: money(d.kpis.roomRevenueCents), sub: 'Booked nightly rates, net of tax' }
	]);
</script>

<svelte:head><title>Insights</title></svelte:head>

<PageHeader title="Insights" subtitle="{d.from} → {d.to}">
	{#snippet actions()}
		<form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); goto(`?from=${from}&to=${to}`); }}>
			<input class="input w-auto" type="date" bind:value={from} aria-label="From" />
			<input class="input w-auto" type="date" bind:value={to} aria-label="To" />
			<button class="btn-secondary">Apply</button>
		</form>
	{/snippet}
</PageHeader>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	{#each tiles as t (t.label)}
		<div class="card p-4">
			<div class="label">{t.label}</div>
			<div class="text-2xl font-semibold tabular-nums">{t.value}</div>
			<div class="text-xs text-slate-500">{t.sub}</div>
		</div>
	{/each}
</div>

<section class="card mt-4 p-4">
	<div class="mb-2 flex items-center justify-between">
		<h2 class="font-semibold">Daily occupancy</h2>
		<button class="text-xs text-brand-700 hover:underline" onclick={() => (showTable = !showTable)}>{showTable ? 'Show chart' : 'Show table'}</button>
	</div>
	{#if showTable}
		<div class="max-h-72 overflow-y-auto">
			<table class="table">
				<thead><tr><th>Date</th><th class="text-right">Sold</th><th class="text-right">Available</th><th class="text-right">Occupancy</th><th class="text-right">Room revenue</th></tr></thead>
				<tbody>
					{#each d.daily as row (row.date)}
						<tr><td>{row.date}</td><td class="text-right">{row.roomsSold}</td><td class="text-right">{row.available}</td><td class="text-right">{row.occupancyPct.toFixed(1)}%</td><td class="text-right">{money(row.roomRevenueCents)}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<DailyBars
			label="Daily occupancy percentage"
			max={100}
			format={(v) => `${Math.round(v)}%`}
			points={d.daily.map((r) => ({ date: r.date, value: r.occupancyPct, detail: `${r.occupancyPct.toFixed(1)}% · ${r.roomsSold}/${r.available} rooms · ${money(r.roomRevenueCents)}` }))}
		/>
	{/if}
</section>

<div class="mt-4 grid gap-4 lg:grid-cols-2">
	<section class="card p-4">
		<h2 class="mb-1 font-semibold">Revenue posted to folios</h2>
		<p class="mb-3 text-xs text-slate-500">Net of tax, by posting date</p>
		<div class="mb-3 grid grid-cols-2 gap-3">
			<div><div class="label">Room</div><div class="text-xl font-semibold tabular-nums">{money(d.revenue.roomCents)}</div></div>
			<div><div class="label">Add-on orders</div><div class="text-xl font-semibold tabular-nums">{money(d.revenue.addOnCents)}</div></div>
		</div>
		<table class="table">
			<tbody>
				{#each d.revenue.byCategory as c (c.category)}
					<tr><td>{c.category}</td><td class="text-right tabular-nums">{money(c.cents)}</td></tr>
				{:else}
					<tr><td class="py-4 text-center text-slate-400">No add-on revenue in range</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="card p-4">
		<h2 class="mb-3 font-semibold">Channel performance</h2>
		<table class="table">
			<thead><tr><th>Channel</th><th class="text-right">Bookings</th><th class="text-right">Nights</th><th class="text-right">ADR</th><th class="w-1/3">Room revenue</th></tr></thead>
			<tbody>
				{#each d.channels as c (c.source)}
					<tr title="{SOURCE_LABEL[c.source]}: {money(c.revenueCents)}">
						<td>{SOURCE_LABEL[c.source]}</td>
						<td class="text-right tabular-nums">{c.reservations}</td>
						<td class="text-right tabular-nums">{c.roomNights}</td>
						<td class="text-right tabular-nums">{money(c.adrCents)}</td>
						<td>
							<div class="flex items-center gap-2">
								<div class="h-2 rounded-r bg-brand-500" style="width: {(c.revenueCents / maxChannel) * 100}%"></div>
								<span class="text-xs whitespace-nowrap text-slate-700 tabular-nums">{money(c.revenueCents)}</span>
							</div>
						</td>
					</tr>
				{:else}
					<tr><td colspan="5" class="py-4 text-center text-slate-400">No bookings in range</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>
