package com.elifora.app.ui

import androidx.annotation.StringRes
import com.elifora.app.R
import com.elifora.app.domain.hair.*

@StringRes fun HairField.labelRes() = when (this) {
    HairField.NATURAL_LEVEL -> R.string.hair_passport_field_natural_level
    HairField.PERCEIVED_LEVEL -> R.string.hair_passport_field_perceived_level
    HairField.GREY_RATIO -> R.string.hair_passport_field_grey_ratio
    HairField.THICKNESS -> R.string.hair_passport_field_thickness
    HairField.DENSITY -> R.string.hair_passport_field_density
    HairField.POROSITY -> R.string.hair_passport_field_porosity
    HairField.ELASTICITY -> R.string.hair_passport_field_elasticity
    HairField.TONE -> R.string.hair_passport_field_tone
    HairField.COSMETIC_COLOR_HISTORY -> R.string.hair_passport_field_color_history
    HairField.BLEACH_HISTORY -> R.string.hair_passport_field_bleach_history
    HairField.CHEMICAL_HISTORY -> R.string.hair_passport_field_chemical_history
}
@StringRes fun FactState.labelRes() = when (this) {
    FactState.KNOWN -> R.string.hair_passport_state_known
    FactState.UNKNOWN -> R.string.hair_passport_state_unknown
    FactState.NOT_ASSESSED -> R.string.hair_passport_state_not_assessed
    FactState.NOT_APPLICABLE -> R.string.hair_passport_state_not_applicable
}
@StringRes fun AssessmentState.labelRes() = when (this) {
    AssessmentState.ASSESSED -> R.string.hair_passport_state_assessed
    AssessmentState.UNVERIFIED -> R.string.hair_passport_state_unverified
    AssessmentState.NOT_ASSESSED -> R.string.hair_passport_state_not_assessed
}
@StringRes fun RegionType.labelRes() = when (this) {
    RegionType.ROOT -> R.string.hair_passport_region_root
    RegionType.MID_LENGTHS -> R.string.hair_passport_region_mid
    RegionType.ENDS -> R.string.hair_passport_region_ends
    RegionType.FACE_FRAME -> R.string.hair_passport_region_face
    RegionType.CROWN -> R.string.hair_passport_region_crown
    RegionType.NAPE -> R.string.hair_passport_region_nape
    RegionType.BANDED_AREA -> R.string.hair_passport_region_banded
    RegionType.BLEACHED_AREA -> R.string.hair_passport_region_bleached
    RegionType.HIGHLIGHTED_AREA -> R.string.hair_passport_region_highlighted
    RegionType.CUSTOM -> R.string.hair_passport_region_custom_unnamed
}
@StringRes fun EvidenceSource.labelRes() = when (this) {
    EvidenceSource.AI_ESTIMATE -> R.string.hair_passport_source_ai
    EvidenceSource.PROFESSIONAL_VERIFIED -> R.string.hair_passport_source_professional
    EvidenceSource.PHYSICAL_TEST -> R.string.hair_passport_source_test
    EvidenceSource.HISTORICAL -> R.string.hair_passport_source_historical
    EvidenceSource.IMPORTED_UNVERIFIED -> R.string.hair_passport_source_imported
}
@StringRes fun PhysicalTestType.labelRes() = when (this) {
    PhysicalTestType.POROSITY -> R.string.hair_passport_test_porosity
    PhysicalTestType.ELASTICITY -> R.string.hair_passport_test_elasticity
    PhysicalTestType.STRAND -> R.string.hair_passport_test_strand
}
@StringRes fun HistoryCategory.labelRes() = when (this) {
    HistoryCategory.COLOR -> R.string.hair_passport_history_color
    HistoryCategory.BLEACH_LIGHTENING -> R.string.hair_passport_history_bleach
    HistoryCategory.TONER_GLOSS -> R.string.hair_passport_history_toner
    HistoryCategory.PERM -> R.string.hair_passport_history_perm
    HistoryCategory.RELAXER_STRAIGHTENING -> R.string.hair_passport_history_relaxer
    HistoryCategory.KERATIN_SMOOTHING -> R.string.hair_passport_history_keratin
    HistoryCategory.OTHER_CHEMICAL -> R.string.hair_passport_history_other
}
