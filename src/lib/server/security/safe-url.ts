/** SSRF guard for server-side fetches of user-configured URLs (iCal import, ARI push). */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateV4(ip: string): boolean {
	const [a = 0, b = 0] = ip.split('.').map(Number);
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

function isPrivateV6(ip: string): boolean {
	const v = ip.toLowerCase();
	if (v === '::' || v === '::1') return true;
	if (v.startsWith('::ffff:')) return isPrivateV4(v.slice(7));
	return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

export function isPrivateAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 4) return isPrivateV4(ip);
	if (family === 6) return isPrivateV6(ip);
	return true;
}

export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error('Invalid URL');
	}
	if (url.protocol !== 'https:') throw new Error('Only https:// URLs are allowed');
	if (url.username || url.password) throw new Error('Credentials in URLs are not allowed');
	const host = url.hostname.replace(/^\[|\]$/g, '');
	const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
	if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
		throw new Error('URL resolves to a private or reserved address');
	}
	return url;
}

/** fetch with timeout, no redirects, and a response size cap. */
export async function safeFetchText(raw: string, init: RequestInit = {}, maxBytes = 2_000_000, timeoutMs = 10_000): Promise<string> {
	const url = await assertPublicHttpsUrl(raw);
	const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
	if (res.status >= 300 && res.status < 400) throw new Error('Redirects are not followed');
	if (!res.ok) throw new Error(`Remote responded HTTP ${res.status}`);
	const reader = res.body?.getReader();
	if (!reader) return '';
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			throw new Error('Remote response too large');
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString('utf8');
}
