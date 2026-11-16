import { staffCommand } from '$lib/server/cqrs/endpoint';
import { ResetStaffPassword } from '$lib/features/staff/reset-staff-password/contract';
import { resetStaffPassword } from '$lib/features/staff/reset-staff-password/handler.server';

export const POST = staffCommand(ResetStaffPassword, resetStaffPassword);
