package com.elifora.app.data.finance

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.finance.*
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.math.BigInteger
import java.util.UUID

class SupabaseFinanceRepository(private val snapshot: suspend (String) -> HttpReply,
    private val memberships: suspend () -> List<ActiveTenantContext>) : FinanceRepository {
    private suspend fun verify(context: ActiveTenantContext): ActiveTenantContext {
        val fresh = memberships().find { it.reference == context.reference && it.organizationId == context.organizationId && it.membershipStatus == "active" } ?: throw ClientFailure("MEMBERSHIP_REVOKED")
        if ("finance.view" !in fresh.permissions) throw ClientFailure("FORBIDDEN")
        return fresh
    }
    override suspend fun load(context: ActiveTenantContext, clientId: String?, appointmentId: String?): FinanceBundle {
        val correlation = UUID.randomUUID().toString()
        try {
            val fresh = verify(context)
            val request = JSONObject()
            if (clientId != null) request.put("client_id", UUID.fromString(clientId).toString())
            if (appointmentId != null) request.put("appointment_id", UUID.fromString(appointmentId).toString())
            val reply = snapshot(JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId).put("p_request", request).toString())
            if (reply.status !in 200..299) throw ClientFailure(if (reply.status == 401) "SESSION_EXPIRED" else if (reply.status == 403) "FORBIDDEN" else "NETWORK_ERROR", correlation)
            val response = JSONObject(reply.body)
            if (response.has("code")) throw ClientFailure(response.getString("code"), correlation)
            val data = response.getJSONObject("data")
            fun id(row: JSONObject, key: String) = UUID.fromString(row.getString(key)).toString()
            fun scope(row: JSONObject) { require(id(row, "organization_id") == context.organizationId && id(row, "location_id") == context.locationId) }
            scope(data)
            val enabled = !data.isNull("settings")
            val settings = if (enabled) data.getJSONObject("settings") else null
            if (settings != null) require(id(settings, "organization_id") == context.organizationId)
            val currency = settings?.getString("currency") ?: "TRY"
            val exponent = settings?.getInt("exponent") ?: 2
            fun money(row: JSONObject, key: String): Money {
                require(row.get(key) is String)
                val raw = row.getString(key)
                require(raw.matches(Regex("-?(0|[1-9][0-9]{0,18})")))
                return Money(currency, BigInteger(raw), exponent)
            }
            val summary = data.getJSONObject("summary")
            val totals = FinanceSummary(money(summary, "service_charges_minor"), money(summary, "payments_minor"), money(summary, "deposits_minor"), money(summary, "refunds_minor"),
                if ("finance.expense.view" in fresh.permissions && !summary.isNull("expenses_minor")) money(summary, "expenses_minor") else null)
            val clients = data.getJSONArray("client_balances").let { rows -> require(rows.length() <= 50); List(rows.length()) { n -> rows.getJSONObject(n).let { r ->
                ClientBalance(id(r, "client_id"), r.getString("display_name"), money(r, "balance_minor"), money(r, "available_credit_minor"), money(r, "outstanding_minor"))
            } } }
            val appointments = data.getJSONArray("documents").let { rows -> require(rows.length() <= 100); List(rows.length()) { rows.getJSONObject(it) }.mapNotNull { r ->
                scope(r)
                require(r.getString("currency") == currency)
                if (r.isNull("appointment_id") || r.getString("type") != "SERVICE_CHARGE") null else {
                    val identifier = id(r, "appointment_id"); require(appointmentId == null || identifier == appointmentId)
                    AppointmentPaymentState(identifier, id(r, "id"), money(r, "amount_minor"), if (r.isNull("outstanding_minor")) null else money(r, "outstanding_minor"), money(r, "refunded_minor"), r.getBoolean("reversed"))
                }
            } }
            val cash = data.getJSONArray("cash_sessions").let { rows -> require(rows.length() <= 20); List(rows.length()) { n -> rows.getJSONObject(n).let { r ->
                scope(r)
                val status = r.getString("status"); require(status in setOf("OPEN", "CLOSING_REVIEW", "CLOSED"))
                val canClose = "finance.cash.close" in fresh.permissions
                CashSessionStatus(id(r, "id"), status, if (canClose && r.has("current_expected_minor")) money(r, "current_expected_minor") else null,
                    if (canClose && !r.isNull("counted_cash_minor")) money(r, "counted_cash_minor") else null, if (canClose && !r.isNull("difference_minor")) money(r, "difference_minor") else null)
            } } }
            val after = verify(context)
            if (after.permissions != fresh.permissions) throw ClientFailure("TENANT_CONTEXT_INVALID", correlation)
            return FinanceBundle(enabled, totals, clients, appointments, cash)
        } catch (failure: ClientFailure) { throw failure }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { throw ClientFailure("NETWORK_ERROR", correlation) }
    }
}
