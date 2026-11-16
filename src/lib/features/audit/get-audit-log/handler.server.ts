import { and, asc, desc, eq, lt, sql, type SQL } from 'drizzle-orm';
import { auditEvent, reservation, staffUser } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { forbidden } from '$lib/server/cqrs/errors';
import { loadProperty } from '$lib/server/domain/property';
import type { GetAuditLog } from './contract';

export const getAuditLog: QueryHandler<typeof GetAuditLog> = async (input, { db, actor, permissions }) => {
	const fullLog = permissions.has('audit.view');
	if (!fullLog && !input.reservationId) throw forbidden('The full audit log requires the "Full audit log" permission');
	const p = await loadProperty(db, actor.propertyId);

	const filters: SQL[] = [eq(auditEvent.propertyId, p.id)];
	if (input.reservationId) filters.push(eq(auditEvent.reservationId, input.reservationId));
	if (input.actorUserId) filters.push(eq(auditEvent.actorUserId, input.actorUserId));
	if (input.command) filters.push(eq(auditEvent.command, input.command));
	if (input.from) filters.push(sql`(${auditEvent.occurredAt} AT TIME ZONE ${p.timezone})::date >= ${input.from}::date`);
	if (input.to) filters.push(sql`(${auditEvent.occurredAt} AT TIME ZONE ${p.timezone})::date <= ${input.to}::date`);
	if (input.before) filters.push(lt(auditEvent.occurredAt, new Date(input.before)));

	const rows = await db
		.select({ e: auditEvent, code: reservation.confirmationCode })
		.from(auditEvent)
		.leftJoin(reservation, eq(reservation.id, auditEvent.reservationId))
		.where(and(...filters))
		.orderBy(desc(auditEvent.occurredAt), desc(auditEvent.id))
		.limit(input.limit + 1);
	const page = rows.slice(0, input.limit);

	const [staff, commands] =
		fullLog && !input.reservationId
			? await Promise.all([
					db.select({ id: staffUser.id, name: staffUser.name }).from(staffUser).where(eq(staffUser.propertyId, p.id)).orderBy(asc(staffUser.name)),
					db.selectDistinct({ c: auditEvent.command }).from(auditEvent).where(eq(auditEvent.propertyId, p.id)).orderBy(asc(auditEvent.command))
				])
			: [[], []];

	return {
		timezone: p.timezone,
		events: page.map(({ e, code }) => ({
			id: e.id,
			occurredAt: e.occurredAt.toISOString(),
			actorLabel: e.actorLabel,
			actorUserId: e.actorUserId,
			command: e.command,
			entityType: e.entityType,
			entityId: e.entityId,
			reservationId: e.reservationId,
			confirmationCode: code,
			input: e.input,
			result: e.result
		})),
		nextBefore: rows.length > input.limit ? page.at(-1)!.e.occurredAt.toISOString() : null,
		staff,
		commands: commands.map((c) => c.c)
	};
};
