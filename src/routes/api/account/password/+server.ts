import { staffCommand } from '$lib/server/cqrs/endpoint';
import { ChangeOwnPassword } from '$lib/features/account/change-password/contract';
import { changeOwnPassword } from '$lib/features/account/change-password/handler.server';

export const POST = staffCommand(ChangeOwnPassword, changeOwnPassword);
