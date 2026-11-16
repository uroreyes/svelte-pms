<script lang="ts">
	import { DOW_SHORT } from '$lib/shared/domain/dates';
	import type { TapeBar, TapeChartView } from './contract';

	let { view }: { view: TapeChartView } = $props();

	const cols = $derived(`grid-template-columns: 120px repeat(${view.days}, minmax(52px, 1fr))`);
	const barColor: Record<TapeBar['status'], string> = {
		CONFIRMED: 'bg-blue-500 hover:bg-blue-600',
		CHECKED_IN: 'bg-emerald-600 hover:bg-emerald-700',
		CHECKED_OUT: 'bg-slate-400 hover:bg-slate-500',
		CANCELLED: 'bg-slate-300',
		NO_SHOW: 'bg-amber-400',
		MAINTENANCE: 'bg-[repeating-linear-gradient(45deg,#e11d48_0_6px,#be123c_6px_12px)]'
	};
	const hk: Record<string, string> = { CLEAN: 'bg-emerald-500', INSPECTED: 'bg-teal-500', DIRTY: 'bg-amber-500', OUT_OF_ORDER: 'bg-rose-500' };
	const isWeekend = (dow: number) => dow === 0 || dow === 6;

	function newHref(roomTypeId: string, date: string, roomUnitId?: string) {
		const qs = new URLSearchParams({ new: '1', roomTypeId, checkIn: date });
		if (roomUnitId) qs.set('roomUnitId', roomUnitId);
		return `/reservations?${qs}`;
	}
</script>

{#snippet bar(b: TapeBar)}
	{@const style = `grid-column: ${b.startCol + 2} / span ${b.span}; grid-row: 1`}
	{#if b.kind === 'reservation'}
		<a
			href="/reservations/{b.id}"
			{style}
			title="{b.label} · {b.checkIn} → {b.checkOut} · {b.status}{b.overbooked ? ' · OVERBOOKED' : ''}"
			class="z-10 mx-0.5 my-1 truncate rounded px-2 py-1 text-xs font-medium text-white shadow-sm {barColor[b.status]}
				{b.continuesBefore ? 'rounded-l-none' : ''} {b.continuesAfter ? 'rounded-r-none' : ''} {b.overbooked ? 'ring-2 ring-rose-500 ring-offset-1' : ''}"
		>
			{b.label}
		</a>
	{:else}
		<div {style} title="Closed: {b.label} ({b.checkIn} → {b.checkOut})" class="z-10 mx-0.5 my-1 truncate rounded px-2 py-1 text-xs font-medium text-white {barColor.MAINTENANCE}">
			🔧 {b.label}
		</div>
	{/if}
{/snippet}

<div class="card overflow-x-auto">
	<div class="min-w-[900px]">
		<!-- header -->
		<div class="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={cols}>
			<div class="px-3 py-2 text-xs font-semibold text-slate-500">Room</div>
			{#each view.dates as d (d.date)}
				<div class="border-l border-slate-100 py-1.5 text-center text-[11px] leading-tight {d.date === view.businessDate ? 'bg-brand-50 font-bold text-brand-700' : isWeekend(d.dow) ? 'bg-slate-50 text-slate-600' : 'text-slate-600'}">
					<div class="uppercase">{d.date === view.businessDate ? 'Today' : DOW_SHORT[d.dow]}</div>
					<div class="text-sm font-semibold">{d.date.slice(8)}</div>
					<div class="text-[10px] text-slate-400">{d.date.slice(5, 7)}</div>
				</div>
			{/each}
		</div>

		{#each view.groups as g (g.roomType.id)}
			<div class="border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{g.roomType.name}</div>
			{#each g.rooms as room (room.id)}
				<div class="grid min-h-9 border-b border-slate-100" style={cols}>
					<div class="flex items-center gap-2 px-3 text-sm" style="grid-column: 1; grid-row: 1">
						<span class="size-2 rounded-full {hk[room.housekeepingStatus]}" title={room.housekeepingStatus}></span>
						{room.roomNumber}
					</div>
					{#each view.dates as d, i (d.date)}
						<a
							href={newHref(g.roomType.id, d.date, room.id)}
							aria-label="New reservation in room {room.roomNumber} on {d.date}"
							style="grid-column: {i + 2}; grid-row: 1"
							class="border-l border-slate-100 hover:bg-brand-50 {d.date === view.businessDate ? 'bg-brand-50/50' : isWeekend(d.dow) ? 'bg-slate-50' : ''}"
						></a>
					{/each}
					{#each room.bars as b (b.id)}{@render bar(b)}{/each}
				</div>
			{/each}
			{#each g.unallocated.length ? g.unallocated : [[]] as lane, li (li)}
				<div class="grid min-h-9 border-b border-slate-100 bg-sky-50/50" style={cols}>
					<div class="flex items-center px-3 text-xs text-slate-500 italic" style="grid-column: 1; grid-row: 1">{li === 0 ? 'Unallocated' : ''}</div>
					{#each view.dates as d, i (d.date)}
						<div style="grid-column: {i + 2}; grid-row: 1" class="border-l border-slate-100"></div>
					{/each}
					{#each lane as b (b.id)}{@render bar(b)}{/each}
				</div>
			{/each}
		{/each}
	</div>
</div>

<div class="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
	<span class="flex items-center gap-1"><span class="size-3 rounded bg-blue-500"></span>Confirmed</span>
	<span class="flex items-center gap-1"><span class="size-3 rounded bg-emerald-600"></span>Checked in</span>
	<span class="flex items-center gap-1"><span class="size-3 rounded bg-slate-400"></span>Checked out</span>
	<span class="flex items-center gap-1"><span class="size-3 rounded {barColor.MAINTENANCE}"></span>Maintenance</span>
	<span class="flex items-center gap-1"><span class="size-3 rounded bg-sky-100 ring-1 ring-sky-300"></span>Unallocated lane</span>
	<span class="flex items-center gap-1"><span class="size-3 rounded ring-2 ring-rose-500"></span>Overbooked</span>
</div>
