<script lang="ts">
	/** Module-level composite: renders the ledger read model and wires the line-level command slices. */
	import { formatMoney } from '$lib/shared/domain/money';
	import { formatDateTime } from '$lib/shared/domain/dates';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import StatusBadge from '$lib/shared/ui/StatusBadge.svelte';
	import type { OptimisticLine } from '../optimistic';
	import { VoidItem } from '../void-item/contract';
	import { TransferItem } from '../transfer-item/contract';
	import { RefundPayment } from '../refund-payment/contract';
	import { VoidPayment } from '../void-payment/contract';
	import { PostRoomCharges } from '../post-room-charges/contract';
	import type { FolioLedgerView } from '../get-folio-ledger/contract';

	interface Props {
		ledger: FolioLedgerView;
		optimistic?: OptimisticLine[];
		canAdjust: boolean;
		canVoidPayments: boolean;
		invalidates?: string[];
	}
	let { ledger, optimistic = [], canAdjust, canVoidPayments, invalidates }: Props = $props();

	const voidItem = createAction(VoidItem, { invalidates });
	const transfer = createAction(TransferItem, { invalidates });
	const refund = createAction(RefundPayment, { invalidates });
	const voidPay = createAction(VoidPayment, { invalidates });
	const postNights = createAction(PostRoomCharges, { invalidates });
	const error = $derived(voidItem.error ?? transfer.error ?? refund.error ?? voidPay.error ?? postNights.error);
	const money = (c: number) => formatMoney(c, ledger.currency);
	const time = (iso: string) => formatDateTime(iso, ledger.timezone);
	const inHouse = $derived(ledger.reservationStatus === 'CHECKED_IN');
	const postableNow = $derived(ledger.unpostedNights.filter((d) => d <= ledger.businessDate));

	function askReason(what: string): string | null {
		const reason = prompt(`Reason for ${what}:`)?.trim();
		return reason ? reason : null;
	}
	async function onVoid(itemId: string) {
		const reason = askReason('voiding this line');
		if (reason) await voidItem.run({ itemId, reason });
	}
	async function onTransfer(itemId: string, targetFolioId: string) {
		if (targetFolioId) await transfer.run({ itemId, targetFolioId, reason: 'Transferred between folios' });
	}
	async function onRefund(paymentId: string, max: number) {
		const raw = prompt(`Refund amount (max ${(max / 100).toFixed(2)}):`, (max / 100).toFixed(2));
		if (!raw) return;
		const amountCents = Math.round(Number(raw) * 100);
		const reason = askReason('the refund');
		if (reason && amountCents > 0) await refund.run({ paymentId, amountCents, reason });
	}
	async function onVoidPayment(paymentId: string) {
		const reason = askReason('voiding this payment');
		if (reason) await voidPay.run({ paymentId, reason });
	}
</script>

<div class="space-y-4">
	<ErrorNote {error} />
	{#if inHouse && ledger.unpostedNights.length > 0}
		<div class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
			<span>{ledger.unpostedNights.length} room night(s) not posted ({ledger.unpostedNights[0]}{ledger.unpostedNights.length > 1 ? ` … ${ledger.unpostedNights.at(-1)}` : ''})</span>
			<div class="flex gap-2">
				{#if postableNow.length > 0}
					<button class="btn-secondary" disabled={postNights.pending} onclick={() => postNights.run({ reservationId: ledger.reservationId, through: ledger.businessDate })}>Post through today</button>
				{/if}
				<button class="btn-secondary" disabled={postNights.pending} onclick={() => postNights.run({ reservationId: ledger.reservationId })}>Post full stay</button>
			</div>
		</div>
	{/if}

	{#each ledger.folios as f (f.id)}
		{@const pending = optimistic.filter((o) => o.folioId === f.id)}
		<section class="card overflow-hidden">
			<header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
				<div class="flex items-center gap-2">
					<h3 class="font-semibold">{f.label}</h3>
					<span class="text-sm text-slate-500">· {f.payerName}</span>
					<StatusBadge status={f.status} />
					{#if f.receivesRoomCharges}<span class="text-xs text-slate-500">receives room nights</span>{/if}
					{#if f.invoiceNumber}<span class="font-mono text-xs text-slate-600">{f.invoiceNumber}</span>{/if}
					{#if f.companyName}<span class="text-xs text-slate-500">· {f.companyName}{f.taxId ? ` (Tax ID ${f.taxId})` : ''}</span>{/if}
				</div>
				<div class="text-sm">Balance <span class="font-semibold tabular-nums {f.balanceCents === 0 ? 'text-emerald-700' : 'text-rose-700'}">{money(f.balanceCents)}</span></div>
			</header>
			<div class="overflow-x-auto">
				<table class="table">
					<thead><tr><th>Posted</th><th>Description</th><th class="text-right">Qty</th><th class="text-right">Amount</th><th class="text-right">Tax</th><th class="text-right">Total</th><th>By</th><th></th></tr></thead>
					<tbody>
						{#each f.items as i (i.id)}
							<tr class={i.voided || i.reversesItemId ? 'text-slate-400' : ''}>
								<td class="whitespace-nowrap">{time(i.postedAt)}</td>
								<td>
									<span class={i.voided ? 'line-through' : ''}>{i.description}</span>
									<span class="ml-1 text-xs text-slate-400">{i.category}</span>
									{#if i.voidReason}<div class="text-xs italic">Reason: {i.voidReason}</div>{/if}
								</td>
								<td class="text-right tabular-nums">{i.quantity}</td>
								<td class="text-right tabular-nums">{money(i.amountCents)}</td>
								<td class="text-right tabular-nums">{money(i.taxCents)}</td>
								<td class="text-right font-medium tabular-nums">{money(i.totalCents)}</td>
								<td class="text-xs">{i.staffName}</td>
								<td class="text-right whitespace-nowrap">
									{#if canAdjust && f.status === 'OPEN' && !i.voided && !i.reversesItemId}
										{#if ledger.folios.length > 1}
											<select class="rounded border border-slate-200 px-1 py-0.5 text-xs" aria-label="Transfer to folio" onchange={(e) => onTransfer(i.id, e.currentTarget.value)}>
												<option value="">Move…</option>
												{#each ledger.folios.filter((o) => o.id !== f.id && o.status === 'OPEN') as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
											</select>
										{/if}
										<button class="text-xs text-rose-700 hover:underline" onclick={() => onVoid(i.id)}>Void</button>
									{/if}
								</td>
							</tr>
						{/each}
						{#each pending as o (o.tempId)}
							<tr class="animate-pulse text-slate-400 italic">
								<td>posting…</td><td>{o.description}</td><td class="text-right">{o.quantity}</td><td></td><td></td><td class="text-right">{money(o.totalCents)}</td><td></td><td></td>
							</tr>
						{/each}
						{#if f.items.length === 0 && pending.length === 0}
							<tr><td colspan="8" class="py-4 text-center text-slate-400">No charges yet</td></tr>
						{/if}
					</tbody>
				</table>
			</div>
			{#if f.payments.length > 0}
				<div class="border-t border-slate-200 bg-slate-50/50">
					<table class="table">
						<thead><tr><th>Paid</th><th>Payment</th><th>Reference</th><th class="text-right">Amount</th><th>By</th><th></th></tr></thead>
						<tbody>
							{#each f.payments as p (p.id)}
								<tr class={p.kind !== 'PAYMENT' ? 'text-slate-500' : ''}>
									<td class="whitespace-nowrap">{time(p.paidAt)}</td>
									<td>{p.kind === 'PAYMENT' ? p.method : `${p.kind} (${p.method})`}{#if p.reason}<div class="text-xs italic">{p.reason}</div>{/if}</td>
									<td class="text-xs">{p.referenceNo ?? '—'}</td>
									<td class="text-right font-medium tabular-nums">{money(p.amountCents)}</td>
									<td class="text-xs">{p.staffName}</td>
									<td class="text-right whitespace-nowrap">
										{#if canAdjust && f.status === 'OPEN' && p.refundableCents > 0}
											<button class="text-xs text-brand-700 hover:underline" onclick={() => onRefund(p.id, p.refundableCents)}>Refund</button>
										{/if}
										{#if canVoidPayments && f.status === 'OPEN' && p.voidable}
											<button class="ml-2 text-xs text-rose-700 hover:underline" onclick={() => onVoidPayment(p.id)}>Void</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<footer class="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
				{#each f.taxSummary as t (t.name)}<span class="text-xs">{t.name} <span class="tabular-nums">{money(t.amountCents)}</span></span>{/each}
				<span>Charges <b class="tabular-nums">{money(f.totalChargesCents)}</b></span>
				<span>Payments <b class="tabular-nums">{money(f.totalPaymentsCents)}</b></span>
				<span>Balance due <b class="tabular-nums">{money(f.balanceCents)}</b></span>
			</footer>
		</section>
	{/each}
</div>
