<script lang="ts">
	import { CHANNEL_NAMES, SOURCE_LABEL, type ChannelName } from '$lib/shared/domain/enums';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { UpsertChannelMapping } from './contract';

	let { roomTypes, invalidates }: { roomTypes: { id: string; name: string; plans: { id: string; name: string }[] }[]; invalidates?: string[] } = $props();
	const action = createAction(UpsertChannelMapping, { invalidates });
	let roomTypeId = $state(roomTypes[0]?.id ?? '');
	let channelName = $state<ChannelName>('BOOKING_COM');
	let externalRoomId = $state('');
	let icalUrl = $state('');
	let pushUrl = $state('');
	let ratePlanId = $state('');
	let externalRateId = $state('');
	const plans = $derived(roomTypes.find((t) => t.id === roomTypeId)?.plans ?? []);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (await action.run({ roomTypeId, channelName, externalRoomId, ratePlanId: ratePlanId || null, externalRateId, icalUrl, pushUrl, active: true })) {
			externalRoomId = icalUrl = pushUrl = externalRateId = '';
		}
	}
</script>

<form onsubmit={submit} class="grid gap-2 sm:grid-cols-3">
	<div><label class="label" for="cm-t">Room type</label><select id="cm-t" class="input" bind:value={roomTypeId}>{#each roomTypes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</select></div>
	<div><label class="label" for="cm-c">Channel</label><select id="cm-c" class="input" bind:value={channelName}>{#each CHANNEL_NAMES as c (c)}<option value={c}>{SOURCE_LABEL[c]}</option>{/each}</select></div>
	<div><label class="label" for="cm-x">OTA room ID</label><input id="cm-x" class="input" bind:value={externalRoomId} required maxlength="100" /></div>
	<div><label class="label" for="cm-rp">Rate plan</label><select id="cm-rp" class="input" bind:value={ratePlanId}><option value="">Default plan</option>{#each plans as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select></div>
	<div><label class="label" for="cm-xr">OTA rate ID (optional)</label><input id="cm-xr" class="input" bind:value={externalRateId} maxlength="100" /></div>
	<div></div>
	<div class="sm:col-span-3"><label class="label" for="cm-i">iCal import URL (https, optional)</label><input id="cm-i" class="input" type="url" bind:value={icalUrl} placeholder="https://ota.example/calendar.ics" /></div>
	<div class="sm:col-span-3"><label class="label" for="cm-p">ARI push endpoint (https, optional)</label><input id="cm-p" class="input" type="url" bind:value={pushUrl} placeholder="https://channel-manager.example/ari" /></div>
	<div class="sm:col-span-3"><ErrorNote error={action.error} /></div>
	<div class="sm:col-span-3"><button class="btn-primary" disabled={action.pending}>Add mapping</button></div>
</form>
