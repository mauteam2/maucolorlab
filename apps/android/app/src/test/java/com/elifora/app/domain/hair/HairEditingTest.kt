package com.elifora.app.domain.hair

import org.junit.Assert.*
import org.junit.Test

class HairEditingTest {
    @Test fun partialPatchPreservesUntouchedFieldsAndExplicitStates() {
        val initial = TechnicalDraft.from(null)
        val edited = initial.copy(fields = initial.fields + (HairField.POROSITY to FieldDraft(FactState.UNKNOWN)))
        val patch = edited.patch(initial)
        assertEquals(setOf(HairField.POROSITY), patch.facts.keys)
        assertEquals(HairFact(FactState.UNKNOWN, null), patch.facts[HairField.POROSITY])
        assertTrue(patch.notes.isEmpty())
        assertEquals(HairFact(FactState.NOT_ASSESSED, null), FieldDraft().fact(HairField.DENSITY))
        assertEquals(HairFact(FactState.NOT_APPLICABLE, null), FieldDraft(FactState.NOT_APPLICABLE).fact(HairField.TONE))
    }
    @Test fun valuesRespectExistingRangesAndPercentWireUnit() {
        assertEquals("0.25", FieldDraft(FactState.KNOWN, "25").fact(HairField.GREY_RATIO).value)
        assertEquals("5.5", FieldDraft(FactState.KNOWN, "5,5").fact(HairField.NATURAL_LEVEL).value)
        for (value in listOf("", "NaN", "101", "-1")) {
            try { FieldDraft(FactState.KNOWN, value).fact(HairField.GREY_RATIO); fail("invalid percentage") } catch (_: HairDraftFailure) { }
        }
        try { FieldDraft(FactState.NOT_APPLICABLE).fact(HairField.NATURAL_LEVEL); fail("level cannot be inapplicable") } catch (_: HairDraftFailure) { }
    }
    @Test fun createAllowsProgressiveEnrichmentAndRegionTypesExcludeDefaults() {
        val initial = TechnicalDraft.from(null)
        assertTrue((HairDraft.Core(HairAction.CREATE, initial, initial).write() as HairWrite.Core).technical.isEmpty)
        assertFalse(RegionType.ROOT in specializedRegionTypes)
        try { HairDraft.NewRegion(RegionType.ROOT).write(); fail("default region duplicate") } catch (_: HairDraftFailure) { }
        try { HairDraft.NewRegion().write(); fail("custom label required") } catch (_: HairDraftFailure) { }
        assertEquals("Ön tutam", (HairDraft.NewRegion(label = "Ön tutam").write() as HairWrite.Core).label)
    }
    @Test fun regionEditingKeepsOwnershipAndVersionAndCanClearNotes() {
        val initial = TechnicalDraft.from(null).copy(technicalNotes = "Old")
        val write = HairDraft.Core(HairAction.REGION_EDIT, initial, initial.copy(technicalNotes = ""), 7, "region", "Old", "New", RegionType.CUSTOM).write() as HairWrite.Core
        assertEquals(7L, write.version)
        assertEquals("region", write.regionId)
        assertTrue(write.technical.notes.containsKey(HairNote.TECHNICAL))
        assertNull(write.technical.notes[HairNote.TECHNICAL])
        assertTrue(write.includeLabel)
    }
}
