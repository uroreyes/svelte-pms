import { describe, expect, it } from 'vitest';
import {
	ENVELOPE_PATTERN,
	decryptField,
	encryptField,
	isEnvelope,
	needsReencryption,
	parseEnvelope,
	parseKeyring
} from './crypto';

const key = (fill: number, len = 32): string => Buffer.alloc(len, fill).toString('base64');
const K1 = key(1);
const K2 = key(2);
const ring1 = parseKeyring(`k1:${K1}`);
const ring2 = parseKeyring(`k2:${K2}`, `k1:${K1}`);
const AAD = 'guest:abc';

/** Flip the first char of one envelope segment (index 2=iv, 3=tag, 4=ct) keeping base64url validity. */
function tamper(env: string, idx: number): string {
	const parts = env.split(':');
	const seg = parts[idx]!;
	const first = seg[0] === 'A' ? 'B' : 'A';
	parts[idx] = first + seg.slice(1);
	return parts.join(':');
}

describe('encryptField / decryptField', () => {
	it.each(['X1234567', 'Ñ-12345', '日本語 €€ 🙂'])('round-trips %s', (pt) => {
		const env = encryptField(ring1, pt, AAD);
		expect(decryptField(ring1, env, AAD)).toBe(pt);
	});

	it('output matches the envelope pattern and starts with v1:<activeId>', () => {
		const env = encryptField(ring1, 'X1234567', AAD);
		expect(env).toMatch(new RegExp(ENVELOPE_PATTERN));
		expect(env.startsWith('v1:k1:')).toBe(true);
		expect(isEnvelope(env)).toBe(true);
	});

	it('uses a fresh IV each time (distinct envelopes for same input)', () => {
		const ivs = new Set<string>();
		for (let i = 0; i < 50; i++) ivs.add(encryptField(ring1, 'same', AAD).split(':')[2]!);
		expect(ivs.size).toBe(50);
	});

	it('rejects empty plaintext', () => {
		expect(() => encryptField(ring1, '', AAD)).toThrow('Cannot encrypt an empty value');
	});

	it('does not leak plaintext in the envelope', () => {
		expect(encryptField(ring1, 'SECRET-DOC-99', AAD)).not.toContain('SECRET-DOC-99');
	});

	it.each([
		['iv', 2],
		['tag', 3],
		['ciphertext', 4]
	])('tampered %s segment fails decryption', (_n, idx) => {
		const env = encryptField(ring1, 'X1234567', AAD);
		expect(() => decryptField(ring1, tamper(env, idx), AAD)).toThrow('PII decryption failed');
	});

	it('changed key id fails with Unknown PII key id', () => {
		const env = encryptField(ring1, 'X1234567', AAD).replace('v1:k1:', 'v1:k9:');
		expect(() => decryptField(ring1, env, AAD)).toThrow('Unknown PII key id: k9');
	});

	it('tampered segment breaking shape/length is "Not an encrypted value"', () => {
		const env = encryptField(ring1, 'X1234567', AAD);
		const parts = env.split(':');
		parts[2] = parts[2]!.slice(1);
		expect(() => decryptField(ring1, parts.join(':'), AAD)).toThrow('Not an encrypted value');
	});

	it('wrong AAD fails', () => {
		const env = encryptField(ring1, 'X1234567', AAD);
		expect(() => decryptField(ring1, env, 'guest:other')).toThrow('PII decryption failed');
	});

	it('wrong key under the same id fails', () => {
		const env = encryptField(ring1, 'X1234567', AAD);
		const other = parseKeyring(`k1:${K2}`);
		expect(() => decryptField(other, env, AAD)).toThrow('PII decryption failed');
	});

	it('rejects non-envelope input', () => {
		expect(() => decryptField(ring1, 'X1234567', AAD)).toThrow('Not an encrypted value');
	});
});

describe('key rotation', () => {
	it('value encrypted under old active decrypts with {active k2, previous k1}', () => {
		const env = encryptField(ring1, 'X1234567', AAD);
		expect(decryptField(ring2, env, AAD)).toBe('X1234567');
	});

	it('new ring encrypts under k2, which the old ring cannot read', () => {
		const env = encryptField(ring2, 'X1234567', AAD);
		expect(env.startsWith('v1:k2:')).toBe(true);
		expect(() => decryptField(ring1, env, AAD)).toThrow('Unknown PII key id: k2');
	});

	it('needsReencryption: true for plaintext and k1 envelopes, false for k2', () => {
		expect(needsReencryption(ring2, 'X1234567')).toBe(true);
		expect(needsReencryption(ring2, encryptField(ring1, 'X1234567', AAD))).toBe(true);
		expect(needsReencryption(ring2, encryptField(ring2, 'X1234567', AAD))).toBe(false);
	});
});

describe('parseEnvelope / isEnvelope', () => {
	it.each(['X1234567', 'v1:a:b', 'v2:k1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAA', ''])(
		'returns null for %j',
		(v) => {
			expect(parseEnvelope(v)).toBeNull();
			expect(isEnvelope(v)).toBe(false);
		}
	);

	it('parses a real envelope into 12-byte iv, 16-byte tag, ciphertext', () => {
		const p = parseEnvelope(encryptField(ring1, 'abc', AAD));
		expect(p?.keyId).toBe('k1');
		expect(p?.iv.length).toBe(12);
		expect(p?.tag.length).toBe(16);
		expect(p?.ciphertext.length).toBe(3);
	});
});

describe('parseKeyring', () => {
	it('parses active and previous keys', () => {
		const r = parseKeyring(`k2:${K2}`, `k1:${K1}`);
		expect(r.active.id).toBe('k2');
		expect([...r.keys.keys()].sort()).toEqual(['k1', 'k2']);
		expect(r.active.key.length).toBe(32);
	});

	it.each([undefined, '', '   '])('missing active %j throws not set', (v) => {
		expect(() => parseKeyring(v)).toThrow('PII_ENCRYPTION_KEY is not set');
	});

	it('no colon -> shape error naming the variable', () => {
		expect(() => parseKeyring(K1)).toThrow(/PII_ENCRYPTION_KEY must be "<keyId>:<base64 32-byte key>"/);
	});

	it('bad key id -> shape error', () => {
		expect(() => parseKeyring(`a b:${K1}`)).toThrow(/PII_ENCRYPTION_KEY must be/);
		expect(() => parseKeyring(`:${K1}`)).toThrow(/PII_ENCRYPTION_KEY must be/);
		expect(() => parseKeyring(`${'x'.repeat(33)}:${K1}`)).toThrow(/PII_ENCRYPTION_KEY must be/);
	});

	it.each([31, 33])('%i-byte key -> exactly 32 bytes error', (n) => {
		expect(() => parseKeyring(`k1:${key(1, n)}`)).toThrow('must decode to exactly 32 bytes');
	});

	it('non-base64 key -> shape error', () => {
		expect(() => parseKeyring('k1:not*base64!')).toThrow(/PII_ENCRYPTION_KEY must be/);
	});

	it('bad previous entry names PII_ENCRYPTION_PREVIOUS_KEYS', () => {
		expect(() => parseKeyring(`k2:${K2}`, 'garbage')).toThrow(/PII_ENCRYPTION_PREVIOUS_KEYS must be/);
	});

	it('duplicate id across active/previous throws', () => {
		expect(() => parseKeyring(`k1:${K1}`, `k1:${K2}`)).toThrow('Duplicate PII key id: k1');
	});

	it('duplicate id within previous throws', () => {
		expect(() => parseKeyring(`k3:${K2}`, `k1:${K1},k1:${K2}`)).toThrow('Duplicate PII key id: k1');
	});

	it('tolerates spaces and empty previous entries', () => {
		expect(parseKeyring(`k2:${K2}`, `k1:${K1}, `).keys.size).toBe(2);
		expect(parseKeyring(`k2:${K2}`, ` , k1:${K1} ,, `).keys.size).toBe(2);
		expect(parseKeyring(`k2:${K2}`, '').keys.size).toBe(1);
		expect(parseKeyring(` k2:${K2} `).active.id).toBe('k2');
	});
});
