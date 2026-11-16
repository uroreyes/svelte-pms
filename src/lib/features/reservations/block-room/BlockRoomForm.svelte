<script lang="ts">
	import { addDays } from '$lib/shared/domain/dates';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { BlockRoom } from './contract';

	let { rooms, today, invalidates }: { rooms: { id: string; label: string }[]; today: string; invalidates?: string[] } = $props();
	const action = createAction(BlockRoom, { invalidates });
	let roomUnitId = $state('');
	let startDate = $state(today);
	let endDate = $state(addDays(today, 1));
	let reason = $state('Maintenance');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		await action.run({ roomUnitId, startDate, endDate, reason });
	}
</script>

<form onsubmit={submit} class="flex flex-wrap items-end gap-2">
	<div>
		<label class="label" for="br-room">Room</label>
		<select id="br-room" class="input" bind:value={roomUnitId} required>
			<option value="" disabled>Select…</option>
			{#each rooms as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
		</select>
	</div>
	<div><label class="label" for="br-s">From</label><input id="br-s" class="input" type="date" bind:value={startDate} required /></div>
	<div><label class="label" for="br-e">Until (exclusive)</label><input id="br-e" class="input" type="date" bind:value={endDate} required /></div>
	<div><label class="label" for="br-r">Reason</label><input id="br-r" class="input" bind:value={reason} maxlength="120" required /></div>
	<button class="btn-danger" disabled={action.pending}>Close room</button>
	<div class="w-full"><ErrorNote error={action.error} /></div>
</form>
