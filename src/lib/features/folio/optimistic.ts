/** Client-only pending folio line shown before the command round-trips. */
export interface OptimisticLine {
	tempId: string;
	folioId: string;
	description: string;
	quantity: number;
	totalCents: number;
}
