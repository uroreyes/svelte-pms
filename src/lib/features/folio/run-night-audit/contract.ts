import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { isoDate } from '$lib/shared/cqrs/schemas';

export interface NightAuditResult {
	businessDate: string;
	/** In-house stays that received tonight's room charge check. */
	reservations: number;
	posted: number;
	/** Arrivals from before today that never checked in → NO_SHOW, inventory released. */
	noShows: number;
	/** Still checked in after their departure date (not billed — extend or check out). */
	overstays: number;
}

export const RunNightAudit = command<NightAuditResult>()({
	name: 'folio.nightAudit',
	path: '/api/folio/night-audit',
	permission: 'folio.nightAudit',
	/** Defaults to the property's current business date. Run late evening, before midnight. */
	input: z.object({ businessDate: isoDate.optional() })
});
