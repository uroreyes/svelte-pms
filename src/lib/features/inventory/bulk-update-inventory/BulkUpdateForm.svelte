<script lang="ts">
	import { DOW_SHORT, monthBounds } from '$lib/shared/domain/dates';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import PatchFields from '../PatchFields.svelte';
	import type { InventoryPatch } from '../patch';
	import { BulkUpdateInventory } from './contract';

	let { roomTypes, month, invalidates }: { roomTypes: { id: string; name: string }[]; month: string; invalidates?: string[] } = $props();
	const action = createAction(BulkUpdateInventory, { invalidates });
	let roomTypeId = $state(roomTypes[0]?.id ?? '');
	let from = $state(monthBounds(month).from);
	let to = $state(monthBounds(month).to);
	let days = $state<number[]>([]);
	let patch = $state<InventoryPatch>({});
	let result = $state('');

	function toggle(d: number) {
		days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
	}
	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const r = await action.run({ roomTypeId, from, to, daysOfWeek: days, patch });
		result = r ? `Updated ${r.updated} date(s).` : '';
	}
</script>

<form onsubmit={submit} class="space-y-3">
	<div class="grid grid-cols-3 gap-2">
		<div>
			<label class="label" for="bu-type">Room type</label>
			<select id="bu-type" class="input" bind:value={roomTypeId}>{#each roomTypes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</select>
		</div>
		<div><label class="label" for="bu-from">From</label><input id="bu-from" class="input" type="date" bind:value={from} required /></div>
		<div><label class="label" for="bu-to">To (incl.)</label><input id="bu-to" class="input" type="date" bind:value={to} required /></div>
	</div>
	<div>
		<span class="label">Days of week <span class="normal-case">(none = every day)</span></span>
		<div class="flex flex-wrap gap-1">
			{#each DOW_SHORT as label, d (d)}
				<button type="button" onclick={() => toggle(d)} class="rounded border px-2 py-1 text-xs {days.includes(d) ? 'border-brand-500 bg-brand-50 font-semibold' : 'border-slate-300'}">{label}</button>
			{/each}
			<button type="button" class="ml-2 text-xs text-brand-700 hover:underline" onclick={() => (days = [5, 6])}>Fri+Sat</button>
		</div>
	</div>
	<PatchFields bind:patch idPrefix="bulk" />
	<ErrorNote error={action.error} />
	{#if result}<p class="text-xs text-emerald-700">{result}</p>{/if}
	<button class="btn-primary w-full" disabled={action.pending}>Apply to range</button>
</form>
