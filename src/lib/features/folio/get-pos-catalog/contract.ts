import type { TaxRule } from '$lib/shared/domain/tax';
import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';

export interface PosCatalogView {
	currency: string;
	taxRules: TaxRule[];
	items: { id: string; category: string; name: string; unitPriceCents: number; taxable: boolean }[];
}

export const GetPosCatalog = query<PosCatalogView>()({
	name: 'folio.posCatalog',
	path: '/api/folio/catalog',
	permission: 'pos.post',
	input: z.object({})
});
