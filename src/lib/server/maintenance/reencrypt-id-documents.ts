import { sql } from 'drizzle-orm';
import type { Executor } from '$lib/server/db/client';
import { PG, pgErrorCode } from '$lib/server/db/pg-errors';
import {
	ENVELOPE_PATTERN,
	decryptField,
	encryptField,
	isEnvelope,
	type PiiKeyring
} from '$lib/server/security/crypto';
import { idDocumentLast4 } from '$lib/shared/domain/id-document';

export interface ReencryptResult {
	scanned: number;
	encrypted: number;
	rotated: number;
	remaining: number;
	failed: { guestId: string; reason: string }[];
	validated: boolean;
}

const CONSTRAINT = 'guest_id_document_number_encrypted';

interface Row {
	id: string;
	id_document_number: string;
}

/**
 * Encrypts legacy plaintext ID numbers and rotates envelopes to the active key.
 * Cross-property system operation (no actor). Never logs plaintext or keys.
 */
export async function reencryptIdDocuments(
	db: Executor,
	ring: PiiKeyring,
	opts: { batchSize?: number; propertyId?: string } = {}
): Promise<ReencryptResult> {
	const batchSize = opts.batchSize ?? 200;
	const activeId = ring.active.id;
	const scope = opts.propertyId ? sql`AND property_id = ${opts.propertyId}` : sql``;
	const stale = sql`id_document_number IS NOT NULL AND NOT (id_document_number ~ ${ENVELOPE_PATTERN} AND split_part(id_document_number, ':', 2) = ${activeId})`;

	const result: ReencryptResult = {
		scanned: 0,
		encrypted: 0,
		rotated: 0,
		remaining: 0,
		failed: [],
		validated: false
	};

	let last: string | null = null;
	for (;;) {
		const cursor: string | null = last;
		const done = await db.transaction(async (tx) => {
			const after = cursor === null ? sql`` : sql`AND id > ${cursor}`;
			const rows = (await tx.execute(
				sql`SELECT id, id_document_number FROM guest WHERE ${stale} ${after} ${scope} ORDER BY id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`
			)) as unknown as Row[];
			if (rows.length === 0) return true;
			for (const row of rows) {
				result.scanned++;
				const aad = `guest:${row.id}`;
				const wasEnvelope = isEnvelope(row.id_document_number);
				try {
					const plaintext = wasEnvelope
						? decryptField(ring, row.id_document_number, aad)
						: row.id_document_number;
					const ciphertext = encryptField(ring, plaintext, aad);
					await tx.execute(
						sql`UPDATE guest SET id_document_number = ${ciphertext}, id_document_last4 = ${idDocumentLast4(plaintext)} WHERE id = ${row.id}`
					);
					if (wasEnvelope) result.rotated++;
					else result.encrypted++;
				} catch (e) {
					result.failed.push({
						guestId: row.id,
						reason: e instanceof Error ? e.message : 'unknown error'
					});
				}
			}
			last = rows[rows.length - 1]!.id;
			return false;
		});
		if (done) break;
	}

	const remainingRows = (await db.execute(
		sql`SELECT count(*)::int AS n FROM guest WHERE ${stale} ${scope}`
	)) as unknown as { n: number }[];
	result.remaining = remainingRows[0]?.n ?? 0;

	const state = (await db.execute(
		sql`SELECT convalidated FROM pg_constraint WHERE conname = ${CONSTRAINT} AND conrelid = 'guest'::regclass`
	)) as unknown as { convalidated: boolean }[];
	if (state[0]?.convalidated === true) {
		result.validated = true;
	} else if (state.length > 0 && result.remaining === 0 && result.failed.length === 0) {
		try {
			await db.transaction(async (tx) => {
				await tx.execute(sql.raw(`ALTER TABLE "guest" VALIDATE CONSTRAINT "${CONSTRAINT}"`));
			});
			result.validated = true;
		} catch (e) {
			if (pgErrorCode(e) !== PG.CHECK_VIOLATION) throw e;
		}
	}
	return result;
}
