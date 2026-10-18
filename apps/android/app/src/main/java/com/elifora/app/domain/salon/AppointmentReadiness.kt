package com.elifora.app.domain.salon

enum class PreparationStatus { NOT_REQUIRED, CONSULTATION_REQUIRED, REVIEW_REQUIRED }
enum class StrandTestStatus { UNKNOWN, NOT_REQUIRED }
data class AppointmentReadiness(
    val appointmentId: String, val appointmentVersion: Long, val evaluatedAt: String,
    val preparationStatus: PreparationStatus, val consultationRequired: Boolean,
    val strandTestStatus: StrandTestStatus, val allocatedMinutes: Int,
) {
    // Operational preparation never authorizes a chemical procedure.
    val technicalClearance: Boolean get() = false
}
fun interface AppointmentReadinessRepository {
    suspend fun read(appointmentId: String, membershipId: String, locationId: String): AppointmentReadiness
}
