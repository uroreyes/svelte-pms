import { staffCommandNoTx } from '$lib/server/cqrs/endpoint';
import { safeFetchText } from '$lib/server/security/safe-url';
import { SyncIcal } from '$lib/features/channels/sync-ical/contract';
import { makeSyncIcal } from '$lib/features/channels/sync-ical/handler.server';

export const POST = staffCommandNoTx(SyncIcal, makeSyncIcal((url) => safeFetchText(url)));
