<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, subtitle, actions }: { title: string; subtitle?: string; actions?: Snippet } = $props();
</script>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-xl font-semibold text-slate-900">{title}</h1>
		{#if subtitle}<p class="text-sm text-slate-500">{subtitle}</p>{/if}
	</div>
	{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
