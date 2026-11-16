<script lang="ts">
	import TaxRulesEditor from '$lib/features/setup/upsert-tax-rule/TaxRulesEditor.svelte';
	let { data } = $props();
</script>

<section class="card max-w-4xl p-4">
	<h2 class="mb-3 font-semibold">Taxes</h2>
	<TaxRulesEditor rules={data.setup.taxRules} currency={data.setup.property.currency} invalidates={['app:setup']} />
</section>
