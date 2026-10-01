package com.elifora.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.elifora.app.R
import com.elifora.app.domain.hair.*
import kotlinx.coroutines.launch

@Composable
internal fun HairEditorScreen(state: HairState.Editing, controller: HairPassportController) {
    val scope = rememberCoroutineScope()
    val locked = state.status is HairEditStatus.Saving || state.status is HairEditStatus.NetworkError || state.status is HairEditStatus.Conflict
    BackHandler(state.status is HairEditStatus.Saving || state.status is HairEditStatus.NetworkError) { }
    Text(state.client.fullName, style = MaterialTheme.typography.titleLarge)
    Text(stringResource(state.draft.action.labelRes()), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
    when (val draft = state.draft) {
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
}
internal fun validationLabel(field: String) = when (field) {
    "changes" -> R.string.hair_edit_no_changes
    "label" -> R.string.hair_edit_label_invalid
    else -> R.string.hair_edit_validation
}
