<script lang="ts">
	import { DOW_SHORT, monthBounds } from '$lib/shared/domain/dates';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import { BulkUpdateRatePlan } from './contract';

	let { roomTypes, month, invalidates }: { roomTypes: { name: string; plans: { id: string; name: string }[] }[]; month: string; invalidates?: string[] } = $props();
	const action = createAction(BulkUpdateRatePlan, { invalidates });
	const plans = $derived(roomTypes.flatMap((t) => t.plans.map((p) => ({ id: p.id, label: `${t.name} · ${p.name}` }))));
	// svelte-ignore state_referenced_locally
	let f = $state({ ratePlanId: '', from: monthBounds(month).from, to: monthBounds(month).to, days: [] as number[], mode: 'rate' as 'rate' | 'clear' | 'close' | 'open', rate: null as number | null });
	let result = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const patch =
			f.mode === 'rate' ? { rateOverrideCents: f.rate } : f.mode === 'clear' ? { rateOverrideCents: null } : { isClosed: f.mode === 'close' };
		const r = await action.run({ ratePlanId: f.ratePlanId, from: f.from, to: f.to, daysOfWeek: f.days, ...patch });
		result = r ? `Updated ${r.updated} date(s).` : '';
	}
</script>

<form onsubmit={submit} class="space-y-3 text-sm">
	<select class="input" bind:value={f.ratePlanId} required aria-label="Rate plan">
		<option value="" disabled>Rate plan…</option>
		{#each plans as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
	</select>
	<div class="grid grid-cols-2 gap-2">
		<input class="input" type="date" bind:value={f.from} aria-label="From" />
		<input class="input" type="date" bind:value={f.to} aria-label="To (inclusive)" />
	</div>
	<div class="flex flex-wrap gap-1">
		{#each DOW_SHORT as label, d (d)}
			<button type="button" onclick={() => (f.days = f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d])} class="rounded border px-2 py-1 text-xs {f.days.includes(d) ? 'border-brand-500 bg-brand-50 font-semibold' : 'border-slate-300'}">{label}</button>
		{/each}
	</div>
	<div class="grid grid-cols-2 gap-2">
		<select class="input" bind:value={f.mode} aria-label="Change">
			<option value="rate">Set plan rate</option><option value="clear">Clear plan rate</option><option value="close">Stop-sell plan</option><option value="open">Re-open plan</option>
		</select>
		{#if f.mode === 'rate'}<MoneyInput bind:cents={f.rate} required placeholder="Nightly rate" />{/if}
	</div>
	<ErrorNote error={action.error} />
	{#if result}<p class="text-xs text-emerald-700">{result}</p>{/if}
	<button class="btn-primary w-full" disabled={action.pending || plans.length === 0}>Apply to plan</button>
	{#if plans.length === 0}<p class="text-xs text-slate-500">Create rate plans under Setup first.</p>{/if}
</form>
