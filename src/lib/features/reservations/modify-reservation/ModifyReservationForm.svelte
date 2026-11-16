<script lang="ts">
	import { addDays } from '$lib/shared/domain/dates';
	import { formatMoney } from '$lib/shared/domain/money';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { ModifyReservation } from './contract';

	interface Props {
		reservation: { id: string; status: string; checkIn: string; checkOut: string; adults: number; children: number; roomType: { id: string }; ratePlan: { id: string | null } };
		roomTypes: { id: string; name: string; maxOccupancy: number; plans: { id: string | null; name: string }[] }[];
		businessDate: string;
		currency: string;
	}
	let { reservation: r, roomTypes, businessDate, currency }: Props = $props();
	const inHouse = $derived(r.status === 'CHECKED_IN');
	const action = createAction(ModifyReservation);
	// svelte-ignore state_referenced_locally
	let form = $state({ checkIn: r.checkIn, checkOut: r.checkOut, roomTypeId: r.roomType.id, ratePlanId: r.ratePlan.id ?? '', adults: r.adults, children: r.children, repriceExisting: false });
	let done = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const { ratePlanId, ...rest } = form;
		const result = await action.run({ reservationId: r.id, ...rest, ratePlanId: ratePlanId || undefined, ...(inHouse ? { checkIn: undefined, roomTypeId: undefined, ratePlanId: undefined } : {}) });
		done = result ? `Saved · new total ${formatMoney(result.quotedTotalCents, currency)}` : '';
	}
</script>

<form onsubmit={submit} class="space-y-3">
	<div class="grid grid-cols-2 gap-2">
		<div><label class="label" for="mr-in">Arrival</label><input id="mr-in" class="input" type="date" min={businessDate} bind:value={form.checkIn} disabled={inHouse} /></div>
		<div><label class="label" for="mr-out">Departure</label><input id="mr-out" class="input" type="date" min={addDays(inHouse ? businessDate : form.checkIn, 1)} bind:value={form.checkOut} /></div>
		<div class="col-span-2">
			<label class="label" for="mr-type">Room type</label>
			<select id="mr-type" class="input" bind:value={form.roomTypeId} disabled={inHouse}>
				{#each roomTypes as t (t.id)}<option value={t.id}>{t.name} (sleeps {t.maxOccupancy})</option>{/each}
			</select>
		</div>
		<div class="col-span-2">
			<label class="label" for="mr-plan">Rate plan</label>
			<select id="mr-plan" class="input" bind:value={form.ratePlanId} disabled={inHouse}>
				{#each roomTypes.find((t) => t.id === form.roomTypeId)?.plans ?? [] as p (p.id ?? 'std')}<option value={p.id ?? ''}>{p.name}</option>{/each}
			</select>
		</div>
		<div><label class="label" for="mr-ad">Adults</label><input id="mr-ad" class="input" type="number" min="1" max="20" bind:value={form.adults} /></div>
		<div><label class="label" for="mr-ch">Children</label><input id="mr-ch" class="input" type="number" min="0" max="20" bind:value={form.children} /></div>
	</div>
	<label class="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" bind:checked={form.repriceExisting} /> Re-price existing nights at today's rates</label>
	{#if inHouse}<p class="text-xs text-slate-500">In-house: only departure and party can change. Use <i>Room move</i> to change rooms.</p>{/if}
	<ErrorNote error={action.error} />
	{#if done && !action.error}<p class="text-xs text-emerald-700">{done}</p>{/if}
	<button class="btn-secondary w-full" disabled={action.pending}>Save changes</button>
</form>
