/** Rate-plan loading. A room type without plans sells an implicit "Standard rate" (legacy pricing). */
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { PlanDay, PlanTerms } from '$lib/shared/domain/pricing';
import type { IsoDate } from '$lib/shared/domain/dates';
import type { Executor } from '../db/client';
import { ratePlan, ratePlanDaily, roomType } from '../db/schema';
import { invalid, notFound } from '../cqrs/errors';

export interface Plan extends PlanTerms {
	roomTypeId: string;
	code: string;
	description: string;
	refundable: boolean;
	freeCancellationDays: number | null;
	breakfastIncluded: boolean;
	isDefault: boolean;
}

type PlanRow = typeof ratePlan.$inferSelect;

function toPlan(r: PlanRow): Plan {
	return {
		id: r.id,
		roomTypeId: r.roomTypeId,
		name: r.name,
		code: r.code,
		description: r.description,
		adjustmentKind: r.adjustmentKind,
		adjustmentValue: r.adjustmentValue,
		includedOccupancy: r.includedOccupancy,
		extraAdultCents: r.extraAdultCents,
		extraChildCents: r.extraChildCents,
		minLos: r.minLos,
		refundable: r.refundable,
		freeCancellationDays: r.freeCancellationDays,
		breakfastIncluded: r.breakfastIncluded,
		isDefault: r.isDefault
	};
}

export function implicitPlan(type: { id: string; maxOccupancy: number }): Plan {
	return {
		id: null,
		roomTypeId: type.id,
		name: 'Standard rate',
		code: 'STD',
		description: '',
		adjustmentKind: 'NONE',
		adjustmentValue: 0,
		includedOccupancy: type.maxOccupancy,
		extraAdultCents: 0,
		extraChildCents: 0,
		minLos: null,
		refundable: true,
		freeCancellationDays: null,
		breakfastIncluded: false,
		isDefault: true
	};
}

/** Active plans per room type, default first. */
export async function plansForTypes(db: Executor, propertyId: string, types: { id: string; maxOccupancy: number }[]): Promise<Map<string, Plan[]>> {
	const ids = types.map((t) => t.id);
	const rows = ids.length
		? await db
				.select()
				.from(ratePlan)
				.where(and(eq(ratePlan.propertyId, propertyId), inArray(ratePlan.roomTypeId, ids), eq(ratePlan.active, true)))
				.orderBy(desc(ratePlan.isDefault), asc(ratePlan.name))
		: [];
	return new Map(types.map((t) => {
		const own = rows.filter((r) => r.roomTypeId === t.id).map(toPlan);
		return [t.id, own.length ? own : [implicitPlan(t)]];
	}));
}

/** The requested plan (must be active and belong to the room type) or the type's default. */
export async function resolvePlan(db: Executor, propertyId: string, roomTypeId: string, ratePlanId?: string | null): Promise<Plan> {
	const [type] = await db.select({ id: roomType.id, maxOccupancy: roomType.maxOccupancy }).from(roomType).where(and(eq(roomType.id, roomTypeId), eq(roomType.propertyId, propertyId)));
	if (!type) throw notFound('Room type');
	const plans = (await plansForTypes(db, propertyId, [type])).get(type.id)!;
	if (!ratePlanId) return plans[0]!;
	const plan = plans.find((p) => p.id === ratePlanId);
	if (!plan) throw invalid('Rate plan is not available for this room type');
	return plan;
}

export async function loadPlanDays(db: Executor, planIds: (string | null)[], from: IsoDate, toExclusive: IsoDate): Promise<Map<string, Map<IsoDate, PlanDay>>> {
	const ids = planIds.filter((x): x is string => !!x);
	const rows = ids.length
		? await db
				.select()
				.from(ratePlanDaily)
				.where(and(inArray(ratePlanDaily.ratePlanId, ids), gte(ratePlanDaily.date, from), lt(ratePlanDaily.date, toExclusive)))
		: [];
	const out = new Map<string, Map<IsoDate, PlanDay>>();
	for (const r of rows) {
		if (!out.has(r.ratePlanId)) out.set(r.ratePlanId, new Map());
		out.get(r.ratePlanId)!.set(r.date, { rateOverrideCents: r.rateOverrideCents, isClosed: r.isClosed });
	}
	return out;
}

export const NO_DAYS: ReadonlyMap<IsoDate, PlanDay> = new Map();
