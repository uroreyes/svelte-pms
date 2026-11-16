<script lang="ts">
	let { status }: { status: string } = $props();
	const styles: Record<string, string> = {
		CONFIRMED: 'bg-blue-100 text-blue-800',
		CHECKED_IN: 'bg-emerald-100 text-emerald-800',
		CHECKED_OUT: 'bg-slate-200 text-slate-700',
		CANCELLED: 'bg-rose-100 text-rose-700',
		NO_SHOW: 'bg-amber-100 text-amber-800',
		CLEAN: 'bg-emerald-100 text-emerald-800',
		INSPECTED: 'bg-teal-100 text-teal-800',
		DIRTY: 'bg-amber-100 text-amber-800',
		OUT_OF_ORDER: 'bg-rose-100 text-rose-700',
		OPEN: 'bg-blue-100 text-blue-800',
		SETTLED: 'bg-slate-200 text-slate-700',
		PENDING: 'bg-amber-100 text-amber-800',
		SENT: 'bg-emerald-100 text-emerald-800',
		FAILED: 'bg-rose-100 text-rose-700'
	};
</script>

<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {styles[status] ?? 'bg-slate-100 text-slate-700'}">
	{status.replaceAll('_', ' ')}
</span>
