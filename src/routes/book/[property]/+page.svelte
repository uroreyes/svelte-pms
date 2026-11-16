<script lang="ts">
	import { ask, send } from '$lib/shared/cqrs/client';
	import type { ApiError } from '$lib/shared/cqrs/contract';
	import { addDays, formatDate } from '$lib/shared/domain/dates';
	import { formatMoney } from '$lib/shared/domain/money';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { SearchAvailability, type AvailabilityOffer, type AvailabilityView } from '$lib/features/booking-engine/search-availability/contract';
	import { CreateBooking, type CreatedBooking } from '$lib/features/booking-engine/create-booking/contract';

	let { data } = $props();
	const today = new Date().toISOString().slice(0, 10);
	let checkIn = $state(addDays(today, 1));
	let checkOut = $state(addDays(today, 3));
	let adults = $state(2);
	let children = $state(0);
	let view = $state<AvailabilityView | null>(null);
	/** Cart: one entry per room. */
	let cart = $state<AvailabilityOffer[]>([]);
	let guest = $state({ firstName: '', lastName: '', email: '', phone: '' });
	let notes = $state('');
	let error = $state<ApiError | null>(null);
	let pending = $state(false);
	let confirmed = $state<{ booking: CreatedBooking; view: AvailabilityView; cart: AvailabilityOffer[]; name: string } | null>(null);

	const money = (c: number) => formatMoney(c, view?.property.currency ?? 'USD');
	const total = $derived(cart.reduce((s, o) => s + o.quote.totalCents, 0));
	const groups = $derived(view ? [...new Set(view.offers.map((o) => o.roomTypeId))].map((id) => view!.offers.filter((o) => o.roomTypeId === id)) : []);
	const inCart = (roomTypeId: string) => cart.filter((c) => c.roomTypeId === roomTypeId).length;

	async function search(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		error = null;
		cart = [];
		const r = await ask(SearchAvailability, { property: data.slug, checkIn, checkOut, adults, children });
		pending = false;
		if (r.ok) view = r.data;
		else error = r.error;
	}

	async function book(e: SubmitEvent) {
		e.preventDefault();
		if (!view || cart.length === 0) return;
		pending = true;
		error = null;
		const r = await send(CreateBooking, {
			property: data.slug,
			checkIn: view.checkIn,
			checkOut: view.checkOut,
			rooms: cart.map((o) => ({ roomTypeId: o.roomTypeId, ratePlanId: o.ratePlanId, adults: view!.party.adults, children: view!.party.children })),
			guest,
			notes: notes || undefined,
			expectedTotalCents: total
		});
		pending = false;
		if (r.ok) confirmed = { booking: r.data, view, cart: [...cart], name: `${guest.firstName} ${guest.lastName}` };
		else error = r.error;
	}
</script>

<svelte:head><title>{view?.property.name ?? 'Book your stay'}</title></svelte:head>

<main class="mx-auto max-w-5xl p-4 sm:p-8">
	<h1 class="mb-1 text-2xl font-semibold">{view?.property.name ?? 'Book your stay'}</h1>
	<p class="mb-6 text-sm text-slate-500">Best rate guaranteed when booking direct.</p>

	{#if confirmed}
		<section class="card space-y-3 p-6">
			<h2 class="text-lg font-semibold text-emerald-700">Booking confirmed</h2>
			<p class="text-sm">Thank you, {confirmed.name}. Your booking code is</p>
			<p class="font-mono text-3xl font-bold tracking-widest">{confirmed.booking.confirmationCode}</p>
			<p class="text-sm text-slate-600">{formatDate(confirmed.view.checkIn)} → {formatDate(confirmed.view.checkOut)} · {confirmed.view.nights} night{confirmed.view.nights > 1 ? 's' : ''}</p>
			<ul class="divide-y divide-slate-100 text-sm">
				{#each confirmed.booking.rooms as room, i (room.confirmationCode)}
					<li class="flex justify-between py-1.5"><span>{confirmed.cart[i]?.name} · {confirmed.cart[i]?.plan.name} <span class="font-mono text-xs text-slate-500">{room.confirmationCode}</span></span><span>{formatMoney(room.totalCents, confirmed.view.property.currency)}</span></li>
				{/each}
			</ul>
			<p class="text-right font-semibold">Total {formatMoney(confirmed.booking.totalCents, confirmed.view.property.currency)}</p>
			<a class="text-sm text-brand-700 hover:underline" href="/book/{data.slug}/confirmation?code={confirmed.booking.confirmationCode}">Look up this booking later</a>
		</section>
	{:else}
		<form onsubmit={search} class="card grid gap-3 p-4 sm:grid-cols-5">
			<div><label class="label" for="b-in">Check-in</label><input id="b-in" class="input" type="date" min={today} bind:value={checkIn} required /></div>
			<div><label class="label" for="b-out">Check-out</label><input id="b-out" class="input" type="date" min={addDays(checkIn, 1)} bind:value={checkOut} required /></div>
			<div><label class="label" for="b-a">Adults per room</label><input id="b-a" class="input" type="number" min="1" max="20" bind:value={adults} /></div>
			<div><label class="label" for="b-c">Children per room</label><input id="b-c" class="input" type="number" min="0" max="20" bind:value={children} /></div>
			<div class="flex items-end"><button class="btn-primary w-full" disabled={pending}>Search</button></div>
		</form>
		<div class="mt-4"><ErrorNote {error} /></div>

		{#if view}
			<div class="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
				<div class="space-y-3">
					{#each groups as offers (offers[0]!.roomTypeId)}
						{@const first = offers[0]!}
						<article class="card p-4">
							<div class="mb-2 flex items-baseline justify-between">
								<h3 class="font-semibold">{first.name}</h3>
								<span class="text-xs text-slate-500">Sleeps {first.maxOccupancy}{first.fewLeft ? ` · only ${first.fewLeft} left` : ''}</span>
							</div>
							{#if first.amenities.length}<p class="mb-2 text-xs text-slate-500">{first.amenities.join(' · ')}</p>{/if}
							<ul class="divide-y divide-slate-100">
								{#each offers as o (o.key)}
									<li class="flex flex-wrap items-center justify-between gap-3 py-2 {o.bookable ? '' : 'opacity-60'}">
										<div class="text-sm">
											<div class="font-medium">{o.plan.name}</div>
											<div class="flex flex-wrap gap-1.5 text-xs">
												{#if o.plan.breakfastIncluded}<span class="rounded bg-emerald-50 px-1.5 text-emerald-800">Breakfast included</span>{/if}
												{#if !o.plan.refundable}<span class="rounded bg-amber-50 px-1.5 text-amber-800">Non-refundable</span>{:else if o.plan.freeCancellationDays != null}<span class="rounded bg-slate-100 px-1.5">Free cancellation until {o.plan.freeCancellationDays} day(s) before</span>{/if}
												{#if o.message}<span class="text-rose-700">{o.message}</span>{/if}
											</div>
											<details class="text-xs text-slate-500">
												<summary class="cursor-pointer">Price details</summary>
												<ul>{#each o.quote.nights as n (n.date)}<li>{n.date}: {money(n.rateCents)}</li>{/each}</ul>
												{#each o.quote.taxes as t (t.name)}<p>{t.name}: {money(t.amountCents)}</p>{/each}
											</details>
										</div>
										<div class="text-right">
											<div class="font-semibold">{money(o.quote.totalCents)}</div>
											<div class="text-xs text-slate-500">per room, incl. taxes</div>
											<button class="btn-primary mt-1" disabled={!o.bookable || cart.length >= 5 || inCart(o.roomTypeId) >= o.maxRooms} onclick={() => (cart = [...cart, o])}>Add room</button>
										</div>
									</li>
								{/each}
							</ul>
						</article>
					{/each}
					{#if view.property.taxNotes.length}<p class="text-xs text-slate-500">Taxes: {view.property.taxNotes.join(' · ')}</p>{/if}
				</div>

				<aside class="card h-fit space-y-3 p-4 lg:sticky lg:top-4">
					<h2 class="font-semibold">Your stay</h2>
					<p class="text-xs text-slate-500">{formatDate(view.checkIn)} → {formatDate(view.checkOut)} · {view.party.adults} adult(s){view.party.children ? `, ${view.party.children} child(ren)` : ''} per room</p>
					{#each cart as o, i (i)}
						<div class="flex items-start justify-between gap-2 text-sm">
							<span>{o.name}<br /><span class="text-xs text-slate-500">{o.plan.name}</span></span>
							<span class="text-right">{money(o.quote.totalCents)}<br /><button class="text-xs text-rose-700 hover:underline" onclick={() => (cart = cart.filter((_, j) => j !== i))}>Remove</button></span>
						</div>
					{:else}
						<p class="text-sm text-slate-400">Add up to 5 rooms.</p>
					{/each}
					{#if cart.length}<div class="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total</span><span>{money(total)}</span></div>{/if}
				</aside>
			</div>

			{#if cart.length > 0}
				<form onsubmit={book} class="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
					<h2 class="font-semibold sm:col-span-2">Guest details</h2>
					<div><label class="label" for="g-fn">First name</label><input id="g-fn" class="input" bind:value={guest.firstName} required maxlength="60" autocomplete="given-name" /></div>
					<div><label class="label" for="g-ln">Last name</label><input id="g-ln" class="input" bind:value={guest.lastName} required maxlength="60" autocomplete="family-name" /></div>
					<div><label class="label" for="g-em">Email</label><input id="g-em" class="input" type="email" bind:value={guest.email} required maxlength="254" autocomplete="email" /></div>
					<div><label class="label" for="g-ph">Phone</label><input id="g-ph" class="input" bind:value={guest.phone} maxlength="40" autocomplete="tel" /></div>
					<div class="sm:col-span-2"><label class="label" for="g-no">Special requests</label><textarea id="g-no" class="input" rows="2" bind:value={notes} maxlength="500"></textarea></div>
					<div class="flex items-center justify-between sm:col-span-2">
						<span class="text-sm">{cart.length} room(s) · total <b>{money(total)}</b> · pay at the hotel</span>
						<button class="btn-primary" disabled={pending}>Confirm booking</button>
					</div>
				</form>
			{/if}
		{/if}
	{/if}
</main>
