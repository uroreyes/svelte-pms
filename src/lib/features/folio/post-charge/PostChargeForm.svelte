<script lang="ts">
	import { CHARGE_CATEGORIES } from '$lib/shared/domain/enums';
	import { formatMoney, priceLine } from '$lib/shared/domain/money';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import type { OptimisticLine } from '../optimistic';
	import type { TaxRule } from '$lib/shared/domain/tax';
	import { PostCharge } from './contract';

	interface Props {
		folios: { id: string; label: string }[];
		catalog: { id: string; category: string; name: string; unitPriceCents: number; taxable: boolean }[];
		currency: string;
		taxRules: TaxRule[];
		canDiscount: boolean;
		invalidates?: string[];
		onOptimistic?: (line: OptimisticLine) => void;
		onSettled?: (tempId: string, ok: boolean) => void;
	}
	let { folios, catalog, currency, taxRules, canDiscount, invalidates, onOptimistic, onSettled }: Props = $props();

	const action = createAction(PostCharge, { invalidates });
	let folioId = $state(folios[0]?.id ?? '');
	let mode = $state<'catalog' | 'custom' | 'discount'>('catalog');
	let catalogItemId = $state('');
	let quantity = $state(1);
	let category = $state<(typeof CHARGE_CATEGORIES)[number]>('F&B');
	let description = $state('');
	let priceCents = $state<number | null>(null);
	let taxable = $state(true);
	let flash = $state('');

	$effect(() => {
		if (!folios.some((f) => f.id === folioId)) folioId = folios[0]?.id ?? '';
	});

	const preview = $derived.by(() => {
		if (mode === 'catalog') {
			const item = catalog.find((c) => c.id === catalogItemId);
			return item ? { description: item.name, ...priceLine(quantity, item.unitPriceCents, item.taxable ? taxRules : []) } : null;
		}
		if (!priceCents || !description) return null;
		const sign = mode === 'discount' ? -1 : 1;
		return { description, ...priceLine(quantity, sign * priceCents, mode === 'discount' || taxable ? taxRules : []) };
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!preview || !folioId) return;
		const line =
			mode === 'catalog'
				? ({ kind: 'catalog', catalogItemId } as const)
				: mode === 'custom'
					? ({ kind: 'custom', category: category === 'ROOM' ? 'OTHER' : category, description, unitPriceCents: priceCents!, taxable } as const)
					: ({ kind: 'discount', description, amountCents: priceCents! } as const);
		const tempId = crypto.randomUUID();
		onOptimistic?.({ tempId, folioId, description: preview.description, quantity, totalCents: preview.totalCents });
		const result = await action.run({ folioId, quantity, line: line as never });
		onSettled?.(tempId, result !== null);
		if (result) {
			flash = `Posted ${preview.description} · ${formatMoney(result.totalCents, currency)}`;
			quantity = 1;
			description = '';
			priceCents = null;
		}
	}
</script>

<form onsubmit={submit} class="space-y-3">
	{#if folios.length > 1}
		<div>
			<label class="label" for="pc-folio">Folio</label>
			<select id="pc-folio" class="input" bind:value={folioId}>
				{#each folios as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
			</select>
		</div>
	{/if}
	<div class="flex gap-1 rounded-md bg-slate-100 p-1 text-xs font-medium">
		{#each [['catalog', 'Catalog'], ['custom', 'Custom item'], ...(canDiscount ? [['discount', 'Discount']] : [])] as [value, label] (value)}
			<button type="button" class="flex-1 rounded px-2 py-1 {mode === value ? 'bg-white shadow-sm' : 'text-slate-600'}" onclick={() => (mode = value as typeof mode)}>{label}</button>
		{/each}
	</div>

	{#if mode === 'catalog'}
		<div class="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto">
			{#each catalog as c (c.id)}
				<button
					type="button"
					onclick={() => (catalogItemId = c.id)}
					class="rounded-md border px-2 py-1.5 text-left text-xs {catalogItemId === c.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}"
				>
					<div class="font-medium">{c.name}</div>
					<div class="text-slate-500">{c.category} · {formatMoney(c.unitPriceCents, currency)}</div>
				</button>
			{/each}
		</div>
	{:else}
		{#if mode === 'custom'}
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="label" for="pc-cat">Category</label>
					<select id="pc-cat" class="input" bind:value={category}>
						{#each CHARGE_CATEGORIES.filter((c) => c !== 'ROOM') as c (c)}<option value={c}>{c}</option>{/each}
					</select>
				</div>
				<label class="mt-5 flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={taxable} /> Taxable</label>
			</div>
		{/if}
		<div>
			<label class="label" for="pc-desc">Description</label>
			<input id="pc-desc" class="input" bind:value={description} maxlength="120" required />
		</div>
		<div>
			<label class="label" for="pc-price">{mode === 'discount' ? 'Discount amount' : 'Unit price'}</label>
			<MoneyInput id="pc-price" bind:cents={priceCents} required />
		</div>
	{/if}

	<div class="flex items-end gap-2">
		<div class="w-24">
			<label class="label" for="pc-qty">Qty</label>
			<input id="pc-qty" class="input" type="number" min="1" max="99" bind:value={quantity} />
		</div>
		<div class="flex-1 text-right text-sm text-slate-600">
			{#if preview}Total incl. tax <span class="font-semibold text-slate-900">{formatMoney(preview.totalCents, currency)}</span>{/if}
		</div>
	</div>
	<ErrorNote error={action.error} />
	{#if flash && !action.error}<p class="text-xs text-emerald-700">{flash}</p>{/if}
	<button class="btn-primary w-full" disabled={!preview || action.pending}>{action.pending ? 'Posting…' : 'Post to folio'}</button>
</form>
