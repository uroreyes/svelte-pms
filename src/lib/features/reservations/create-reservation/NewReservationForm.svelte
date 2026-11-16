<script lang="ts">
	import { goto } from '$app/navigation';
	import { ask } from '$lib/shared/cqrs/client';
	import type { ApiError } from '$lib/shared/cqrs/contract';
	import { addDays } from '$lib/shared/domain/dates';
	import { formatMoney } from '$lib/shared/domain/money';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	// Consumes the booking-engine read model over HTTP (CQRS: queries are reusable by any client).
	import { SearchAvailability, type AvailabilityView } from '$lib/features/booking-engine/search-availability/contract';
	import { CreateReservation } from './contract';

	interface Props {
		propertySlug: string;
		today: string;
		initial: { roomTypeId?: string; checkIn?: string; roomUnitId?: string };
	}
	let { propertySlug, today, initial }: Props = $props();

	let checkIn = $state(initial.checkIn && initial.checkIn >= today ? initial.checkIn : today);
	let checkOut = $state(addDays(initial.checkIn && initial.checkIn >= today ? initial.checkIn : today, 1));
	let adults = $state(2);
	let children = $state(0);
	let offers = $state<AvailabilityView | null>(null);
	let searchError = $state<ApiError | null>(null);
	let offerKey = $state('');
	let guest = $state({ firstName: '', lastName: '', email: '', phone: '' });
	let notes = $state('');
	const create = createAction(CreateReservation, { invalidates: [] });
	const chosen = $derived(offers?.offers.find((o) => o.key === offerKey && o.bookable));

	async function search(e?: SubmitEvent) {
		e?.preventDefault();
		searchError = null;
		const r = await ask(SearchAvailability, { property: propertySlug, checkIn, checkOut, adults, children });
		if (r.ok) offers = r.data;
		else {
			offers = null;
			searchError = r.error;
		}
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!chosen) return;
		const result = await create.run({
			roomTypeId: chosen.roomTypeId,
			ratePlanId: chosen.ratePlanId,
			checkIn,
			checkOut,
			adults,
			children,
			guest,
			notes: notes || undefined,
			roomUnitId: chosen.roomTypeId === initial.roomTypeId ? initial.roomUnitId : undefined
		});
		if (result) await goto(`/reservations/${result.reservationId}`);
	}

	$effect(() => {
		if (initial.checkIn) void search();
	});
</script>

<div class="space-y-4">
	<form onsubmit={search} class="grid grid-cols-2 gap-2 sm:grid-cols-5">
		<div><label class="label" for="nr-in">Check-in</label><input id="nr-in" class="input" type="date" min={today} bind:value={checkIn} required /></div>
		<div><label class="label" for="nr-out">Check-out</label><input id="nr-out" class="input" type="date" min={addDays(checkIn, 1)} bind:value={checkOut} required /></div>
		<div><label class="label" for="nr-ad">Adults</label><input id="nr-ad" class="input" type="number" min="1" max="20" bind:value={adults} /></div>
		<div><label class="label" for="nr-ch">Children</label><input id="nr-ch" class="input" type="number" min="0" max="20" bind:value={children} /></div>
		<div class="flex items-end"><button class="btn-secondary w-full">Check availability</button></div>
	</form>
	<ErrorNote error={searchError} />

	{#if offers}
		<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{#each offers.offers as o (o.key)}
				<button
					type="button"
					disabled={!o.bookable}
					onclick={() => (offerKey = o.key)}
					class="rounded-lg border p-3 text-left text-sm disabled:opacity-50 {offerKey === o.key && o.bookable ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}"
				>
					<div class="flex justify-between font-semibold"><span>{o.name}</span><span>{formatMoney(o.quote.totalCents, offers.property.currency)}</span></div>
					<div class="text-xs text-slate-500">
						{o.plan.name}{o.plan.breakfastIncluded ? ' · breakfast' : ''}{o.plan.refundable ? '' : ' · non-refundable'} · {offers.nights} night(s)
						{#if o.fewLeft}· <span class="text-amber-700">{o.fewLeft} left</span>{/if}
						{#if o.message}· <span class="text-rose-700">{o.message}</span>{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}

	{#if chosen && offers}
		<form onsubmit={submit} class="grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2">
			<div><label class="label" for="nr-fn">First name</label><input id="nr-fn" class="input" bind:value={guest.firstName} required maxlength="60" /></div>
			<div><label class="label" for="nr-ln">Last name</label><input id="nr-ln" class="input" bind:value={guest.lastName} required maxlength="60" /></div>
			<div><label class="label" for="nr-em">Email</label><input id="nr-em" class="input" type="email" bind:value={guest.email} maxlength="254" /></div>
			<div><label class="label" for="nr-ph">Phone</label><input id="nr-ph" class="input" bind:value={guest.phone} maxlength="40" /></div>
			<div class="sm:col-span-2"><label class="label" for="nr-no">Notes</label><textarea id="nr-no" class="input" rows="2" bind:value={notes} maxlength="1000"></textarea></div>
			<div class="sm:col-span-2"><ErrorNote error={create.error} /></div>
			<div class="flex items-center justify-between sm:col-span-2">
				<span class="text-sm text-slate-600">
					{chosen.name} ({chosen.plan.name}) · subtotal {formatMoney(chosen.quote.subtotalCents, offers.property.currency)} + tax {formatMoney(chosen.quote.taxCents, offers.property.currency)}
				</span>
				<button class="btn-primary" disabled={create.pending}>Create reservation</button>
			</div>
		</form>
	{/if}
</div>
