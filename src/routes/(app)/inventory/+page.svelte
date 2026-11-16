<script lang="ts">
	import { goto } from '$app/navigation';
	import { DOW_SHORT } from '$lib/shared/domain/dates';
	import { formatMoney } from '$lib/shared/domain/money';
	import { can } from '$lib/shared/domain/permissions';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import BulkUpdateForm from '$lib/features/inventory/bulk-update-inventory/BulkUpdateForm.svelte';
	import DayEditor from '$lib/features/inventory/set-daily-inventory/DayEditor.svelte';
	import BulkRatePlanForm from '$lib/features/inventory/bulk-update-rate-plan/BulkRatePlanForm.svelte';

	let { data } = $props();
	const grid = $derived(data.grid);
	const canEdit = $derived(can(data.actor.permissions, 'inventory.manage'));
	let selected = $state<{ typeId: string; date: string } | null>(null);
	const selectedType = $derived(selected ? grid.roomTypes.find((t) => t.id === selected!.typeId) : undefined);
	const selectedCell = $derived(selectedType?.cells.find((c) => c.date === selected!.date));
	const INV = ['app:inventory'];

	function shiftMonth(delta: number) {
		const [y, m] = grid.month.split('-').map(Number) as [number, number];
		const d = new Date(Date.UTC(y, m - 1 + delta, 1));
		goto(`?month=${d.toISOString().slice(0, 7)}`, { noScroll: true });
	}
	const money = (c: number) => formatMoney(c, grid.currency).replace(/\.00$/, '');
</script>

<svelte:head><title>Rates &amp; inventory</title></svelte:head>

<PageHeader title="Rates & inventory" subtitle="Per-day control · click a cell to edit one day, or bulk-update a range below">
	{#snippet actions()}
		<button class="btn-secondary" onclick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
		<input class="input w-auto" type="month" value={grid.month} onchange={(e) => goto(`?month=${e.currentTarget.value}`)} aria-label="Month" />
		<button class="btn-secondary" onclick={() => shiftMonth(1)} aria-label="Next month">›</button>
	{/snippet}
</PageHeader>

<div class="card overflow-x-auto">
	<table class="w-full border-collapse text-xs">
		<thead>
			<tr>
				<th class="sticky left-0 z-10 min-w-36 bg-white px-2 py-1 text-left">Room type</th>
				{#each grid.dates as d (d.date)}
					<th class="min-w-14 px-1 py-1 text-center font-medium {d.dow === 0 || d.dow === 6 ? 'bg-slate-50' : ''}">
						<div class="text-slate-500">{DOW_SHORT[d.dow]}</div>
						<div>{d.date.slice(8)}</div>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each grid.roomTypes as t (t.id)}
				<tr class="border-t border-slate-200">
					<th class="sticky left-0 z-10 bg-white px-2 py-1 text-left align-top">
						<div class="text-sm font-semibold">{t.name}</div>
						<div class="font-normal text-slate-500">{t.units} units · base {money(t.baseRateCents)}</div>
					</th>
					{#each t.cells as c (c.date)}
						<td class="p-0.5">
							<button
								disabled={!canEdit}
								onclick={() => (selected = { typeId: t.id, date: c.date })}
								class="w-full rounded px-1 py-1 text-center leading-tight disabled:cursor-default
									{c.isClosed ? 'bg-rose-100 text-rose-800' : c.remaining === 0 ? 'bg-amber-100' : 'bg-emerald-50 hover:bg-emerald-100'}
									{selected?.typeId === t.id && selected?.date === c.date ? 'ring-2 ring-brand-500' : ''}"
								title="{c.soldCount} sold of {c.availableCount}{c.minLos ? ` · MinLOS ${c.minLos}` : ''}{c.isClosed ? ' · stop-sell' : ''}"
							>
								<div class="font-semibold">{c.remaining}<span class="font-normal text-slate-400">/{c.availableCount}</span></div>
								<div class={c.isOverride ? 'font-semibold text-brand-700' : 'text-slate-600'}>{money(c.rateCents)}</div>
								{#if c.minLos}<div class="text-[10px] text-slate-500">≥{c.minLos}n</div>{/if}
							</button>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="mt-2 text-xs text-slate-500">Cell: remaining/allotment · nightly rate (blue = override) · ≥n = minimum stay · red = stop-sell · amber = sold out</p>

{#if canEdit}
	<div class="mt-4 grid gap-4 lg:grid-cols-3">
		<section class="card p-4">
			<h2 class="mb-3 font-semibold">Bulk update</h2>
			{#key grid.month}<BulkUpdateForm roomTypes={grid.roomTypes} month={grid.month} invalidates={INV} />{/key}
		</section>
		<section class="card p-4">
			<h2 class="mb-3 font-semibold">Single day</h2>
			{#if selected && selectedType && selectedCell}
				<DayEditor roomTypeId={selectedType.id} roomTypeName={selectedType.name} cell={selectedCell} currency={grid.currency} invalidates={INV} onDone={() => (selected = null)} />
			{:else}
				<p class="text-sm text-slate-500">Select a cell in the grid.</p>
			{/if}
		</section>
		<section class="card p-4">
			<h2 class="mb-1 font-semibold">Rate plan overrides</h2>
			<p class="mb-3 text-xs text-slate-500">Override a plan's price or stop-sell it without touching room inventory.</p>
			{#key grid.month}<BulkRatePlanForm roomTypes={grid.roomTypes} month={grid.month} invalidates={INV} />{/key}
		</section>
	</div>
{/if}
