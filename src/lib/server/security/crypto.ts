import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const ENVELOPE_PATTERN =
	'^v1:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$';

const ENVELOPE_RE = new RegExp(ENVELOPE_PATTERN);
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const KEY_B64_RE = /^[A-Za-z0-9+/]{43}=$/;

export interface PiiKeyring {
	readonly active: { id: string; key: Buffer };
	readonly keys: ReadonlyMap<string, Buffer>;
}

function parseEntry(raw: string, varName: string): { id: string; key: Buffer } {
	const shape = `${varName} must be "<keyId>:<base64 32-byte key>"`;
	const idx = raw.indexOf(':');
	if (idx < 0) throw new Error(shape);
	const id = raw.slice(0, idx);
	const b64 = raw.slice(idx + 1);
	if (!KEY_ID_RE.test(id)) throw new Error(shape);
	// Strict shape check: 32 bytes <=> 43 base64 chars + one '='.
	if (!KEY_B64_RE.test(b64)) {
		// Valid base64 of another length -> length error; anything else -> shape error.
		if (/^[A-Za-z0-9+/]+={0,2}$/.test(b64) && b64.length % 4 === 0) {
			throw new Error('PII encryption keys must decode to exactly 32 bytes');
		}
		throw new Error(shape);
	}
	const key = Buffer.from(b64, 'base64');
	if (key.length !== 32) throw new Error('PII encryption keys must decode to exactly 32 bytes');
	return { id, key };
}

export function parseKeyring(active: string | undefined, previous?: string): PiiKeyring {
	if (active === undefined || active.trim() === '') throw new Error('PII_ENCRYPTION_KEY is not set');
	const act = parseEntry(active.trim(), 'PII_ENCRYPTION_KEY');
	const keys = new Map<string, Buffer>([[act.id, act.key]]);
	for (const part of (previous ?? '').split(',')) {
		const entry = part.trim();
		if (entry === '') continue;
		const prev = parseEntry(entry, 'PII_ENCRYPTION_PREVIOUS_KEYS');
		if (keys.has(prev.id)) throw new Error(`Duplicate PII key id: ${prev.id}`);
		keys.set(prev.id, prev.key);
	}
	return { active: act, keys };
}

const b64u = (b: Buffer): string => b.toString('base64url');

export function encryptField(ring: PiiKeyring, plaintext: string, aad: string): string {
	if (plaintext === '') throw new Error('Cannot encrypt an empty value');
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', ring.active.key, iv);
	cipher.setAAD(Buffer.from(aad, 'utf8'));
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `v1:${ring.active.id}:${b64u(iv)}:${b64u(tag)}:${b64u(ct)}`;
}

export function parseEnvelope(
	value: string
): { keyId: string; iv: Buffer; tag: Buffer; ciphertext: Buffer } | null {
	if (!ENVELOPE_RE.test(value)) return null;
	const [, keyId, iv, tag, ct] = value.split(':');
	if (keyId === undefined || iv === undefined || tag === undefined || ct === undefined) return null;
	return {
		keyId,
		iv: Buffer.from(iv, 'base64url'),
		tag: Buffer.from(tag, 'base64url'),
		ciphertext: Buffer.from(ct, 'base64url')
	};
}

export function isEnvelope(value: string): boolean {
	return ENVELOPE_RE.test(value);
}

export function decryptField(ring: PiiKeyring, envelope: string, aad: string): string {
	const env = parseEnvelope(envelope);
	if (!env) throw new Error('Not an encrypted value');
	const key = ring.keys.get(env.keyId);
	if (!key) throw new Error(`Unknown PII key id: ${env.keyId}`);
	try {
		const decipher = createDecipheriv('aes-256-gcm', key, env.iv);
		decipher.setAAD(Buffer.from(aad, 'utf8'));
		decipher.setAuthTag(env.tag);
		return Buffer.concat([decipher.update(env.ciphertext), decipher.final()]).toString('utf8');
	} catch {
		throw new Error('PII decryption failed');
	}
}

export function needsReencryption(ring: PiiKeyring, value: string): boolean {
	const env = parseEnvelope(value);
	return env === null || env.keyId !== ring.active.id;
}
