<script lang="ts">
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import { STAFF_ROLE_LABEL } from '$lib/shared/domain/enums';
	import { formatDateTime } from '$lib/shared/domain/dates';
	import type { StaffRow, StaffView } from '../get-staff/contract';
	import { UpdateStaffUser } from '../update-staff-user/contract';
	import ResetPasswordDialog from '../reset-staff-password/ResetPasswordDialog.svelte';

	let { view }: { view: StaffView } = $props();
	const action = createAction(UpdateStaffUser, { invalidates: ['app:staff'] });

	let editing = $state<string | null>(null);
	let draft = $state('');
	let resetting = $state<string | null>(null);

	function startEdit(row: StaffRow) {
		editing = row.staffUserId;
		draft = row.name;
	}
	async function saveName(row: StaffRow) {
		if (await action.run({ staffUserId: row.staffUserId, name: draft })) editing = null;
	}
	function toggleActive(row: StaffRow) {
		const verb = row.active ? 'Deactivate' : 'Reactivate';
		if (!confirm(`${verb} ${row.name}?`)) return;
		void action.run({ staffUserId: row.staffUserId, active: !row.active });
	}
	function changeRole(row: StaffRow, e: Event) {
		const role = (e.currentTarget as HTMLSelectElement).value as StaffRow['role'];
		if (role !== row.role) void action.run({ staffUserId: row.staffUserId, role });
	}
</script>

<div class="card space-y-3 p-4">
	<ErrorNote error={action.error} />
	<table class="table w-full text-sm">
		<thead>
			<tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr>
		</thead>
		<tbody>
			{#each view.users as row (row.staffUserId)}
				<tr>
					<td>
						{#if editing === row.staffUserId}
							<div class="flex gap-1">
								<input class="input" bind:value={draft} />
								<button class="btn-primary" disabled={action.pending} onclick={() => saveName(row)}>Save</button>
								<button class="btn-secondary" onclick={() => (editing = null)}>Cancel</button>
							</div>
						{:else}
							{row.name}{#if row.isSelf}<span class="text-slate-400"> (you)</span>{/if}
							{#if row.manageable || row.isSelf}
								<button class="ml-1 text-xs text-brand-700 hover:underline" onclick={() => startEdit(row)}>Edit</button>
							{/if}
						{/if}
					</td>
					<td class="break-all">{row.email}</td>
					<td>
						{#if row.manageable && !row.isSelf}
							<select class="input" value={row.role} disabled={action.pending} onchange={(e) => changeRole(row, e)}>
								{#each view.assignableRoles as r (r)}<option value={r}>{STAFF_ROLE_LABEL[r]}</option>{/each}
							</select>
						{:else}
							{STAFF_ROLE_LABEL[row.role]}
						{/if}
					</td>
					<td>
						{#if !row.active}
							<span class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Inactive</span>
						{:else if row.mustChangePassword}
							<span class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Must change password</span>
						{:else}
							<span class="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Active</span>
						{/if}
					</td>
					<td class="whitespace-nowrap">
						{formatDateTime(row.createdAt, view.timezone, { year: 'numeric', month: 'short', day: 'numeric' })}
					</td>
					<td class="text-right">
						{#if row.manageable && !row.isSelf}
							<div class="flex justify-end gap-1">
								<button class="btn-secondary" onclick={() => (resetting = row.staffUserId)}>Reset password</button>
								<button class="btn-danger" disabled={action.pending} onclick={() => toggleActive(row)}>
									{row.active ? 'Deactivate' : 'Reactivate'}
								</button>
							</div>
						{/if}
					</td>
				</tr>
				{#if resetting === row.staffUserId}
					<tr><td colspan="6">
						<ResetPasswordDialog staffUserId={row.staffUserId} name={row.name} onclose={() => (resetting = null)} />
					</td></tr>
				{/if}
			{/each}
		</tbody>
	</table>
</div>
