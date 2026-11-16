/** Pure layout math for the tape chart (unit-tested). */
import { diffDays } from '$lib/shared/domain/dates';

export interface Span {
	checkIn: string;
	checkOut: string;
}

export function placeBar(start: string, days: number, span: Span) {
	const from = diffDays(start, span.checkIn);
	const to = diffDays(start, span.checkOut);
	const startCol = Math.max(0, from);
	const endCol = Math.min(days, to);
	return { startCol, span: Math.max(0, endCol - startCol), continuesBefore: from < 0, continuesAfter: to > days };
}

/** Greedy interval partitioning into the minimum number of lanes (half-open intervals). */
export function packLanes<T extends Span>(items: readonly T[]): T[][] {
	const sorted = [...items].sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.checkOut.localeCompare(b.checkOut));
	const lanes: { end: string; items: T[] }[] = [];
	for (const item of sorted) {
		const lane = lanes.find((l) => l.end <= item.checkIn);
		if (lane) {
			lane.items.push(item);
			lane.end = item.checkOut;
		} else lanes.push({ end: item.checkOut, items: [item] });
	}
	return lanes.map((l) => l.items);
}
