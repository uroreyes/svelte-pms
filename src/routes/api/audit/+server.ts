import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetAuditLog } from '$lib/features/audit/get-audit-log/contract';
import { getAuditLog } from '$lib/features/audit/get-audit-log/handler.server';

export const GET = staffQuery(GetAuditLog, getAuditLog);
