import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { GetAuditLog } from '$lib/features/audit/get-audit-log/contract';

export const load: PageLoad = async ({ fetch, url, depends }) => {
	depends('app:audit');
	const q = (k: string) => url.searchParams.get(k) || undefined;
	const filters = { actorUserId: q('staff'), command: q('action'), from: q('from'), to: q('to'), before: q('before') };
	return { filters, log: await askOrThrow(GetAuditLog, { ...filters, limit: 100 }, fetch) };
};
