/**
 * UI-side command runner: tracks pending/error state, sends the command,
 * then invalidates the read models that depend on it.
 */
import { invalidate, invalidateAll } from '$app/navigation';
import { send } from '$lib/shared/cqrs/client';
import type { ApiError, CommandContract, InputOf, ResultOf } from '$lib/shared/cqrs/contract';

export function createAction<C extends CommandContract>(contract: C, opts: { invalidates?: string[] } = {}) {
	let pending = $state(false);
	let error = $state<ApiError | null>(null);

	return {
		get pending() {
			return pending;
		},
		get error() {
			return error;
		},
		clear() {
			error = null;
		},
		async run(input: InputOf<C>): Promise<ResultOf<C> | null> {
			pending = true;
			error = null;
			try {
				const result = await send(contract, input);
				if (!result.ok) {
					error = result.error;
					return null;
				}
				if (opts.invalidates) await Promise.all(opts.invalidates.map((dep) => invalidate(dep)));
				else await invalidateAll();
				return result.data;
			} finally {
				pending = false;
			}
		}
	};
}
