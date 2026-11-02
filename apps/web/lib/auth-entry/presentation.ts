export const accessMessages = {
  UNAUTHENTICATED: { title: "Oturum açın", description: "Çalışma alanınıza devam etmek için yetkilendirilmiş hesabınızla giriş yapın." },
  SESSION_EXPIRED: { title: "Oturumunuz sona erdi", description: "Devam etmek için yeniden giriş yapın. Çalışma alanınız tekrar doğrulanacak." },
  MEMBERSHIP_REQUIRED: { title: "Bir çalışma alanı seçin", description: "Devam etmek için erişiminiz olan salon ve konumu seçin." },
  MEMBERSHIP_REVOKED: { title: "Çalışma alanı erişiminiz aktif değil", description: "Üyeliğinizi salon yöneticinizle kontrol edin. Başka bir çalışma alanınız varsa onu seçebilirsiniz." },
  TENANT_CONTEXT_INVALID: { title: "Çalışma alanınızı yeniden seçin", description: "Önceki seçiminiz artık kullanılamıyor. Güncel erişiminizle devam edin." },
  FORBIDDEN: { title: "Bu bölüm için yetkiniz yok", description: "Çalışma alanınıza dönebilir veya erişiminizi salon yöneticinizle kontrol edebilirsiniz." },
  NETWORK_ERROR: { title: "Bağlantıyı kontrol edelim", description: "Şu anda erişim bilgilerinizi doğrulayamıyoruz. Bağlantınızı kontrol edip yeniden deneyin." },
  RELEASE_NOT_READY: { title: "Çalışma alanı şu anda kullanılamıyor", description: "Erişim doğrulaması tamamlanamadı. Biraz sonra yeniden deneyin." },
} as const;
export function accessMessage(code: string) { return accessMessages[code as keyof typeof accessMessages] ?? accessMessages.NETWORK_ERROR; }
// A locator is never a return authority. Only this fixed, authenticated landing
// is carried across sign-in; no caller URL, role, tenant or membership is stored.
export function signInDestination(value: unknown) { return value === "/invitations" ? "/invitations" : "/entry"; }
export const invitationMessages = {
  INVITATION_NOT_FOUND: "Bu davet kullanılamıyor. Salon yöneticinizle erişiminizi kontrol edin.",
  INVITATION_REVOKED: "Bu davet artık aktif değil. Erişiminizi salon yöneticinizle kontrol edin.",
  INVITATION_UNAVAILABLE: "Bu salon veya konum için erişim şu anda tamamlanamıyor.",
  INVITATION_REPLAY_CONFLICT: "Bu işlem yeniden kontrol edilmeli. Daveti güncelleyip tekrar inceleyin.",
  NETWORK_ERROR: "Yanıtı doğrulayamadık. Daveti yeniden kabul etmeyi deneyebilirsiniz; aynı işlem güvenle kontrol edilecek.",
} as const;
