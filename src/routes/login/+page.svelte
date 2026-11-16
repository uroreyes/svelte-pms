<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<svelte:head><title>Sign in · Hotel PMS</title></svelte:head>

<main class="flex min-h-screen items-center justify-center p-4">
	<form method="POST" use:enhance class="card w-full max-w-sm space-y-4 p-6">
		<div>
			<h1 class="text-lg font-semibold">Hotel PMS</h1>
			<p class="text-sm text-slate-500">Staff sign in</p>
		</div>
		{#if form?.message}
			<p role="alert" class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{form.message}</p>
		{/if}
		<div>
			<label class="label" for="email">Email</label>
			<input class="input" id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''} />
		</div>
		<div>
			<label class="label" for="password">Password</label>
			<input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
		</div>
		<button class="btn-primary w-full">Sign in</button>
	</form>
</main>
