import { sql, type AnyColumn } from 'drizzle-orm';
import {
	boolean,
	char,
	check,
	date,
	jsonb,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
// Relative import: this file is also loaded by drizzle-kit and tsx scripts.
import {
	CHANNEL_NAMES,
	FOLIO_ITEM_TYPES,
	FOLIO_STATUSES,
	HOUSEKEEPING_STATUSES,
	OUTBOX_STATUSES,
	PAYMENT_KINDS,
	PAYMENT_METHODS,
	RESERVATION_SOURCES,
	RESERVATION_STATUSES,
	RATE_ADJUSTMENTS,
	ROOM_POSTING_MODES,
	STAFF_ROLES,
	TAX_KINDS,
	TAX_SCOPES
} from '../../shared/domain/enums';

export const staffRole = pgEnum('staff_role', STAFF_ROLES);
export const housekeepingStatus = pgEnum('housekeeping_status', HOUSEKEEPING_STATUSES);
export const reservationStatus = pgEnum('reservation_status', RESERVATION_STATUSES);
export const reservationSource = pgEnum('reservation_source', RESERVATION_SOURCES);
export const folioStatus = pgEnum('folio_status', FOLIO_STATUSES);
export const folioItemType = pgEnum('folio_item_type', FOLIO_ITEM_TYPES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentKind = pgEnum('payment_kind', PAYMENT_KINDS);
export const roomPostingMode = pgEnum('room_posting_mode', ROOM_POSTING_MODES);
export const channelName = pgEnum('channel_name', CHANNEL_NAMES);
export const outboxStatus = pgEnum('outbox_status', OUTBOX_STATUSES);
export const taxKind = pgEnum('tax_kind', TAX_KINDS);
export const taxScope = pgEnum('tax_scope', TAX_SCOPES);
export const rateAdjustment = pgEnum('rate_adjustment', RATE_ADJUSTMENTS);

const pk = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const day = (name: string) => date(name, { mode: 'string' });
const nonNegative = (name: string, col: AnyColumn) => check(name, sql`${col} >= 0`);

export const property = pgTable(
	'property',
	{
		id: pk(),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		address: text('address').notNull().default(''),
		currency: char('currency', { length: 3 }).notNull().default('USD'),
		timezone: text('timezone').notNull().default('UTC'),
		/** @deprecated Legacy single tax rate — only used when the property has no tax_rule rows. */
		taxRateBp: integer('tax_rate_bp').notNull().default(0),
		roomPostingMode: roomPostingMode('room_posting_mode').notNull().default('NIGHTLY'),
		invoicePrefix: text('invoice_prefix').notNull().default('INV-'),
		createdAt: createdAt()
	},
	(t) => [check('property_tax_rate_range', sql`${t.taxRateBp} BETWEEN 0 AND 10000`)]
);

export const staffUser = pgTable(
	'staff_user',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		email: text('email').notNull().unique(),
		name: text('name').notNull(),
		role: staffRole('role').notNull(),
		passwordHash: text('password_hash').notNull(),
		active: boolean('active').notNull().default(true),
		/** Set when an admin issues a temporary password; cleared by account.changePassword. */
		mustChangePassword: boolean('must_change_password').notNull().default(false),
		/** Internal actors (night-audit). Never listed, never signs in. */
		isSystem: boolean('is_system').notNull().default(false),
		createdAt: createdAt()
	},
	(t) => [
		check('staff_user_system_inactive', sql`NOT ${t.isSystem} OR NOT ${t.active}`),
		check('staff_user_email_lower', sql`${t.email} = lower(${t.email})`)
	]
);

/** Per-property overrides on the code defaults (DEFAULT_GRANTS). Only cells that differ are stored. */
export const rolePermission = pgTable(
	'role_permission',
	{
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		role: staffRole('role').notNull(),
		permission: text('permission').notNull(),
		granted: boolean('granted').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.propertyId, t.role, t.permission] }),
		check('role_permission_not_admin', sql`${t.role} <> 'ADMIN'`),
		check('role_permission_key_format', sql`${t.permission} ~ '^[a-z][A-Za-z]*[.][a-z][A-Za-z]*$'`)
	]
);

export const session = pgTable('session', {
	/** SHA-256 of the cookie token — the raw token is never stored. */
	id: text('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => staffUser.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
	createdAt: createdAt()
});

export const roomType = pgTable(
	'room_type',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		name: text('name').notNull(),
		baseRateCents: integer('base_rate_cents').notNull(),
		baseOccupancy: integer('base_occupancy').notNull().default(2),
		maxOccupancy: integer('max_occupancy').notNull(),
		amenities: text('amenities').array().notNull().default(sql`'{}'::text[]`),
		createdAt: createdAt()
	},
	(t) => [
		uniqueIndex('room_type_property_name_uq').on(t.propertyId, t.name),
		nonNegative('room_type_base_rate_nn', t.baseRateCents),
		check('room_type_occupancy_ck', sql`${t.baseOccupancy} >= 1 AND ${t.maxOccupancy} >= ${t.baseOccupancy}`)
	]
);

export const roomUnit = pgTable(
	'room_unit',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		roomTypeId: uuid('room_type_id')
			.notNull()
			.references(() => roomType.id),
		roomNumber: text('room_number').notNull(),
		floor: integer('floor').notNull().default(1),
		housekeepingStatus: housekeepingStatus('housekeeping_status').notNull().default('CLEAN'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('room_unit_property_number_uq').on(t.propertyId, t.roomNumber), index('room_unit_type_idx').on(t.roomTypeId)]
);

export const roomInventoryDaily = pgTable(
	'room_inventory_daily',
	{
		id: pk(),
		roomTypeId: uuid('room_type_id')
			.notNull()
			.references(() => roomType.id),
		date: day('date').notNull(),
		/** Sellable allotment for the date (manager-controlled). */
		availableCount: integer('available_count').notNull(),
		/** Units consumed by active reservations. remaining = available - sold. */
		soldCount: integer('sold_count').notNull().default(0),
		rateOverrideCents: integer('rate_override_cents'),
		minLos: integer('min_los'),
		isClosed: boolean('is_closed').notNull().default(false),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('room_inventory_daily_type_date_uq').on(t.roomTypeId, t.date),
		nonNegative('rid_available_nn', t.availableCount),
		nonNegative('rid_sold_nn', t.soldCount),
		check('rid_rate_nn', sql`${t.rateOverrideCents} IS NULL OR ${t.rateOverrideCents} >= 0`),
		check('rid_min_los_ck', sql`${t.minLos} IS NULL OR ${t.minLos} >= 1`)
	]
);

export const guest = pgTable(
	'guest',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		email: text('email'),
		phone: text('phone'),
		idDocumentType: text('id_document_type'),
		idDocumentNumber: text('id_document_number'),
		idDocumentLast4: text('id_document_last4'),
		createdAt: createdAt()
	},
	(t) => [
		index('guest_property_last_name_idx').on(t.propertyId, t.lastName),
		check(
			'guest_id_document_last4_ck',
			sql`${t.idDocumentLast4} IS NULL OR (char_length(${t.idDocumentLast4}) = 4 AND ${t.idDocumentNumber} IS NOT NULL)`
		)
	]
);

export const reservation = pgTable(
	'reservation',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		guestId: uuid('guest_id')
			.notNull()
			.references(() => guest.id),
		roomTypeId: uuid('room_type_id')
			.notNull()
			.references(() => roomType.id),
		roomUnitId: uuid('room_unit_id').references(() => roomUnit.id),
		/** null = the room type's implicit standard rate. */
		ratePlanId: uuid('rate_plan_id').references((): AnyPgColumn => ratePlan.id),
		/** Multi-room bookings share one booking (one guest, one booking code). */
		bookingId: uuid('booking_id').references((): AnyPgColumn => booking.id),
		confirmationCode: text('confirmation_code').notNull().unique(),
		source: reservationSource('source').notNull(),
		externalRef: text('external_ref'),
		checkIn: day('check_in').notNull(),
		checkOut: day('check_out').notNull(),
		adults: integer('adults').notNull().default(1),
		children: integer('children').notNull().default(0),
		status: reservationStatus('status').notNull().default('CONFIRMED'),
		quotedTotalCents: integer('quoted_total_cents').notNull(),
		overbooked: boolean('overbooked').notNull().default(false),
		notes: text('notes'),
		depositCents: integer('deposit_cents'),
		depositReference: text('deposit_reference'),
		createdAt: createdAt(),
		checkedInAt: timestamp('checked_in_at', { withTimezone: true, mode: 'date' }),
		checkedOutAt: timestamp('checked_out_at', { withTimezone: true, mode: 'date' }),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
		noShowAt: timestamp('no_show_at', { withTimezone: true, mode: 'date' })
	},
	(t) => [
		check('reservation_dates_ck', sql`${t.checkOut} > ${t.checkIn}`),
		check('reservation_party_ck', sql`${t.adults} >= 1 AND ${t.children} >= 0`),
		uniqueIndex('reservation_external_uq')
			.on(t.propertyId, t.source, t.externalRef)
			.where(sql`${t.externalRef} IS NOT NULL`),
		index('reservation_property_check_in_idx').on(t.propertyId, t.checkIn),
		index('reservation_property_status_idx').on(t.propertyId, t.status),
		index('reservation_booking_idx').on(t.bookingId)
	]
);

/** Rate snapshot per night at booking time — what the guest is charged. */
export const reservationNight = pgTable(
	'reservation_night',
	{
		reservationId: uuid('reservation_id')
			.notNull()
			.references(() => reservation.id, { onDelete: 'cascade' }),
		date: day('date').notNull(),
		rateCents: integer('rate_cents').notNull()
	},
	(t) => [primaryKey({ columns: [t.reservationId, t.date] }), index('reservation_night_date_idx').on(t.date)]
);

export const roomBlock = pgTable(
	'room_block',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		roomUnitId: uuid('room_unit_id')
			.notNull()
			.references(() => roomUnit.id),
		startDate: day('start_date').notNull(),
		endDate: day('end_date').notNull(),
		reason: text('reason').notNull(),
		createdBy: uuid('created_by')
			.notNull()
			.references(() => staffUser.id),
		createdAt: createdAt()
	},
	(t) => [check('room_block_dates_ck', sql`${t.endDate} > ${t.startDate}`)]
);

export const folio = pgTable(
	'folio',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		reservationId: uuid('reservation_id')
			.notNull()
			.references(() => reservation.id),
		label: text('label').notNull(),
		payerName: text('payer_name').notNull(),
		isPrimary: boolean('is_primary').notNull().default(false),
		receivesRoomCharges: boolean('receives_room_charges').notNull().default(false),
		status: folioStatus('status').notNull().default('OPEN'),
		totalChargesCents: integer('total_charges_cents').notNull().default(0),
		totalPaymentsCents: integer('total_payments_cents').notNull().default(0),
		balanceCents: integer('balance_cents').notNull().default(0),
		/** Company billing details (split / corporate folios). Frozen once the invoice is issued. */
		companyName: text('company_name'),
		taxId: text('tax_id'),
		billingAddress: text('billing_address'),
		/** Gap-free per property, assigned in the settlement transaction. */
		invoiceNumber: text('invoice_number'),
		invoiceIssuedAt: timestamp('invoice_issued_at', { withTimezone: true, mode: 'date' }),
		createdAt: createdAt(),
		settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' })
	},
	(t) => [
		index('folio_reservation_idx').on(t.reservationId),
		uniqueIndex('folio_invoice_number_uq')
			.on(t.propertyId, t.invoiceNumber)
			.where(sql`${t.invoiceNumber} IS NOT NULL`),
		uniqueIndex('folio_one_primary_uq').on(t.reservationId).where(sql`${t.isPrimary}`),
		uniqueIndex('folio_one_room_router_uq').on(t.reservationId).where(sql`${t.receivesRoomCharges}`)
	]
);

/** Append-only (enforced by trigger). Voids are negative rows referencing the original. */
export const folioItem = pgTable(
	'folio_item',
	{
		id: pk(),
		folioId: uuid('folio_id')
			.notNull()
			.references(() => folio.id),
		type: folioItemType('type').notNull(),
		category: text('category').notNull(),
		description: text('description').notNull(),
		quantity: integer('quantity').notNull(),
		unitPriceCents: integer('unit_price_cents').notNull(),
		amountCents: integer('amount_cents').notNull(),
		taxCents: integer('tax_cents').notNull(),
		totalCents: integer('total_cents').notNull(),
		serviceDate: day('service_date'),
		reversesItemId: uuid('reverses_item_id').references((): AnyPgColumn => folioItem.id),
		voidReason: text('void_reason'),
		staffUserId: uuid('staff_user_id')
			.notNull()
			.references(() => staffUser.id),
		postedAt: timestamp('posted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('folio_item_reverses_uq').on(t.reversesItemId),
		index('folio_item_folio_idx').on(t.folioId),
		index('folio_item_posted_at_idx').on(t.postedAt)
	]
);

/** Append-only. amount_cents is signed: PAYMENT > 0, REFUND/VOID < 0. */
export const folioPayment = pgTable(
	'folio_payment',
	{
		id: pk(),
		folioId: uuid('folio_id')
			.notNull()
			.references(() => folio.id),
		method: paymentMethod('method').notNull(),
		kind: paymentKind('kind').notNull(),
		amountCents: integer('amount_cents').notNull(),
		referenceNo: text('reference_no'),
		relatedPaymentId: uuid('related_payment_id').references((): AnyPgColumn => folioPayment.id),
		reason: text('reason'),
		staffUserId: uuid('staff_user_id')
			.notNull()
			.references(() => staffUser.id),
		paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(t) => [
		index('folio_payment_folio_idx').on(t.folioId),
		uniqueIndex('folio_payment_single_void_uq')
			.on(t.relatedPaymentId)
			.where(sql`${t.kind} = 'VOID'`),
		check(
			'folio_payment_sign_ck',
			sql`(${t.kind} = 'PAYMENT' AND ${t.amountCents} > 0) OR (${t.kind} <> 'PAYMENT' AND ${t.amountCents} < 0 AND ${t.relatedPaymentId} IS NOT NULL)`
		)
	]
);

/** Gap-free invoice sequence: one row per property, incremented under FOR UPDATE. */
export const invoiceCounter = pgTable('invoice_counter', {
	propertyId: uuid('property_id')
		.primaryKey()
		.references(() => property.id),
	lastNumber: integer('last_number').notNull().default(0)
});

export const catalogItem = pgTable(
	'catalog_item',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		category: text('category').notNull(),
		name: text('name').notNull(),
		unitPriceCents: integer('unit_price_cents').notNull(),
		taxable: boolean('taxable').notNull().default(true),
		active: boolean('active').notNull().default(true),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('catalog_item_property_name_uq').on(t.propertyId, t.name), nonNegative('catalog_item_price_nn', t.unitPriceCents)]
);

export const channelMapping = pgTable(
	'channel_mapping',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		roomTypeId: uuid('room_type_id')
			.notNull()
			.references(() => roomType.id),
		channelName: channelName('channel_name').notNull(),
		externalRoomId: text('external_room_id').notNull(),
		/** Optional rate plan this mapping sells (null = standard rate). */
		ratePlanId: uuid('rate_plan_id').references((): AnyPgColumn => ratePlan.id),
		externalRateId: text('external_rate_id'),
		icalUrl: text('ical_url'),
		pushUrl: text('push_url'),
		exportToken: text('export_token').notNull().unique(),
		active: boolean('active').notNull().default(true),
		lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: 'date' }),
		lastSyncError: text('last_sync_error'),
		createdAt: createdAt()
	},
	(t) => [
		// NULLS NOT DISTINCT is applied in migration 0003 (drizzle can't express it).
		uniqueIndex('channel_mapping_type_channel_uq').on(t.roomTypeId, t.channelName, t.ratePlanId),
		uniqueIndex('channel_mapping_external_uq').on(t.channelName, t.externalRoomId, t.externalRateId)
	]
);

/** Transactional outbox for outbound ARI pushes. */
export const channelOutbox = pgTable(
	'channel_outbox',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		channelMappingId: uuid('channel_mapping_id')
			.notNull()
			.references(() => channelMapping.id),
		fromDate: day('from_date').notNull(),
		/** exclusive */
		toDate: day('to_date').notNull(),
		status: outboxStatus('status').notNull().default('PENDING'),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		createdAt: createdAt(),
		processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
	},
	(t) => [index('channel_outbox_status_idx').on(t.status, t.createdAt)]
);

/** Property tax rules (see shared/domain/tax.ts). */
export const taxRule = pgTable(
	'tax_rule',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		name: text('name').notNull(),
		kind: taxKind('kind').notNull(),
		rateBp: integer('rate_bp').notNull().default(0),
		amountCents: integer('amount_cents').notNull().default(0),
		appliesTo: taxScope('applies_to').notNull().default('ALL'),
		inclusive: boolean('inclusive').notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0),
		active: boolean('active').notNull().default(true),
		createdAt: createdAt()
	},
	(t) => [
		index('tax_rule_property_idx').on(t.propertyId),
		check('tax_rule_rate_ck', sql`${t.rateBp} BETWEEN 0 AND 10000 AND ${t.amountCents} >= 0`),
		check('tax_rule_inclusive_ck', sql`NOT ${t.inclusive} OR ${t.kind} = 'PERCENT'`),
		check('tax_rule_fixed_scope_ck', sql`${t.kind} = 'PERCENT' OR ${t.appliesTo} = 'ROOM'`)
	]
);

/** Per-line tax breakdown. Append-only like folio_item. */
export const folioItemTax = pgTable(
	'folio_item_tax',
	{
		id: pk(),
		folioItemId: uuid('folio_item_id')
			.notNull()
			.references(() => folioItem.id),
		taxRuleId: uuid('tax_rule_id').references(() => taxRule.id),
		name: text('name').notNull(),
		amountCents: integer('amount_cents').notNull()
	},
	(t) => [index('folio_item_tax_item_idx').on(t.folioItemId)]
);

export const ratePlan = pgTable(
	'rate_plan',
	{
		id: pk(),
		propertyId: uuid('property_id')
			.notNull()
			.references(() => property.id),
		roomTypeId: uuid('room_type_id')
			.notNull()
			.references(() => roomType.id),
		name: text('name').notNull(),
		code: text('code').notNull(),
		description: text('description').notNull().default(''),
		adjustmentKind: rateAdjustment('adjustment_kind').notNull().default('NONE'),
		adjustmentValue: integer('adjustment_value').notNull().default(0),
		includedOccupancy: integer('included_occupancy').notNull(),
		extraAdultCents: integer('extra_adult_cents').notNull().default(0),
		extraChildCents: integer('extra_child_cents').notNull().default(0),
		refundable: boolean('refundable').notNull().default(true),
		freeCancellationDays: integer('free_cancellation_days'),
		breakfastIncluded: boolean('breakfast_included').notNull().default(false),
		minLos: integer('min_los'),
		isDefault: boolean('is_default').notNull().default(false),
		active: boolean('active').notNull().default(true),
		createdAt: createdAt()
	},
	(t) => [
		uniqueIndex('rate_plan_type_code_uq').on(t.roomTypeId, t.code),
		uniqueIndex('rate_plan_one_default_uq').on(t.roomTypeId).where(sql`${t.isDefault}`),
		check('rate_plan_values_ck', sql`${t.includedOccupancy} >= 1 AND ${t.extraAdultCents} >= 0 AND ${t.extraChildCents} >= 0 AND (${t.minLos} IS NULL OR ${t.minLos} >= 1)`)
	]
);

export const ratePlanDaily = pgTable(
	'rate_plan_daily',
	{
		ratePlanId: uuid('rate_plan_id')
			.notNull()
			.references(() => ratePlan.id, { onDelete: 'cascade' }),
		date: day('date').notNull(),
		rateOverrideCents: integer('rate_override_cents'),
		isClosed: boolean('is_closed').notNull().default(false)
	},
	(t) => [primaryKey({ columns: [t.ratePlanId, t.date] }), check('rate_plan_daily_rate_ck', sql`${t.rateOverrideCents} IS NULL OR ${t.rateOverrideCents} >= 0`)]
);

/** Parent of a multi-room booking. */
export const booking = pgTable('booking', {
	id: pk(),
	propertyId: uuid('property_id')
		.notNull()
		.references(() => property.id),
	confirmationCode: text('confirmation_code').notNull().unique(),
	guestId: uuid('guest_id')
		.notNull()
		.references(() => guest.id),
	source: reservationSource('source').notNull(),
	createdAt: createdAt()
});

/**
 * Operational audit trail (PR-23). Append-only (DB trigger). Written by the command executor
 * inside the command's own transaction, so rolled-back commands leave no trace.
 */
export const auditEvent = pgTable(
	'audit_event',
	{
		id: pk(),
		propertyId: uuid('property_id').references(() => property.id),
		actorUserId: uuid('actor_user_id').references(() => staffUser.id),
		/** Staff name at the time, or 'Public booking engine' / 'Channel: …' / 'System'. */
		actorLabel: text('actor_label').notNull(),
		command: text('command').notNull(),
		entityType: text('entity_type'),
		entityId: text('entity_id'),
		reservationId: uuid('reservation_id').references(() => reservation.id),
		/** Parsed command input with PII redacted. */
		input: jsonb('input').notNull(),
		result: jsonb('result'),
		occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(t) => [
		index('audit_event_property_time_idx').on(t.propertyId, t.occurredAt),
		index('audit_event_reservation_idx').on(t.reservationId, t.occurredAt),
		index('audit_event_actor_idx').on(t.actorUserId, t.occurredAt)
	]
);
