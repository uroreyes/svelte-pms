<script lang="ts">
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { UpdateFolioBilling } from './contract';

	interface F {
		id: string;
		label: string;
		payerName: string;
		companyName: string | null;
		taxId: string | null;
		billingAddress: string | null;
	}
	let { folios, invalidates }: { folios: F[]; invalidates?: string[] } = $props();
	const action = createAction(UpdateFolioBilling, { invalidates });
	// svelte-ignore state_referenced_locally
	let folioId = $state(folios[0]?.id ?? '');
	let form = $state({ payerName: '', companyName: '', taxId: '', billingAddress: '' });
	let saved = $state(false);

	$effect(() => {
		const f = folios.find((x) => x.id === folioId);
		if (f) form = { payerName: f.payerName, companyName: f.companyName ?? '', taxId: f.taxId ?? '', billingAddress: f.billingAddress ?? '' };
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		saved = !!(await action.run({ folioId, ...form }));
	}
</script>

<form onsubmit={submit} class="space-y-2">
	{#if folios.length > 1}
		<select class="input" bind:value={folioId} aria-label="Folio">{#each folios as f (f.id)}<option value={f.id}>{f.label}</option>{/each}</select>
	{/if}
	<div class="grid grid-cols-2 gap-2">
		<div><label class="label" for="bd-p">Bill to (person)</label><input id="bd-p" class="input" bind:value={form.payerName} required maxlength="120" /></div>
		<div><label class="label" for="bd-c">Company</label><input id="bd-c" class="input" bind:value={form.companyName} maxlength="160" /></div>
		<div class="col-span-2"><label class="label" for="bd-t">Tax ID / VAT no.</label><input id="bd-t" class="input" bind:value={form.taxId} maxlength="40" /></div>
		<div class="col-span-2"><label class="label" for="bd-a">Billing address</label><textarea id="bd-a" class="input" rows="2" bind:value={form.billingAddress} maxlength="400"></textarea></div>
	</div>
	<ErrorNote error={action.error} />
	{#if saved && !action.error}<p class="text-xs text-emerald-700">Saved — printed on the invoice at check-out.</p>{/if}
	<button class="btn-secondary w-full" disabled={action.pending}>Save billing details</button>
</form>
