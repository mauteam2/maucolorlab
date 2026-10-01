import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";

async function createClient(page: Page) {
 const session = await (await page.request.get("/api/session")).json();
 const headers = {origin: "http://127.0.0.1:4173", "x-workspace-reference": `${session.context.membership_id}:${session.context.location_id}`};
 const response = await page.request.post("/api/clients", {headers, data: {operation: "create", payload: {full_name: "Sentetik Confidence Profili", phone: "05329998877", request_id: randomUUID()}}});
 expect(response.ok(), await response.text()).toBeTruthy();
 return {client: (await response.json()).data, headers};
}
test("real confidence read consumes observations/tests and preserves archive, revocation and read-only authorization", async ({page}) => {
 test.setTimeout(120000);
 const account = await seedAccount(); await login(page, account); await expectReady(page);
 const {client, headers} = await createClient(page); const base = `/api/clients/${client.id}/hair-passport`;
 const create = await page.request.post(base, {headers, data: {request_id: randomUUID()}}); expect(create.ok(), await create.text()).toBeTruthy();
 const initial = await page.request.get(`${base}/confidence`); expect(initial.ok(), await initial.text()).toBeTruthy();
 const empty = await initial.json(); expect(empty.data.band).toBe("INSUFFICIENT"); expect(empty.data.confidence).toBe(0);
 expect(empty.data.domains).toHaveLength(8); expect(empty.data.engineVersion).toBe("confidence-engine/1.0.0");
 expect(initial.headers()["cache-control"]).toBe("private, no-store"); expect(initial.headers()["x-correlation-id"]).toBe(empty.correlationId);
 const observation = await page.request.post(`${base}/observations`, {headers, data: {request_id: randomUUID(), expected_version: 1,
  technical: {natural_level: {state: "KNOWN", value: 6}}, evidence: {source: "PROFESSIONAL_VERIFIED", attestation: "PERSONALLY_ASSESSED"}}});
 expect(observation.ok(), await observation.text()).toBeTruthy();
 const physical = await page.request.post(`${base}/tests`, {headers, data: {request_id: randomUUID(), type: "POROSITY", result: {state: "KNOWN", value: "MEDIUM"}}});
 expect(physical.ok(), await physical.text()).toBeTruthy();
 const populated = await page.request.get(`${base}/confidence`); expect(populated.ok(), await populated.text()).toBeTruthy();
 const assessment = (await populated.json()).data;
 expect(assessment.domains.find((d: {domain: string}) => d.domain === "INTEGRITY").fields.find((f: {field: string; target: string}) => f.field === "porosity" && f.target === "GLOBAL").evidenceRefs[0].kind).toBe("PHYSICAL_TEST");
 expect(assessment.inputFingerprint).not.toBe(empty.data.inputFingerprint);
 expect(assessment.band).toBe("INSUFFICIENT"); // Regions remain unknown: no global-to-region inference.
 const archive = await page.request.post("/api/clients", {headers, data: {operation: "archive", payload: {client_id: client.id, expected_version: client.version, request_id: randomUUID()}}});
 expect(archive.ok(), await archive.text()).toBeTruthy();
 expect((await page.request.get(`${base}/confidence`)).status()).toBe(404);
 expect((await page.request.get(`${base}/confidence?include_archived=true`)).status()).toBe(200);
 const assistant = await account.addMember("assistant");
 await account.revoke(); const denied = await page.request.get(`${base}/confidence?include_archived=true`);
 expect(denied.status()).toBe(403); expect(await denied.json()).not.toHaveProperty("data");
 await page.context().clearCookies(); await login(page, assistant); await expectReady(page);
 expect((await page.request.get(`${base}/confidence?include_archived=true`)).status()).toBe(200);
});

test("anonymous and foreign-tenant client identifiers expose no confidence/evidence", async ({page, browser}) => {
 test.setTimeout(120000);
 const anonymous = await page.request.get(`/api/clients/${randomUUID()}/hair-passport/confidence`);
 expect(anonymous.status()).toBe(401); expect(await anonymous.json()).not.toHaveProperty("data");
 const account = await seedAccount(); await login(page, account); await expectReady(page);
 const foreignAccount = await seedAccount();
 const foreignContext = await browser.newContext({baseURL: "http://127.0.0.1:4173"});
 try {
  const foreignPage = await foreignContext.newPage(); await login(foreignPage, foreignAccount); await expectReady(foreignPage);
  const {client: foreign} = await createClient(foreignPage);
  const response = await page.request.get(`/api/clients/${foreign.id}/hair-passport/confidence`);
  const missing = await page.request.get(`/api/clients/${randomUUID()}/hair-passport/confidence`);
  expect(response.status()).toBe(404); expect((await response.json()).code).toBe((await missing.json()).code);
  expect((await page.request.get(`/api/clients/${foreign.id}/hair-passport/confidence?organization_id=forged`)).status()).toBe(400);
 } finally {await foreignContext.close();}
});
