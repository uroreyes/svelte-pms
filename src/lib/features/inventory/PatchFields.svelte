<script lang="ts">
	/** Module-level form fields for an inventory patch (shared by the daily and bulk slices). */
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import type { InventoryPatch } from './patch';

	let { patch = $bindable(), idPrefix }: { patch: InventoryPatch; idPrefix: string } = $props();
	let setAvail = $state(patch.availableCount !== undefined);
	let setRate = $state(patch.rateOverrideCents !== undefined);
	let setLos = $state(patch.minLos !== undefined);
	let setClosed = $state(patch.isClosed !== undefined);
	let avail = $state(patch.availableCount ?? 0);
	let rate = $state<number | null>(patch.rateOverrideCents ?? null);
	let los = $state<number | null>(patch.minLos ?? null);
	let closed = $state(patch.isClosed ?? false);

	$effect(() => {
		patch = {
			availableCount: setAvail ? avail : undefined,
			rateOverrideCents: setRate ? rate : undefined,
			minLos: setLos ? (los && los > 0 ? los : null) : undefined,
			isClosed: setClosed ? closed : undefined
		};
	});
</script>

<div class="grid gap-2 text-sm">
	<label class="flex items-center gap-2">
		<input type="checkbox" bind:checked={setAvail} /> <span class="w-32">Available units</span>
		<input id="{idPrefix}-avail" class="input w-24" type="number" min="0" max="999" bind:value={avail} disabled={!setAvail} />
	</label>
	<div class="flex items-center gap-2">
		<input type="checkbox" bind:checked={setRate} aria-label="Change nightly rate" /> <span class="w-32">Nightly rate</span>
		<div class="w-28">{#if setRate}<MoneyInput id="{idPrefix}-rate" bind:cents={rate} placeholder="base" />{:else}<input class="input" disabled placeholder="—" />{/if}</div>
		{#if setRate}<span class="text-xs text-slate-500">empty = base rate</span>{/if}
	</div>
	<label class="flex items-center gap-2">
		<input type="checkbox" bind:checked={setLos} /> <span class="w-32">Min. stay (nights)</span>
		<input class="input w-24" type="number" min="0" max="60" bind:value={los} disabled={!setLos} placeholder="none" />
	</label>
	<label class="flex items-center gap-2">
		<input type="checkbox" bind:checked={setClosed} /> <span class="w-32">Stop-sell</span>
		<select class="input w-28" bind:value={closed} disabled={!setClosed}><option value={true}>Closed</option><option value={false}>Open</option></select>
	</label>
</div>
