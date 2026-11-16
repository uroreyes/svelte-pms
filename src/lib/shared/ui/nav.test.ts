import { describe, expect, it } from 'vitest';
import { DEFAULT_GRANTS } from '$lib/shared/domain/permissions';
import { homePath, visibleNav } from './nav';

const hrefs = (p: Parameters<typeof visibleNav>[0]) => visibleNav(p).map((n) => n.href);

describe('nav', () => {
	it('POS sees only /pos and lands there', () => {
		expect(hrefs(DEFAULT_GRANTS.POS)).toEqual(['/pos']);
		expect(homePath(DEFAULT_GRANTS.POS)).toBe('/pos');
	});
	it('front desk sees reports but no management pages', () => {
		const h = hrefs(DEFAULT_GRANTS.FRONT_DESK);
		expect(h).toContain('/reports');
		for (const x of ['/inventory', '/channels', '/insights', '/setup']) expect(h).not.toContain(x);
	});
	it('revenue manager lands on the tape chart', () => {
		expect(homePath(DEFAULT_GRANTS.REVENUE_MANAGER)).toBe('/tape-chart');
	});
	it('audit.view alone shows reports', () => {
		expect(hrefs(['audit.view'])).toEqual(['/reports']);
	});
	it('no permissions: no home', () => {
		expect(homePath([])).toBeNull();
	});
	it('admin sees all 10 items', () => {
		expect(visibleNav(DEFAULT_GRANTS.ADMIN)).toHaveLength(10);
	});
});
