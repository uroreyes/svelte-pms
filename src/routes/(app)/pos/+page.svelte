<script lang="ts">
	import { ask } from '$lib/shared/cqrs/client';
	import type { ApiError } from '$lib/shared/cqrs/contract';
	import { formatMoney } from '$lib/shared/domain/money';
	import { can } from '$lib/shared/domain/permissions';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import { FindInHouseRoom, type InHouseRoomView } from '$lib/features/folio/find-in-house-room/contract';
	import PostChargeForm from '$lib/features/folio/post-charge/PostChargeForm.svelte';
	import type { OptimisticLine } from '$lib/features/folio/optimistic';

	let { data } = $props();
	let roomNumber = $state('');
	let room = $state<InHouseRoomView | null>(null);
	let lookupError = $state<ApiError | null>(null);
	let journal = $state<(OptimisticLine & { state: 'pending' | 'posted' | 'failed'; room: string })[]>([]);
	const canDiscount = $derived(can(data.actor.permissions, 'folio.manage'));

	async function lookup(e: SubmitEvent) {
		e.preventDefault();
		lookupError = null;
		const r = await ask(FindInHouseRoom, { roomNumber: roomNumber.trim() });
		room = r.ok ? r.data : null;
		if (!r.ok) lookupError = r.error;
	}
	const onOptimistic = (line: OptimisticLine) => (journal = [{ ...line, state: 'pending' as const, room: room?.roomNumber ?? '' }, ...journal].slice(0, 20));
	const onSettled = (tempId: string, ok: boolean) => (journal = journal.map((j) => (j.tempId === tempId ? { ...j, state: ok ? ('posted' as const) : ('failed' as const) } : j)));
</script>

<svelte:head><title>Add order to room</title></svelte:head>

<PageHeader title="Add order to room" subtitle="Post restaurant, minibar, laundry and other incidentals to an in-house guest's folio" />

<div class="grid gap-4 lg:grid-cols-[420px_1fr]">
	<section class="card space-y-4 p-4">
		<form onsubmit={lookup} class="flex gap-2">
			<input class="input text-lg" placeholder="Room number, e.g. 204" bind:value={roomNumber} required maxlength="10" aria-label="Room number" />
			<button class="btn-primary">Find</button>
		</form>
		<ErrorNote error={lookupError} />
		{#if room}
			<div class="rounded-md bg-emerald-50 px-3 py-2 text-sm">
				<div class="font-semibold">Room {room.roomNumber} · {room.guestName}</div>
				<div class="text-xs text-slate-600">{room.confirmationCode} · departs {room.checkOut}</div>
			</div>
			{#key room.reservationId}
				<PostChargeForm
					folios={room.folios}
					catalog={data.catalog.items}
					currency={data.catalog.currency}
					taxRules={data.catalog.taxRules}
					{canDiscount}
					invalidates={[]}
					{onOptimistic}
					{onSettled}
				/>
			{/key}
		{/if}
	</section>

	<section class="card">
		<h2 class="border-b border-slate-200 px-4 py-2.5 font-semibold">This session</h2>
		<table class="table">
			<tbody>
				{#each journal as j (j.tempId)}
					<tr class={j.state === 'pending' ? 'animate-pulse text-slate-400' : j.state === 'failed' ? 'text-rose-600 line-through' : ''}>
						<td>Room {j.room}</td><td>{j.quantity} × {j.description}</td><td class="text-right tabular-nums">{formatMoney(j.totalCents, data.catalog.currency)}</td><td class="text-xs">{j.state}</td>
					</tr>
				{:else}
					<tr><td class="py-8 text-center text-slate-400">Nothing posted yet</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>
