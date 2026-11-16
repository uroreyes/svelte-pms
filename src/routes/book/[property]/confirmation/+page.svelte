<script lang="ts">
	import { page } from '$app/state';
	import { ask } from '$lib/shared/cqrs/client';
	import type { ApiError } from '$lib/shared/cqrs/contract';
	import { formatDate } from '$lib/shared/domain/dates';
	import { formatMoney } from '$lib/shared/domain/money';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { GetConfirmation, type BookingConfirmationView } from '$lib/features/booking-engine/get-confirmation/contract';

	let code = $state(page.url.searchParams.get('code') ?? '');
	let lastName = $state('');
	let booking = $state<BookingConfirmationView | null>(null);
	let error = $state<ApiError | null>(null);

	async function lookup(e: SubmitEvent) {
		e.preventDefault();
		const r = await ask(GetConfirmation, { property: page.params.property ?? '', code: code.trim().toUpperCase(), lastName });
		booking = r.ok ? r.data : null;
		error = r.ok ? null : r.error;
	}
</script>

<svelte:head><title>Find my booking</title></svelte:head>

<main class="mx-auto max-w-lg p-4 sm:p-8">
	<h1 class="mb-4 text-xl font-semibold">Find my booking</h1>
	<form onsubmit={lookup} class="card space-y-3 p-4">
		<div><label class="label" for="c-code">Confirmation code</label><input id="c-code" class="input font-mono uppercase" bind:value={code} required maxlength="12" /></div>
		<div><label class="label" for="c-ln">Last name</label><input id="c-ln" class="input" bind:value={lastName} required maxlength="60" /></div>
		<ErrorNote {error} />
		<button class="btn-primary w-full">Look up</button>
	</form>
	{#if booking}
		<section class="card mt-4 space-y-2 p-4 text-sm">
			<h2 class="font-semibold">{booking.propertyName}</h2>
			<p class="font-mono text-lg">{booking.confirmationCode}</p>
			<p>{booking.guestName} · {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}</p>
			<ul class="divide-y divide-slate-100">
				{#each booking.rooms as room (room.confirmationCode)}
					<li class="flex justify-between py-1.5">
						<span>{room.roomTypeName} · {room.ratePlanName} <span class="text-xs text-slate-500">({room.adults} adult(s){room.children ? `, ${room.children} child(ren)` : ''} · {room.status.replace('_', ' ').toLowerCase()} · {room.confirmationCode})</span></span>
						<span>{formatMoney(room.totalCents, booking.currency)}</span>
					</li>
				{/each}
			</ul>
			<p class="text-right">Total <b>{formatMoney(booking.totalCents, booking.currency)}</b></p>
		</section>
	{/if}
</main>
