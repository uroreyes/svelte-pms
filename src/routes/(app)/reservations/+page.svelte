<script lang="ts">
	import { goto } from '$app/navigation';
	import { RESERVATION_STATUSES, SOURCE_LABEL } from '$lib/shared/domain/enums';
	import { todayIn } from '$lib/shared/domain/dates';
	import { can } from '$lib/shared/domain/permissions';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import StatusBadge from '$lib/shared/ui/StatusBadge.svelte';
	import NewReservationForm from '$lib/features/reservations/create-reservation/NewReservationForm.svelte';

	let { data } = $props();
	let q = $state(data.filters.q ?? '');
	let arrival = $state(data.filters.arrival ?? '');
	let status = $state(data.filters.status ?? '');
	// UI hint only — the server validates against the property's timezone.
	const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
	const canManage = $derived(can(data.actor.permissions, 'reservations.manage'));

	function search(e: SubmitEvent) {
		e.preventDefault();
		const qs = new URLSearchParams();
		if (q) qs.set('q', q);
		if (arrival) qs.set('arrival', arrival);
		if (status) qs.set('status', status);
		goto(`?${qs}`, { keepFocus: true });
	}
</script>

<svelte:head><title>Reservations</title></svelte:head>

<PageHeader title="Reservations">
	{#snippet actions()}
		{#if canManage && !data.newForm}<a class="btn-primary" href="?new=1">+ New reservation</a>{/if}
	{/snippet}
</PageHeader>

{#if data.newForm && canManage}
	<section class="card mb-5 p-4">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="font-semibold">New front-desk reservation</h2>
			<a href="/reservations" class="text-sm text-slate-500 hover:underline">Close</a>
		</div>
		<NewReservationForm propertySlug={data.property.slug} {today} initial={data.newForm} />
	</section>
{/if}

<form onsubmit={search} class="mb-4 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
	<input class="input" placeholder="Confirmation code or guest name" bind:value={q} aria-label="Search" />
	<input class="input" type="date" bind:value={arrival} aria-label="Arrival date" />
	<select class="input" bind:value={status} aria-label="Status">
		<option value="">Any status</option>
		{#each RESERVATION_STATUSES as s (s)}<option value={s}>{s.replace('_', ' ')}</option>{/each}
	</select>
	<button class="btn-secondary">Search</button>
</form>

<div class="card overflow-x-auto">
	<table class="table">
		<thead><tr><th>Code</th><th>Guest</th><th>Room</th><th>Stay</th><th>Source</th><th>Status</th></tr></thead>
		<tbody>
			{#each data.results.items as r (r.id)}
				<tr class="cursor-pointer hover:bg-slate-50" onclick={() => goto(`/reservations/${r.id}`)}>
					<td class="font-mono text-xs"><a href="/reservations/{r.id}" class="text-brand-700 hover:underline">{r.confirmationCode}</a></td>
					<td>{r.guestName}{#if r.overbooked}<span class="ml-2 rounded bg-rose-100 px-1.5 text-xs text-rose-700">overbooked</span>{/if}</td>
					<td>{r.roomNumber ? `${r.roomNumber} · ` : ''}{r.roomTypeName}</td>
					<td class="whitespace-nowrap">{r.checkIn} → {r.checkOut}</td>
					<td>{SOURCE_LABEL[r.source]}</td>
					<td><StatusBadge status={r.status} /></td>
				</tr>
			{:else}
				<tr><td colspan="6" class="py-8 text-center text-slate-400">No reservations match</td></tr>
			{/each}
		</tbody>
	</table>
</div>
