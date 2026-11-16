import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
	new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P });
	return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algo, n, r, p, saltB64, keyB64] = stored.split('$');
	if (algo !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false;
	const expected = Buffer.from(keyB64, 'base64url');
	const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, {
		N: Number(n),
		r: Number(r),
		p: Number(p)
	});
	return key.length === expected.length && timingSafeEqual(key, expected);
}
