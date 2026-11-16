import { describe, expect, it } from 'vitest';
import { signBody, verifySignature } from './hmac';
import { isPrivateAddress } from './safe-url';
import { rateLimit } from './rate-limit';
import { hashPassword, verifyPassword } from '../auth/password';

describe('security primitives', () => {
	it('verifies HMAC signatures in constant time and rejects tampering', () => {
		const secret = 'x'.repeat(40);
		const body = '{"event":"NEW"}';
		const sig = signBody(body, secret);
		expect(verifySignature(body, sig, secret)).toBe(true);
		expect(verifySignature(body + ' ', sig, secret)).toBe(false);
		expect(verifySignature(body, null, secret)).toBe(false);
		expect(verifySignature(body, 'sha256=00', secret)).toBe(false);
	});

	it('flags private / reserved addresses for the SSRF guard', () => {
		for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) {
			expect(isPrivateAddress(ip), ip).toBe(true);
		}
		for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
	});

	it('rate limits per key and window', () => {
		const key = `t-${Math.random()}`;
		expect([1, 2, 3].map(() => rateLimit(key, 2, 1000, 0))).toEqual([true, true, false]);
		expect(rateLimit(key, 2, 1000, 2000)).toBe(true);
	});

	it('hashes passwords with scrypt and verifies', async () => {
		const hash = await hashPassword('correct horse');
		expect(hash.startsWith('scrypt$')).toBe(true);
		expect(await verifyPassword('correct horse', hash)).toBe(true);
		expect(await verifyPassword('wrong', hash)).toBe(false);
		expect(await verifyPassword('x', 'garbage')).toBe(false);
	});
});
