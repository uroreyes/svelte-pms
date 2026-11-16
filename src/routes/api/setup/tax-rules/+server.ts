import { staffCommand } from '$lib/server/cqrs/endpoint';
import { UpsertTaxRule } from '$lib/features/setup/upsert-tax-rule/contract';
import { upsertTaxRule } from '$lib/features/setup/upsert-tax-rule/handler.server';

export const POST = staffCommand(UpsertTaxRule, upsertTaxRule);
