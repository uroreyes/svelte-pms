<script lang="ts">
	import { PAYMENT_METHODS, type PaymentMethod } from '$lib/shared/domain/enums';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import { RecordPayment } from './contract';

	let { folios, invalidates }: { folios: { id: string; label: string; balanceCents: number }[]; invalidates?: string[] } = $props();
	const action = createAction(RecordPayment, { invalidates });
	let folioId = $state(folios[0]?.id ?? '');
	let method = $state<PaymentMethod>('CARD');
	let amountCents = $state<number | null>(null);
	let referenceNo = $state('');
	const balance = $derived(folios.find((f) => f.id === folioId)?.balanceCents ?? 0);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!amountCents) return;
		const ok = await action.run({ folioId, method, amountCents, referenceNo: referenceNo || undefined });
		if (ok) {
			amountCents = null;
			referenceNo = '';
		}
	}
</script>

<form onsubmit={submit} class="space-y-3">
	<div class="grid grid-cols-2 gap-2">
		<div>
			<label class="label" for="rp-folio">Folio</label>
			<select id="rp-folio" class="input" bind:value={folioId}>
				{#each folios as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for="rp-method">Method</label>
			<select id="rp-method" class="input" bind:value={method}>
				{#each PAYMENT_METHODS as m (m)}<option value={m}>{m}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for="rp-amt">Amount</label>
			{#key folioId}<MoneyInput id="rp-amt" bind:cents={amountCents} required placeholder={(Math.max(0, balance) / 100).toFixed(2)} />{/key}
		</div>
		<div>
			<label class="label" for="rp-ref">Reference</label>
			<input id="rp-ref" class="input" bind:value={referenceNo} maxlength="80" />
		</div>
	</div>
	<ErrorNote error={action.error} />
	<div class="flex gap-2">
		<button type="button" class="btn-secondary" onclick={() => (amountCents = Math.max(0, balance))} disabled={balance <= 0}>Full balance</button>
		<button class="btn-primary flex-1" disabled={!amountCents || action.pending}>Record payment</button>
	</div>
</form>
