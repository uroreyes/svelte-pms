<script lang="ts">
	import { CHARGE_CATEGORIES, type ChargeCategory } from '$lib/shared/domain/enums';
	import { formatMoney } from '$lib/shared/domain/money';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import { UpsertCatalogItem } from '$lib/features/setup/upsert-catalog-item/contract';

	let { data } = $props();
	const s = $derived(data.setup);
	const money = (c: number) => formatMoney(c, s.property.currency);
	const save = createAction(UpsertCatalogItem, { invalidates: ['app:setup'] });
	let item = $state({ category: 'F&B' as ChargeCategory, name: '', unitPriceCents: null as number | null, taxable: true });

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (await save.run({ ...item, unitPriceCents: item.unitPriceCents ?? 0 })) item = { ...item, name: '', unitPriceCents: null };
	}
</script>

<section class="card max-w-4xl p-4">
	<h2 class="mb-3 font-semibold">POS catalog</h2>
	<form onsubmit={submit} class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
		<select class="input" bind:value={item.category} aria-label="Category">{#each CHARGE_CATEGORIES.filter((c) => c !== 'ROOM') as c (c)}<option value={c}>{c}</option>{/each}</select>
		<input class="input sm:col-span-2" bind:value={item.name} placeholder="Item name" required aria-label="Item name" />
		<MoneyInput bind:cents={item.unitPriceCents} required />
		<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={item.taxable} /> Taxable</label>
		<button class="btn-primary" disabled={save.pending}>Add item</button>
	</form>
	<ErrorNote error={save.error} />
	<table class="table">
		<thead><tr><th>Category</th><th>Item</th><th class="text-right">Price</th><th>Tax</th><th></th></tr></thead>
		<tbody>
			{#each s.catalog as c (c.id)}
				<tr class={c.active ? '' : 'text-slate-400'}>
					<td class="text-xs">{c.category}</td>
					<td>{c.name}</td>
					<td class="text-right tabular-nums">{money(c.unitPriceCents)}</td>
					<td class="text-xs">{c.taxable ? 'Taxable' : 'Tax-free'}</td>
					<td class="text-right"><button class="text-xs text-slate-600 hover:underline" onclick={() => save.run({ ...c, active: !c.active })}>{c.active ? 'Deactivate' : 'Activate'}</button></td>
				</tr>
			{:else}
				<tr><td colspan="5" class="py-6 text-center text-slate-400">No catalog items yet</td></tr>
			{/each}
		</tbody>
	</table>
</section>
