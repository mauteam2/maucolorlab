package com.elifora.app.data.salon

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.salon.*
import java.time.OffsetDateTime
import java.util.UUID
import org.json.JSONObject

class SupabaseAppointmentReadinessRepository(private val rpc: suspend (String) -> HttpReply) : AppointmentReadinessRepository {
    override suspend fun read(appointmentId: String, membershipId: String, locationId: String): AppointmentReadiness {
        val id = UUID.fromString(appointmentId).toString()
        val reply = rpc(JSONObject().put("p_appointment_id", id).put("p_membership_id", UUID.fromString(membershipId)).put("p_location_id", UUID.fromString(locationId)).toString())
        require(reply.status == 200)
        return parse(JSONObject(reply.body).getJSONObject("data"), id)
    }
    companion object {
        fun parse(row: JSONObject, expectedId: String): AppointmentReadiness {
            require(row.keys().asSequence().toSet() == setOf("schema_version", "appointment_id", "appointment_version", "evaluated_at", "preparation_status", "consultation_required", "strand_test_status", "allocated_minutes", "duration_source", "technical_clearance"))
            require(row.getInt("schema_version") == 1 && !row.getBoolean("technical_clearance"))
            require(row.get("technical_clearance") is Boolean && row.get("consultation_required") is Boolean)
            for (field in listOf("schema_version", "appointment_version", "allocated_minutes")) {
                val value = row.get(field)
                require(value is Number && value.toDouble().isFinite() && value.toDouble() == value.toLong().toDouble())
            }
            require(row.getString("duration_source") == "APPOINTMENT_ALLOCATION")
            val id = UUID.fromString(row.getString("appointment_id")).toString().also { require(it == expectedId) }
            val version = row.getLong("appointment_version").also { require(it > 0) }
            val minutes = row.getInt("allocated_minutes").also { require(it in 5..720) }
            return AppointmentReadiness(id, version, OffsetDateTime.parse(row.getString("evaluated_at")).toString(), PreparationStatus.valueOf(row.getString("preparation_status")), row.getBoolean("consultation_required"), StrandTestStatus.valueOf(row.getString("strand_test_status")), minutes)
        }
    }
}
