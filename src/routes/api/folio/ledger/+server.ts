import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetFolioLedger } from '$lib/features/folio/get-folio-ledger/contract';
import { getFolioLedger } from '$lib/features/folio/get-folio-ledger/handler.server';

export const GET = staffQuery(GetFolioLedger, getFolioLedger);
