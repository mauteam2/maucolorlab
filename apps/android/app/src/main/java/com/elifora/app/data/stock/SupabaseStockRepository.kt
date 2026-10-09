package com.elifora.app.data.stock

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.stock.*
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

class SupabaseStockRepository(private val snapshot: suspend (String) -> HttpReply,
    private val memberships: suspend () -> List<ActiveTenantContext>) : StockRepository {
    private suspend fun verify(context: ActiveTenantContext) {
        val fresh = memberships().find { it.reference == context.reference && it.organizationId == context.organizationId && it.membershipStatus == "active" }
            ?: throw ClientFailure("MEMBERSHIP_REVOKED")
        if ("stock.view" !in fresh.permissions) throw ClientFailure("FORBIDDEN")
    }
    override suspend fun load(context: ActiveTenantContext, itemId: String?, query: String, offset: Int): StockBundle {
        val correlation = UUID.randomUUID().toString()
        try {
            require(query.length <= 80 && offset in 0..10000)
            val requested = itemId?.let { UUID.fromString(it).toString() }
            verify(context)
            val q = JSONObject().put("query", query).put("offset", offset)
            if (requested != null) q.put("item_id", requested)
            val reply = snapshot(JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId).put("p_request", q).toString())
            if (reply.status !in 200..299) throw ClientFailure(if (reply.status == 401) "SESSION_EXPIRED" else if (reply.status == 403) "FORBIDDEN" else "NETWORK_ERROR", correlation)
            val response = JSONObject(reply.body)
            if (response.has("code")) {
                val code = response.getString("code")
                throw ClientFailure(if (code in setOf("UNAUTHENTICATED", "SESSION_EXPIRED", "FORBIDDEN", "MEMBERSHIP_REQUIRED", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID", "STOCK_NOT_FOUND", "VALIDATION_FAILED")) code else "NETWORK_ERROR", correlation)
            }
            val data = response.getJSONObject("data")
            fun id(row: JSONObject, key: String) = UUID.fromString(row.getString(key)).toString()
            fun scope(row: JSONObject) { require(id(row, "organization_id") == context.organizationId && id(row, "location_id") == context.locationId) }
            val items = data.getJSONArray("items").let { rows -> require(rows.length() <= 50); List(rows.length()) { n -> rows.getJSONObject(n).let { row ->
                scope(row)
                val identifier = id(row, "id"); require(requested == null || identifier == requested)
                val source = row.getString("source"); require(source in setOf("GLOBAL_VERIFIED_CATALOG", "SALON_VERIFIED_PRODUCT", "SALON_CUSTOM_OPERATIONAL_PRODUCT"))
                val sync = row.getString("stock_sync_status"); require(sync in setOf("CURRENT", "RETRY_REQUIRED"))
                StockItem(identifier, row.getString("display_name").also { require(it.length in 1..160) }, if (row.isNull("sku")) null else row.getString("sku"), StockUnit.valueOf(row.getString("inventory_unit")),
                    if (row.isNull("on_hand")) null else BigDecimal(row.get("on_hand").toString()), StockStatus.valueOf(row.getString("stock_status")), sync == "RETRY_REQUIRED", source)
            } } }
            val movements = data.getJSONArray("movements").let { rows -> require(rows.length() <= 100); List(rows.length()) { n -> rows.getJSONObject(n).let { row ->
                scope(row)
                val item = id(row, "stock_item_id"); require(requested == null || item == requested)
                val type = row.getString("movement_type"); require(type in setOf("OPENING", "RECEIPT", "USAGE", "CORRECTION", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "REVERSAL", "TRANSFER_IN", "TRANSFER_OUT"))
                StockMovement(id(row, "id"), item, type, BigDecimal(row.get("quantity_delta").toString()).also { require(it.signum() != 0) }, StockUnit.valueOf(row.getString("unit")), OffsetDateTime.parse(row.getString("occurred_at")).toString(), row.getString("reason"))
            } } }
            if (!data.isNull("settings")) scope(data.getJSONObject("settings"))
            val monitoring = data.getJSONObject("monitoring")
            val total = data.getInt("total_items").also { require(it >= 0) }
            require(data.getInt("offset") == offset)
            val pending = monitoring.getInt("pending").also { require(it >= 0) }
            val failed = monitoring.getInt("failed").also { require(it >= 0) }
            verify(context)
            return StockBundle(items, movements, total, offset, !data.isNull("settings"), pending, failed)
        } catch (failure: ClientFailure) { throw failure }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { throw ClientFailure("NETWORK_ERROR", correlation) }
    }
}
