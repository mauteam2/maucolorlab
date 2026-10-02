import { expect, test } from "@playwright/test";
const screens = ["dashboard","clients","profile","appointments","finance","reports","team","settings","colorlab"];
for (const screen of screens) test(`salon ${screen} keeps one active menu and contains narrow mobile layout`,async({page})=>{
 await page.goto(`/preview/salon/${screen}`);
 await expect(page.locator(".salon-main h1")).toBeVisible();
 await expect(page.locator('.salon-sidebar [aria-current="page"]')).toHaveCount(1);
 await expect(page.getByText("Tasarım önizlemesi · örnek veriler",{exact:true})).toBeVisible();
 await page.setViewportSize({width:320,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 await page.getByRole("button",{name:"Menü",exact:true}).click();
 await expect(page.getByRole("button",{name:"Menü",exact:true})).toHaveAttribute("aria-expanded","true");
 await expect(page.locator('.salon-sidebar [aria-current="page"]')).toBeVisible();
});
test("calendar has ordered hours and working day/month selection",async({page})=>{
 await page.goto("/preview/salon/appointments");
 await expect(page.locator(".calendar-time")).toHaveText(Array.from({length:10},(_,index)=>`${index+9}:00`));
 await page.getByRole("button",{name:"Ay",exact:true}).click();
 await expect(page.locator(".salon-month-grid button")).toHaveCount(31);
 await page.getByRole("button",{name:"Gün",exact:true}).click();
 await expect(page.locator(".calendar-day")).toHaveCount(2);
});
test("client preview filters and labels its modal changes as unsaved",async({page})=>{
 await page.goto("/preview/salon/clients");
 await page.getByLabel("Ad veya telefon ile ara",{exact:true}).fill("Ceyda");
 await expect(page.locator("tbody tr")).toHaveCount(1);
 await page.getByLabel("Ad veya telefon ile ara",{exact:true}).fill("Bulunmayan");
 await expect(page.locator("tbody tr")).toHaveCount(0);
 await page.getByRole("button",{name:"Müşteri ekle",exact:true}).click();
 await page.getByLabel("Ad / başlık").fill("Sentetik test kişi");
 await page.getByRole("button",{name:"Önizlemeyi güncelle",exact:true}).click();
 await expect(page.getByRole("status")).toContainText("sunucuya kaydedilmedi");
 await page.getByLabel("Ad veya telefon ile ara",{exact:true}).fill("Sentetik test");
 await expect(page.locator("tbody tr")).toHaveCount(1);
});
test("settings working hours and notification choices update the preview",async({page})=>{
 await page.goto("/preview/salon/settings");
 await page.getByRole("button",{name:"Çalışma saatleri",exact:true}).click();
 await page.getByLabel("Pazartesi açılış",{exact:true}).fill("10:00");
 await expect(page.locator(".salon-workdays")).toContainText("10:00–18:00");
 await page.getByRole("switch",{name:/Randevu hatırlatmaları/}).uncheck();
 await expect(page.getByRole("switch",{name:/Randevu hatırlatmaları/})).not.toBeChecked();
 await page.getByRole("button",{name:"Değişiklikleri kaydet",exact:true}).click();
 await expect(page.getByRole("status")).toContainText("sunucuya kaydedilmedi");
});
