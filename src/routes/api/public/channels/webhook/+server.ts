import type { RequestHandler } from './$types';
import { respond } from '$lib/server/cqrs/endpoint';
import { DomainError } from '$lib/server/cqrs/errors';
import { executePublicCommand } from '$lib/server/cqrs/execute';
import { getDb } from '$lib/server/db';
import { channelSecret } from '$lib/server/config';
import { verifySignature } from '$lib/server/security/hmac';
import { IngestOtaReservation } from '$lib/features/channels/ingest-ota-webhook/contract';
import { ingestOtaReservation } from '$lib/features/channels/ingest-ota-webhook/handler.server';

/** Inbound OTA webhook. Body must be signed: `X-PMS-Signature: sha256=<hex HMAC of raw body>`. */
export const POST: RequestHandler = async ({ request }) =>
	respond(IngestOtaReservation.name, async () => {
		const raw = await request.text();
		if (raw.length > 64 * 1024) throw new DomainError('VALIDATION', 'Payload too large');
		if (!verifySignature(raw, request.headers.get('x-pms-signature'), channelSecret())) {
			throw new DomainError('UNAUTHENTICATED', 'Invalid webhook signature');
		}
		let body: unknown;
		try {
			body = JSON.parse(raw);
		} catch {
			throw new DomainError('VALIDATION', 'Malformed JSON body');
		}
		return executePublicCommand(IngestOtaReservation, ingestOtaReservation, body, { db: getDb() });
	});
