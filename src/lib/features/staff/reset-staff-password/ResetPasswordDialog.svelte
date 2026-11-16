<script lang="ts">
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { tempPasswordFromBytes } from '$lib/shared/domain/staff';
	import { ResetStaffPassword } from './contract';

	let { staffUserId, name, onclose }: { staffUserId: string; name: string; onclose: () => void } = $props();
	const action = createAction(ResetStaffPassword, { invalidates: ['app:staff'] });
	let password = $state('');

	function generate() {
		password = tempPasswordFromBytes(crypto.getRandomValues(new Uint8Array(64)));
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (await action.run({ staffUserId, temporaryPassword: password })) onclose();
	}
</script>

<form class="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-slate-50 p-3" onsubmit={submit}>
	<label class="label min-w-64 flex-1"
		>New temporary password for {name}
		<input class="input" type="text" bind:value={password} required autocomplete="off" />
	</label>
	<button type="button" class="btn-secondary" onclick={generate}>Generate</button>
	<button class="btn-primary" disabled={action.pending}>Reset</button>
	<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
	<p class="w-full text-xs text-slate-500">The user must change it at next sign-in; their sessions are revoked.</p>
	<div class="w-full"><ErrorNote error={action.error} /></div>
</form>
