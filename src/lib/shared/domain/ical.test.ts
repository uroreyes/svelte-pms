import { describe, expect, it } from 'vitest';
import { parseCalendar, serializeCalendar } from './ical';

describe('iCal', () => {
	it('round-trips all-day events', () => {
		const text = serializeCalendar('Harbor, Deluxe', [{ uid: 'a@x', start: '2026-12-01', end: '2026-12-03', summary: 'Not available' }], new Date('2026-11-15T00:00:00Z'));
		expect(text).toContain('DTSTART;VALUE=DATE:20261201');
		expect(text).toContain('X-WR-CALNAME:Harbor\\, Deluxe');
		expect(parseCalendar(text)).toEqual([{ uid: 'a@x', start: '2026-12-01', end: '2026-12-03', summary: 'Not available', cancelled: false }]);
	});

	it('parses OTA feeds with folded lines, datetimes, missing DTEND and cancellations', () => {
		const feed = [
			'BEGIN:VCALENDAR',
			'BEGIN:VEVENT',
			'UID:res-1',
			'DTSTART:20261201T140000Z',
			'DTEND:20261204T100000Z',
			'SUMMARY:Reserved – Jane',
			' Doe',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'UID:res-2',
			'DTSTART;VALUE=DATE:20261210',
			'STATUS:CANCELLED',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'SUMMARY:no uid → ignored',
			'DTSTART;VALUE=DATE:20261210',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');
		expect(parseCalendar(feed)).toEqual([
			{ uid: 'res-1', start: '2026-12-01', end: '2026-12-04', summary: 'Reserved – JaneDoe', cancelled: false },
			{ uid: 'res-2', start: '2026-12-10', end: '2026-12-11', summary: '', cancelled: true }
		]);
	});
});
