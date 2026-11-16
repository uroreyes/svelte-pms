import type { Actor } from '$lib/server/cqrs/actor';

declare global {
	namespace App {
		interface Locals {
			actor: Actor | null;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
