import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { isoDate } from '$lib/shared/cqrs/schemas';
import type { CsvCell } from '$lib/shared/domain/csv';

export const DATASETS = ['payments', 'folio-items', 'reservations'] as const;
export type Dataset = (typeof DATASETS)[number];

export interface DatasetExport {
	filename: string;
	columns: string[];
	rows: CsvCell[][];
}

/** Served as text/csv by /api/reports/export (not the JSON envelope). */
export const ExportDataset = query<DatasetExport>()({
	name: 'reports.export',
	path: '/api/reports/export',
	permission: 'reports.export',
	input: z
		.object({ dataset: z.enum(DATASETS), from: isoDate, to: isoDate })
		.refine((v) => v.to >= v.from, { message: 'End must be on or after start', path: ['to'] })
});
