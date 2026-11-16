<script lang="ts">
	import { goto } from '$app/navigation';
	import { addDays, formatDate } from '$lib/shared/domain/dates';
	import { can } from '$lib/shared/domain/permissions';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import TapeChart from '$lib/features/reservations/get-tape-chart/TapeChart.svelte';
	import BlockRoomForm from '$lib/features/reservations/block-room/BlockRoomForm.svelte';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { UnblockRoom } from '$lib/features/reservations/unblock-room/contract';

	let { data } = $props();
	const chart = $derived(data.chart);
	const unblock = createAction(UnblockRoom, { invalidates: ['app:tape'] });
	const canManage = $derived(can(data.actor.permissions, 'tapeChart.manage'));
	const canReserve = $derived(can(data.actor.permissions, 'reservations.manage'));
	let showBlock = $state(false);
	const rooms = $derived(chart.groups.flatMap((g) => g.rooms.map((r) => ({ id: r.id, label: `${r.roomNumber} · ${g.roomType.name}` }))));

	const nav = (start: string, days = chart.days) => goto(`?start=${start}&days=${days}`, { keepFocus: true, noScroll: true });
	const blocks = $derived(chart.groups.flatMap((g) => g.rooms.flatMap((r) => r.bars.filter((b) => b.kind === 'block').map((b) => ({ ...b, room: r.roomNumber })))));
</script>

<svelte:head><title>Tape chart</title></svelte:head>

<PageHeader title="Tape chart" subtitle="{formatDate(chart.start)} – {formatDate(addDays(chart.start, chart.days - 1))}">
	{#snippet actions()}
		<select class="input w-auto" value={String(chart.days)} onchange={(e) => nav(chart.start, Number(e.currentTarget.value))} aria-label="Days shown">
			<option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option><option value="31">31 days</option>
		</select>
		<button class="btn-secondary" onclick={() => nav(addDays(chart.start, -chart.days))} aria-label="Previous period">«</button>
		<button class="btn-secondary" onclick={() => nav(addDays(chart.start, -1))} aria-label="Previous day">‹</button>
		<button class="btn-secondary" onclick={() => nav(addDays(chart.businessDate, -2))}>Today</button>
		<button class="btn-secondary" onclick={() => nav(addDays(chart.start, 1))} aria-label="Next day">›</button>
		<button class="btn-secondary" onclick={() => nav(addDays(chart.start, chart.days))} aria-label="Next period">»</button>
		{#if canManage}<button class="btn-secondary" onclick={() => (showBlock = !showBlock)}>Room closure</button>{/if}
		{#if canReserve}<a class="btn-primary" href="/reservations?new=1">+ Reservation</a>{/if}
	{/snippet}
</PageHeader>

{#if showBlock && canManage}
	<div class="card mb-4 p-4"><BlockRoomForm {rooms} today={chart.businessDate} invalidates={['app:tape']} /></div>
{/if}

<TapeChart view={chart} />

{#if blocks.length > 0}
	<section class="mt-4 text-sm">
		<h2 class="mb-1 font-semibold">Room closures in view</h2>
		<ErrorNote error={unblock.error} />
		<ul class="space-y-1">
			{#each blocks as b (b.id)}
				<li class="flex items-center gap-3">
					Room {b.room}: {b.label} ({b.checkIn} → {b.checkOut})
					{#if canManage}<button class="text-xs text-brand-700 hover:underline" onclick={() => confirm('Reopen this room?') && unblock.run({ blockId: b.id })}>Reopen</button>{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}
