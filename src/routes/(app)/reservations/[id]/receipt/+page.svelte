<script lang="ts">
	import { dateIn, formatDate, formatDateTime } from '$lib/shared/domain/dates';
	import { formatMoney } from '$lib/shared/domain/money';
	let { data } = $props();
	const r = $derived(data.detail.reservation);
	const g = $derived(data.detail.guest);
	const money = (c: number) => formatMoney(c, data.ledger.currency);
</script>

<svelte:head><title>Folio {r.confirmationCode}</title></svelte:head>

<div class="no-print mb-4 flex justify-end gap-2">
	<a class="btn-secondary" href="/reservations/{r.id}">Back</a>
	<button class="btn-primary" onclick={() => window.print()}>Print / Save as PDF</button>
</div>

<article class="mx-auto max-w-3xl bg-white p-8 text-sm shadow-xs print:p-0 print:shadow-none">
	<header class="mb-6 flex justify-between border-b border-slate-300 pb-4">
		<div>
			<h1 class="text-xl font-bold">{data.property.name}</h1>
			<p class="text-slate-500">Guest folio · itemised receipt</p>
		</div>
		<div class="text-right">
			<div class="font-mono">{r.confirmationCode}</div>
			<div>{g.firstName} {g.lastName}</div>
			<div class="text-slate-500">{r.room ? `Room ${r.room.roomNumber} · ` : ''}{r.roomType.name}</div>
			<div class="text-slate-500">{formatDate(r.checkIn)} – {formatDate(r.checkOut)}</div>
		</div>
	</header>

	{#each data.ledger.folios as f (f.id)}
		<section class="mb-6 break-inside-avoid">
			<div class="mb-2 flex justify-between gap-4">
				<div>
					<h2 class="font-semibold">{f.label} — billed to {f.companyName ?? f.payerName}</h2>
					{#if f.companyName}<div class="text-slate-600">Attn: {f.payerName}</div>{/if}
					{#if f.billingAddress}<div class="whitespace-pre-line text-slate-600">{f.billingAddress}</div>{/if}
					{#if f.taxId}<div class="text-slate-600">Tax ID: {f.taxId}</div>{/if}
				</div>
				<div class="text-right">
					{#if f.invoiceNumber}
						<div class="font-mono font-semibold">Invoice {f.invoiceNumber}</div>
						<div class="text-slate-500">Issued {f.invoiceIssuedAt ? formatDateTime(f.invoiceIssuedAt, data.ledger.timezone, { dateStyle: 'medium' }) : ''}</div>
					{:else}
						<div class="text-slate-500">Interim folio — not an invoice</div>
					{/if}
				</div>
			</div>
			<table class="w-full">
				<thead class="border-b border-slate-300 text-left text-xs text-slate-500 uppercase">
					<tr><th class="py-1">Date</th><th>Description</th><th class="text-right">Qty</th><th class="text-right">Unit</th><th class="text-right">Tax</th><th class="text-right">Total</th></tr>
				</thead>
				<tbody>
					{#each f.items as i (i.id)}
						<tr class="border-b border-slate-100">
							<td class="py-1">{i.serviceDate ?? dateIn(i.postedAt, data.ledger.timezone)}</td>
							<td>{i.description}{#if i.voided}<span class="text-slate-400"> (voided)</span>{/if}</td>
							<td class="text-right">{i.quantity}</td>
							<td class="text-right">{money(i.unitPriceCents)}</td>
							<td class="text-right">{money(i.taxCents)}</td>
							<td class="text-right">{money(i.totalCents)}</td>
						</tr>
					{/each}
					{#each f.payments as p (p.id)}
						<tr class="border-b border-slate-100 text-slate-600">
							<td class="py-1">{dateIn(p.paidAt, data.ledger.timezone)}</td>
							<td colspan="4">{p.kind === 'PAYMENT' ? 'Payment' : p.kind === 'REFUND' ? 'Refund' : 'Payment void'} · {p.method}{p.referenceNo ? ` · ${p.referenceNo}` : ''}</td>
							<td class="text-right">{money(-p.amountCents)}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					{#each f.taxSummary as t (t.name)}<tr class="text-slate-600"><td colspan="5" class="pt-1 text-right">of which {t.name}</td><td class="pt-1 text-right">{money(t.amountCents)}</td></tr>{/each}
					<tr><td colspan="5" class="pt-2 text-right">Charges</td><td class="pt-2 text-right">{money(f.totalChargesCents)}</td></tr>
					<tr><td colspan="5" class="text-right">Payments</td><td class="text-right">{money(-f.totalPaymentsCents)}</td></tr>
					<tr class="font-bold"><td colspan="5" class="text-right">Balance due</td><td class="text-right">{money(f.balanceCents)}</td></tr>
				</tfoot>
			</table>
		</section>
	{/each}
	<p class="mt-8 text-center text-xs text-slate-400">Thank you for staying with us.</p>
</article>
