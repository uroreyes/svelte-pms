<script lang="ts">
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import { CheckIn } from './contract';

	interface Room {
		id: string;
		roomNumber: string;
		housekeepingStatus: string;
		ready: boolean;
		free: boolean;
	}
	let { reservationId, assignedRoomId, rooms }: { reservationId: string; assignedRoomId: string | null; rooms: Room[] } = $props();

	const action = createAction(CheckIn);
	let roomUnitId = $state(assignedRoomId ?? '');
	let idDocumentType = $state('Passport');
	let idDocumentNumber = $state('');
	let depositCents = $state<number | null>(null);
	let depositReference = $state('');
	const selectable = $derived(rooms.filter((r) => (r.free && r.ready) || r.id === assignedRoomId));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		await action.run({
			reservationId,
			roomUnitId: roomUnitId || undefined,
			idDocumentType,
			idDocumentNumber,
			depositCents: depositCents ?? undefined,
			depositReference: depositReference || undefined
		});
	}
</script>

<form onsubmit={submit} class="space-y-3">
	<div>
		<label class="label" for="ci-room">Room (clean &amp; unoccupied)</label>
		<select id="ci-room" class="input" bind:value={roomUnitId} required>
			<option value="" disabled>Select a room…</option>
			{#each selectable as r (r.id)}
				<option value={r.id}>{r.roomNumber} · {r.housekeepingStatus.toLowerCase()}{r.ready ? '' : ' (not ready)'}</option>
			{/each}
		</select>
		{#if selectable.length === 0}<p class="mt-1 text-xs text-amber-700">No clean, free room of this type — update housekeeping first.</p>{/if}
	</div>
	<div class="grid grid-cols-2 gap-2">
		<div>
			<label class="label" for="ci-idt">ID type</label>
			<select id="ci-idt" class="input" bind:value={idDocumentType}>
				<option>Passport</option><option>National ID</option><option>Driver's licence</option>
			</select>
		</div>
		<div>
			<label class="label" for="ci-idn">ID number</label>
			<input id="ci-idn" class="input" bind:value={idDocumentNumber} required maxlength="60" autocomplete="off" />
		</div>
	</div>
	<div class="grid grid-cols-2 gap-2">
		<div>
			<label class="label" for="ci-dep">Deposit / pre-auth</label>
			<MoneyInput id="ci-dep" bind:cents={depositCents} />
		</div>
		<div>
			<label class="label" for="ci-ref">Auth reference</label>
			<input id="ci-ref" class="input" bind:value={depositReference} maxlength="80" />
		</div>
	</div>
	<ErrorNote error={action.error} />
	<button class="btn-primary w-full" disabled={action.pending}>{action.pending ? 'Checking in…' : 'Check in & open folio'}</button>
</form>
