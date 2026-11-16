export const STAFF_ROLES = ['ADMIN', 'MANAGER', 'FRONT_DESK', 'POS', 'REVENUE_MANAGER'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
	ADMIN: 'Super admin',
	MANAGER: 'Manager',
	REVENUE_MANAGER: 'Revenue manager',
	FRONT_DESK: 'Front desk',
	POS: 'POS'
};

/** Grid column order for the permission matrix. */
export const ROLE_ORDER: readonly StaffRole[] = [
	'ADMIN',
	'MANAGER',
	'REVENUE_MANAGER',
	'FRONT_DESK',
	'POS'
];

export const HOUSEKEEPING_STATUSES = ['CLEAN', 'DIRTY', 'INSPECTED', 'OUT_OF_ORDER'] as const;
export type HousekeepingStatus = (typeof HOUSEKEEPING_STATUSES)[number];

export const RESERVATION_STATUSES = [
	'CONFIRMED',
	'CHECKED_IN',
	'CHECKED_OUT',
	'CANCELLED',
	'NO_SHOW'
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_SOURCES = [
	'DIRECT',
	'FRONT_DESK',
	'BOOKING_COM',
	'AGODA',
	'AIRBNB',
	'EXPEDIA',
	'ICAL'
] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

export const CHANNEL_NAMES = ['BOOKING_COM', 'AGODA', 'AIRBNB', 'EXPEDIA', 'ICAL'] as const;
export type ChannelName = (typeof CHANNEL_NAMES)[number];

export const FOLIO_STATUSES = ['OPEN', 'SETTLED'] as const;
export type FolioStatus = (typeof FOLIO_STATUSES)[number];

export const FOLIO_ITEM_TYPES = ['ROOM', 'POS_ORDER', 'TAX', 'DISCOUNT'] as const;
export type FolioItemType = (typeof FOLIO_ITEM_TYPES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_KINDS = ['PAYMENT', 'REFUND', 'VOID'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const ROOM_POSTING_MODES = ['UPFRONT', 'NIGHTLY'] as const;
export type RoomPostingMode = (typeof ROOM_POSTING_MODES)[number];

export const OUTBOX_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const CHARGE_CATEGORIES = [
	'ROOM',
	'F&B',
	'MINIBAR',
	'LAUNDRY',
	'TRANSFER',
	'FEE',
	'OTHER'
] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

export const SOURCE_LABEL: Record<ReservationSource, string> = {
	DIRECT: 'Direct (web)',
	FRONT_DESK: 'Front desk',
	BOOKING_COM: 'Booking.com',
	AGODA: 'Agoda',
	AIRBNB: 'Airbnb',
	EXPEDIA: 'Expedia',
	ICAL: 'iCal'
};

export const TAX_KINDS = ['PERCENT', 'PER_NIGHT', 'PER_PERSON_NIGHT'] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

/** What a tax applies to: room nights, POS / incidental lines, or both. */
export const TAX_SCOPES = ['ROOM', 'POS', 'ALL'] as const;
export type TaxScope = (typeof TAX_SCOPES)[number];

export const RATE_ADJUSTMENTS = ['NONE', 'PERCENT', 'FIXED'] as const;
export type RateAdjustment = (typeof RATE_ADJUSTMENTS)[number];
