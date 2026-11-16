<script lang="ts">
	import { goto } from '$app/navigation';
	import ChangePasswordForm from '$lib/features/account/change-password/ChangePasswordForm.svelte';
	import { homePath } from '$lib/shared/ui/nav';
	import PageHeader from '$lib/shared/ui/PageHeader.svelte';

	// Layout data (no page load for this route): actor comes from the (app) layout.
	let { data } = $props();
</script>

<PageHeader title="Change password" />

{#if data.actor.mustChangePassword}
	<div role="status" class="mb-4 max-w-md rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
		You must set a new password before continuing. Your administrator reset it or created your account with a temporary password.
	</div>
{/if}

<ChangePasswordForm onsuccess={() => goto(homePath(data.actor.permissions) ?? '/')} />
