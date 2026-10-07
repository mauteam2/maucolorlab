package com.elifora.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.elifora.app.domain.crm.*
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

@Composable
fun ClientCrmScreen(controller: ClientCrmController, clientId: String, permissions: Set<String>) {
    val state by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(clientId) { controller.open(clientId) }
    DisposableEffect(clientId) { onDispose { controller.conceal() } }
    Text("Müşteri ilişkileri", style = MaterialTheme.typography.titleLarge)
    when (val value = state) {
        ClientCrmState.Closed, ClientCrmState.Loading -> Text("Müşteri ilişkileri doğrulanıyor…")
        is ClientCrmState.Error -> {
            Text(if (value.failure.code == "CRM_CONFLICT") "Kayıt değişti; yeniden inceleyin." else "CRM bilgileri gösterilemiyor. Erişimi ve bağlantıyı kontrol edin.", color = MaterialTheme.colorScheme.error)
            Text("İşlem: ${value.failure.correlationId}", style = MaterialTheme.typography.labelSmall)
            OutlinedButton(onClick = { scope.launch { controller.open(clientId) } }) { Text("Yeniden dene") }
        }
        is ClientCrmState.Ready -> {
            val data = value.data
            val summary = data.summary
            if (summary.requestedClientId != clientId) return
            if (summary.clientId != clientId) Text("Bu kimlik birleştirildi; özgün geçmiş korunur.")
            OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(relationshipLabel(summary.relationshipStatus), style = MaterialTheme.typography.titleMedium)
                Text("Tamamlanan ziyaret: ${summary.completedVisits}")
                Text("Son ziyaret: ${crmDate(summary.lastVisitAt)}")
                Text("Geçen gün: ${summary.daysSinceLastVisit ?: "Bilinmiyor"}")
                Text("İptal: ${summary.cancellations} · Gelmedi: ${summary.noShows}")
                Text("Ziyaret aralığı: ${summary.averageIntervalDays?.let { "$it gün · aynı hizmet geçmişi" } ?: "Yeterli veri yok"}")
                Text("Tercih edilen personel: ${summary.preferredStaffName ?: "Belirtilmedi"}")
                Text(when (summary.preferenceSource) { PreferenceSource.MANUAL_PREFERENCE -> "Müşterinin açık tercihi"; PreferenceSource.HISTORICAL_PATTERN -> "Tamamlanan ziyaretlerden türetildi"; PreferenceSource.UNKNOWN -> "Personel tercihi bilinmiyor" })
                Text(when (summary.returnSignal) { "RETURN_WINDOW_OPEN" -> "Hizmete özel dönüş aralığında"; "OVERDUE" -> "Hizmete özel dönüş aralığı geçti"; "ALREADY_BOOKED" -> "İlgili hizmet için randevu var"; "NOT_YET_DUE" -> "Dönüş zamanı henüz gelmedi"; else -> "Dönüş aralığı belirlenmedi" })
                summary.nextAppointment?.let { next -> Text("Yaklaşan: ${crmDate(next.startsAt)} · ${next.service} · ${next.staff}") } ?: Text("Gelecek randevu yok")
                summary.technicalFollowups.forEach { kind -> Text(actionLabel(CrmActionKind.valueOf(kind.removeSuffix("_DUE")))) }
                Text("Teknik özet işlem güvenliği onayı değildir. Hair Passport değerlendirmesini açın.", style = MaterialTheme.typography.bodySmall)
            } }
            Text("Zaman çizelgesi", style = MaterialTheme.typography.titleMedium)
            if (data.timeline.isEmpty()) Text("Görülebilen geçmiş kaydı yok.")
            data.timeline.forEach { event -> OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) {
                Text(crmDate(event.timestamp), style = MaterialTheme.typography.labelMedium)
                Text(event.type.replace('_', ' '), style = MaterialTheme.typography.titleSmall)
                Text(event.summary)
                Text(when (event.visibility) { "TECHNICAL" -> "Teknik kayıt"; "RECEPTION" -> "Resepsiyon notu"; "PRIVATE_MANAGEMENT" -> "Yönetime özel"; else -> "Salon kaydı" }, style = MaterialTheme.typography.labelSmall)
                if (event.sourceClientId != summary.clientId) Text("Birleştirilmiş özgün kayıt", style = MaterialTheme.typography.labelSmall)
            } } }
            Text("CRM aksiyonları", style = MaterialTheme.typography.titleMedium)
            if (data.actions.isEmpty()) Text("Görünür aksiyon yok.")
            data.actions.forEach { action -> OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) {
                Text(actionLabel(action.kind), style = MaterialTheme.typography.titleSmall)
                Text(when (action.effectiveStatus) { CrmActionStatus.OPEN -> "Açık"; CrmActionStatus.SNOOZED -> "Ertelendi"; CrmActionStatus.DONE -> "Tamamlandı"; CrmActionStatus.DISMISSED -> "Kapatıldı" })
                Text(crmDate(action.dueAt))
                action.snoozedUntil?.let { Text("Erteleme: ${crmDate(it)}") }
                if ("crm.actions.manage" in permissions && action.status !in setOf(CrmActionStatus.DONE, CrmActionStatus.DISMISSED)) {
                    OutlinedButton(onClick = { scope.launch { controller.transition(action, CrmActionStatus.DONE) } }) { Text("Tamamlandı olarak işaretle") }
                    TextButton(onClick = { scope.launch { controller.transition(action, CrmActionStatus.DISMISSED) } }) { Text("Aksiyonu kapat") }
                }
            } } }
            if (data.offset > 0) OutlinedButton(onClick = { scope.launch { controller.open(clientId, (data.offset - 20).coerceAtLeast(0)) } }) { Text("Önceki kayıtlar") }
            if ((data.timelineHasMore || data.actionsHaveMore) && data.offset <= 9980) OutlinedButton(onClick = { scope.launch { controller.open(clientId, data.offset + 20) } }) { Text("Sonraki kayıtlar") }
        }
    }
}
private fun crmDate(value: String?) = value?.let { runCatching { OffsetDateTime.parse(it).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withLocale(Locale.forLanguageTag("tr-TR"))) }.getOrDefault("Tarih doğrulanamadı") } ?: "Kayıt yok"
private fun relationshipLabel(status: RelationshipStatus) = when (status) { RelationshipStatus.NEW -> "Yeni"; RelationshipStatus.ACTIVE -> "Aktif"; RelationshipStatus.RETURNING -> "Düzenli ziyaret"; RelationshipStatus.OVERDUE -> "Dönüş zamanı geçti"; RelationshipStatus.INACTIVE -> "Uzun süredir gelmedi"; RelationshipStatus.UPCOMING -> "Yaklaşan randevu"; RelationshipStatus.FOLLOW_UP_REQUIRED -> "Takip gerekli" }
private fun actionLabel(kind: CrmActionKind) = when (kind) { CrmActionKind.REBOOK -> "Yeniden randevu"; CrmActionKind.WIN_BACK -> "Geri dönüş görüşmesi"; CrmActionKind.CARE_CHECK -> "Bakım kontrolü"; CrmActionKind.COLOR_FOLLOWUP -> "Renk takibi"; CrmActionKind.RECOVERY_REASSESSMENT -> "İyileştirme değerlendirmesi"; CrmActionKind.DUPLICATE_REVIEW -> "Benzer kayıt incelemesi" }
