<script lang="ts">
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { STAFF_ROLE_LABEL, type StaffRole } from '$lib/shared/domain/enums';
	import { tempPasswordFromBytes } from '$lib/shared/domain/staff';
	import { CreateStaffUser } from './contract';

	let { roles }: { roles: StaffRole[] } = $props();
	const action = createAction(CreateStaffUser, { invalidates: ['app:staff'] });

	let email = $state('');
	let name = $state('');
	let role = $state<StaffRole | ''>('');
	let password = $state('');

	function generate() {
		password = tempPasswordFromBytes(crypto.getRandomValues(new Uint8Array(64)));
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (role === '') return;
		const res = await action.run({ email, name, role, temporaryPassword: password });
		if (res) {
			email = '';
			name = '';
			role = '';
			password = '';
		}
	}
</script>

<form class="card space-y-3 p-4" onsubmit={submit}>
	<h2 class="font-medium">Add staff user</h2>
	<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
		<label class="label">Email<input class="input" type="email" bind:value={email} required /></label>
		<label class="label">Name<input class="input" bind:value={name} required /></label>
		<label class="label"
			>Role
			<select class="input" bind:value={role} required>
				<option value="" disabled>Select…</option>
				{#each roles as r (r)}<option value={r}>{STAFF_ROLE_LABEL[r]}</option>{/each}
			</select>
		</label>
		<div class="label">
			Temporary password
			<div class="flex gap-2">
				<input class="input min-w-0 flex-1" type="text" bind:value={password} required autocomplete="off" />
				<button type="button" class="btn-secondary" onclick={generate}>Generate</button>
			</div>
		</div>
	</div>
	<p class="text-xs text-slate-500">The user must change it at first sign-in.</p>
	<ErrorNote error={action.error} />
	<button class="btn-primary" disabled={action.pending}>Create user</button>
</form>
