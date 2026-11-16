<script lang="ts">
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { MoveRoom } from './contract';

	let { reservationId, targets }: { reservationId: string; targets: { id: string; roomNumber: string; roomTypeName: string; housekeepingStatus: string; ready: boolean; free: boolean }[] } = $props();
	const action = createAction(MoveRoom);
	let roomUnitId = $state('');
	let reason = $state('');
	const options = $derived(targets.filter((t) => t.free && t.ready));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (await action.run({ reservationId, roomUnitId, reason })) reason = '';
	}
</script>

<form onsubmit={submit} class="space-y-3">
	<div>
		<label class="label" for="mv-room">Move to (clean &amp; free until departure)</label>
		<select id="mv-room" class="input" bind:value={roomUnitId} required>
			<option value="" disabled>Select a room…</option>
			{#each options as t (t.id)}<option value={t.id}>{t.roomNumber} · {t.roomTypeName}</option>{/each}
		</select>
	</div>
	<div><label class="label" for="mv-why">Reason</label><input id="mv-why" class="input" bind:value={reason} required maxlength="200" placeholder="AC not working / upgrade" /></div>
	<ErrorNote error={action.error} />
	<button class="btn-secondary w-full" disabled={action.pending || !roomUnitId}>Move guest</button>
</form>
