<script lang="ts">
	import { formatDate } from '$lib/shared/domain/dates';
	import { SOURCE_LABEL } from '$lib/shared/domain/enums';
	import { formatMoney } from '$lib/shared/domain/money';
	import { can } from '$lib/shared/domain/permissions';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import StatusBadge from '$lib/shared/ui/StatusBadge.svelte';
	import { AssignRoom } from '$lib/features/reservations/assign-room/contract';
	import { CancelReservation } from '$lib/features/reservations/cancel-reservation/contract';
	import CheckInForm from '$lib/features/front-desk/check-in/CheckInForm.svelte';
	import CheckOutPanel from '$lib/features/front-desk/check-out/CheckOutPanel.svelte';
	import FolioLedger from '$lib/features/folio/ui/FolioLedger.svelte';
	import PostChargeForm from '$lib/features/folio/post-charge/PostChargeForm.svelte';
	import RecordPaymentForm from '$lib/features/folio/record-payment/RecordPaymentForm.svelte';
	import OpenSplitFolioForm from '$lib/features/folio/open-split-folio/OpenSplitFolioForm.svelte';
	import type { OptimisticLine } from '$lib/features/folio/optimistic';
	import ModifyReservationForm from '$lib/features/reservations/modify-reservation/ModifyReservationForm.svelte';
	import MoveRoomForm from '$lib/features/reservations/move-room/MoveRoomForm.svelte';
	import BillingDetailsForm from '$lib/features/folio/update-folio-billing/BillingDetailsForm.svelte';
	import { MarkNoShow } from '$lib/features/reservations/mark-no-show/contract';
	import AuditTrail from '$lib/features/audit/AuditTrail.svelte';

	let { data } = $props();
	const r = $derived(data.detail.reservation);
	const g = $derived(data.detail.guest);
	const ledger = $derived(data.ledger);
	const catalog = $derived(data.catalog);
	const money = (c: number) => formatMoney(c, data.detail.currency);
	const perms = $derived(data.actor.permissions);
	const canReservations = $derived(can(perms, 'reservations.manage'));
	const canFrontDesk = $derived(can(perms, 'frontDesk.manage'));
	const canFolio = $derived(can(perms, 'folio.manage'));
	const canVoidPayments = $derived(can(perms, 'folio.voidPayment'));
	const openFolios = $derived(ledger?.folios.filter((f) => f.status === 'OPEN') ?? []);
	const FOLIO = ['app:folio'];

	const assign = createAction(AssignRoom, { invalidates: ['app:reservation'] });
	const cancel = createAction(CancelReservation);
	const noShow = createAction(MarkNoShow);
	const canNoShow = $derived(r.status === 'CONFIRMED' && r.checkIn <= data.detail.businessDate);

	let optimistic = $state<OptimisticLine[]>([]);
	const addOptimistic = (line: OptimisticLine) => (optimistic = [...optimistic, line]);
	const settle = (tempId: string) => (optimistic = optimistic.filter((o) => o.tempId !== tempId));
</script>

<svelte:head><title>{r.confirmationCode} · {g.lastName}</title></svelte:head>

<PageHeader title="{g.lastName}, {g.firstName}" subtitle="{r.confirmationCode} · {SOURCE_LABEL[r.source]}{r.externalRef ? ` (${r.externalRef})` : ''}">
	{#snippet actions()}
		<StatusBadge status={r.status} />
		{#if ledger && ledger.folios.length > 0}<a class="btn-secondary" href="/reservations/{r.id}/receipt" target="_blank" rel="noopener">Folio receipt</a>{/if}
		{#if canNoShow && canReservations}
			<button class="btn-secondary" disabled={noShow.pending} onclick={() => confirm('Mark as no-show and release the inventory?') && noShow.run({ reservationId: r.id })}>Mark no-show</button>
		{/if}
		{#if r.status === 'CONFIRMED' && canReservations}
			<button class="btn-danger" disabled={cancel.pending} onclick={() => confirm('Cancel this reservation and release inventory?') && cancel.run({ reservationId: r.id })}>Cancel reservation</button>
		{/if}
	{/snippet}
</PageHeader>
<ErrorNote error={cancel.error ?? noShow.error} />
{#if r.overbooked}
	<p class="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">⚠ Overbooked: this channel booking arrived when no inventory was left. Relocate or upgrade the guest.</p>
{/if}

<div class="grid gap-4 lg:grid-cols-[1fr_380px]">
	<div class="space-y-4">
		<section class="card grid gap-4 p-4 sm:grid-cols-4">
			<div><div class="label">Stay</div><div class="text-sm">{formatDate(r.checkIn)} → {formatDate(r.checkOut)}</div><div class="text-xs text-slate-500">{r.nights} night(s)</div></div>
			<div><div class="label">Room</div><div class="text-sm">{r.room ? `Room ${r.room.roomNumber}` : 'Unallocated'}</div><div class="text-xs text-slate-500">{r.roomType.name} · {r.ratePlan.name}{r.ratePlan.breakfastIncluded ? ' · breakfast' : ''}{r.ratePlan.refundable ? '' : ' · non-refundable'}</div></div>
			<div><div class="label">Guests</div><div class="text-sm">{r.adults} adult(s), {r.children} child(ren)</div></div>
			<div><div class="label">Quoted total</div><div class="text-sm">{money(r.quotedTotalCents)}</div>{#if r.depositCents}<div class="text-xs text-slate-500">Deposit {money(r.depositCents)} · {r.depositReference ?? ''}</div>{/if}</div>
			<div class="sm:col-span-2"><div class="label">Contact</div><div class="text-sm">{g.email ?? '—'} · {g.phone ?? '—'}</div></div>
			<div class="sm:col-span-2"><div class="label">ID document</div><div class="text-sm">{g.idDocumentType ? `${g.idDocumentType} ${g.idDocumentMasked}` : 'Not captured'}</div></div>
			{#if r.booking}
				<div class="sm:col-span-4"><div class="label">Group booking {r.booking.code}</div><div class="flex flex-wrap gap-2 text-sm">{#each r.booking.rooms as b (b.id)}<a href="/reservations/{b.id}" class="rounded border px-2 py-0.5 {b.id === r.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}">{b.confirmationCode} · {b.roomTypeName} · {b.status.replace('_', ' ').toLowerCase()}</a>{/each}</div></div>
			{/if}
			{#if r.notes}<div class="sm:col-span-4"><div class="label">Notes</div><div class="text-sm whitespace-pre-line">{r.notes}</div></div>{/if}
		</section>

		{#if ledger}
			{#if ledger.folios.length > 0}
				<FolioLedger {ledger} {optimistic} canAdjust={canFolio} canVoidPayments={canVoidPayments} invalidates={FOLIO} />
			{:else}
				<p class="card p-6 text-center text-sm text-slate-500">The guest folio opens automatically at check-in.</p>
			{/if}
		{/if}

		<details class="card">
			<summary class="cursor-pointer px-4 py-3 font-semibold">History <span class="text-sm font-normal text-slate-500">({data.history.events.length} event{data.history.events.length === 1 ? '' : 's'})</span></summary>
			<div class="border-t border-slate-200"><AuditTrail events={data.history.events} timezone={data.history.timezone} showReservation={false} /></div>
		</details>
	</div>

	<aside class="space-y-4">
		{#if r.status === 'CONFIRMED' && canReservations}
			<section class="card p-4">
				<h2 class="mb-2 font-semibold">Room allocation</h2>
				<ErrorNote error={assign.error} />
				<div class="flex flex-wrap gap-1.5">
					{#each data.detail.rooms as room (room.id)}
						<button
							class="rounded border px-2 py-1 text-xs {r.room?.id === room.id ? 'border-brand-500 bg-brand-50 font-semibold' : room.free ? 'border-slate-300 hover:bg-slate-50' : 'border-slate-200 text-slate-300'}"
							disabled={!room.free || assign.pending}
							title="{room.housekeepingStatus}{room.free ? '' : ' · taken'}"
							onclick={() => assign.run({ reservationId: r.id, roomUnitId: r.room?.id === room.id ? null : room.id })}
						>
							{room.roomNumber}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if r.status === 'CONFIRMED' && canFrontDesk}
			<section class="card p-4">
				<h2 class="mb-3 font-semibold">Check in</h2>
				{#if data.detail.checkInBlockers.length > 0}
					<ul class="list-inside list-disc text-sm text-slate-500">{#each data.detail.checkInBlockers as b (b)}<li>{b}</li>{/each}</ul>
				{:else}
					<CheckInForm reservationId={r.id} assignedRoomId={r.room?.id ?? null} rooms={data.detail.rooms} />
				{/if}
			</section>
		{/if}

		{#if (r.status === 'CONFIRMED' || r.status === 'CHECKED_IN') && canReservations}
			<details class="card p-4">
				<summary class="cursor-pointer font-semibold">Modify reservation</summary>
				<div class="mt-3">
					{#key r.checkIn + r.checkOut + r.roomType.id}
						<ModifyReservationForm reservation={r} roomTypes={data.detail.roomTypes} businessDate={data.detail.businessDate} currency={data.detail.currency} />
					{/key}
				</div>
			</details>
		{/if}

		{#if r.status === 'CHECKED_IN'}
			{#if canReservations}
				<details class="card p-4">
					<summary class="cursor-pointer font-semibold">Room move</summary>
					<div class="mt-3"><MoveRoomForm reservationId={r.id} targets={data.detail.moveTargets} /></div>
				</details>
			{/if}
			{#if catalog && openFolios.length > 0}
				<section class="card p-4">
					<h2 class="mb-3 font-semibold">Add order to room</h2>
					<PostChargeForm
						folios={openFolios}
						catalog={catalog.items}
						currency={catalog.currency}
						taxRules={catalog.taxRules}
						canDiscount={canFolio}
						invalidates={FOLIO}
						onOptimistic={addOptimistic}
						onSettled={settle}
					/>
				</section>
			{/if}
			{#if canFolio}
				<section class="card p-4">
					<h2 class="mb-3 font-semibold">Payment</h2>
					<RecordPaymentForm folios={openFolios} invalidates={FOLIO} />
				</section>
				<section class="card p-4">
					<h2 class="mb-3 font-semibold">Split billing</h2>
					<OpenSplitFolioForm reservationId={r.id} invalidates={FOLIO} />
				</section>
				<details class="card p-4">
					<summary class="cursor-pointer font-semibold">Billing details (invoice)</summary>
					<div class="mt-3"><BillingDetailsForm folios={openFolios} invalidates={FOLIO} /></div>
				</details>
			{/if}
			{#if canFrontDesk && ledger}
				<section class="card p-4">
					<h2 class="mb-3 font-semibold">Check out</h2>
					<CheckOutPanel reservationId={r.id} folios={ledger.folios} currency={ledger.currency} unpostedNights={ledger.unpostedNights.length} businessDate={ledger.businessDate} checkOut={r.checkOut} />
				</section>
			{/if}
		{/if}

		{#if ledger && ledger.folios.length > 0}
			<section class="card space-y-1 p-4 text-sm">
				<h2 class="mb-2 font-semibold">Balance</h2>
				<div class="flex justify-between"><span>Room charges</span><span class="tabular-nums">{money(ledger.roomChargesCents)}</span></div>
				<div class="flex justify-between"><span>POS orders &amp; adjustments</span><span class="tabular-nums">{money(ledger.posOrdersCents)}</span></div>
				<div class="flex justify-between"><span>Payments</span><span class="tabular-nums">−{money(ledger.paymentsCents)}</span></div>
				<div class="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Balance due</span><span class="tabular-nums">{money(ledger.balanceDueCents)}</span></div>
			</section>
		{/if}
	</aside>
</div>
