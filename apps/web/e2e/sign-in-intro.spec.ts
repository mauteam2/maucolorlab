import { expect, test } from "@playwright/test";

test("login intro finishes on its 1500ms timeline and stays completed through validation, reload, and navigation", async ({ page }) => {
  await page.addInitScript(() => {
    const events: { state: string; time: number }[] = [];
    Object.assign(window, { introEvents: events });
    new MutationObserver(() => {
      const state = document.querySelector("[data-intro]")?.getAttribute("data-intro");
      if (state && events.at(-1)?.state !== state) events.push({ state, time: performance.now() });
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-intro"] });
  });
  await page.goto("/sign-in");
  const intro = page.locator("[data-intro]");
  await page.waitForFunction(() => (window as unknown as { introEvents: { state: string }[] }).introEvents.some(event => event.state === "playing"));
  await expect(intro).toHaveAttribute("data-intro", "complete");
  const events = await page.evaluate(() => (window as unknown as { introEvents: { state: string; time: number }[] }).introEvents);
  const start = events.find(event => event.state === "playing");
  const end = events.find(event => event.state === "complete" && event.time > (start?.time ?? Infinity));
  expect(start).toBeDefined(); expect(end).toBeDefined();
  expect(end!.time - start!.time).toBeGreaterThanOrEqual(1450);
  // Allow browser scheduling latency while the configured timeline remains exactly 1500ms.
  expect(end!.time - start!.time).toBeLessThan(2200);
  await expect(page.locator("[data-intro-content]")).not.toHaveAttribute("inert");
  await expect(page.getByLabel("E-posta")).toBeEditable();
  await page.getByLabel("E-posta").fill("bad-email");
  await page.getByRole("button", { name: "Oturum aç" }).click();
  expect(await page.getByLabel("E-posta").evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true);
  await expect(intro).toHaveAttribute("data-intro", "complete");
  // Native validation focuses the input and can leave the existing 140ms button transition running.
  await expect.poll(() => intro.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.reload();
  await expect(intro).toHaveAttribute("data-intro", "complete");
  expect(await intro.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.goto("/");
  await page.getByRole("link", { name: "Oturum aç" }).click();
  await expect(intro).toHaveAttribute("data-intro", "complete");
  expect(await intro.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  const layout = await page.locator("[data-intro-logo]").evaluate(el => {
    const logo = el.getBoundingClientRect();
    const card = document.querySelector("[data-intro-content]")!.getBoundingClientRect();
    return { logoRight: logo.right, logoBottom: logo.bottom, cardLeft: card.left, cardTop: card.top, width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  if (layout.width <= 720) expect(layout.logoBottom).toBeLessThan(layout.cardTop);
  else expect(layout.logoRight).toBeLessThan(layout.cardLeft);
});

test("reduced motion shows the complete, usable login immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  await page.waitForFunction(() => sessionStorage.getItem("elifora.sign-in-intro.v1") === "played");
  await expect(page.locator("[data-intro]")).toHaveAttribute("data-intro", "complete");
  await expect(page.getByLabel("Parola")).toBeEditable();
  expect(await page.locator("[data-intro]").evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("elifora.sign-in-intro.v1"))).toBe("played");
});

test("development preview replays only after explicit clicks, including with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/preview/sign-in-intro");
  const intro = page.locator("[data-intro]");
  await expect(intro).toHaveAttribute("data-intro", "complete");
  expect(await page.evaluate(() => sessionStorage.getItem("elifora.sign-in-intro.v1"))).toBeNull();
  for (let run = 0; run < 2; run++) {
    await page.getByRole("button", { name: "Animasyonu oynat" }).click();
    await expect(intro).toHaveAttribute("data-intro", "playing");
    expect(await page.locator("[data-intro-brush]").evaluate(el => getComputedStyle(el).clipPath)).not.toBe("inset(0px 0% 0px 0px)");
    await expect(intro).toHaveAttribute("data-intro", "complete");
    expect(await intro.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  }
  await expect(page.getByLabel("E-posta")).not.toBeEditable();
  expect(await page.evaluate(() => sessionStorage.getItem("elifora.sign-in-intro.v1"))).toBeNull();
});
