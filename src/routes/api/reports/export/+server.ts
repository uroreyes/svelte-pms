import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { searchParamsToObject } from '$lib/server/cqrs/endpoint';
import { toApiError } from '$lib/server/cqrs/errors';
import { executeQuery } from '$lib/server/cqrs/execute';
import { toCsv } from '$lib/shared/domain/csv';
import { ExportDataset } from '$lib/features/reports/export-dataset/contract';
import { exportDataset } from '$lib/features/reports/export-dataset/handler.server';

/** GET /api/reports/export?dataset=payments&from=…&to=… → CSV download (same auth/validation as every query). */
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const data = await executeQuery(ExportDataset, exportDataset, searchParamsToObject(url.searchParams), { db: getDb(), actor: locals.actor });
		return new Response(toCsv(data.columns, data.rows), {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename="${data.filename.replace(/[^\w.-]/g, '_')}"`,
				'cache-control': 'no-store'
			}
		});
	} catch (e) {
		const { status, error } = toApiError(e, ExportDataset.name);
		return json({ ok: false, error }, { status });
	}
};
