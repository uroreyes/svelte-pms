import { staffCommand } from '$lib/server/cqrs/endpoint';
import { UpdatePropertySettings } from '$lib/features/setup/update-property-settings/contract';
import { updatePropertySettings } from '$lib/features/setup/update-property-settings/handler.server';

export const POST = staffCommand(UpdatePropertySettings, updatePropertySettings);
