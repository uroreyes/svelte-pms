<script lang="ts">
	import PermissionGrid from '$lib/features/access/save-permissions/PermissionGrid.svelte';
	let { data } = $props();
</script>

<PermissionGrid matrix={data.matrix} />
