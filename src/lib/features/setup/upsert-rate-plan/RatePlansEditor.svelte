<script lang="ts">
	import { RATE_ADJUSTMENTS, type RateAdjustment } from '$lib/shared/domain/enums';
	import { formatMoney } from '$lib/shared/domain/money';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import type { RatePlanView } from '../get-setup/contract';
	import { UpsertRatePlan } from './contract';

	let { roomType, plans, currency, invalidates }: { roomType: { id: string; name: string; maxOccupancy: number; baseOccupancy: number }; plans: RatePlanView[]; currency: string; invalidates?: string[] } = $props();
	const save = createAction(UpsertRatePlan, { invalidates });
	const money = (c: number) => formatMoney(c, currency);
	let open = $state(false);
	// svelte-ignore state_referenced_locally
	let f = $state({ name: '', code: '', adjustmentKind: 'PERCENT' as RateAdjustment, pct: -10, fixed: null as number | null, includedOccupancy: roomType.baseOccupancy, extraAdultCents: null as number | null, extraChildCents: null as number | null, refundable: true, freeCancellationDays: 2 as number | null, breakfastIncluded: false, minLos: null as number | null });

	const describe = (p: RatePlanView) =>
		[
			p.adjustmentKind === 'PERCENT' ? `${p.adjustmentValue > 0 ? '+' : ''}${p.adjustmentValue / 100}%` : p.adjustmentKind === 'FIXED' ? `${p.adjustmentValue >= 0 ? '+' : ''}${money(p.adjustmentValue)}/night` : 'base rate',
			`${p.includedOccupancy} incl.`,
			p.extraAdultCents ? `+${money(p.extraAdultCents)}/adult` : '',
			p.extraChildCents ? `+${money(p.extraChildCents)}/child` : '',
			p.breakfastIncluded ? 'breakfast' : '',
			p.refundable ? (p.freeCancellationDays != null ? `free cancel ${p.freeCancellationDays}d` : 'refundable') : 'non-refundable',
			p.minLos ? `min ${p.minLos}n` : ''
		]
			.filter(Boolean)
			.join(' · ');

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const ok = await save.run({
			roomTypeId: roomType.id,
			name: f.name,
			code: f.code.toUpperCase(),
			adjustmentKind: f.adjustmentKind,
			adjustmentValue: f.adjustmentKind === 'PERCENT' ? Math.round(f.pct * 100) : f.adjustmentKind === 'FIXED' ? (f.fixed ?? 0) : 0,
			includedOccupancy: f.includedOccupancy,
			extraAdultCents: f.extraAdultCents ?? 0,
			extraChildCents: f.extraChildCents ?? 0,
			refundable: f.refundable,
			freeCancellationDays: f.refundable ? f.freeCancellationDays : null,
			breakfastIncluded: f.breakfastIncluded,
			minLos: f.minLos || null
		});
		if (ok) {
			open = false;
			f = { ...f, name: '', code: '' };
		}
	}
	const update = (p: RatePlanView, patch: Partial<RatePlanView>) => {
		const { id, roomTypeId: _r, ...rest } = { ...p, ...patch };
		return save.run({ id, roomTypeId: roomType.id, ...rest });
	};
</script>

<ul class="space-y-1 text-xs">
	{#each plans as p (p.id)}
		<li class="flex items-start justify-between gap-2 {p.active ? '' : 'text-slate-400'}">
			<span><b>{p.name}</b> <span class="font-mono">{p.code}</span>{p.isDefault ? ' · default' : ''}<br />{describe(p)}</span>
			<span class="whitespace-nowrap">
				{#if !p.isDefault}
					<button class="hover:underline" onclick={() => update(p, { isDefault: true, active: true })}>Make default</button> ·
					<button class="hover:underline" onclick={() => update(p, { active: !p.active })}>{p.active ? 'Disable' : 'Enable'}</button>
				{/if}
			</span>
		</li>
	{/each}
</ul>
<ErrorNote error={save.error} />
{#if open}
	<form onsubmit={add} class="mt-2 grid grid-cols-2 gap-1.5 border-t border-slate-200 pt-2 text-xs">
		<input class="input" bind:value={f.name} placeholder="Name (e.g. Non-refundable)" required maxlength="60" aria-label="Plan name" />
		<input class="input font-mono uppercase" bind:value={f.code} placeholder="CODE" required maxlength="20" aria-label="Plan code" />
		<select class="input" bind:value={f.adjustmentKind} aria-label="Price rule">{#each RATE_ADJUSTMENTS as k (k)}<option value={k}>{k === 'NONE' ? 'Base rate' : k === 'PERCENT' ? '± % of base' : '± fixed per night'}</option>{/each}</select>
		{#if f.adjustmentKind === 'PERCENT'}<input class="input" type="number" step="0.5" min="-100" max="500" bind:value={f.pct} aria-label="Percent" />{:else if f.adjustmentKind === 'FIXED'}<MoneyInput bind:cents={f.fixed} placeholder="e.g. 15.00" />{:else}<span></span>{/if}
		<label class="flex items-center gap-1">Included guests <input class="input w-16" type="number" min="1" max={roomType.maxOccupancy} bind:value={f.includedOccupancy} /></label>
		<label class="flex items-center gap-1">Min nights <input class="input w-16" type="number" min="0" max="60" bind:value={f.minLos} /></label>
		<label class="flex items-center gap-1">+ adult <MoneyInput bind:cents={f.extraAdultCents} /></label>
		<label class="flex items-center gap-1">+ child <MoneyInput bind:cents={f.extraChildCents} /></label>
		<label class="flex items-center gap-1"><input type="checkbox" bind:checked={f.breakfastIncluded} /> Breakfast included</label>
		<label class="flex items-center gap-1"><input type="checkbox" bind:checked={f.refundable} /> Refundable</label>
		{#if f.refundable}<label class="col-span-2 flex items-center gap-1">Free cancellation until <input class="input w-16" type="number" min="0" max="365" bind:value={f.freeCancellationDays} /> day(s) before arrival</label>{/if}
		<button class="btn-primary col-span-2" disabled={save.pending}>Add plan</button>
	</form>
{:else}
	<button class="mt-2 text-xs text-brand-700 hover:underline" onclick={() => (open = true)}>+ Rate plan</button>
{/if}
