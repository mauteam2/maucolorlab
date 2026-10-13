package com.elifora.app.data.reporting

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.reporting.*
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.math.BigDecimal
import java.math.BigInteger
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.UUID

class SupabaseReportingRepository(private val snapshot: suspend (String) -> HttpReply,
    private val memberships: suspend () -> List<ActiveTenantContext>, private val userId: suspend () -> String) : ReportingRepository {
    override suspend fun load(context: ActiveTenantContext, filter: ReportFilter): ReportBundle {
        suspend fun verify(): ActiveTenantContext {
            val current = memberships().find { it.reference == context.reference && it.organizationId == context.organizationId && it.membershipStatus == "active" }
                ?: throw ClientFailure("MEMBERSHIP_REVOKED")
            if ("reports.read" !in current.permissions) throw ClientFailure("FORBIDDEN")
            return current
        }
        try {
            val before = verify(); val self = userId()
            val request = JSONObject().put("kind", filter.kind.name).put("period", filter.period.name)
            if (filter.period == ReportPeriodKind.CUSTOM) {
                require(filter.from != null && filter.until != null)
                val start = LocalDate.parse(filter.from); val end = LocalDate.parse(filter.until)
                require(ChronoUnit.DAYS.between(start, end) in 0..89)
                request.put("from", filter.from).put("until", filter.until)
            } else require(filter.from == null && filter.until == null)
            val reply = snapshot(JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId).put("p_request", request).toString())
            if (reply.status !in 200..299) throw ClientFailure(if (reply.status == 401) "SESSION_EXPIRED" else if (reply.status == 403) "FORBIDDEN" else "NETWORK_ERROR")
            val envelope = JSONObject(reply.body)
            if (envelope.has("code")) throw ClientFailure(envelope.getString("code"))
            val data = envelope.getJSONObject("data")
            require(UUID.fromString(data.getString("organization_id")).toString() == context.organizationId && UUID.fromString(data.getString("location_id")).toString() == context.locationId)
            require(data.getString("kind") == filter.kind.name)
            val selfOnly = context.role in setOf("colorist", "assistant")
            require(data.getBoolean("self_only") == selfOnly)
            val staff = if (data.isNull("staff_user_id")) null else UUID.fromString(data.getString("staff_user_id")).toString()
            require(!selfOnly || staff == self)
            val allowed = mutableSetOf<String>()
            if ("salon.read" in before.permissions) allowed.add("APPOINTMENT")
            if (!selfOnly && "crm.read" in before.permissions) allowed.add("CLIENT")
            if (!selfOnly && "finance.view" in before.permissions) allowed.add("REVENUE")
            if (!selfOnly && "cost.view" in before.permissions) allowed.add("COST")
            if ((if (selfOnly) "commission.view_self" else "commission.view_all") in before.permissions) allowed.add("COMMISSION")
            if (!selfOnly && "finance.expense.view" in before.permissions) allowed.add("EXPENSE")
            if (!selfOnly && "finance.cash.close" in before.permissions) allowed.add("CASH")
            if (!selfOnly && "stock.view" in before.permissions) allowed.addAll(setOf("STOCK_ITEM", "STOCK_MOVEMENT"))
            if ("live_session.view" in before.permissions && "crm.notes.technical" in before.permissions) allowed.add("LIVE")
            val rows = data.getJSONArray("metrics"); require(rows.length() <= 100)
            fun decimal(r: JSONObject, key: String): BigDecimal? {
                if (r.isNull(key)) return null
                require(r.get(key) is String)
                val text = r.getString(key); require(text.matches(Regex("-?[0-9]{1,40}(\\.[0-9]+)?")))
                return BigDecimal(text)
            }
            val metrics = (0 until rows.length()).map { index ->
                val row = rows.getJSONObject(index); val name = row.getString("name"); val unit = row.getString("unit")
                val value = decimal(row, "value"); require((row.getString("status") == "KNOWN") == (value != null))
                require(row.getString("source_domain") in allowed)
                require(unit in setOf("COUNT", "MONEY", "BPS", "MINUTES", "GRAM", "MILLILITER", "UNIT"))
                require(unit != "MONEY" || value == null || value.stripTrailingZeros().scale() <= 0)
                require("COST" in allowed || !(name.contains("cost") || name.contains("contribution") || name.contains("coverage")))
                ReportMetric(name, value, unit, decimal(row, "denominator"), row.getString("source_domain"))
            }
            val p = data.getJSONObject("period"); require(p.getString("kind") == filter.period.name)
            ZoneId.of(p.getString("timezone"))
            for (key in listOf("start", "end", "previous_start", "previous_end")) OffsetDateTime.parse(p.getString(key))
            require(OffsetDateTime.parse(p.getString("end")).isAfter(OffsetDateTime.parse(p.getString("start"))))
            val f = data.getJSONObject("freshness"); require(f.getString("status") in setOf("CURRENT", "PENDING", "STALE_CALENDAR") && f.getInt("metric_version") == 1)
            OffsetDateTime.parse(f.getString("updated_at")); require(f.get("pending_events") is String)
            val pending = BigInteger(f.getString("pending_events")); require(pending.signum() >= 0)
            if (verify().permissions != before.permissions || userId() != self) throw ClientFailure("TENANT_CONTEXT_INVALID")
            return ReportBundle(filter.kind, selfOnly, staff, data.getString("currency"), ReportDates(p.getString("timezone"), p.getString("start"), p.getString("end"), p.getString("previous_start"), p.getString("previous_end")),
                ReportFreshness(f.getString("status"), f.getString("updated_at"), pending, 1), metrics)
        } catch (failure: ClientFailure) { throw failure }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { throw ClientFailure("NETWORK_ERROR") }
    }
}
