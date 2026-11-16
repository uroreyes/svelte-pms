<script lang="ts">
	import { HOUSEKEEPING_STATUSES, type HousekeepingStatus } from '$lib/shared/domain/enums';
	import { can } from '$lib/shared/domain/permissions';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import { SetRoomStatus } from '$lib/features/housekeeping/set-room-status/contract';

	let { data } = $props();
	const setStatus = createAction(SetRoomStatus, { invalidates: ['app:housekeeping'] });
	const tone: Record<HousekeepingStatus, string> = {
		CLEAN: 'border-emerald-300 bg-emerald-50',
		INSPECTED: 'border-teal-300 bg-teal-50',
		DIRTY: 'border-amber-300 bg-amber-50',
		OUT_OF_ORDER: 'border-rose-300 bg-rose-50'
	};
	const canManage = $derived(can(data.actor.permissions, 'housekeeping.manage'));
	const counts = $derived(Object.fromEntries(HOUSEKEEPING_STATUSES.map((s) => [s, data.board.rooms.filter((r) => r.housekeepingStatus === s).length])));
</script>

<svelte:head><title>Housekeeping</title></svelte:head>

<PageHeader title="Housekeeping" subtitle="Business date {data.board.businessDate} · {HOUSEKEEPING_STATUSES.map((s) => `${counts[s]} ${s.toLowerCase().replace('_', ' ')}`).join(' · ')}" />
<ErrorNote error={setStatus.error} />

<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
	{#each data.board.rooms as room (room.id)}
		<div class="rounded-lg border-2 p-3 {tone[room.housekeepingStatus]}">
			<div class="flex items-baseline justify-between">
				<span class="text-lg font-bold">{room.roomNumber}</span>
				<span class="text-xs text-slate-500">Fl {room.floor}</span>
			</div>
			<div class="mb-2 truncate text-xs text-slate-600">{room.roomTypeName}</div>
			{#if room.occupant}
				<a href="/reservations/{room.occupant.reservationId}" class="block truncate text-xs text-emerald-800 hover:underline">● {room.occupant.guestName} → {room.occupant.checkOut}</a>
			{:else if room.arrivalToday}
				<a href="/reservations/{room.arrivalToday.reservationId}" class="block truncate text-xs text-blue-800 hover:underline">↘ Arriving: {room.arrivalToday.guestName}</a>
			{:else}
				<div class="text-xs text-slate-400">Vacant</div>
			{/if}
			{#if canManage}
				<select
					class="mt-2 w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
					value={room.housekeepingStatus}
					disabled={setStatus.pending}
					aria-label="Status for room {room.roomNumber}"
					onchange={(e) => setStatus.run({ roomUnitId: room.id, status: e.currentTarget.value as HousekeepingStatus })}
				>
					{#each HOUSEKEEPING_STATUSES as s (s)}<option value={s}>{s.replace('_', ' ')}</option>{/each}
				</select>
			{:else}
				<div class="mt-2 text-xs text-slate-600">{room.housekeepingStatus.replace('_', ' ')}</div>
			{/if}
		</div>
	{/each}
</div>
