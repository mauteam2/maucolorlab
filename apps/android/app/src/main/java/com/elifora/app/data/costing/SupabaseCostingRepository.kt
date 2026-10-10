package com.elifora.app.data.costing

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.costing.*
import com.elifora.app.domain.finance.Money
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.math.BigInteger
import java.util.UUID

class SupabaseCostingRepository(private val snapshot: suspend (String) -> HttpReply,
    private val memberships: suspend () -> List<ActiveTenantContext>, private val userId: suspend () -> String) : CostingRepository {
    override suspend fun load(context: ActiveTenantContext, ownCommission: Boolean, chargeId: String?, offset: Int): CostingBundle {
        val permission = if (ownCommission) "commission.view_self" else "cost.view"
        suspend fun verify(): ActiveTenantContext {
            val current = memberships().find { it.reference == context.reference && it.organizationId == context.organizationId && it.membershipStatus == "active" } ?: throw ClientFailure("MEMBERSHIP_REVOKED")
            if (permission !in current.permissions) throw ClientFailure("FORBIDDEN")
            return current
        }
        try {
            require(offset in 0..10000)
            val before = verify()
            val self = userId()
            val query = JSONObject().put("kind", if (ownCommission) "COMMISSION_SELF" else "PROFITABILITY").put("offset", offset)
            if (chargeId != null) query.put("charge_id", UUID.fromString(chargeId).toString())
            val reply = snapshot(JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId).put("p_request", query).toString())
            if (reply.status !in 200..299) throw ClientFailure(if (reply.status == 401) "SESSION_EXPIRED" else if (reply.status == 403) "FORBIDDEN" else "NETWORK_ERROR")
            val envelope = JSONObject(reply.body)
            if (envelope.has("code")) throw ClientFailure(envelope.getString("code"))
            val data = envelope.getJSONObject("data")
            fun id(r: JSONObject, key: String) = UUID.fromString(r.getString(key)).toString()
            fun nullableId(r: JSONObject, key: String) = if (r.isNull(key)) null else id(r, key)
            fun scope(r: JSONObject) { require(id(r, "organization_id") == context.organizationId && id(r, "location_id") == context.locationId) }
            scope(data)
            require(data.getString("kind") == query.getString("kind") && data.getInt("offset") == offset)
            val rows = data.getJSONArray("items")
            require(rows.length() <= 50 && data.getInt("total") >= 0)
            fun money(r: JSONObject, key: String): Money {
                val code = r.getString("currency")
                val exponent = when (code) { "JPY" -> 0; "KWD" -> 3; "TRY", "EUR", "USD", "GBP" -> 2; else -> throw IllegalArgumentException() }
                require(r.get(key) is String)
                val raw = r.getString(key)
                require(raw.matches(Regex("-?(0|[1-9][0-9]{0,18})")))
                return Money(code, BigInteger(raw), exponent)
            }
            fun maybe(r: JSONObject, key: String) = if (r.isNull(key)) null else money(r, key)
            val commissions = mutableListOf<OwnCommission>()
            val profits = mutableListOf<ProfitabilityDetail>()
            for (n in 0 until rows.length()) {
                val r = rows.getJSONObject(n); scope(r)
                val source = id(r, "charge_id"); require(chargeId == null || source == chargeId)
                if (ownCommission) {
                    require(id(r, "staff_user_id") == self)
                    commissions.add(OwnCommission(id(r, "id"), source, id(r, "policy_id"), r.getLong("policy_version"), r.optString("service_name").takeIf { !r.isNull("service_name") }, r.getString("eligible_at"), money(r, "basis_minor"), money(r, "amount_minor"), money(r, "adjustment_minor"), money(r, "commission_net_minor")))
                } else {
                    val cost = CostStatus.valueOf(r.getString("cost_status"))
                    val status = ProfitabilityStatus.valueOf(r.getString("profitability_status"))
                    val complete = cost == CostStatus.KNOWN
                    val disclose = "commission.view_all" in before.permissions
                    require(r.getString("revenue_basis") == "NET_OF_TAX")
                    profits.add(ProfitabilityDetail(source, nullableId(r, "appointment_id"), r.optString("service_name").takeIf { !r.isNull("service_name") }, cost, status,
                        money(r, "gross_revenue_minor"), money(r, "net_revenue_minor"), money(r, "tax_revenue_minor"), if (complete) maybe(r, "direct_product_cost_minor") else null,
                        if (complete) maybe(r, "gross_contribution_minor") else null, if (disclose) maybe(r, "commission_minor") else null,
                        if (complete && disclose) maybe(r, "contribution_after_commission_minor") else null, if (complete && !r.isNull("margin_bps")) r.getInt("margin_bps") else null))
                }
            }
            if (verify().permissions != before.permissions || userId() != self) throw ClientFailure("TENANT_CONTEXT_INVALID")
            return CostingBundle(profits, commissions, offset, data.getInt("total"))
        } catch (failure: ClientFailure) { throw failure }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { throw ClientFailure("NETWORK_ERROR") }
    }
}
