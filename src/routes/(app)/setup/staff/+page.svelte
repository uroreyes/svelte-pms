<script lang="ts">
	import StaffList from '$lib/features/staff/ui/StaffList.svelte';
	import CreateStaffForm from '$lib/features/staff/create-staff-user/CreateStaffForm.svelte';
	let { data } = $props();
</script>

<div class="space-y-4">
	<CreateStaffForm roles={data.staff.assignableRoles} />
	<StaffList view={data.staff} />
</div>
