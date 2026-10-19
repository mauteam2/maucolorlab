# ELIFORA salon sahibi pilot kılavuzu

İlk amaç Color Engine merkezli profesyonel iş akışını güvenilir işletme kayıtlarıyla
birleştirmektir. Önce [kurulum sırasını](pilot-onboarding.md) tamamlayın.

- Ekipte üyelik/rol, teknik yetkinlik ve randevuya uygun çalışma planı farklıdır.
  Davetli üyelik aktif erişim vermez; kota ve mevcut izinler korunur.
- Müşteri kaydını minimum gerekli kimlik/iletişimle oluşturun. Yinelenen kayıt
  bulma/birleştirme mevcut güvenli sürece bağlıdır; aktif randevu/seans engellerini
  aşmayın. Hair Passport yalnızca ilgili profesyonel izinlerle açılır.
- Hizmet süresi, tamponlar, fiyat/vergi, kaynak ve personel uygunluğunu gerçek salon
  bilgisinden girin. Randevu takvimi saati salonun saat dilimindedir; iptal/no-show
  ve gerçek tamamlanma aynı durum değildir.
- Stokta gerçek ürün eşlemesi, birim, lot gereği ve ölçülmüş açılış kaydedin.
  Live tüketim kaynak olaylarını/outbox durumunu izleyin; başarısız olayı yeniden
  çalıştırırken yeni tüketim yaratmayın. Tüketim ve maliyet bilgisi ayrı olabilir.
- Finance ana para birimini ve kasa düzenini onaylayın. Hizmet ücreti, tahsilat,
  dağıtım, iade ve gider farklı gerçeklerdir. Mevcut ters kayıt akışını kullanın.
  Kart/havale kaydı, banka/POS sağlayıcısından canlı tahsilat yapıldığı anlamına
  gelmez. Maliyet bilinmiyorsa kâr/tam marj bilinmiyor görünür; sıfır varsaymayın.
- Komisyonu geçerlilik tarihli politika ve personel atamasıyla yapılandırın.
  Geçmiş atfı sessizce değiştirmeyin. Komisyon tahakkuku maaş ödemesi değildir.
- Reports dönemini, kapsamını ve projeksiyon güncelliğini inceleyin. Yetkili CSV
  dışa aktarımı denetlenir; tüm tenant yedeğinin yerini tutmaz.
- Abonelik ekranında Color Engine dâhil hakları ve sayısal kotaları inceleyin.
  Pilot daveti sınırsız kullanım veya ödeme sağlayıcısı entegrasyonu vermez.
- Kişisel veri, fotoğraf ve ekip verisi için onaylı pilot bildirimini kullanın.
  Ayrılma halinde mevcut yetkili dışa aktarımlar ve ek operator veri teslimi
  planlanır; ledgers/geçmiş silinmez. Saklama kararı ayrıca onaylanmalıdır.

Sorunda hata kodu, korelasyon ve sürümü destek sorumlusuna verin. Müşteri/teknik/
mali içerik eklemeyin. P0 güvenlik veya veri kaybında etkilenen işlemi durdurun;
yersiz kayıt düzeltmesi/SQL veya tekrar ödeme/tüketim oluşturmayın.
