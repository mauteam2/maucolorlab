package com.elifora.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.elifora.app.R
import com.elifora.app.domain.hair.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.text.NumberFormat
import java.util.Locale

@Composable
fun HairPassportScreen(controller: HairPassportController, onBack: () -> Unit) {
    val state by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val editing = state as? HairState.Editing
    TextButton(onClick = onBack, enabled = editing?.status !is HairEditStatus.Saving && editing?.status !is HairEditStatus.NetworkError) { Text(stringResource(R.string.hair_passport_back)) }
    Text(stringResource(R.string.hair_passport_title), style = MaterialTheme.typography.headlineMedium,
        modifier = Modifier.semantics { heading() })
    when (val current = state) {
        HairState.Closed, HairState.Loading -> {
            CircularProgressIndicator()
            Text(stringResource(R.string.hair_passport_loading))
        }
        is HairState.Ready -> {
            Text(current.client.fullName, style = MaterialTheme.typography.titleLarge)
            if (controller.can(HairAction.CORE)) OutlinedButton(onClick = { controller.begin(HairAction.CORE) }) { Text(stringResource(R.string.hair_edit_core)) }
            if (controller.can(HairAction.REGION_CREATE)) TextButton(onClick = { controller.begin(HairAction.REGION_CREATE) }) { Text(stringResource(R.string.hair_edit_region_create)) }
            PassportContent(current.passport,
                onRefresh = { scope.launch { controller.refresh() } },
                onPage = { kind, offset -> scope.launch { controller.page(kind, offset) } },
                editRegion = if (controller.can(HairAction.REGION_EDIT)) { id -> controller.begin(HairAction.REGION_EDIT, id) } else null)
        }
        is HairState.EmptyPassport -> {
            Text(current.client.fullName, style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.hair_passport_empty_title), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.hair_passport_empty_detail))
            if (controller.can(HairAction.CREATE)) Button(onClick = { controller.begin(HairAction.CREATE) }) { Text(stringResource(R.string.hair_edit_create)) }
            OutlinedButton(onClick = { scope.launch { controller.refresh() } }) { Text(stringResource(R.string.hair_passport_refresh)) }
        }
        is HairState.Error -> {
            Text(stringResource(if (current.code == "CLIENT_NOT_FOUND") R.string.hair_passport_not_found else R.string.hair_passport_network),
                color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = { scope.launch { controller.refresh() } }) { Text(stringResource(R.string.auth_retry)) }
        }
        HairState.Forbidden -> Text(stringResource(R.string.hair_passport_forbidden), color = MaterialTheme.colorScheme.error)
        HairState.MembershipRevoked -> Text(stringResource(R.string.hair_passport_revoked), color = MaterialTheme.colorScheme.error)
        HairState.SessionExpired -> Text(stringResource(R.string.hair_passport_expired), color = MaterialTheme.colorScheme.error)
        is HairState.Editing -> HairEditorScreen(current, controller)
    }
}

@Composable
internal fun PassportContent(passport: HairPassport, onRefresh: () -> Unit, onPage: (HairPageKind, Int) -> Unit,
    editRegion: ((String) -> Unit)? = null) {
    if (passport.archived) Text(stringResource(R.string.hair_passport_archived), color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(stringResource(R.string.hair_passport_updated, displayHairDate(passport.updatedAt)), style = MaterialTheme.typography.bodySmall)
    OutlinedButton(onClick = onRefresh) { Text(stringResource(R.string.hair_passport_refresh)) }

    PassportSection(stringResource(R.string.hair_passport_core), initiallyOpen = true) {
        Assessment(passport.core)
    }
    PassportSection(stringResource(R.string.hair_passport_regions), passport.regions.size) {
        if (passport.regions.isEmpty()) Text(stringResource(R.string.hair_passport_no_regions))
        passport.regions.forEach { region ->
            PassportSection(regionTitle(region), initiallyOpen = false) {
                if (region.archived) Text(stringResource(R.string.hair_passport_archived))
                Assessment(region.assessment)
                if (!passport.archived && !region.archived && editRegion != null) TextButton(onClick = { editRegion(region.id) }) { Text(stringResource(R.string.hair_edit_region_edit)) }
            }
        }
    }
    PassportSection(stringResource(R.string.hair_passport_observations), passport.observations.items.size) {
        if (passport.observations.items.isEmpty()) Text(stringResource(R.string.hair_passport_no_observations))
        passport.observations.items.forEach { item ->
            PassportSection(stringResource(R.string.hair_passport_recorded, displayHairDate(item.recordedAt)), initiallyOpen = false) {
                Text(regionTitle(passport.regionName(item.regionId)))
                TechnicalValues(item.values)
                Evidence(item.evidence)
            }
        }
        Pager(passport.observations, HairPageKind.OBSERVATIONS, onPage)
    }
    PassportSection(stringResource(R.string.hair_passport_tests), passport.tests.items.size) {
        if (passport.tests.items.isEmpty()) Text(stringResource(R.string.hair_passport_no_tests))
        passport.tests.items.forEach { item ->
            PassportSection(stringResource(item.type.labelRes()), initiallyOpen = false) {
                Text(regionTitle(passport.regionName(item.regionId)))
                FactLine(stringResource(item.type.labelRes()), item.result)
                Text(stringResource(R.string.hair_passport_performed, displayHairDate(item.performedAt)))
                Text(stringResource(R.string.hair_passport_performer, item.performedBy))
                item.notes?.let { Text(stringResource(R.string.hair_passport_test_note, it)) }
                Evidence(item.evidence)
            }
        }
        Pager(passport.tests, HairPageKind.TESTS, onPage)
    }
    PassportSection(stringResource(R.string.hair_passport_history), passport.history.items.size) {
        if (passport.history.items.isEmpty()) Text(stringResource(R.string.hair_passport_no_history))
        passport.history.items.forEach { item ->
            PassportSection(stringResource(item.category.labelRes()), initiallyOpen = false) {
                Text(historyDate(item.date))
                Text(item.description)
                val regionNames = item.regionIds.map { regionTitle(passport.regionName(it)) }
                Text(regionNames.takeIf { it.isNotEmpty() }?.joinToString(", ") ?: stringResource(R.string.hair_passport_whole))
                FactLine(stringResource(R.string.hair_passport_product_label), item.product)
                item.salon?.let { Text(stringResource(R.string.hair_passport_salon, it)) }
                item.professional?.let { Text(stringResource(R.string.hair_passport_professional, it)) }
                Evidence(item.evidence)
            }
        }
        Pager(passport.history, HairPageKind.HISTORY, onPage)
    }
}

@Composable
private fun PassportSection(title: String, count: Int? = null, initiallyOpen: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    var open by remember(title) { mutableStateOf(initiallyOpen) }
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TextButton(onClick = { open = !open }, modifier = Modifier.fillMaxWidth()) {
                Text(if (count == null) title else stringResource(R.string.hair_passport_section_count, title, count),
                    style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).semantics { heading() })
                Text(stringResource(if (open) R.string.hair_passport_collapse else R.string.hair_passport_expand))
            }
            if (open) content()
        }
    }
}

@Composable
private fun Assessment(value: HairAssessment) {
    Text(stringResource(value.state.labelRes()), fontWeight = FontWeight.SemiBold)
    value.values?.let { TechnicalValues(it) } ?: Text(stringResource(R.string.hair_passport_partial))
    value.evidence?.let { Evidence(it) }
}

@Composable
private fun TechnicalValues(value: HairTechnicalValues) {
    HairField.entries.forEach { field -> value.facts[field]?.let { FactLine(stringResource(field.labelRes()), it, field) } }
    value.technicalNotes?.let { LabeledText(stringResource(R.string.hair_passport_technical_notes), it) }
    value.integrityNotes?.let { LabeledText(stringResource(R.string.hair_passport_integrity_notes), it) }
}

@Composable
private fun FactLine(label: String, fact: HairFact, field: HairField? = null) {
    LabeledText(label, factValue(fact, field))
}

@Composable
private fun LabeledText(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value)
    }
}

@Composable
private fun factValue(fact: HairFact, field: HairField?): String {
    if (fact.state != FactState.KNOWN) return stringResource(fact.state.labelRes())
    val raw = fact.value ?: return stringResource(R.string.hair_passport_state_unknown)
    if (field == HairField.GREY_RATIO) return raw.toDoubleOrNull()?.let { NumberFormat.getPercentInstance().format(it) } ?: raw
    val mapped = when (raw.uppercase(Locale.ROOT)) {
        "FINE" -> R.string.hair_passport_value_fine
        "MEDIUM" -> R.string.hair_passport_value_medium
        "COARSE" -> R.string.hair_passport_value_coarse
        "LOW" -> R.string.hair_passport_value_low
        "HIGH" -> R.string.hair_passport_value_high
        "NORMAL" -> R.string.hair_passport_value_normal
        else -> null
    }
    return mapped?.let { stringResource(it) } ?: raw
}

@Composable
private fun Evidence(value: HairEvidence) {
    Text(stringResource(R.string.hair_passport_evidence), style = MaterialTheme.typography.titleSmall)
    Text(stringResource(value.source.labelRes()))
    Text(value.confidence?.let { stringResource(R.string.hair_passport_confidence, NumberFormat.getPercentInstance().format(it)) }
        ?: stringResource(R.string.hair_passport_no_confidence))
    value.verifiedBy?.let { Text(stringResource(R.string.hair_passport_verified, it)) }
    value.observedAt?.let { Text(stringResource(R.string.hair_passport_observed, displayHairDate(it))) }
    value.context?.let { Text(it) }
}

@Composable
private fun regionTitle(region: HairRegion?): String = when {
    region == null -> stringResource(R.string.hair_passport_whole)
    region.type == RegionType.CUSTOM && !region.label.isNullOrBlank() -> stringResource(R.string.hair_passport_region_custom, region.label)
    else -> stringResource(region.type.labelRes())
}

@Composable
private fun historyDate(date: HairHistoryDate): String = when (date.state) {
    HistoryDateState.UNKNOWN -> stringResource(R.string.hair_passport_history_date_unknown)
    HistoryDateState.EXACT -> stringResource(R.string.hair_passport_history_date_exact, displayHairDate(date.value.orEmpty()))
    HistoryDateState.APPROXIMATE -> stringResource(R.string.hair_passport_history_date_approx, displayHairDate(date.value.orEmpty()))
}

@Composable
private fun <T> Pager(page: HairPage<T>, kind: HairPageKind, onPage: (HairPageKind, Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(enabled = page.offset > 0, onClick = { onPage(kind, (page.offset - page.pageSize).coerceAtLeast(0)) }) {
            Text(stringResource(R.string.hair_passport_previous))
        }
        Text(stringResource(R.string.hair_passport_page, page.offset / page.pageSize + 1), modifier = Modifier.padding(top = 12.dp))
        OutlinedButton(enabled = page.hasMore && page.nextOffset != null,
            onClick = { page.nextOffset?.let { onPage(kind, it) } }) { Text(stringResource(R.string.hair_passport_next)) }
    }
}

private fun displayHairDate(value: String): String = runCatching {
    OffsetDateTime.parse(value).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM))
}.recoverCatching { LocalDate.parse(value).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) }.getOrDefault(value)
