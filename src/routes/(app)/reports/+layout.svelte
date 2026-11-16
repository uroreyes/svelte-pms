<script lang="ts">
	import { page } from '$app/state';
	import { can } from '$lib/shared/domain/permissions';
	let { data, children } = $props();
	const tabs = $derived([
		...(can(data.actor.permissions, 'reports.view') ? [{ href: '/reports', label: 'Cashier report' }] : []),
		...(can(data.actor.permissions, 'audit.view') ? [{ href: '/reports/audit', label: 'Audit log' }] : [])
	]);
</script>

{#if tabs.length > 1}
	<nav class="mb-4 flex flex-wrap gap-1 border-b border-slate-200 text-sm" aria-label="Report sections">
		{#each tabs as t (t.href)}
			<a
				href={t.href}
				class="-mb-px border-b-2 px-3 py-2 whitespace-nowrap {page.url.pathname === t.href ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}"
				aria-current={page.url.pathname === t.href ? 'page' : undefined}>{t.label}</a
			>
		{/each}
	</nav>
{/if}
{@render children()}
