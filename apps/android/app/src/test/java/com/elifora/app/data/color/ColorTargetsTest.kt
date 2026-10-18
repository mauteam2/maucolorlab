package com.elifora.app.data.color

import com.elifora.app.domain.color.*
import org.junit.Assert.*
import org.junit.Test

class ColorTargetsTest {
    private val id = "f1000000-0000-4000-8000-000000000001"
    @Test fun allSharedPresetsRoundTripWithoutManufacturerChemistry() {
        for (preset in listOf("COOL_BRUNETTE", "WARM_BRUNETTE", "NATURAL_BRUNETTE", "CARAMEL", "COPPER", "BEIGE_BLONDE", "GOLD_BLONDE", "COOL_BLONDE")) {
            val t = TargetDefinition(TargetMode.UNIFORM_COLOR, "TRANSFORM", listOf(TargetPresets.select(preset, id)))
            assertEquals(t, SupabaseColorTargetRepository.parse(SupabaseColorTargetRepository.encode(t)))
            assertFalse(SupabaseColorTargetRepository.encode(t).toString().contains("developer"))
        }
    }
    @Test fun currentLevelScaleIsNotReplaced() { for (level in listOf(0.0, 10.5, Double.NaN)) try { RegionalColorTarget(id, level, ToneFamily.NEUTRAL);fail() } catch (_: IllegalArgumentException) {} }
    @Test fun chemistryOrOwnershipCannotBeSmuggledIntoTarget() {
        for (field in listOf("risk", "confidence", "executable", "organization_id", "recipe", "pigment_strength")) {
            val json = SupabaseColorTargetRepository.encode(TargetDefinition(TargetMode.UNIFORM_COLOR, "TRANSFORM", listOf(TargetPresets.select("COPPER", id)))).put(field, true)
            try { SupabaseColorTargetRepository.parse(json);fail(field) } catch (_: IllegalArgumentException) {}
        }
    }
    @Test fun mixedDirectionIsNotAConcentration() { val t = TargetPresets.select("CARAMEL", id);assertEquals(ToneFamily.MIXED,t.toneFamily);assertEquals(setOf(ToneFamily.COPPER,ToneFamily.GOLD_WARM),t.mixedFamilies.toSet()) }
    @Test fun regionalDifferencesAreNotAveraged() { val a = TargetPresets.select("COOL_BRUNETTE",id);val b=TargetPresets.select("BEIGE_BLONDE","f1000000-0000-4000-8000-000000000002");val t=TargetDefinition(TargetMode.MULTI_REGION_CUSTOM,"TRANSFORM",listOf(a,b));assertEquals(listOf(5.0,9.0),SupabaseColorTargetRepository.parse(SupabaseColorTargetRepository.encode(t)).regions.map { it.level }) }
    @Test fun bandCorrectionRequiresExplicitIntermediate() { try { RegionalColorTarget(id,7.0,ToneFamily.NEUTRAL,correction="BAND");fail() } catch (_: IllegalArgumentException) {} }
}
