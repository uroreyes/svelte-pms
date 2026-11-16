import { staffCommand } from '$lib/server/cqrs/endpoint';
import { CreateStaffUser } from '$lib/features/staff/create-staff-user/contract';
import { createStaffUser } from '$lib/features/staff/create-staff-user/handler.server';

export const POST = staffCommand(CreateStaffUser, createStaffUser);
