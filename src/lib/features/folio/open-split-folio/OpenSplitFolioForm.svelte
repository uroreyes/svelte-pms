<script lang="ts">
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { OpenSplitFolio } from './contract';

	let { reservationId, invalidates }: { reservationId: string; invalidates?: string[] } = $props();
	const action = createAction(OpenSplitFolio, { invalidates });
	let label = $state('Company');
	let payerName = $state('');
	let routeRoomCharges = $state(true);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (await action.run({ reservationId, label, payerName, routeRoomCharges })) payerName = '';
	}
</script>

<form onsubmit={submit} class="space-y-3">
	<div class="grid grid-cols-2 gap-2">
		<div>
			<label class="label" for="sf-label">Folio label</label>
			<input id="sf-label" class="input" bind:value={label} maxlength="40" required />
		</div>
		<div>
			<label class="label" for="sf-payer">Billed to</label>
			<input id="sf-payer" class="input" bind:value={payerName} maxlength="120" required placeholder="Acme Corp." />
		</div>
	</div>
	<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={routeRoomCharges} /> Route future room nights here</label>
	<ErrorNote error={action.error} />
	<button class="btn-secondary w-full" disabled={action.pending}>Open split folio</button>
</form>
