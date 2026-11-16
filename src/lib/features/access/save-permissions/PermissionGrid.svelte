<script lang="ts">
	import { ROLE_ORDER, STAFF_ROLE_LABEL } from '$lib/shared/domain/enums';
	import {
		DEFAULT_GRANTS,
		EDITABLE_ROLES,
		LOCKED_TO_ADMIN,
		PERMISSION_GROUPS,
		toggleGrant,
		type EditableRole,
		type PermissionKey
	} from '$lib/shared/domain/permissions';
	import { createAction } from '$lib/shared/ui/action.svelte';
	import ErrorNote from '$lib/shared/ui/ErrorNote.svelte';
	import type { PermissionMatrixView } from '../get-permissions/contract';
	import { SavePermissions } from './contract';

	let { matrix }: { matrix: PermissionMatrixView } = $props();

	const fromMatrix = (): Record<EditableRole, PermissionKey[]> => ({
		MANAGER: [...matrix.grants.MANAGER],
		REVENUE_MANAGER: [...matrix.grants.REVENUE_MANAGER],
		FRONT_DESK: [...matrix.grants.FRONT_DESK],
		POS: [...matrix.grants.POS]
	});
	const isEditable = (r: string): r is EditableRole => (EDITABLE_ROLES as readonly string[]).includes(r);

	let draft = $state<Record<EditableRole, PermissionKey[]>>(fromMatrix());
	let saved = $state(false);
	$effect(() => {
		draft = fromMatrix();
	});

	const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
	const dirty = $derived(EDITABLE_ROLES.some((r) => !same(draft[r], matrix.grants[r])));
	const save = createAction(SavePermissions, { invalidates: ['app:access'] });

	const isOn = (role: EditableRole, key: PermissionKey) => draft[role].includes(key);
	const changed = (role: EditableRole, key: PermissionKey) => isOn(role, key) !== DEFAULT_GRANTS[role].includes(key);

	async function submit() {
		saved = false;
		const ok = await save.run({ grants: EDITABLE_ROLES.map((role) => ({ role, permissions: draft[role] })) });
		saved = ok !== null;
	}
	function discard() {
		saved = false;
		save.clear();
		draft = fromMatrix();
	}
	function resetDefaults() {
		if (!confirm('Reset every role to its default permissions? You still need to save.')) return;
		saved = false;
		draft = {
			MANAGER: [...DEFAULT_GRANTS.MANAGER],
			REVENUE_MANAGER: [...DEFAULT_GRANTS.REVENUE_MANAGER],
			FRONT_DESK: [...DEFAULT_GRANTS.FRONT_DESK],
			POS: [...DEFAULT_GRANTS.POS]
		};
	}
</script>

<section class="card p-4">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="font-semibold">Roles &amp; permissions</h2>
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class="btn-secondary" onclick={resetDefaults} disabled={save.pending}>Reset to defaults</button>
			<button type="button" class="btn-secondary" onclick={discard} disabled={!dirty || save.pending}>Discard</button>
			<button type="button" class="btn-primary" onclick={submit} disabled={!dirty || save.pending}>Save changes</button>
		</div>
	</div>
	<ErrorNote error={save.error} />
	{#if saved && !dirty}<p class="mb-2 text-sm text-emerald-700">Saved — takes effect on each user's next action.</p>{/if}
	<table class="table w-full">
		<thead>
			<tr>
				<th>Permission</th>
				{#each ROLE_ORDER as role (role)}
					<th class="text-center">
						{STAFF_ROLE_LABEL[role]}
						{#if role === 'ADMIN'}<span class="block text-xs font-normal text-slate-500">Locked</span>
						{:else if matrix.customized[role]}<span class="block text-xs font-normal text-slate-500">Customized</span>{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each PERMISSION_GROUPS as g (g.feature)}
				<tr><th colspan={ROLE_ORDER.length + 1} class="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">{g.label}</th></tr>
				{#each g.permissions as p (p.key)}
					<tr>
						<td class="text-sm">{p.label}</td>
						{#each ROLE_ORDER as role (role)}
							<td class="text-center">
								{#if role === 'ADMIN'}
									<input type="checkbox" checked disabled aria-label="{STAFF_ROLE_LABEL[role]}: {p.label}" />
								{:else if isEditable(role)}
									<input
										type="checkbox"
										checked={isOn(role, p.key)}
										disabled={LOCKED_TO_ADMIN.includes(p.key) || save.pending}
										aria-label="{STAFF_ROLE_LABEL[role]}: {p.label}"
										onchange={(e) => (draft[role] = toggleGrant(draft[role], p.key, e.currentTarget.checked))}
									/>
									{#if changed(role, p.key)}<span class="text-amber-600" title="Changed from default" aria-hidden="true">*</span>{/if}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			{/each}
		</tbody>
	</table>
	<p class="mt-3 text-xs text-slate-500"><span class="text-amber-600">*</span> changed from default. Granting a permission also grants what it requires; removing one removes what depends on it.</p>
</section>
