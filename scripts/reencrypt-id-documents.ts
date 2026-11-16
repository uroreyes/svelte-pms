/**
 * Encrypts legacy plaintext guest ID numbers and rotates them to the active key.
 *   DATABASE_URL=… PII_ENCRYPTION_KEY=… [PII_ENCRYPTION_PREVIOUS_KEYS=…] npm run pii:reencrypt
 * Exit codes: 0 ok · 1 fatal (bad key, DB error) · 2 some rows failed to decrypt.
 */
import { createDb } from '$lib/server/db/client';
import { parseKeyring } from '$lib/server/security/crypto';
import { reencryptIdDocuments } from '$lib/server/maintenance/reencrypt-id-documents';

async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set');
	const ring = parseKeyring(process.env.PII_ENCRYPTION_KEY, process.env.PII_ENCRYPTION_PREVIOUS_KEYS);
	const { db, close } = createDb(url, { max: 2 });
	try {
		const r = await reencryptIdDocuments(db, ring);
		console.log(
			`ID documents: encrypted ${r.encrypted}, rotated ${r.rotated}, remaining ${r.remaining}, failed ${r.failed.length}, constraint validated ${r.validated ? 'yes' : 'no'}`
		);
		for (const f of r.failed) console.error(`failed guest ${f.guestId}: ${f.reason}`);
		return r.failed.length > 0 ? 2 : 0;
	} finally {
		await close();
	}
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((e) => {
		console.error(e instanceof Error ? e.message : e);
		process.exitCode = 1;
	});
