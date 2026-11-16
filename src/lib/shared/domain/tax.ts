/**
 * Tax engine (pure, isomorphic). Supports several taxes per property:
 *  - PERCENT            (exclusive or price-inclusive), scoped to ROOM / POS / ALL
 *  - PER_NIGHT          fixed amount per room night (ROOM only)
 *  - PER_PERSON_NIGHT   fixed amount per guest per night, e.g. city tax (ROOM only)
 * Taxes never compound. Negative prices (discounts, reversals) mirror the positive computation.
 */
import type { TaxKind, TaxScope } from './enums';

export interface TaxRule {
	id: string | null;
	name: string;
	kind: TaxKind;
	/** PERCENT only, basis points (1200 = 12%). */
	rateBp: number;
	/** PER_NIGHT / PER_PERSON_NIGHT only. */
	amountCents: number;
	appliesTo: TaxScope;
	/** PERCENT only: the entered price already includes this tax. */
	inclusive: boolean;
}

export interface TaxLine {
	ruleId: string | null;
	name: string;
	amountCents: number;
}

export interface Taxed {
	/** Price excluding all taxes. */
	netCents: number;
	taxCents: number;
	totalCents: number;
	taxes: TaxLine[];
}

export interface TaxContext {
	scope: 'ROOM' | 'POS';
	/** Room nights (ROOM) or quantity (POS) — multiplies fixed per-night taxes. */
	units: number;
	guests: number;
}

const round = (v: number) => Math.round(v);

export function applicableRules(rules: readonly TaxRule[], scope: 'ROOM' | 'POS'): TaxRule[] {
	return rules.filter((r) => (r.appliesTo === 'ALL' || r.appliesTo === scope) && (r.kind === 'PERCENT' || scope === 'ROOM'));
}

/** `priceCents` is what the hotel charges (gross of inclusive taxes, net of exclusive ones). */
export function applyTaxes(rules: readonly TaxRule[], priceCents: number, ctx: TaxContext): Taxed {
	const sign = priceCents < 0 ? -1 : 1;
	const price = Math.abs(priceCents);
	const rs = applicableRules(rules, ctx.scope);
	const incl = rs.filter((r) => r.kind === 'PERCENT' && r.inclusive);
	const inclBp = incl.reduce((s, r) => s + r.rateBp, 0);
	const net = inclBp > 0 ? round((price * 10_000) / (10_000 + inclBp)) : price;

	const taxes: TaxLine[] = [];
	// Inclusive shares; the last one absorbs rounding so net + inclusive taxes === price exactly.
	let inclLeft = price - net;
	incl.forEach((r, i) => {
		const amount = i === incl.length - 1 ? inclLeft : round((net * r.rateBp) / 10_000);
		inclLeft -= amount;
		taxes.push({ ruleId: r.id, name: r.name, amountCents: amount });
	});
	for (const r of rs) {
		if (r.kind === 'PERCENT' && !r.inclusive) taxes.push({ ruleId: r.id, name: r.name, amountCents: round((net * r.rateBp) / 10_000) });
		if (r.kind === 'PER_NIGHT') taxes.push({ ruleId: r.id, name: r.name, amountCents: r.amountCents * ctx.units });
		if (r.kind === 'PER_PERSON_NIGHT') taxes.push({ ruleId: r.id, name: r.name, amountCents: r.amountCents * ctx.units * ctx.guests });
	}
	const signed = taxes.filter((t) => t.amountCents !== 0).map((t) => ({ ...t, amountCents: sign * t.amountCents }));
	const taxCents = signed.reduce((s, t) => s + t.amountCents, 0);
	return { netCents: sign * net, taxCents, totalCents: sign * net + taxCents, taxes: signed };
}

/** Merge tax lines by name (receipts, quotes). */
export function sumTaxLines(lines: readonly TaxLine[]): TaxLine[] {
	const map = new Map<string, TaxLine>();
	for (const l of lines) {
		const prev = map.get(l.name);
		map.set(l.name, prev ? { ...prev, amountCents: prev.amountCents + l.amountCents } : { ...l });
	}
	return [...map.values()].filter((l) => l.amountCents !== 0);
}

/** Legacy single-rate profile (properties that never configured tax rules). */
export function legacyRules(taxRateBp: number): TaxRule[] {
	return taxRateBp > 0 ? [{ id: null, name: 'Tax', kind: 'PERCENT', rateBp: taxRateBp, amountCents: 0, appliesTo: 'ALL', inclusive: false }] : [];
}

export function describeRule(r: Pick<TaxRule, 'kind' | 'rateBp' | 'amountCents' | 'inclusive'>, money: (c: number) => string): string {
	if (r.kind === 'PERCENT') return `${(r.rateBp / 100).toFixed(2).replace(/\.00$/, '')}%${r.inclusive ? ' incl.' : ''}`;
	return `${money(r.amountCents)} per ${r.kind === 'PER_NIGHT' ? 'night' : 'guest per night'}`;
}
