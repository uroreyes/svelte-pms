<script lang="ts">
	import { TAX_KINDS, TAX_SCOPES, type TaxKind, type TaxScope } from '$lib/shared/domain/enums';
	import { formatMoney } from '$lib/shared/domain/money';
	import { describeRule } from '$lib/shared/domain/tax';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import { UpsertTaxRule } from './contract';

	interface Rule {
		id: string;
		name: string;
		kind: TaxKind;
		rateBp: number;
		amountCents: number;
		appliesTo: TaxScope;
		inclusive: boolean;
		sortOrder: number;
		active: boolean;
	}
	let { rules, currency, invalidates }: { rules: Rule[]; currency: string; invalidates?: string[] } = $props();
	const save = createAction(UpsertTaxRule, { invalidates });
	const money = (c: number) => formatMoney(c, currency);
	const KIND_LABEL: Record<TaxKind, string> = { PERCENT: 'Percentage', PER_NIGHT: 'Fixed per room night', PER_PERSON_NIGHT: 'Fixed per guest per night' };
	let form = $state({ name: '', kind: 'PERCENT' as TaxKind, pct: 12, amountCents: null as number | null, appliesTo: 'ALL' as TaxScope, inclusive: false });
	const fixed = $derived(form.kind !== 'PERCENT');

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const ok = await save.run({
			name: form.name,
			kind: form.kind,
			rateBp: fixed ? 0 : Math.round(form.pct * 100),
			amountCents: fixed ? (form.amountCents ?? 0) : 0,
			appliesTo: fixed ? 'ROOM' : form.appliesTo,
			inclusive: !fixed && form.inclusive,
			sortOrder: rules.length
		});
		if (ok) form = { ...form, name: '', amountCents: null };
	}
</script>

<table class="table mb-3">
	<thead><tr><th>Tax</th><th>Amount</th><th>Applies to</th><th></th></tr></thead>
	<tbody>
		{#each rules as r (r.id)}
			<tr class={r.active ? '' : 'text-slate-400'}>
				<td>{r.name}</td>
				<td>{describeRule(r, money)}</td>
				<td class="text-xs">{r.appliesTo === 'ALL' ? 'Rooms & POS' : r.appliesTo === 'ROOM' ? 'Room nights' : 'POS / incidentals'}</td>
				<td class="text-right"><button class="text-xs text-slate-600 hover:underline" onclick={() => save.run({ ...r, active: !r.active })}>{r.active ? 'Disable' : 'Enable'}</button></td>
			</tr>
		{:else}
			<tr><td colspan="4" class="py-4 text-center text-slate-400">No taxes configured</td></tr>
		{/each}
	</tbody>
</table>
<form onsubmit={add} class="grid grid-cols-2 gap-2 sm:grid-cols-6">
	<input class="input sm:col-span-2" bind:value={form.name} placeholder="Name, e.g. VAT" required maxlength="60" aria-label="Tax name" />
	<select class="input sm:col-span-2" bind:value={form.kind} aria-label="Kind">{#each TAX_KINDS as k (k)}<option value={k}>{KIND_LABEL[k]}</option>{/each}</select>
	{#if fixed}
		<MoneyInput bind:cents={form.amountCents} required placeholder="Amount" />
	{:else}
		<input class="input" type="number" min="0.01" max="100" step="0.01" bind:value={form.pct} aria-label="Rate %" title="Rate %" />
	{/if}
	<select class="input" bind:value={form.appliesTo} disabled={fixed} aria-label="Applies to">{#each TAX_SCOPES as s (s)}<option value={s}>{s === 'ALL' ? 'Rooms & POS' : s === 'ROOM' ? 'Rooms' : 'POS'}</option>{/each}</select>
	<label class="col-span-2 flex items-center gap-2 text-xs sm:col-span-4"><input type="checkbox" bind:checked={form.inclusive} disabled={fixed} /> Prices already include this tax</label>
	<button class="btn-primary col-span-2" disabled={save.pending}>Add tax</button>
	<div class="col-span-full"><ErrorNote error={save.error} /></div>
</form>
<p class="mt-2 text-xs text-slate-500">Changes apply to future postings and quotes; posted folio lines keep their tax breakdown.</p>
