<script lang="ts">
	import { formatDate } from '$lib/shared/domain/dates';
	import { formatMoney } from '$lib/shared/domain/money';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import PatchFields from '../PatchFields.svelte';
	import type { InventoryPatch } from '../patch';
	import type { InventoryCell } from '../get-inventory-grid/contract';
	import { SetDailyInventory } from './contract';

	let { roomTypeId, roomTypeName, cell, currency, invalidates, onDone }: { roomTypeId: string; roomTypeName: string; cell: InventoryCell; currency: string; invalidates?: string[]; onDone: () => void } = $props();
	const action = createAction(SetDailyInventory, { invalidates });
	let patch = $state<InventoryPatch>({});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (await action.run({ roomTypeId, date: cell.date, patch })) onDone();
	}
</script>

<form onsubmit={submit} class="space-y-3">
	<div class="text-sm">
		<div class="font-semibold">{roomTypeName} · {formatDate(cell.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
		<div class="text-slate-500">{cell.soldCount} sold / {cell.availableCount} available · {formatMoney(cell.rateCents, currency)}{cell.minLos ? ` · min ${cell.minLos}n` : ''}{cell.isClosed ? ' · CLOSED' : ''}</div>
	</div>
	{#key cell.date + roomTypeId}<PatchFields bind:patch idPrefix="day" />{/key}
	<ErrorNote error={action.error} />
	<div class="flex gap-2"><button type="button" class="btn-secondary" onclick={onDone}>Close</button><button class="btn-primary flex-1" disabled={action.pending}>Save day</button></div>
</form>
