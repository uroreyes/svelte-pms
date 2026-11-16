<script lang="ts">
	/** Single-series bar chart: one hue, 4px rounded data end, 2px gaps, recessive grid, hover tooltip. */
	let { points, format, label, max: fixedMax }: { points: { date: string; value: number; detail: string }[]; format: (v: number) => string; label: string; max?: number } = $props();
	const W = 800;
	const H = 180;
	const PAD = { top: 8, right: 8, bottom: 22, left: 44 };
	const max = $derived(fixedMax ?? Math.max(1, ...points.map((p) => p.value)));
	const ticks = $derived([0, 0.5, 1].map((t) => t * max));
	const step = $derived((W - PAD.left - PAD.right) / Math.max(1, points.length));
	const barW = $derived(Math.max(2, step - 2));
	const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
	let hover = $state<number | null>(null);
	const hp = $derived(hover === null ? null : points[hover]);
</script>

<div class="relative">
	<svg viewBox="0 0 {W} {H}" class="h-auto w-full" role="img" aria-label={label}>
		{#each ticks as t (t)}
			<line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" stroke-width="1" />
			<text x={PAD.left - 6} y={y(t) + 3} text-anchor="end" class="fill-slate-400 text-[8px]">{format(t)}</text>
		{/each}
		{#each points as p, i (p.date)}
			{@const x = PAD.left + i * step + 1}
			{@const h = Math.max(0, H - PAD.bottom - y(p.value))}
			<!-- path: 4px rounded top, square at baseline -->
			{#if h > 0}
				{@const r = Math.min(4, barW / 2, h)}
				<path
					d="M{x},{H - PAD.bottom} V{y(p.value) + r} Q{x},{y(p.value)} {x + r},{y(p.value)} H{x + barW - r} Q{x + barW},{y(p.value)} {x + barW},{y(p.value) + r} V{H - PAD.bottom} Z"
					class={hover === i ? 'fill-brand-700' : 'fill-brand-500'}
				/>
			{/if}
			{#if points.length <= 31 && (i % Math.ceil(points.length / 10) === 0)}
				<text x={x + barW / 2} y={H - 6} text-anchor="middle" class="fill-slate-400 text-[8px]">{p.date.slice(5)}</text>
			{/if}
			<!-- hit target taller than the mark -->
			<rect role="presentation" x={x - 1} y={PAD.top} width={step} height={H - PAD.top - PAD.bottom} fill="transparent" onmouseenter={() => (hover = i)} onmouseleave={() => (hover = null)} />
		{/each}
	</svg>
	{#if hp && hover !== null}
		<div class="pointer-events-none absolute top-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-md" style="left: {Math.min(85, ((PAD.left + hover * step) / W) * 100)}%">
			<div class="font-semibold text-slate-900">{hp.date}</div>
			<div class="text-slate-600">{hp.detail}</div>
		</div>
	{/if}
</div>
