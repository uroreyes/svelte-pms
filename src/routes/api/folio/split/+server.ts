import { staffCommand } from '$lib/server/cqrs/endpoint';
import { OpenSplitFolio } from '$lib/features/folio/open-split-folio/contract';
import { openSplitFolio } from '$lib/features/folio/open-split-folio/handler.server';

export const POST = staffCommand(OpenSplitFolio, openSplitFolio);
