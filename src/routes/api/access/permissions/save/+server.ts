import { staffCommand } from '$lib/server/cqrs/endpoint';
import { SavePermissions } from '$lib/features/access/save-permissions/contract';
import { savePermissions } from '$lib/features/access/save-permissions/handler.server';

export const POST = staffCommand(SavePermissions, savePermissions);
