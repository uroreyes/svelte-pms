<script lang="ts">
	import { page } from '$app/state';
	import { SOURCE_LABEL } from '$lib/shared/domain/enums';
	import { can } from '$lib/shared/domain/permissions';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import StatusBadge from '$lib/shared/ui/StatusBadge.svelte';
	import MappingForm from '$lib/features/channels/upsert-mapping/MappingForm.svelte';
	import { ProcessOutbox } from '$lib/features/channels/process-outbox/contract';
	import { SyncIcal } from '$lib/features/channels/sync-ical/contract';
	import { UpsertChannelMapping } from '$lib/features/channels/upsert-mapping/contract';

	let { data } = $props();
	const c = $derived(data.channels);
	const CH = ['app:channels'];
	const canManage = $derived(can(data.actor.permissions, 'channels.manage'));
	const process = createAction(ProcessOutbox, { invalidates: CH });
	const sync = createAction(SyncIcal, { invalidates: CH });
	const toggle = createAction(UpsertChannelMapping, { invalidates: CH });
	let message = $state('');

	async function runOutbox() {
		const r = await process.run({ limit: 50 });
		if (r) message = `ARI push: ${r.sent} sent, ${r.dryRun} dry-run (no endpoint), ${r.failed} failed.`;
	}
	async function runSync(mappingId: string) {
		const r = await sync.run({ mappingId });
		if (r) message = `iCal sync: ${r.created} new, ${r.cancelled} cancelled, ${r.unchanged} unchanged${r.overbooked ? `, ${r.overbooked} OVERBOOKED` : ''}.`;
	}
</script>

<svelte:head><title>Channel manager</title></svelte:head>

<PageHeader title="Channel manager" subtitle="Outbound ARI push · inbound OTA webhook · iCal fallback">
	{#snippet actions()}
		<span class="text-sm text-slate-600">Outbox: {c.outbox.pending} pending · {c.outbox.sent} sent · {c.outbox.failed} failed</span>
		{#if canManage}<button class="btn-primary" onclick={runOutbox} disabled={process.pending}>Push ARI now</button>{/if}
	{/snippet}
</PageHeader>
<ErrorNote error={process.error ?? sync.error ?? toggle.error} />
{#if message}<p class="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>{/if}

{#if c.overbooked.length > 0}
	<section class="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
		<h2 class="mb-2 font-semibold text-rose-800">Overbookings to resolve</h2>
		<ul class="space-y-1">
			{#each c.overbooked as o (o.reservationId)}
				<li><a class="text-rose-800 underline" href="/reservations/{o.reservationId}">{o.confirmationCode}</a> · {SOURCE_LABEL[o.source as keyof typeof SOURCE_LABEL] ?? o.source} · {o.checkIn} → {o.checkOut}</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="card mb-4 overflow-x-auto">
	<table class="table">
		<thead><tr><th>Room type</th><th>Channel</th><th>OTA room</th><th>iCal export</th><th>Import / push</th><th>Last sync</th><th></th></tr></thead>
		<tbody>
			{#each c.mappings as m (m.id)}
				<tr class={m.active ? '' : 'text-slate-400'}>
					<td>{m.roomTypeName}</td>
					<td>{SOURCE_LABEL[m.channelName]}</td>
					<td class="font-mono text-xs">{m.externalRoomId}{m.externalRateId ? ` / ${m.externalRateId}` : ''}<div class="font-sans text-slate-500">{m.ratePlanName ?? 'Default plan'}</div></td>
					<td><input class="input w-56 font-mono text-xs" readonly value="{page.url.origin}{m.exportPath}.ics" aria-label="iCal export URL" onfocus={(e) => e.currentTarget.select()} /></td>
					<td class="text-xs">{m.icalUrl ? 'iCal ✓' : ''} {m.pushUrl ? 'Push ✓' : ''}</td>
					<td class="text-xs">{m.lastSyncedAt ? new Date(m.lastSyncedAt).toLocaleString() : '—'}{#if m.lastSyncError}<div class="text-rose-700">{m.lastSyncError}</div>{/if}</td>
					<td class="text-right whitespace-nowrap">
						{#if canManage}
							{#if m.icalUrl}<button class="btn-secondary" disabled={sync.pending} onclick={() => runSync(m.id)}>Sync iCal</button>{/if}
							<button
								class="text-xs text-slate-600 hover:underline"
								onclick={() => toggle.run({ id: m.id, roomTypeId: m.roomTypeId, channelName: m.channelName, externalRoomId: m.externalRoomId, ratePlanId: m.ratePlanId, externalRateId: m.externalRateId ?? '', icalUrl: m.icalUrl ?? '', pushUrl: m.pushUrl ?? '', active: !m.active })}
								>{m.active ? 'Disable' : 'Enable'}</button
							>
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="7" class="py-6 text-center text-slate-400">No channel mappings yet</td></tr>
			{/each}
		</tbody>
	</table>
</section>

<div class="grid gap-4 lg:grid-cols-2">
	<section class="card p-4">
		{#if canManage}
			<h2 class="mb-3 font-semibold">Map a room type to an OTA</h2>
			<MappingForm roomTypes={c.roomTypes} invalidates={CH} />
		{:else}
			<p class="text-sm text-slate-500">Read-only: channel mappings are managed by users with channel permissions.</p>
		{/if}
	</section>
	<section class="card overflow-x-auto">
		<h2 class="border-b border-slate-200 px-4 py-2.5 font-semibold">Recent ARI messages</h2>
		<table class="table">
			<tbody>
				{#each c.recent as o (o.id)}
					<tr>
						<td class="text-xs">{SOURCE_LABEL[o.channelName]} · {o.roomTypeName}</td>
						<td class="text-xs whitespace-nowrap">{o.fromDate} → {o.toDate}</td>
						<td><StatusBadge status={o.status} /></td>
						<td class="text-xs text-slate-500">{o.lastError ?? ''}</td>
					</tr>
				{:else}
					<tr><td class="py-6 text-center text-slate-400">No ARI messages</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>

<details class="mt-4 text-sm text-slate-600">
	<summary class="cursor-pointer font-medium">Inbound webhook</summary>
	<p class="mt-2">POST <code>{page.url.origin}/api/public/channels/webhook</code> with header <code>X-PMS-Signature: sha256=&lt;HMAC-SHA256(body, CHANNEL_WEBHOOK_SECRET)&gt;</code>.</p>
	<pre class="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify({ event: 'NEW', channel: 'BOOKING_COM', externalReservationId: 'BDC-123', externalRoomId: 'DLX-1', checkIn: '2026-12-01', checkOut: '2026-12-03', adults: 2, children: 0, guest: { firstName: 'Ana', lastName: 'Cruz' } }, null, 2)}</pre>
</details>
