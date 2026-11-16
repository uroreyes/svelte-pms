<script lang="ts">
	import { formatMoney } from '$lib/shared/domain/money';
	import { PAYMENT_METHODS, type PaymentMethod } from '$lib/shared/domain/enums';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { CheckOut } from './contract';

	interface FolioSummary {
		id: string;
		label: string;
		payerName: string;
		balanceCents: number;
	}
	let { reservationId, folios, currency, unpostedNights, businessDate, checkOut }: { reservationId: string; folios: FolioSummary[]; currency: string; unpostedNights: number; businessDate: string; checkOut: string } = $props();
	const early = $derived(businessDate < checkOut);
	let releaseUnusedNights = $state(false);

	const action = createAction(CheckOut);
	let method = $state<PaymentMethod>('CARD');
	let referenceNo = $state('');
	const due = $derived(folios.filter((f) => f.balanceCents > 0));
	const credit = $derived(folios.filter((f) => f.balanceCents < 0));

	async function settleAndCheckOut() {
		await action.run({
			reservationId,
			releaseUnusedNights,
			settleWith: due.length > 0 || credit.length > 0 || releaseUnusedNights ? { method, referenceNo: referenceNo || undefined } : undefined
		});
	}
</script>

<div class="space-y-3">
	<ul class="space-y-1 text-sm">
		{#each folios as f (f.id)}
			<li class="flex justify-between">
				<span>{f.label} <span class="text-slate-400">· {f.payerName}</span></span>
				<span class="font-semibold tabular-nums {f.balanceCents === 0 ? 'text-emerald-700' : 'text-rose-700'}">{formatMoney(f.balanceCents, currency)}</span>
			</li>
		{/each}
	</ul>
	{#if early}
		<label class="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
			<input type="checkbox" bind:checked={releaseUnusedNights} class="mt-0.5" />
			<span><b>Early departure</b> (booked until {checkOut}) — release unused nights to inventory and void their room charges. The remaining balance is collected with the method below.</span>
		</label>
	{/if}
	{#if unpostedNights > 0 && !releaseUnusedNights}
		<p class="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{unpostedNights} room night(s) not posted yet — post them from the folio before checkout.</p>
	{/if}
	{#if credit.length > 0}
		<p class="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">A folio is in credit — it will be refunded to the original payment at checkout.</p>
	{/if}
	{#if due.length > 0 || releaseUnusedNights}
		<div class="grid grid-cols-2 gap-2">
			<div>
				<label class="label" for="co-method">Final payment</label>
				<select id="co-method" class="input" bind:value={method}>
					{#each PAYMENT_METHODS as m (m)}<option value={m}>{m}</option>{/each}
				</select>
			</div>
			<div>
				<label class="label" for="co-ref">Reference</label>
				<input id="co-ref" class="input" bind:value={referenceNo} maxlength="80" />
			</div>
		</div>
	{/if}
	<ErrorNote error={action.error} />
	<button class="btn-primary w-full" onclick={settleAndCheckOut} disabled={action.pending || (!releaseUnusedNights && unpostedNights > 0)}>
		{#if releaseUnusedNights}Release nights, settle &amp; check out{:else if due.length > 0}Collect {formatMoney(due.reduce((s, f) => s + f.balanceCents, 0), currency)} &amp; check out{:else}Check out{/if}
	</button>
</div>
