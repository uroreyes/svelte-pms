/** Minimal RFC 5545 support for all-day availability blocks. */
import { addDays, isIsoDate, type IsoDate } from './dates';

export interface CalendarEvent {
	uid: string;
	start: IsoDate; // inclusive
	end: IsoDate; // exclusive (DTEND for all-day events)
	summary: string;
	cancelled?: boolean;
}

function escapeText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function compact(date: IsoDate): string {
	return date.replaceAll('-', '');
}

/** Fold lines longer than 75 octets (approximated by chars). */
function fold(line: string): string {
	if (line.length <= 75) return line;
	const parts: string[] = [line.slice(0, 75)];
	for (let i = 75; i < line.length; i += 74) parts.push(' ' + line.slice(i, i + 74));
	return parts.join('\r\n');
}

export function serializeCalendar(name: string, events: readonly CalendarEvent[], stamp: Date): string {
	const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Hotel PMS//Availability//EN',
		'CALSCALE:GREGORIAN',
		`X-WR-CALNAME:${escapeText(name)}`
	];
	for (const e of events) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:${escapeText(e.uid)}`,
			`DTSTAMP:${dtstamp}`,
			`DTSTART;VALUE=DATE:${compact(e.start)}`,
			`DTEND;VALUE=DATE:${compact(e.end)}`,
			`SUMMARY:${escapeText(e.summary)}`,
			'END:VEVENT'
		);
	}
	lines.push('END:VCALENDAR');
	return lines.map(fold).join('\r\n') + '\r\n';
}

function unfold(text: string): string[] {
	return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function unescapeText(value: string): string {
	return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

function parseDateValue(raw: string): IsoDate | null {
	const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
	if (!m) return null;
	const iso = `${m[1]}-${m[2]}-${m[3]}`;
	return isIsoDate(iso) ? iso : null;
}

export function parseCalendar(text: string): CalendarEvent[] {
	const events: CalendarEvent[] = [];
	let current: Partial<CalendarEvent> | null = null;
	for (const line of unfold(text)) {
		if (line === 'BEGIN:VEVENT') {
			current = {};
			continue;
		}
		if (line === 'END:VEVENT') {
			if (current?.uid && current.start) {
				const end = current.end && current.end > current.start ? current.end : addDays(current.start, 1);
				events.push({ uid: current.uid, start: current.start, end, summary: current.summary ?? '', cancelled: current.cancelled ?? false });
			}
			current = null;
			continue;
		}
		if (!current) continue;
		const sep = line.indexOf(':');
		if (sep < 0) continue;
		const name = line.slice(0, sep).split(';')[0]!.toUpperCase();
		const value = line.slice(sep + 1);
		switch (name) {
			case 'UID':
				current.uid = unescapeText(value).slice(0, 255);
				break;
			case 'DTSTART':
				current.start = parseDateValue(value) ?? undefined;
				break;
			case 'DTEND':
				current.end = parseDateValue(value) ?? undefined;
				break;
			case 'SUMMARY':
				current.summary = unescapeText(value).slice(0, 255);
				break;
			case 'STATUS':
				current.cancelled = value.trim().toUpperCase() === 'CANCELLED';
				break;
		}
	}
	return events;
}
