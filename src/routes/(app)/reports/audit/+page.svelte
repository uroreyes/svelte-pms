<script lang="ts">
	import { goto } from '$app/navigation';
	import { auditLabel } from '$lib/shared/domain/audit-labels';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';
	import AuditTrail from '$lib/features/audit/AuditTrail.svelte';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let f = $state({ staff: data.filters.actorUserId ?? '', action: data.filters.command ?? '', from: data.filters.from ?? '', to: data.filters.to ?? '' });

	function apply(e?: SubmitEvent) {
		e?.preventDefault();
		const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
		goto(`?${qs}`);
	}
	function older() {
		const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
		qs.set('before', data.log.nextBefore!);
		goto(`?${qs}`);
	}
</script>

<svelte:head><title>Audit log</title></svelte:head>
<PageHeader title="Audit log" subtitle="Every staff action, sign-in and channel/booking-engine change. Append-only; guest personal data is redacted." />

<form onsubmit={apply} class="mb-4 flex flex-wrap gap-2">
	<select class="input w-auto" bind:value={f.staff} aria-label="Staff">
		<option value="">All staff</option>
		{#each data.log.staff as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
	</select>
	<select class="input w-auto" bind:value={f.action} aria-label="Action">
		<option value="">All actions</option>
		{#each data.log.commands as c (c)}<option value={c}>{auditLabel(c)}</option>{/each}
	</select>
	<input class="input w-auto" type="date" bind:value={f.from} aria-label="From" />
	<input class="input w-auto" type="date" bind:value={f.to} aria-label="To" />
	<button class="btn-secondary">Filter</button>
	{#if data.filters.before}<a class="btn-secondary" href="/reports/audit">Newest</a>{/if}
</form>

<section class="card">
	<AuditTrail events={data.log.events} timezone={data.log.timezone} />
	{#if data.log.nextBefore}
		<div class="border-t border-slate-200 p-3 text-center"><button class="btn-secondary" onclick={older}>Older events</button></div>
	{/if}
</section>
