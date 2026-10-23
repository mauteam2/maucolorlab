/** Presentation labels only: command values and server state are never translated. */
const labels: Record<string, string> = {
 NOTE: "Not", USAGE: "Malzeme kullanımı", MATERIAL_RECONCILE: "Malzeme mutabakatı", CHECKPOINT_RECORD: "Kontrol kaydı", PHOTO: "Fotoğraf",
 CONFLICT_REVIEW: "Çakışma incelemesi gerekli", READY_FOR_EXPLICIT_SYNC: "Açık onayla gönderilmeye hazır",
 PENDING: "Bekliyor", IN_PROGRESS: "Uygulanıyor", COMPLETED: "Tamamlandı", SUPERSEDED: "Yeni sürümle değiştirildi",
 RUNNING: "Çalışıyor", PAUSED: "Duraklatıldı", CANCELLED: "İptal edildi",
 LIFT_CHECK: "Açılma kontrolü", TONE_CHECK: "Ton kontrolü", HAIR_INTEGRITY_CHECK: "Saç bütünlüğü kontrolü", ELASTICITY_CHECK: "Esneklik kontrolü", VISUAL_CHECK: "Görsel kontrol", CUSTOM: "Özel kontrol",
 PASS: "Uygun", CONCERN: "Endişe var", FAIL: "Uygun değil", UNKNOWN: "Bilinmiyor", ACCEPTABLE: "Kabul edilebilir", UNACCEPTABLE: "Kabul edilemez",
 UNEXPECTED_BREAKAGE: "Beklenmeyen kopma", UNEXPECTED_LIFT: "Beklenmeyen açılma", ELASTICITY_CONCERN: "Esneklik endişesi", UNEXPECTED_BAND: "Beklenmeyen renk bandı", SCALP_CONCERN: "Saç derisi endişesi",
 CHECKPOINT_REQUIRED: "Kontrol gerekli", PAUSE: "Duraklat", REASSESS: "Yeniden değerlendir", STOP: "Durdur",
 BEFORE: "Öncesi", CHECKPOINT: "Kontrol", PROCESS: "Uygulama", AFTER: "Sonrası",
 PRODUCT_CHANGED: "Ürün değişikliği", GRAM_CHANGED: "Miktar değişikliği", REGION_CHANGED: "Bölge değişikliği", TIME_CHANGED: "Süre değişikliği", SEQUENCE_CHANGED: "Sıra değişikliği", CHECKPOINT_FAILED: "Başarısız kontrol", PROFESSIONAL_DECISION: "Profesyonel karar", OTHER: "Diğer",
 PROCEED:"İlerlemeye uygun", PROCEED_WITH_CAUTION:"Kontrollü ilerleme", REQUIRE_PHYSICAL_TEST:"Fiziksel test gerekli", BLOCK_SERVICE:"Uygulama engellendi",
 ALLOW: "İlerlemeye uygun", ALLOWED: "İlerlemeye uygun", CONDITIONAL: "Koşullu", BLOCK: "İlerleme engellendi", BLOCKED: "İlerleme engellendi", REQUIRE_TEST: "Test gerekli", REQUIRE_ASSESSMENT: "Değerlendirme gerekli", REQUIRE_RECOVERY: "Toparlanma gerekli",
};
export const liveLabel = (value: string) => labels[value] ?? "Teknik inceleme gerekli";
