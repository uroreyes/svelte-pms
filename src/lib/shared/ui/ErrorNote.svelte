<script lang="ts">
	import type { ApiError } from '$lib/shared/cqrs/contract';
	let { error }: { error: ApiError | null | undefined } = $props();
</script>

{#if error}
	<div role="alert" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
		{error.message}
	</div>
{/if}
