import { staffCommand } from '$lib/server/cqrs/endpoint';
import { UpdateStaffUser } from '$lib/features/staff/update-staff-user/contract';
import { updateStaffUser } from '$lib/features/staff/update-staff-user/handler.server';

export const POST = staffCommand(UpdateStaffUser, updateStaffUser);
