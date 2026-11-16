import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { shortText } from '$lib/shared/cqrs/schemas';

export interface InHouseRoomView {
	reservationId: string;
	confirmationCode: string;
	guestName: string;
	roomNumber: string;
	checkOut: string;
	folios: { id: string; label: string; payerName: string; isPrimary: boolean }[];
}

export const FindInHouseRoom = query<InHouseRoomView>()({
	name: 'folio.findInHouseRoom',
	path: '/api/folio/in-house',
	permission: 'pos.post',
	input: z.object({ roomNumber: shortText(10) })
});
