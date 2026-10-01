package com.elifora.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.elifora.app.R
import com.elifora.app.domain.hair.*
import kotlinx.coroutines.launch
import android.app.DatePickerDialog
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

@Composable
internal fun HairEditorScreen(state: HairState.Editing, controller: HairPassportController) {
    val scope = rememberCoroutineScope()
    val locked = state.status is HairEditStatus.Saving || state.status is HairEditStatus.NetworkError || state.status is HairEditStatus.Conflict
    BackHandler(state.status is HairEditStatus.Saving || state.status is HairEditStatus.NetworkError) { }
    Text(state.client.fullName, style = MaterialTheme.typography.titleLarge)
    Text(stringResource(state.draft.action.labelRes()), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
    if (state.passport == null && state.draft.action != HairAction.CREATE) Text(stringResource(R.string.hair_edit_conflict))
    else when (val draft = state.draft) {
        is HairDraft.Core -> {
            Text(stringResource(R.string.hair_edit_partial_help))
            if (draft.regionType == RegionType.CUSTOM) EditText(draft.label, R.string.hair_edit_region_label, 120, !locked) { controller.change(draft.copy(label = it)) }
            TechnicalEditor(draft.values, !locked) { controller.change(draft.copy(values = it)) }
        }
        is HairDraft.NewRegion -> {
            val types = specializedRegionTypes.filter { type -> type == RegionType.CUSTOM || state.passport?.regions?.none { !it.archived && it.type == type } != false }
            HairChoice(stringResource(R.string.hair_edit_region_type), draft.type, types, !locked, { stringResource(it.labelRes()) }) {
                controller.change(draft.copy(type = it))
            }
            if (draft.type == RegionType.CUSTOM) EditText(draft.label, R.string.hair_edit_region_label, 120, !locked) { controller.change(draft.copy(label = it)) }
        }
        is HairDraft.Observation -> {
            HairChoice(stringResource(R.string.hair_edit_field), draft.field, HairField.entries, !locked, { stringResource(it.labelRes()) }) {
                controller.change(draft.copy(field = it, value = FieldDraft(FactState.KNOWN)))
            }
            RegionChoice(state.passport!!, draft.regionId, !locked) { controller.change(draft.copy(regionId = it)) }
            FieldEditor(draft.field, draft.value, !locked) { controller.change(draft.copy(value = it)) }
            EditText(draft.confidence, R.string.hair_edit_confidence, 20, !locked, keyboard = KeyboardType.Decimal) { controller.change(draft.copy(confidence = it)) }
            Text(stringResource(R.string.hair_edit_confidence_hint), style = MaterialTheme.typography.bodySmall)
            Row(Modifier.fillMaxWidth().toggleable(draft.attested, enabled = !locked, role = Role.Checkbox,
                onValueChange = { controller.change(draft.copy(attested = it)) })) {
                Checkbox(draft.attested, onCheckedChange = null, enabled = !locked)
                Text(stringResource(R.string.hair_edit_attestation), modifier = Modifier.padding(top = 12.dp))
            }
        }
        is HairDraft.Test -> {
            HairChoice(stringResource(R.string.hair_edit_test_type), draft.type, PhysicalTestType.entries, !locked, { stringResource(it.labelRes()) }) {
                controller.change(draft.copy(type = it, value = ""))
            }
            RegionChoice(state.passport!!, draft.regionId, !locked) { controller.change(draft.copy(regionId = it)) }
            HairChoice(stringResource(R.string.hair_edit_result_state), draft.state, resultStates, !locked, { stringResource(it.labelRes()) }) { controller.change(draft.copy(state = it)) }
            if (draft.state == FactState.KNOWN) {
                if (draft.type.choices().isNotEmpty()) HairChoice(stringResource(R.string.hair_edit_value), draft.value, draft.type.choices(), !locked, { knownValueLabel(it) }) { controller.change(draft.copy(value = it)) }
                else EditText(draft.value, R.string.hair_edit_test_result, 1000, !locked, multiline = true) { controller.change(draft.copy(value = it)) }
            }
            EditText(draft.notes, R.string.hair_edit_test_note, 2000, !locked, multiline = true) { controller.change(draft.copy(notes = it)) }
            Text(stringResource(R.string.hair_edit_test_attribution), style = MaterialTheme.typography.bodySmall)
        }
        is HairDraft.History -> HistoryEditor(state.passport!!, draft, !locked) { controller.change(it) }
    }
    when (val status = state.status) {
        HairEditStatus.Editing -> Unit
        HairEditStatus.Saving -> { CircularProgressIndicator(); Text(stringResource(R.string.hair_edit_saving)) }
        is HairEditStatus.ValidationError -> Text(stringResource(validationLabel(status.field)), color = MaterialTheme.colorScheme.error,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        is HairEditStatus.Conflict -> {
            Text(stringResource(if (status.code == "HAIR_PASSPORT_ALREADY_EXISTS") R.string.hair_edit_existing else R.string.hair_edit_conflict),
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            OutlinedButton(onClick = { scope.launch { controller.reloadAfterConflict() } }) { Text(stringResource(R.string.hair_edit_reload)) }
        }
        is HairEditStatus.NetworkError -> Text(stringResource(R.string.hair_edit_uncertain), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    }
    if (state.status !is HairEditStatus.Conflict) Button(enabled = state.status !is HairEditStatus.Saving,
        onClick = { scope.launch { controller.save() } }) {
        Text(stringResource(if (state.status is HairEditStatus.NetworkError) R.string.hair_edit_retry else R.string.hair_edit_save))
    }
    TextButton(enabled = state.status !is HairEditStatus.Saving && state.status !is HairEditStatus.NetworkError,
        onClick = { scope.launch { controller.cancelEdit() } }) { Text(stringResource(R.string.hair_edit_cancel)) }
}

@Composable
private fun TechnicalEditor(values: TechnicalDraft, enabled: Boolean, change: (TechnicalDraft) -> Unit) {
    var field by remember { mutableStateOf(HairField.NATURAL_LEVEL) }
    HairChoice(stringResource(R.string.hair_edit_field), field, HairField.entries, enabled, { stringResource(it.labelRes()) }) { field = it }
    FieldEditor(field, values.fields.getValue(field), enabled) { change(values.copy(fields = values.fields + (field to it))) }
    EditText(values.technicalNotes, R.string.hair_passport_technical_notes, 4000, enabled, multiline = true) { change(values.copy(technicalNotes = it)) }
    EditText(values.integrityNotes, R.string.hair_passport_integrity_notes, 2000, enabled, multiline = true) { change(values.copy(integrityNotes = it)) }
}

@Composable
internal fun FieldEditor(field: HairField, value: FieldDraft, enabled: Boolean, change: (FieldDraft) -> Unit) {
    HairChoice(stringResource(R.string.hair_edit_state), value.state, field.states(), enabled, { stringResource(it.labelRes()) }) { change(value.copy(state = it)) }
    if (value.state == FactState.KNOWN) {
        if (field.choices().isNotEmpty()) HairChoice(stringResource(R.string.hair_edit_value), value.raw, field.choices(), enabled, { knownValueLabel(it) }) { change(value.copy(raw = it)) }
        else {
            val number = field in listOf(HairField.NATURAL_LEVEL, HairField.PERCEIVED_LEVEL, HairField.GREY_RATIO)
            EditText(value.raw, R.string.hair_edit_value, if (field == HairField.TONE) 120 else 2000, enabled,
                multiline = field in listOf(HairField.COSMETIC_COLOR_HISTORY, HairField.BLEACH_HISTORY, HairField.CHEMICAL_HISTORY),
                keyboard = if (number) KeyboardType.Decimal else KeyboardType.Text) { change(value.copy(raw = it)) }
            if (number) Text(stringResource(if (field == HairField.GREY_RATIO) R.string.hair_edit_percent_hint else R.string.hair_edit_level_hint), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
internal fun <T> HairChoice(label: String, selected: T, choices: List<T>, enabled: Boolean = true,
    display: @Composable (T) -> String, change: (T) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Box {
            OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                Text(display(selected).ifBlank { stringResource(R.string.hair_edit_choose) })
            }
            DropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
                choices.forEach { choice -> DropdownMenuItem(text = { Text(display(choice)) }, onClick = { expanded = false; change(choice) }) }
            }
        }
    }
}

@Composable
internal fun EditText(value: String, label: Int, max: Int, enabled: Boolean, multiline: Boolean = false,
    keyboard: KeyboardType = KeyboardType.Text, change: (String) -> Unit) {
    OutlinedTextField(value, { if (it.length <= max) change(it) }, label = { Text(stringResource(label)) }, enabled = enabled,
        singleLine = !multiline, minLines = if (multiline) 2 else 1, keyboardOptions = KeyboardOptions(keyboardType = keyboard), modifier = Modifier.fillMaxWidth())
}
@Composable
internal fun knownValueLabel(value: String): String = when (value) {
    "FINE" -> stringResource(R.string.hair_passport_value_fine)
    "MEDIUM" -> stringResource(R.string.hair_passport_value_medium)
    "COARSE" -> stringResource(R.string.hair_passport_value_coarse)
    "LOW" -> stringResource(R.string.hair_passport_value_low)
    "HIGH" -> stringResource(R.string.hair_passport_value_high)
    "NORMAL" -> stringResource(R.string.hair_passport_value_normal)
    else -> value
}
internal fun HairAction.labelRes() = when (this) {
    HairAction.CREATE -> R.string.hair_edit_create
    HairAction.CORE -> R.string.hair_edit_core
    HairAction.REGION_CREATE -> R.string.hair_edit_region_create
    HairAction.REGION_EDIT -> R.string.hair_edit_region_edit
    HairAction.OBSERVATION -> R.string.hair_edit_observation
    HairAction.TEST -> R.string.hair_edit_test
    HairAction.HISTORY -> R.string.hair_edit_history
}
internal fun validationLabel(field: String) = when (field) {
    "changes" -> R.string.hair_edit_no_changes
    "label" -> R.string.hair_edit_label_invalid
    "attestation" -> R.string.hair_edit_attestation_invalid
    "confidence", "INVALID_CONFIDENCE" -> R.string.hair_edit_confidence_invalid
    "date", "INVALID_HISTORY_DATE" -> R.string.hair_edit_date_invalid
    "product" -> R.string.hair_edit_product_invalid
    "description" -> R.string.hair_edit_description_invalid
    else -> R.string.hair_edit_validation
}

@Composable
internal fun RegionChoice(passport: HairPassport, selected: String?, enabled: Boolean, change: (String?) -> Unit) {
    HairChoice(stringResource(R.string.hair_edit_target), selected, listOf<String?>(null) + passport.regions.filter { !it.archived }.map { it.id }, enabled,
        { regionTitle(passport.regionName(it)) }, change)
}

@Composable
private fun HistoryEditor(passport: HairPassport, draft: HairDraft.History, enabled: Boolean, change: (HairDraft.History) -> Unit) {
    HairChoice(stringResource(R.string.hair_edit_history_category), draft.category, HistoryCategory.entries, enabled, { stringResource(it.labelRes()) }) { change(draft.copy(category = it)) }
    HairChoice(stringResource(R.string.hair_edit_date_state), draft.dateState, HistoryDateState.entries, enabled, { stringResource(when (it) {
        HistoryDateState.EXACT -> R.string.hair_edit_date_exact
        HistoryDateState.APPROXIMATE -> R.string.hair_edit_date_approximate
        HistoryDateState.UNKNOWN -> R.string.hair_passport_history_date_unknown
    }) }) { change(draft.copy(dateState = it)) }
    if (draft.dateState != HistoryDateState.UNKNOWN) {
        val context = LocalContext.current
        OutlinedButton(enabled = enabled, modifier = Modifier.fillMaxWidth(), onClick = {
            val date = runCatching { LocalDate.parse(draft.date) }.getOrDefault(LocalDate.now())
            DatePickerDialog(context, { _, year, month, day -> change(draft.copy(date = LocalDate.of(year, month + 1, day).toString())) },
                date.year, date.monthValue - 1, date.dayOfMonth).apply { datePicker.maxDate = System.currentTimeMillis() }.show()
        }) { Text(runCatching { LocalDate.parse(draft.date).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) }.getOrDefault(stringResource(R.string.hair_edit_date_choose))) }
        if (draft.dateState == HistoryDateState.APPROXIMATE) Text(stringResource(R.string.hair_edit_date_approx_hint), style = MaterialTheme.typography.bodySmall)
    }
    HairChoice(stringResource(R.string.hair_edit_product_state), draft.productState, resultStates, enabled, { stringResource(it.labelRes()) }) { change(draft.copy(productState = it)) }
    if (draft.productState == FactState.KNOWN) EditText(draft.product, R.string.hair_passport_product_label, 500, enabled) { change(draft.copy(product = it)) }
    EditText(draft.description, R.string.hair_edit_description, 2000, enabled, multiline = true) { change(draft.copy(description = it)) }
    var regionsExpanded by remember { mutableStateOf(false) }
    TextButton(onClick = { regionsExpanded = !regionsExpanded }, enabled = enabled) {
        Text(stringResource(R.string.hair_edit_regions_selected, draft.regionIds.size))
    }
    if (draft.regionIds.isEmpty()) Text(stringResource(R.string.hair_passport_whole))
    if (regionsExpanded) passport.regions.filter { !it.archived }.forEach { region ->
        val selected = region.id in draft.regionIds
        Row(Modifier.fillMaxWidth().toggleable(selected, enabled = enabled, role = Role.Checkbox, onValueChange = { checked ->
            change(draft.copy(regionIds = if (checked) draft.regionIds + region.id else draft.regionIds - region.id))
        })) { Checkbox(selected, onCheckedChange = null, enabled = enabled); Text(regionTitle(region), Modifier.padding(top = 12.dp)) }
    }
    HairChoice(stringResource(R.string.hair_edit_history_source), draft.source, listOf(EvidenceSource.HISTORICAL, EvidenceSource.IMPORTED_UNVERIFIED), enabled, { stringResource(it.labelRes()) }) { change(draft.copy(source = it)) }
    EditText(draft.context, R.string.hair_edit_history_context, 2000, enabled, multiline = true) { change(draft.copy(context = it)) }
    EditText(draft.confidence, R.string.hair_edit_confidence, 20, enabled, keyboard = KeyboardType.Decimal) { change(draft.copy(confidence = it)) }
    var attributionExpanded by remember { mutableStateOf(false) }
    TextButton(onClick = { attributionExpanded = !attributionExpanded }) { Text(stringResource(R.string.hair_edit_attribution)) }
    if (attributionExpanded) {
        EditText(draft.salon, R.string.hair_edit_salon, 160, enabled) { change(draft.copy(salon = it)) }
        EditText(draft.professional, R.string.hair_edit_professional, 160, enabled) { change(draft.copy(professional = it)) }
    }
}

@Composable
internal fun HairActivityMenu(controller: HairPassportController) {
    val actions = listOf(HairAction.REGION_CREATE, HairAction.OBSERVATION, HairAction.TEST, HairAction.HISTORY).filter { controller.can(it) }
    if (actions.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }) { Text(stringResource(R.string.hair_edit_activity)) }
        DropdownMenu(expanded, onDismissRequest = { expanded = false }) {
            actions.forEach { action -> DropdownMenuItem(text = { Text(stringResource(action.labelRes())) }, onClick = { expanded = false; controller.begin(action) }) }
        }
    }
}
