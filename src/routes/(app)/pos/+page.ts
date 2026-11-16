import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { GetPosCatalog } from '$lib/features/folio/get-pos-catalog/contract';

export const load: PageLoad = async ({ fetch }) => ({ catalog: await askOrThrow(GetPosCatalog, {}, fetch) });
