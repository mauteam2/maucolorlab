package com.elifora.app.domain.color

enum class ToneFamily { NEUTRAL, ASH_COOL, VIOLET, BLUE, GREEN, GOLD_WARM, COPPER, RED, MIXED }
enum class TargetMode { UNIFORM_COLOR, ROOT_REFRESH, ROOT_SHADOW, GREY_COVERAGE, LIGHTENING, TONING, COLOR_CORRECTION, FILL_PREPIGMENTATION, DIMENSIONAL_COLOR, MULTI_REGION_CUSTOM }
data class RegionalColorTarget(
    val regionId: String, val level: Double?, val toneFamily: ToneFamily?, val mixedFamilies: List<ToneFamily> = emptyList(),
    val warmth: String = "NEUTRAL", val greyPriority: String = "NONE", val liftPriority: String = "NONE", val depositPriority: String = "NORMAL",
    val toneIntent: String = "CHANGE", val contrast: String = "NONE", val preserve: Boolean = false, val handling: String = "STANDARD",
    val correction: String = "NONE", val intermediateLevel: Double? = null,
) {
    init {
        require(level == null || level.isFinite() && level in 1.0..10.0)
        require(intermediateLevel == null || intermediateLevel.isFinite() && intermediateLevel in 1.0..10.0)
        require(warmth in setOf("NEUTRAL", "COOL", "WARM", "PRESERVE"))
        require(greyPriority in setOf("NONE", "BLEND", "COVER"))
        require(liftPriority in setOf("NONE", "NORMAL", "HIGH") && depositPriority in setOf("NONE", "NORMAL", "HIGH"))
        require(liftPriority == "NONE" || depositPriority == "NONE")
        require(toneIntent in setOf("PRESERVE", "NEUTRALIZE", "ENHANCE", "CHANGE"))
        require(contrast in setOf("NONE", "SOFT", "PRONOUNCED") && handling in setOf("STANDARD", "ISOLATE"))
        require(correction in setOf("NONE", "BAND", "UNEVEN", "REFLECTION", "DARK_ACCUMULATION"))
        require(mixedFamilies.size <= 3 && mixedFamilies.distinct().size == mixedFamilies.size && ToneFamily.MIXED !in mixedFamilies)
        require(if (toneFamily == ToneFamily.MIXED) mixedFamilies.size >= 2 else mixedFamilies.isEmpty())
        require(if (preserve) level == null && toneFamily == null && toneIntent == "PRESERVE" && warmth == "PRESERVE" && greyPriority == "NONE" && liftPriority == "NONE" && depositPriority == "NONE" && correction == "NONE" && intermediateLevel == null else level != null && (toneIntent == "PRESERVE" || toneFamily != null))
        require(correction !in setOf("BAND", "DARK_ACCUMULATION") || intermediateLevel != null)
    }
}
data class TargetDefinition(val mode: TargetMode, val globalIntent: String, val regions: List<RegionalColorTarget>) {
    val schemaVersion: Int get() = 1
    init {
        require(globalIntent in setOf("PRESERVE", "REFRESH", "TRANSFORM", "CORRECT"))
        require(regions.size in 1..100 && regions.map { it.regionId }.distinct().size == regions.size)
        if (mode == TargetMode.UNIFORM_COLOR) require(regions.none { it.preserve } && regions.map { listOf(it.level, it.toneFamily, it.mixedFamilies.sortedBy { f -> f.name }, it.warmth) }.distinct().size == 1)
    }
}
object TargetPresets {
    const val taxonomyVersion = "color-target-taxonomy/1.0.0"
    fun select(id: String, regionId: String): RegionalColorTarget = when (id) {
        "COOL_BRUNETTE" -> RegionalColorTarget(regionId, 5.0, ToneFamily.ASH_COOL, warmth = "COOL")
        "WARM_BRUNETTE" -> RegionalColorTarget(regionId, 5.0, ToneFamily.GOLD_WARM, warmth = "WARM")
        "NATURAL_BRUNETTE" -> RegionalColorTarget(regionId, 5.0, ToneFamily.NEUTRAL)
        "CARAMEL" -> RegionalColorTarget(regionId, 7.0, ToneFamily.MIXED, listOf(ToneFamily.COPPER, ToneFamily.GOLD_WARM), warmth = "WARM")
        "COPPER" -> RegionalColorTarget(regionId, 7.0, ToneFamily.COPPER, warmth = "WARM")
        "BEIGE_BLONDE" -> RegionalColorTarget(regionId, 9.0, ToneFamily.MIXED, listOf(ToneFamily.GOLD_WARM, ToneFamily.NEUTRAL))
        "GOLD_BLONDE" -> RegionalColorTarget(regionId, 9.0, ToneFamily.GOLD_WARM, warmth = "WARM")
        "COOL_BLONDE" -> RegionalColorTarget(regionId, 9.0, ToneFamily.ASH_COOL, warmth = "COOL")
        else -> error("COLOR_TARGET_INVALID")
    }
}
data class ColorPlanSummary(val id: String, val targetId: String, val engineVersion: String, val status: String, val feasibility: String, val riskBand: String?, val confidenceBand: String?)
interface ColorTargetRepository {
    suspend fun save(clientId: String, requestId: String, definition: TargetDefinition, membershipId: String, locationId: String): String
    suspend fun read(clientId: String, targetId: String, membershipId: String, locationId: String): TargetDefinition
    suspend fun readPlan(clientId: String, planId: String, membershipId: String, locationId: String): ColorPlanSummary
}
