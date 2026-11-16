import { staffCommandNoTx } from '$lib/server/cqrs/endpoint';
import { channelSecret } from '$lib/server/config';
import { ProcessOutbox } from '$lib/features/channels/process-outbox/contract';
import { makeProcessOutbox } from '$lib/features/channels/process-outbox/handler.server';

export const POST = staffCommandNoTx(ProcessOutbox, makeProcessOutbox(channelSecret));
