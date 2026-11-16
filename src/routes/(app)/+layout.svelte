<script lang="ts">
	import { page } from '$app/state';
	import { STAFF_ROLE_LABEL } from '$lib/shared/domain/enums';
	import { visibleNav } from '$lib/shared/ui/nav';
	let { data, children } = $props();

	const visible = $derived(data.actor.mustChangePassword ? [] : visibleNav(data.actor.permissions));
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<div class="min-h-screen">
	<header class="no-print border-b border-slate-200 bg-slate-900 text-white">
		<div class="mx-auto flex max-w-[1600px] items-center gap-4 px-4">
			<nav class="nav-scroll flex min-w-0 flex-1 overflow-x-auto text-sm" aria-label="Main">
				{#each visible as item (item.href)}
					<a
						href={item.href}
						class="border-b-2 px-2.5 py-3 whitespace-nowrap {active(item.href) ? 'border-brand-500 text-white' : 'border-transparent text-slate-300 hover:text-white'}"
						aria-current={active(item.href) ? 'page' : undefined}>{item.label}</a
					>
				{/each}
			</nav>
			<div class="flex shrink-0 items-center gap-3 text-xs text-slate-300">
				<a href="/account/password" class="whitespace-nowrap hover:text-white" title="Change password · {data.actor.name} · {STAFF_ROLE_LABEL[data.actor.role]} · {data.property.name}">{data.actor.name}</a>
				<form method="POST" action="/logout"><button class="rounded border border-slate-600 px-2 py-1 whitespace-nowrap hover:bg-slate-800">Sign out</button></form>
			</div>
		</div>
	</header>
	<main class="mx-auto max-w-[1600px] p-4">
		{@render children()}
	</main>
</div>

<style>
	/* Still scrollable on narrow screens, but without a visible scrollbar. */
	.nav-scroll {
		scrollbar-width: none;
	}
	.nav-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
