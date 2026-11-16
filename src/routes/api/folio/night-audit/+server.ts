import { staffCommand } from '$lib/server/cqrs/endpoint';
import { RunNightAudit } from '$lib/features/folio/run-night-audit/contract';
import { runNightAudit } from '$lib/features/folio/run-night-audit/handler.server';

export const POST = staffCommand(RunNightAudit, runNightAudit);
