<script lang="ts">
	import { ROOM_POSTING_MODES, type RoomPostingMode } from '$lib/shared/domain/enums';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { UpdatePropertySettings } from '$lib/features/setup/update-property-settings/contract';

	let { data } = $props();
	const save = createAction(UpdatePropertySettings, { invalidates: ['app:setup'] });
	// svelte-ignore state_referenced_locally
	let prop = $state({ ...data.setup.property });
	let saved = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		saved = !!(await save.run({
			name: prop.name,
			address: prop.address,
			currency: prop.currency,
			timezone: prop.timezone,
			roomPostingMode: prop.roomPostingMode as RoomPostingMode
		}));
	}
</script>

<section class="card max-w-3xl p-4">
	<h2 class="mb-3 font-semibold">Property details</h2>
	<form onsubmit={submit} class="grid gap-3 sm:grid-cols-2">
		<div><label class="label" for="p-n">Name</label><input id="p-n" class="input" bind:value={prop.name} required /></div>
		<div><label class="label" for="p-a">Address</label><input id="p-a" class="input" bind:value={prop.address} /></div>
		<div><label class="label" for="p-c">Currency</label><input id="p-c" class="input" bind:value={prop.currency} maxlength="3" required /></div>
		<div><label class="label" for="p-tz">Timezone</label><input id="p-tz" class="input" bind:value={prop.timezone} required /></div>
		<div>
			<label class="label" for="p-pm">Room charge posting</label>
			<select id="p-pm" class="input" bind:value={prop.roomPostingMode}>{#each ROOM_POSTING_MODES as m (m)}<option value={m}>{m === 'UPFRONT' ? 'Whole stay at check-in' : 'Nightly (night audit)'}</option>{/each}</select>
		</div>
		<div class="sm:col-span-2"><ErrorNote error={save.error} /></div>
		<div class="flex items-center gap-3 sm:col-span-2">
			<button class="btn-primary" disabled={save.pending}>Save property</button>
			{#if saved && !save.error}<span class="text-xs text-emerald-700">Saved</span>{/if}
		</div>
	</form>
</section>
