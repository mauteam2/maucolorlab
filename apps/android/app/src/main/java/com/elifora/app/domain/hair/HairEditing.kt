package com.elifora.app.domain.hair

import java.util.UUID
import java.time.LocalDate
import java.time.ZoneOffset

enum class HairAction(val permission: String) {
    CREATE("hair_passport.create"), CORE("hair_passport.update"), REGION_CREATE("hair_passport.update"), REGION_EDIT("hair_passport.update"), OBSERVATION("hair_passport.add_observation"),
    TEST("hair_passport.add_test"), HISTORY("hair_passport.add_history");
}
val specializedRegionTypes = RegionType.entries.filter { it !in listOf(RegionType.ROOT, RegionType.MID_LENGTHS, RegionType.ENDS) }
data class FieldDraft(val state: FactState = FactState.NOT_ASSESSED, val raw: String = "")
enum class HairNote { TECHNICAL, INTEGRITY }
data class TechnicalDraft(val fields: Map<HairField, FieldDraft>, val technicalNotes: String = "", val integrityNotes: String = "") {
    companion object {
        fun from(assessment: HairAssessment?) = TechnicalDraft(HairField.entries.associateWith { field ->
            val fact = assessment?.values?.facts?.get(field)
            val raw = fact?.value.orEmpty()
            FieldDraft(fact?.state ?: FactState.NOT_ASSESSED,
                if (field == HairField.GREY_RATIO && fact?.state == FactState.KNOWN) (raw.toDouble() * 100).toString() else raw)
        }, assessment?.values?.technicalNotes.orEmpty(), assessment?.values?.integrityNotes.orEmpty())
    }
    fun patch(initial: TechnicalDraft): TechnicalPatch {
        val facts = fields.filter { (field, value) -> value != initial.fields[field] }.mapValues { (field, value) -> value.fact(field) }
        val notes = buildMap<HairNote, String?> {
            if (technicalNotes != initial.technicalNotes) { checkDraft(technicalNotes.length <= 4000, "notes"); put(HairNote.TECHNICAL, technicalNotes.trim().ifBlank { null }) }
            if (integrityNotes != initial.integrityNotes) { checkDraft(integrityNotes.length <= 2000, "notes"); put(HairNote.INTEGRITY, integrityNotes.trim().ifBlank { null }) }
        }
        return TechnicalPatch(facts, notes)
    }
}
data class TechnicalPatch(val facts: Map<HairField, HairFact> = emptyMap(), val notes: Map<HairNote, String?> = emptyMap()) {
    val isEmpty get() = facts.isEmpty() && notes.isEmpty()
}
fun HairField.choices(): List<String> = when (this) {
    HairField.THICKNESS -> listOf("FINE", "MEDIUM", "COARSE")
    HairField.DENSITY, HairField.POROSITY -> listOf("LOW", "MEDIUM", "HIGH")
    HairField.ELASTICITY -> listOf("LOW", "NORMAL", "HIGH")
    else -> emptyList()
}
fun HairField.states() = FactState.entries.filter { it != FactState.NOT_APPLICABLE || this !in listOf(HairField.NATURAL_LEVEL, HairField.PERCEIVED_LEVEL) }
class HairDraftFailure(val field: String) : Exception(field)
internal fun checkDraft(valid: Boolean, field: String) { if (!valid) throw HairDraftFailure(field) }
fun FieldDraft.fact(field: HairField): HairFact {
    checkDraft(state in field.states(), "state")
    if (state != FactState.KNOWN) return HairFact(state, null)
    val value = raw.trim()
    checkDraft(value.isNotBlank(), "value")
    val parsed = when (field) {
        HairField.NATURAL_LEVEL, HairField.PERCEIVED_LEVEL, HairField.GREY_RATIO -> {
            val number = value.replace(',', '.').toDoubleOrNull()
            checkDraft(number != null && number.isFinite() && number in (if (field == HairField.GREY_RATIO) 0.0..100.0 else 1.0..10.0), "value")
            (if (field == HairField.GREY_RATIO) number!! / 100 else number!!).toString()
        }
        else -> {
            checkDraft(value.length <= if (field == HairField.TONE) 120 else 2000, "value")
            if (field.choices().isNotEmpty()) checkDraft(value in field.choices(), "value")
            value
        }
    }
    return HairFact(state, parsed)
}
sealed interface HairDraft {
    val action: HairAction
    data class Core(override val action: HairAction, val initial: TechnicalDraft, val values: TechnicalDraft,
        val version: Long? = null, val regionId: String? = null, val initialLabel: String = "", val label: String = "",
        val regionType: RegionType? = null) : HairDraft
    data class NewRegion(val type: RegionType = RegionType.CUSTOM, val label: String = "") : HairDraft { override val action = HairAction.REGION_CREATE }
    data class Observation(val version: Long, val field: HairField = HairField.NATURAL_LEVEL, val value: FieldDraft = FieldDraft(FactState.KNOWN),
        val regionId: String? = null, val attested: Boolean = false, val confidence: String = "") : HairDraft { override val action = HairAction.OBSERVATION }
    data class Test(val type: PhysicalTestType = PhysicalTestType.POROSITY, val state: FactState = FactState.KNOWN, val value: String = "",
        val regionId: String? = null, val notes: String = "") : HairDraft { override val action = HairAction.TEST }
    data class History(val category: HistoryCategory = HistoryCategory.COLOR, val dateState: HistoryDateState = HistoryDateState.UNKNOWN,
        val date: String = "", val productState: FactState = FactState.UNKNOWN, val product: String = "", val description: String = "",
        val regionIds: Set<String> = emptySet(), val source: EvidenceSource = EvidenceSource.HISTORICAL, val context: String = "",
        val confidence: String = "", val salon: String = "", val professional: String = "") : HairDraft { override val action = HairAction.HISTORY }
}
sealed interface HairWrite {
    val action: HairAction
    data class Core(override val action: HairAction, val technical: TechnicalPatch, val version: Long?,
        val regionId: String?, val regionType: RegionType?, val label: String?, val includeLabel: Boolean) : HairWrite
    data class Observation(val version: Long, val regionId: String?, val technical: TechnicalPatch, val confidence: Double?) : HairWrite { override val action = HairAction.OBSERVATION }
    data class Test(val type: PhysicalTestType, val result: HairFact, val regionId: String?, val notes: String?) : HairWrite { override val action = HairAction.TEST }
    data class History(val category: HistoryCategory, val date: HairHistoryDate, val product: HairFact, val description: String,
        val regionIds: Set<String>, val source: EvidenceSource, val context: String?, val confidence: Double?, val salon: String?, val professional: String?) : HairWrite { override val action = HairAction.HISTORY }
}
data class HairCommand(val clientId: String, val write: HairWrite, val requestId: String = UUID.randomUUID().toString())
fun HairDraft.write(): HairWrite = when (this) {
    is HairDraft.Core -> {
        val patch = values.patch(initial)
        val labelChanged = action == HairAction.REGION_EDIT && label != initialLabel
        checkDraft(label.length <= 120 && (regionType != RegionType.CUSTOM || label.isNotBlank()), "label")
        checkDraft(action == HairAction.CREATE || !patch.isEmpty || labelChanged, "changes")
        HairWrite.Core(action, patch, version, regionId, regionType, label.trim().ifBlank { null }, labelChanged)
    }
    is HairDraft.NewRegion -> {
        checkDraft(type in specializedRegionTypes, "region")
        checkDraft(label.length <= 120 && (type != RegionType.CUSTOM || label.isNotBlank()), "label")
        HairWrite.Core(action, TechnicalPatch(), null, null, type, label.trim().ifBlank { null }, label.isNotBlank())
    }
    is HairDraft.Observation -> {
        checkDraft(attested, "attestation")
        HairWrite.Observation(version, regionId, TechnicalPatch(mapOf(field to value.fact(field))), confidence.percentage())
    }
    is HairDraft.Test -> {
        checkDraft(state in resultStates, "result")
        val raw = value.trim()
        checkDraft(state != FactState.KNOWN || (raw.isNotBlank() && raw.length <= 1000), "result")
        if (state == FactState.KNOWN && type.choices().isNotEmpty()) checkDraft(raw in type.choices(), "result")
        checkDraft(notes.length <= 2000, "notes")
        HairWrite.Test(type, HairFact(state, raw.takeIf { state == FactState.KNOWN }), regionId, notes.trim().ifBlank { null })
    }
    is HairDraft.History -> {
        checkDraft(productState in resultStates, "product")
        val productValue = product.trim()
        checkDraft(productState != FactState.KNOWN || (productValue.isNotBlank() && productValue.length <= 500), "product")
        checkDraft(description.isNotBlank() && description.length <= 2000, "description")
        checkDraft(regionIds.size <= 100, "region")
        checkDraft(source in listOf(EvidenceSource.HISTORICAL, EvidenceSource.IMPORTED_UNVERIFIED), "source")
        checkDraft(context.length <= 2000 && salon.length <= 160 && professional.length <= 160, "notes")
        val dateValue = if (dateState == HistoryDateState.UNKNOWN) null else {
            val parsed = runCatching { LocalDate.parse(date) }.getOrNull()
            checkDraft(parsed != null && parsed.toString() == date && parsed >= LocalDate.of(1900, 1, 1) && parsed <= LocalDate.now(ZoneOffset.UTC), "date")
            date
        }
        HairWrite.History(category, HairHistoryDate(dateState, dateValue), HairFact(productState, productValue.takeIf { productState == FactState.KNOWN }),
            description.trim(), regionIds, source, context.trim().ifBlank { null }, confidence.percentage(), salon.trim().ifBlank { null }, professional.trim().ifBlank { null })
    }
}
val resultStates = listOf(FactState.KNOWN, FactState.UNKNOWN, FactState.NOT_APPLICABLE)
fun PhysicalTestType.choices() = when (this) {
    PhysicalTestType.POROSITY -> listOf("LOW", "MEDIUM", "HIGH")
    PhysicalTestType.ELASTICITY -> listOf("LOW", "NORMAL", "HIGH")
    PhysicalTestType.STRAND -> emptyList()
}
private fun String.percentage(): Double? = if (isBlank()) null else replace(',', '.').toDoubleOrNull().also {
    checkDraft(it != null && it.isFinite() && it in 0.0..100.0, "confidence")
}!! / 100
sealed interface HairEditStatus {
    data object Editing : HairEditStatus
    data object Saving : HairEditStatus
    data class ValidationError(val field: String) : HairEditStatus
    data class Conflict(val code: String) : HairEditStatus
    data class NetworkError(val correlationId: String?) : HairEditStatus
}
fun interface HairMutationRepository { suspend fun mutate(context: com.elifora.app.domain.auth.ActiveTenantContext, command: HairCommand) }
