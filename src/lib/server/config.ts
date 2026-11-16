/** Server configuration read from the environment (adapters only — handlers receive values). */
import { env } from '$env/dynamic/private';
import { parseKeyring, type PiiKeyring } from '$lib/server/security/crypto';

export function channelSecret(): string {
	const secret = env.CHANNEL_WEBHOOK_SECRET ?? '';
	if (secret.length < 32) throw new Error('CHANNEL_WEBHOOK_SECRET must be at least 32 characters');
	return secret;
}


let ring: PiiKeyring | undefined;

/** Memoized PII keyring; throws if the key is missing or malformed. */
export function piiKeyring(): PiiKeyring {
	ring ??= parseKeyring(env.PII_ENCRYPTION_KEY, env.PII_ENCRYPTION_PREVIOUS_KEYS);
	return ring;
}
