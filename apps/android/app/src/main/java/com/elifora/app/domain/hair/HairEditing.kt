package com.elifora.app.domain.hair

import java.util.UUID

enum class HairAction(val permission: String) {
    CREATE("hair_passport.create"), CORE("hair_passport.update"), REGION_CREATE("hair_passport.update"), REGION_EDIT("hair_passport.update"), OBSERVATION("hair_passport.add_observation");
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
}
sealed interface HairWrite {
    val action: HairAction
    data class Core(override val action: HairAction, val technical: TechnicalPatch, val version: Long?,
        val regionId: String?, val regionType: RegionType?, val label: String?, val includeLabel: Boolean) : HairWrite
    data class Observation(val version: Long, val regionId: String?, val technical: TechnicalPatch, val confidence: Double?) : HairWrite { override val action = HairAction.OBSERVATION }
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
        val confidenceValue = if (confidence.isBlank()) null else confidence.replace(',', '.').toDoubleOrNull().also {
            checkDraft(it != null && it.isFinite() && it in 0.0..100.0, "confidence")
        }!! / 100
        HairWrite.Observation(version, regionId, TechnicalPatch(mapOf(field to value.fact(field))), confidenceValue)
    }
}
sealed interface HairEditStatus {
    data object Editing : HairEditStatus
    data object Saving : HairEditStatus
    data class ValidationError(val field: String) : HairEditStatus
    data class Conflict(val code: String) : HairEditStatus
    data class NetworkError(val correlationId: String?) : HairEditStatus
}
fun interface HairMutationRepository { suspend fun mutate(context: com.elifora.app.domain.auth.ActiveTenantContext, command: HairCommand) }
