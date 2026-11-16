import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { id, isoDate, qsInt } from '$lib/shared/cqrs/schemas';

export interface AuditEventView {
	id: string;
	occurredAt: string;
	actorLabel: string;
	actorUserId: string | null;
	command: string;
	entityType: string | null;
	entityId: string | null;
	reservationId: string | null;
	confirmationCode: string | null;
	input: unknown;
	result: unknown;
}

export interface AuditLogView {
	timezone: string;
	events: AuditEventView[];
	/** Cursor for the next (older) page, or null at the end. */
	nextBefore: string | null;
	/** Filter options (managers only; empty for reservation-scoped reads). */
	staff: { id: string; name: string }[];
	commands: string[];
}

export const GetAuditLog = query<AuditLogView>()({
	name: 'audit.log',
	path: '/api/audit',
	/** Front desk may read a single reservation's history; the full log is managers-only (enforced in the handler). */
	permission: 'reservations.view',
	input: z
		.object({
			reservationId: id.optional(),
			actorUserId: id.optional(),
			command: z.string().regex(/^[a-zA-Z.]{1,80}$/).optional(),
			from: isoDate.optional(),
			to: isoDate.optional(),
			before: z.iso.datetime({ offset: true }).optional(),
			limit: qsInt(1, 200).default(100)
		})
		.refine((v) => !v.from || !v.to || v.to >= v.from, { message: 'End must be on or after start', path: ['to'] })
});
