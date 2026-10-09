import { z } from "zod";
const id=z.uuid(),time=z.iso.datetime({offset:true}),scope={organization_id:id,location_id:id},reason=z.string().trim().min(1).max(2000);
export const minor=z.string().regex(/^(0|[1-9]\d{0,15})$/).refine(s=>BigInt(s)<=9000000000000000n);
export const signedMinor=z.string().regex(/^-?(0|[1-9]\d{0,18})$/);
const positive=minor.refine(s=>BigInt(s)>0n),currency=z.enum(["TRY","EUR","USD","GBP","JPY","KWD"]);
export const money=z.strictObject({currency,minor_units:signedMinor,exponent:z.int().min(0).max(4)});
export const paymentMethod=z.enum(["CASH","CARD","BANK_TRANSFER","OTHER"]);
export const allocationInput=z.strictObject({charge_id:id,amount_minor:positive});
const allocations=allocationInput.array().max(20).refine(a=>new Set(a.map(x=>x.charge_id)).size===a.length);
const base={mutation_id:id,reason},posted={...base,id,currency,occurred_at:time},tax={tax_rate_bps:z.int().min(0).max(10000),tax_inclusive:z.boolean()},description=z.string().trim().min(1).max(500);
const paymentFields={...posted,client_id:id,amount_minor:positive,method:paymentMethod,appointment_id:id.nullable(),external_reference:z.string().max(160).nullable()};
export const financeCommand=z.discriminatedUnion("type",[
 z.strictObject({...base,type:z.literal("CURRENCY_SET"),currency,expected_version:z.int().nonnegative()}),
 z.strictObject({...base,type:z.literal("CASH_OPEN"),id,currency,opening_cash_minor:minor}),
 z.strictObject({...base,type:z.literal("CASH_CLOSE_SUBMIT"),id,expected_version:z.int().positive(),counted_cash_minor:minor}),
 z.strictObject({...base,type:z.literal("CASH_CLOSE_CONFIRM"),id,expected_version:z.int().positive(),acknowledge_difference:z.boolean()}),
 z.strictObject({...base,type:z.literal("SERVICE_CHARGE"),id,appointment_id:id}),
 z.strictObject({...posted,type:z.literal("MANUAL_CHARGE"),client_id:id,amount_minor:positive,...tax,description}),
 z.strictObject({...posted,type:z.literal("RETAIL_SALE"),client_id:id,stock_item_id:id,lot_id:id.nullable(),quantity:z.string().regex(/^[0-9]{1,10}(\.\d{1,2})?$/).refine(s=>BigInt(s.replace(".",""))>0n),unit_price_minor:positive,...tax,description}),
 z.strictObject({...paymentFields,type:z.literal("PAYMENT"),allocations,confirm_credit:z.boolean()}),
 z.strictObject({...paymentFields,type:z.literal("DEPOSIT")}),
 z.strictObject({...base,type:z.literal("ALLOCATE"),client_id:id,payment_id:id,allocations:allocations.refine(a=>a.length>0)}),
 z.strictObject({...base,type:z.literal("REFUND"),id,original_payment_id:id,amount_minor:positive,occurred_at:time}),
 z.strictObject({...posted,type:z.literal("EXPENSE"),amount_minor:positive,method:paymentMethod,category:z.enum(["RENT","UTILITIES","SUPPLIES","MAINTENANCE","MARKETING","OTHER"]),description,stock_receipt_id:id.nullable(),external_reference:z.string().max(160).nullable()}),
 z.strictObject({...base,type:z.literal("REVERSAL"),id,document_id:id}),
 z.strictObject({...posted,type:z.literal("CLIENT_CREDIT"),client_id:id,amount_minor:positive,description}),
 z.strictObject({...posted,type:z.literal("CLIENT_DEBIT"),client_id:id,amount_minor:positive,description}),
 z.strictObject({...posted,type:z.literal("ADJUSTMENT"),amount_minor:positive,direction:z.enum(["IN","OUT"]),description}),
]);
export type FinanceCommand=z.infer<typeof financeCommand>;
export function financePermission(t:FinanceCommand["type"]){return ["CURRENCY_SET","CLIENT_CREDIT","CLIENT_DEBIT","ADJUSTMENT","REVERSAL"].includes(t)?"finance.adjust":["SERVICE_CHARGE","MANUAL_CHARGE","RETAIL_SALE"].includes(t)?"finance.charge":["PAYMENT","DEPOSIT","ALLOCATE"].includes(t)?"finance.payment":t==="REFUND"?"finance.refund":t==="EXPENSE"?"finance.expense.manage":t==="CASH_OPEN"?"finance.cash.open":"finance.cash.close";}
export const financeReadRequest=z.strictObject({day:z.iso.date().optional(),client_id:id.optional(),appointment_id:id.optional(),document_id:id.optional(),offset:z.int().min(0).max(10000).optional()});
export const financeDocument=z.strictObject({id,...scope,client_id:id.nullable(),appointment_id:id.nullable(),live_session_id:id.nullable(),type:z.enum(["SERVICE_CHARGE","RETAIL_SALE","DEPOSIT","PAYMENT","REFUND","EXPENSE","CLIENT_CREDIT","CLIENT_DEBIT","ADJUSTMENT","REVERSAL"]),currency,amount_minor:positive,net_amount_minor:minor,tax_amount_minor:minor,...tax,description,reason,external_reference:z.string().nullable(),service_id:id.nullable(),service_name_snapshot:z.string().nullable(),service_version:z.int().positive().nullable(),performed_by:id.nullable(),reversal_of:id.nullable(),original_payment_id:id.nullable(),recorded_by:id,occurred_at:time,created_at:time,correlation_id:id,mutation_id:id,version:z.literal(1),method:paymentMethod.nullable(),category:z.string().nullable(),stock_receipt_id:id.nullable(),stock_item_id:id.nullable(),stock_lot_id:id.nullable(),quantity:z.string().nullable(),unit_price_minor:minor.nullable(),stock_movement_id:id.nullable(),outstanding_minor:signedMinor.nullable(),available_credit_minor:signedMinor.nullable(),refunded_minor:minor,reversed:z.boolean()});
export const paymentAllocation=z.strictObject({id,...scope,payment_id:id,charge_id:id,currency,amount_minor:signedMinor,release_of:id.nullable(),source_document_id:id,recorded_by:id,created_at:time,correlation_id:id,mutation_id:id});
export const financeCharge=financeDocument.extend({type:z.enum(["SERVICE_CHARGE","RETAIL_SALE"])});
export const financePayment=financeDocument.extend({type:z.literal("PAYMENT")});
export const deposit=financeDocument.extend({type:z.literal("DEPOSIT")});
export const refund=financeDocument.extend({type:z.literal("REFUND")});
export const expense=financeDocument.extend({type:z.literal("EXPENSE")});
export const financeLedger=z.strictObject({id,document_id:id,...scope,client_id:id.nullable(),currency,account:z.enum(["CLIENT","CASH","CARD","BANK_TRANSFER","OTHER"]),amount_minor:signedMinor,cash_session_id:id.nullable(),recorded_by:id,created_at:time});
export const clientBalance=z.strictObject({client_id:id,display_name:z.string(),balance_minor:signedMinor,available_credit_minor:minor,outstanding_minor:minor});
export const cashSession=z.strictObject({id,...scope,currency,status:z.enum(["OPEN","CLOSING_REVIEW","CLOSED"]),version:z.int().positive(),register_code:z.literal("MAIN").optional(),opening_cash_minor:minor.optional(),opened_by:id.optional(),opened_at:time.optional(),expected_cash_minor:signedMinor.nullable().optional(),counted_cash_minor:minor.nullable().optional(),difference_minor:signedMinor.nullable().optional(),close_basis_count:z.int().nullable().optional(),closed_by:id.nullable().optional(),closed_at:time.nullable().optional(),close_reason:z.string().nullable().optional(),current_expected_minor:signedMinor.optional(),cash_in_minor:minor.optional(),cash_out_minor:minor.optional()});
export const financeSummary=z.strictObject({service_charges_minor:signedMinor,retail_sales_minor:signedMinor,payments_minor:signedMinor,deposits_minor:signedMinor,refunds_minor:minor,expenses_minor:signedMinor.nullable(),open_client_balance_minor:signedMinor,payments_by_method:z.strictObject({method:paymentMethod,amount_minor:minor}).array().max(4)});
export const financeSnapshot=z.strictObject({...scope,day:z.iso.date(),timezone:z.string(),settings:z.strictObject({organization_id:id,currency,exponent:z.int().min(0).max(4),version:z.int().positive(),updated_by:id,updated_at:time}).nullable(),documents:financeDocument.array().max(100),allocations:paymentAllocation.array().max(200),ledger_entries:financeLedger.array().max(200),client_balances:clientBalance.array().max(50),cash_sessions:cashSession.array().max(20),summary:financeSummary,clients:z.strictObject({id,display_name:z.string()}).array().max(200),appointments:z.strictObject({id,client_id:id,service_name:z.string(),status:z.literal("COMPLETED"),currency:z.string(),quoted_total:z.string(),version:z.int().positive()}).array().max(100),stock_items:z.strictObject({id,display_name:z.string(),inventory_unit:z.enum(["GRAM","MILLILITER","UNIT"])}).array().max(200),offset:z.int().nonnegative()});
export type FinanceSnapshot=z.infer<typeof financeSnapshot>;
export const financeResult=z.strictObject({id,status:z.literal("SAVED")});
export const financeError=z.strictObject({code:z.enum(["UNAUTHENTICATED","SESSION_EXPIRED","FORBIDDEN","MEMBERSHIP_REQUIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID","VALIDATION_FAILED","NETWORK_ERROR","FINANCE_NOT_ENABLED","FINANCE_NOT_FOUND","FINANCE_CONFLICT","CURRENCY_UNSUPPORTED","CURRENCY_LOCKED","CURRENCY_MISMATCH","CURRENCY_PRECISION_REQUIRED","FINANCE_ALLOCATION_CONFLICT","FINANCE_REFUND_LIMIT","FINANCE_CHARGE_HAS_PAYMENTS","OVERPAYMENT_CONFIRM_REQUIRED","CASH_ALREADY_OPEN","CASH_NOT_OPEN","CASH_CLOSE_STALE","CASH_DIFFERENCE_ACK_REQUIRED","CASH_DATE_OUTSIDE_SESSION","CASH_HISTORY_CLOSED","SERVICE_NOT_COMPLETED","CLIENT_NOT_CURRENT","STOCK_NOT_ENABLED","STOCK_OPENING_REQUIRED","STOCK_LOT_REQUIRED","STOCK_LOT_CONFLICT","STOCK_INSUFFICIENT"]),message:z.string(),correlationId:id});
// Decimal input and display use BigInt, including JPY and KWD. No conversion or Number rounding.
export function parseMoney(value:string,exponent:number):string {if(!Number.isInteger(exponent)||exponent<0||exponent>4)throw Error("VALIDATION_FAILED");const s=value.trim().replace(",",".");if(!new RegExp(exponent===0?"^\\d+$":`^\\d+(?:\\.\\d{1,${exponent}})?$`).test(s)||exponent===0&&s.includes("."))throw Error("VALIDATION_FAILED");const [whole,fraction=""]=s.split(".");return minor.parse((BigInt(whole!)*10n**BigInt(exponent)+BigInt(fraction.padEnd(exponent,"0")||"0")).toString());}
export function formatMoney(value:string,code:string,exponent:number){const n=BigInt(value),negative=n<0n,abs=negative?-n:n,scale=10n**BigInt(exponent),whole=(abs/scale).toLocaleString("tr-TR"),fraction=exponent?","+(abs%scale).toString().padStart(exponent,"0"):"";return `${negative?"âˆ’":""}${whole}${fraction} ${code}`;}
