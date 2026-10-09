import { z } from "zod";
const id=z.uuid(), time=z.iso.datetime({offset:true}), version=z.int().nonnegative();
// Decimal minor units: validation never permits persistence to round user input.
export const stockQuantity=z.number().finite().min(0).max(9999999999.99).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001);
export const stockUnit=z.enum(["GRAM","MILLILITER","UNIT"]);
export const stockSource=z.enum(["GLOBAL_VERIFIED_CATALOG","SALON_VERIFIED_PRODUCT","SALON_CUSTOM_OPERATIONAL_PRODUCT"]);
export const stockProductType=z.enum(["COLOR","DEVELOPER","LIGHTENER","TONER","CORRECTOR","TREATMENT","SHAMPOO","CONDITIONER","RETAIL","DISPOSABLE","OTHER"]);
const reason=z.string().trim().min(1).max(2000), base={mutation_id:id}, scope={organization_id:id,location_id:id};
export const stockDefinition=z.strictObject({source:stockSource,catalog_product_id:id.nullable(),product_type:stockProductType,display_name:z.string().trim().min(1).max(160),sku:z.string().max(80).nullable(),barcode:z.string().max(80).nullable(),inventory_unit:stockUnit,active:z.boolean(),track_quantity:z.boolean(),lot_required:z.boolean(),low_threshold:stockQuantity.nullable()}).refine(d=>(d.source==="SALON_CUSTOM_OPERATIONAL_PRODUCT")===(d.catalog_product_id===null)).refine(d=>d.inventory_unit!=="UNIT"||d.low_threshold===null||Number.isInteger(d.low_threshold));
const lotDefinition={stock_item_id:id,lot_number:z.string().trim().min(1).max(80),batch_number:z.string().max(80).nullable(),expiry_date:z.iso.date().nullable(),opened_at:time.nullable(),received_at:time};
const movement={...base,stock_item_id:id,lot_id:id.nullable(),quantity:stockQuantity,unit:stockUnit,occurred_at:time,reference:z.string().max(160).nullable(),reason};
const moveCommand=(type:"OPENING"|"RECEIPT"|"ADJUSTMENT_IN"|"ADJUSTMENT_OUT")=>z.strictObject({...movement,type:z.literal(type)}).refine(c=>(type==="OPENING"||c.quantity>0)&&(c.unit!=="UNIT"||Number.isInteger(c.quantity)));
export const stockCommand=z.discriminatedUnion("type",[
 z.strictObject({...base,type:z.literal("ENABLE"),reason}),
 z.strictObject({...base,type:z.literal("POLICY"),negative_policy:z.enum(["BLOCK_NEGATIVE","WARN_NEGATIVE"]),expected_version:version,reason}),
 z.strictObject({...base,type:z.literal("ITEM_SAVE"),id,expected_version:version,definition:stockDefinition,reason}),
 z.strictObject({...base,type:z.literal("LOT_SAVE"),id,expected_version:version,...lotDefinition,reason}),
 moveCommand("OPENING"),moveCommand("RECEIPT"),moveCommand("ADJUSTMENT_IN"),moveCommand("ADJUSTMENT_OUT"),
 z.strictObject({...base,type:z.literal("REVERSAL"),movement_id:id,reason}),
 z.strictObject({...base,type:z.literal("PROCESS"),event_id:id,lot_id:id.nullable()}),
 z.strictObject({...base,type:z.literal("PROCESS_BATCH"),limit:z.int().min(1).max(20)}),
 z.strictObject({...base,type:z.literal("COUNT_CREATE"),id,lines:z.strictObject({stock_item_id:id,lot_id:id.nullable(),counted_quantity:stockQuantity}).array().min(1).max(50).refine(lines=>new Set(lines.map(l=>l.stock_item_id+":"+l.lot_id)).size===lines.length),reason}),
 z.strictObject({...base,type:z.literal("COUNT_CONFIRM"),id,reason}),
]);
export type StockCommand=z.infer<typeof stockCommand>;
export const stockReadRequest=z.strictObject({query:z.string().max(80).optional(),offset:z.int().min(0).max(10000).optional(),item_id:id.optional(),lot_id:id.optional(),catalog_product_id:id.optional()});
export const stockItem=stockDefinition.safeExtend({id,...scope,catalog_series_id:id.nullable(),version:z.int().positive(),created_by:id,updated_by:id,created_at:time,updated_at:time,on_hand:z.number().finite().nullable(),stock_status:z.enum(["OK","LOW","OUT","UNKNOWN"]),stock_sync_status:z.enum(["CURRENT","RETRY_REQUIRED"])});
export const stockLot=z.strictObject({id,...scope,...lotDefinition,version:z.int().positive(),created_by:id,updated_by:id,on_hand:z.number().nullable(),expiry_status:z.enum(["EXPIRED","EXPIRING_SOON","UNKNOWN_OR_CURRENT"])});
export const stockMovement=z.strictObject({id,...scope,stock_item_id:id,stock_lot_id:id.nullable(),movement_type:z.enum(["OPENING","RECEIPT","USAGE","CORRECTION","ADJUSTMENT_IN","ADJUSTMENT_OUT","REVERSAL","TRANSFER_IN","TRANSFER_OUT"]),quantity_delta:z.number().finite().refine(n=>n!==0),unit:stockUnit,source_event_id:id.nullable(),source_client_id:id.nullable(),source_session_id:id.nullable(),source_bowl_id:id.nullable(),source_product_id:id.nullable(),reversal_of:id.nullable(),transfer_id:id.nullable(),reason,reference:z.string().nullable(),recorded_by:id,recorded_by_name:z.string().max(120).nullable(),occurred_at:time,created_at:time,correlation_id:id,mutation_id:id});
export const stockEvent=z.strictObject({id,...scope,session_id:id,client_id:id,bowl_id:id,product_id:id,source_domain:z.enum(["LIVE_USAGE","MATERIAL_RECONCILIATION","LIVE_TERMINAL"]),source_event_id:id,usage_id:id.nullable(),reconciliation_id:id.nullable(),status:z.enum(["PENDING","PROCESSED","FAILED"]),error_code:z.string().nullable(),attempts:z.int().nonnegative(),created_at:time,processed_at:time.nullable()});
export const stockCount=z.strictObject({id,...scope,status:z.enum(["DRAFT","CONFIRMED"]),reason,created_by:id,created_at:time,confirmed_by:id.nullable(),confirmed_at:time.nullable(),lines:z.strictObject({count_id:id,...scope,stock_item_id:id,stock_lot_id:id.nullable(),ledger_quantity:z.number(),counted_quantity:stockQuantity}).array().min(1).max(50)});
export const stockAction=z.strictObject({key:z.string().max(100),kind:z.enum(["LOW_STOCK","OUT_OF_STOCK","USAGE_RECONCILIATION_REQUIRED","UNIT_MAPPING_REQUIRED","PRODUCT_MAPPING_REQUIRED","EXPIRING_SOON","EXPIRED","STOCK_SYNC_FAILED"]),source_domain:z.enum(["stock_item","stock_source_event","stock_lot"]),source_id:id,...scope,state:z.literal("OPEN"),error_code:z.string().nullable()});
export const stockSnapshot=z.strictObject({actions:stockAction.array().max(200),settings:z.strictObject({...scope,enabled_at:time,negative_policy:z.enum(["BLOCK_NEGATIVE","WARN_NEGATIVE"]),version:z.int().positive(),updated_by:id}).nullable(),items:stockItem.array().max(50),offset:z.int().nonnegative(),total_items:z.int().nonnegative(),lots:stockLot.array().max(100),movements:stockMovement.array().max(100),events:stockEvent.array().max(100),counts:stockCount.array().max(20),monitoring:z.strictObject({active_items:z.int().nonnegative(),low_items:z.int().nonnegative(),out_items:z.int().nonnegative(),expiring_lots:z.int().nonnegative(),pending:z.int().nonnegative(),failed:z.int().nonnegative(),unreconciled:z.int().nonnegative()}),catalog_options:z.strictObject({id,name:z.string(),manufacturer_code:z.string().nullable(),product_type:z.string(),source:stockSource}).array().max(500),trace:z.strictObject({session_id:id,client_id:id,appointment_id:id.nullable()}).array().max(100).optional()});
export type StockSnapshot=z.infer<typeof stockSnapshot>;
export const stockResult=z.strictObject({id,status:z.enum(["SAVED","PROCESSED","FAILED"]),error_code:z.string().optional()});
export const stockError=z.strictObject({code:z.enum(["UNAUTHENTICATED","SESSION_EXPIRED","FORBIDDEN","MEMBERSHIP_REQUIRED","MEMBERSHIP_REVOKED","TENANT_CONTEXT_INVALID","VALIDATION_FAILED","NETWORK_ERROR","STOCK_NOT_FOUND","STOCK_CONFLICT","STOCK_NOT_ENABLED","STOCK_MAPPING_IMMUTABLE","STOCK_PRODUCT_MAPPING_REQUIRED","UNIT_CONVERSION_REQUIRED","STOCK_OPENING_REQUIRED","STOCK_USAGE_RECONCILIATION_REQUIRED","STOCK_LOT_REQUIRED","STOCK_LOT_CONFLICT","STOCK_INSUFFICIENT","STOCK_COUNT_STALE","STOCK_SOURCE_IMMUTABLE"]),message:z.string(),correlationId:id});
export function stockPermission(type:StockCommand["type"]) {return ["ENABLE","POLICY","ITEM_SAVE"].includes(type)?"stock.manage_items":type==="LOT_SAVE"?"stock.manage_lots":["OPENING","RECEIPT"].includes(type)?"stock.receive":["COUNT_CREATE","COUNT_CONFIRM"].includes(type)?"stock.count":"stock.adjust";}

// Named shared views use the same runtime fields and command validators.
export const stockBalance=z.strictObject({id:stockItem.shape.id,...scope,inventory_unit:stockUnit,on_hand:stockItem.shape.on_hand,stock_status:stockItem.shape.stock_status,stock_sync_status:stockItem.shape.stock_sync_status});
export const stockReceipt=moveCommand("RECEIPT");
export const stockAdjustment=z.discriminatedUnion("type",[moveCommand("ADJUSTMENT_IN"),moveCommand("ADJUSTMENT_OUT")]);
export const stockCountLine=stockCount.shape.lines.element;
export const stockSignal=stockAction;
export const stockSourceStatus=stockEvent.shape.status;
