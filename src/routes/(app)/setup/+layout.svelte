<script lang="ts">
	import { page } from '$app/state';
	import { can } from '$lib/shared/domain/permissions';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';

	let { data, children } = $props();
	const base = [
		{ href: '/setup', label: 'Property' },
		{ href: '/setup/rooms', label: 'Rooms & rate plans' },
		{ href: '/setup/taxes', label: 'Taxes' },
		{ href: '/setup/catalog', label: 'POS catalog' }
	];
	const tabs = $derived([
		...base,
		...(can(data.actor.permissions, 'staff.manage') ? [{ href: '/setup/staff', label: 'Staff' }] : []),
		...(can(data.actor.permissions, 'roles.manage') ? [{ href: '/setup/roles', label: 'Roles & permissions' }] : [])
	]);
	const current = $derived(tabs.find((t) => t.href === page.url.pathname) ?? tabs[0]!);
</script>

<svelte:head><title>Setup · {current.label}</title></svelte:head>

<PageHeader title="Setup" subtitle="Public booking page: /book/{data.setup.property.slug}" />

<nav class="mb-4 flex flex-wrap gap-1 border-b border-slate-200 text-sm" aria-label="Setup sections">
	{#each tabs as t (t.href)}
		<a
			href={t.href}
			class="-mb-px border-b-2 px-3 py-2 whitespace-nowrap {current.href === t.href ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}"
			aria-current={current.href === t.href ? 'page' : undefined}>{t.label}</a
		>
	{/each}
</nav>

{@render children()}
