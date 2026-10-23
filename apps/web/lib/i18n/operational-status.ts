/** Labels only. Domain values, money and lifecycle transitions stay on their existing boundaries. */
const labels: Record<string, string> = {
 APPOINTMENT: "Randevu", REVENUE: "Gelir kaydı", COST: "Doğrudan maliyet", COMMISSION: "Komisyon", CLIENT: "Müşteri", EXPENSE: "Gider", CASH: "Kasa", STOCK_ITEM: "Stok ürünü", STOCK_MOVEMENT: "Stok hareketi", LIVE: "Canlı uygulama",
 DRAFT: "Taslak", CONFIRMED: "Onaylandı", ARRIVED: "Salonda", IN_PROGRESS: "Devam ediyor", COMPLETED: "Tamamlandı", CANCELLED: "İptal edildi", NO_SHOW: "Gelmedi",
 PREPARING: "Hazırlanıyor", READY: "Hazır", PAUSED: "Duraklatıldı", CHECKPOINT_REQUIRED: "Kontrol gerekli", COMPLETION_REVIEW: "Sonuç incelemesi", ABORTED: "Güvenlik nedeniyle sonlandırıldı",
 ACTIVE: "Aktif", ARCHIVED: "Arşivde", OPEN: "Açık", CLOSED: "Kapalı", CLOSING_REVIEW: "Kapanış incelemesi", POSTED: "Kaydedildi", REVERSED: "Ters kayıt yapıldı",
 KNOWN: "Biliniyor", UNKNOWN: "Bilinmiyor", PARTIAL: "Kısmen biliniyor", INCOMPLETE_COST: "Maliyet eksik", PARTIAL_COST: "Kısmi maliyet", COMPLETE: "Tamamlandı", UNAVAILABLE: "Hesaplanamıyor",
 CURRENT: "Güncel", PENDING: "Bekliyor", FAILED: "İşlenemedi", PROCESSED: "İşlendi", LOW: "Azaldı", OUT: "Tükendi", OK: "Yeterli",
 SERVICE_CHARGE: "Hizmet ücreti", RETAIL_SALE: "Perakende satış", DEPOSIT: "Depozito", PAYMENT: "Ödeme", REFUND: "Para iadesi", CLIENT_CREDIT: "Müşteri alacağı", CLIENT_DEBIT: "Müşteri borcu", ADJUSTMENT: "Düzeltme", REVERSAL: "Ters kayıt",
 LIVE_USAGE: "Canlı uygulama kullanımı", MATERIAL_RECONCILIATION: "Malzeme mutabakatı", LIVE_TERMINAL: "Sonlandırılmış uygulama",
};
export const operationalStatus = (value: string) => labels[value] ?? "İncelenecek kayıt";
