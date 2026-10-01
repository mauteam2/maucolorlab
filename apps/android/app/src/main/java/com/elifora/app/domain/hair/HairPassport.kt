package com.elifora.app.domain.hair

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.Client

enum class HairField { NATURAL_LEVEL, PERCEIVED_LEVEL, GREY_RATIO, THICKNESS, DENSITY, POROSITY, ELASTICITY, TONE, COSMETIC_COLOR_HISTORY, BLEACH_HISTORY, CHEMICAL_HISTORY }
enum class FactState { KNOWN, UNKNOWN, NOT_ASSESSED, NOT_APPLICABLE }
data class HairFact(val state: FactState, val value: String?)
data class HairTechnicalValues(val facts: Map<HairField, HairFact>, val technicalNotes: String?, val integrityNotes: String?)
enum class EvidenceSource { AI_ESTIMATE, PROFESSIONAL_VERIFIED, PHYSICAL_TEST, HISTORICAL, IMPORTED_UNVERIFIED }
data class HairEvidence(val source: EvidenceSource, val confidence: Double?, val verifiedBy: String?, val observedAt: String?, val context: String?)
data class HairObservation(val id: String, val regionId: String?, val recordedAt: String, val values: HairTechnicalValues, val evidence: HairEvidence)
enum class AssessmentState { NOT_ASSESSED, ASSESSED, UNVERIFIED }
data class HairAssessment(val state: AssessmentState, val values: HairTechnicalValues?, val evidence: HairEvidence?)
enum class RegionType { ROOT, MID_LENGTHS, ENDS, FACE_FRAME, CROWN, NAPE, BANDED_AREA, BLEACHED_AREA, HIGHLIGHTED_AREA, CUSTOM }
data class HairRegion(val id: String, val type: RegionType, val label: String?, val archived: Boolean, val assessment: HairAssessment)
enum class PhysicalTestType { POROSITY, ELASTICITY, STRAND }
data class HairPhysicalTest(val id: String, val regionId: String?, val type: PhysicalTestType, val result: HairFact, val performedAt: String, val performedBy: String, val notes: String?, val evidence: HairEvidence)
enum class HistoryCategory { COLOR, BLEACH_LIGHTENING, TONER_GLOSS, PERM, RELAXER_STRAIGHTENING, KERATIN_SMOOTHING, OTHER_CHEMICAL }
enum class HistoryDateState { EXACT, APPROXIMATE, UNKNOWN }
data class HairHistoryDate(val state: HistoryDateState, val value: String?)
data class HairHistoryEvent(val id: String, val category: HistoryCategory, val date: HairHistoryDate, val product: HairFact,
    val description: String, val regionIds: List<String>, val salon: String?, val professional: String?, val evidence: HairEvidence)
data class HairPage<T>(val items: List<T>, val offset: Int, val pageSize: Int, val hasMore: Boolean, val nextOffset: Int?)
data class HairPassport(val id: String, val clientId: String, val archived: Boolean, val updatedAt: String, val core: HairAssessment,
    val regions: List<HairRegion>, val observations: HairPage<HairObservation>, val tests: HairPage<HairPhysicalTest>, val history: HairPage<HairHistoryEvent>) {
    fun regionName(id: String?): HairRegion? = regions.firstOrNull { it.id == id }
}
data class HairOffsets(val observations: Int = 0, val tests: Int = 0, val history: Int = 0)
enum class HairPageKind { OBSERVATIONS, TESTS, HISTORY }
sealed interface HairReadResult {
    data class Snapshot(val passport: HairPassport) : HairReadResult
    data object Empty : HairReadResult
}
class HairFailure(val code: String, val correlationId: String? = null) : Exception(code)
fun interface HairPassportRepository { suspend fun read(context: ActiveTenantContext, client: Client, offsets: HairOffsets): HairReadResult }

sealed interface HairState {
    data object Closed : HairState
    data object Loading : HairState
    data class Ready(val client: Client, val passport: HairPassport) : HairState
    data class EmptyPassport(val client: Client) : HairState
    data class Error(val code: String, val correlationId: String?) : HairState
    data object Forbidden : HairState
    data object MembershipRevoked : HairState
    data object SessionExpired : HairState
}
