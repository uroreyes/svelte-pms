import { applyTaxes, sumTaxLines, type TaxLine, type TaxRule } from './tax';

/** Money is always integer minor units (cents). */
export type Cents = number;

/** Round half away from zero — symmetric for reversals. */
export function roundHalfAway(value: number): number {
	return Math.sign(value) * Math.round(Math.abs(value));
}

/** Tax for an amount at a rate expressed in basis points (1200 = 12%). */
export function taxOf(amountCents: Cents, rateBp: number): Cents {
	return roundHalfAway((amountCents * rateBp) / 10_000);
}

export function formatMoney(cents: Cents, currency = 'USD'): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** "12.50" / "12" → 1250. Returns null for invalid input. */
export function parseMoney(input: string): Cents | null {
	const trimmed = input.trim();
	if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
	return roundHalfAway(Number(trimmed) * 100);
}

export function toDecimalString(cents: Cents): string {
	return (cents / 100).toFixed(2);
}

export interface NightRate {
	date: string;
	/** Sell price for the night (includes any price-inclusive taxes). */
	rateCents: Cents;
}

export interface StayQuote {
	nights: NightRate[];
	/** Room revenue excluding all taxes. */
	subtotalCents: Cents;
	taxCents: Cents;
	totalCents: Cents;
	taxes: TaxLine[];
}

/** Taxes are computed per night (matches how nights are posted to the folio). */
export function quoteStay(nights: NightRate[], rules: readonly TaxRule[], guests: number): StayQuote {
	const per = nights.map((n) => applyTaxes(rules, n.rateCents, { scope: 'ROOM', units: 1, guests }));
	return {
		nights,
		subtotalCents: per.reduce((s, t) => s + t.netCents, 0),
		taxCents: per.reduce((s, t) => s + t.taxCents, 0),
		totalCents: per.reduce((s, t) => s + t.totalCents, 0),
		taxes: sumTaxLines(per.flatMap((t) => t.taxes))
	};
}

/** Computes the immutable money fields of a POS / incidental folio line. */
export function priceLine(quantity: number, unitPriceCents: Cents, rules: readonly TaxRule[]) {
	const t = applyTaxes(rules, quantity * unitPriceCents, { scope: 'POS', units: quantity, guests: 1 });
	return { amountCents: t.netCents, taxCents: t.taxCents, totalCents: t.totalCents, taxes: t.taxes };
}
