<script lang="ts">
	import { PASSWORD_MIN_LENGTH } from '$lib/shared/domain/staff';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { ChangeOwnPassword } from './contract';

	let { onsuccess }: { onsuccess: () => void } = $props();

	const action = createAction(ChangeOwnPassword);
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	const mismatch = $derived(confirmPassword.length > 0 && confirmPassword !== newPassword);
	const canSubmit = $derived(
		currentPassword.length > 0 && newPassword.length >= PASSWORD_MIN_LENGTH && confirmPassword === newPassword && !action.pending
	);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		const ok = await action.run({ currentPassword, newPassword });
		if (ok) {
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
			onsuccess();
		}
	}
</script>

<form onsubmit={submit} class="card max-w-md space-y-3 p-4">
	<div>
		<label class="label" for="cp-current">Current password</label>
		<input id="cp-current" class="input" type="password" autocomplete="current-password" bind:value={currentPassword} required />
	</div>
	<div>
		<label class="label" for="cp-new">New password</label>
		<input id="cp-new" class="input" type="password" autocomplete="new-password" bind:value={newPassword} minlength={PASSWORD_MIN_LENGTH} required />
		<p class="mt-1 text-xs text-slate-500">At least {PASSWORD_MIN_LENGTH} characters, not a repeated pattern. Your other sessions will be signed out.</p>
	</div>
	<div>
		<label class="label" for="cp-confirm">Confirm new password</label>
		<input id="cp-confirm" class="input" type="password" autocomplete="new-password" bind:value={confirmPassword} required />
		{#if mismatch}<p class="mt-1 text-xs text-rose-700">The new passwords do not match.</p>{/if}
	</div>
	<ErrorNote error={action.error} />
	<button class="btn-primary w-full" disabled={!canSubmit}>{action.pending ? 'Saving…' : 'Change password'}</button>
</form>
