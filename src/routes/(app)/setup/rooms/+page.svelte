<script lang="ts">
	import { formatMoney } from '$lib/shared/domain/money';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
	import StatusBadge from '$lib/shared/ui/StatusBadge.svelte';
	import { CreateRoomType } from '$lib/features/setup/create-room-type/contract';
	import { CreateRoomUnit } from '$lib/features/setup/create-room-unit/contract';
	import RatePlansEditor from '$lib/features/setup/upsert-rate-plan/RatePlansEditor.svelte';

	let { data } = $props();
	const s = $derived(data.setup);
	const SETUP = ['app:setup'];
	const money = (c: number) => formatMoney(c, s.property.currency);
	const addType = createAction(CreateRoomType, { invalidates: SETUP });
	const addUnit = createAction(CreateRoomUnit, { invalidates: SETUP });
	let type = $state({ name: '', baseRateCents: null as number | null, baseOccupancy: 2, maxOccupancy: 2, amenities: '' });
	let unit = $state({ roomTypeId: '', roomNumber: '', floor: 1 });

	async function submitType(e: SubmitEvent) {
		e.preventDefault();
		const ok = await addType.run({
			name: type.name,
			baseRateCents: type.baseRateCents ?? 0,
			baseOccupancy: Math.min(type.baseOccupancy, type.maxOccupancy),
			maxOccupancy: type.maxOccupancy,
			amenities: type.amenities.split(',').map((a) => a.trim()).filter(Boolean)
		});
		if (ok) type = { name: '', baseRateCents: null, baseOccupancy: 2, maxOccupancy: 2, amenities: '' };
	}
	async function submitUnit(e: SubmitEvent) {
		e.preventDefault();
		if (await addUnit.run(unit)) unit = { ...unit, roomNumber: '' };
	}
</script>

<div class="mb-4 grid gap-4 lg:grid-cols-2">
	<section class="card p-4">
		<h2 class="mb-3 font-semibold">Add room type</h2>
		<form onsubmit={submitType} class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<input class="input col-span-2" bind:value={type.name} placeholder="Name, e.g. Deluxe King" required aria-label="Room type name" />
			<MoneyInput bind:cents={type.baseRateCents} required placeholder="Base rate" />
			<label class="flex items-center gap-1 text-xs text-slate-600">Sleeps <input class="input" type="number" min="1" max="20" bind:value={type.maxOccupancy} aria-label="Max occupancy" /></label>
			<input class="input col-span-2 sm:col-span-3" bind:value={type.amenities} placeholder="Amenities (comma separated)" aria-label="Amenities" />
			<button class="btn-primary" disabled={addType.pending}>Add type</button>
			<div class="col-span-full"><ErrorNote error={addType.error} /></div>
		</form>
	</section>
	<section class="card p-4">
		<h2 class="mb-3 font-semibold">Add physical room</h2>
		<form onsubmit={submitUnit} class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<select class="input col-span-2" bind:value={unit.roomTypeId} required aria-label="Room type">
				<option value="" disabled>Room type…</option>
				{#each s.roomTypes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
			</select>
			<input class="input" bind:value={unit.roomNumber} placeholder="Room no." required maxlength="10" aria-label="Room number" />
			<label class="flex items-center gap-1 text-xs text-slate-600">Floor <input class="input" type="number" bind:value={unit.floor} aria-label="Floor" /></label>
			<button class="btn-primary col-span-2 sm:col-span-4" disabled={addUnit.pending}>Add room</button>
			<div class="col-span-full"><ErrorNote error={addUnit.error} /></div>
		</form>
	</section>
</div>

<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
	{#each s.roomTypes as t (t.id)}
		<section class="card p-4">
			<div class="flex justify-between font-semibold"><span>{t.name}</span><span>{money(t.baseRateCents)}</span></div>
			<div class="mb-3 text-xs text-slate-500">Sleeps {t.baseOccupancy}–{t.maxOccupancy}{t.amenities.length ? ` · ${t.amenities.join(', ')}` : ''}</div>
			<h3 class="label">Rate plans</h3>
			<div class="mb-3 border-b border-slate-100 pb-3"><RatePlansEditor roomType={t} plans={t.ratePlans} currency={s.property.currency} invalidates={SETUP} /></div>
			<h3 class="label">Rooms ({t.units.length})</h3>
			<div class="flex flex-wrap gap-1">{#each t.units as u (u.id)}<span class="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{u.roomNumber}<StatusBadge status={u.housekeepingStatus} /></span>{:else}<span class="text-xs text-slate-400">No rooms yet</span>{/each}</div>
		</section>
	{:else}
		<p class="text-sm text-slate-500">No room types yet — add one above.</p>
	{/each}
</div>
