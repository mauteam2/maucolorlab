import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const m = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m }));
import { MembershipInvitationCard } from "./membership-invitation-card";
import { membershipInvitation } from "@/lib/membership-invitations/model";
const id = "bb530000-0000-4000-8000-000000000001", cid = "bb550000-0000-4000-8000-000000000001";
const invite = membershipInvitation.parse({ membership_id: id, organization_name: "Sentetik Salon", location_name: "Merkez", role_code: "reception", status: "invited", state: "PENDING", invited_at: "2026-11-01T09:00:00Z", joined_at: null });
const context = { membership_id: id, organization_id: cid, organization_name: "Sentetik Salon", location_id: cid, location_name: "Merkez", role: "reception", membership_status: "active", permissions: ["salon.read"] };
const success = (workspaces = [context]) => ({ data: { ...invite, state: "ACTIVE", status: "active", joined_at: "2026-11-01T10:00:00Z" }, correlationId: cid, workspaces });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(success()))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows only safe localized context and never offers a role choice", () => { const { container } = render(<MembershipInvitationCard invitation={invite}/>); expect(screen.getByText("Resepsiyon")).toBeVisible(); expect(container.textContent).not.toMatch(/bb530000|reception|PENDING|permissions|organization_id/); expect(screen.queryByRole("combobox")).toBeNull(); });
it("sends request_id only, waits for canonical confirmation and then uses the existing workspace", async () => {
  render(<MembershipInvitationCard invitation={invite}/>); fireEvent.click(screen.getByRole("button", { name: "Daveti kabul et" }));
  expect(await screen.findByRole("heading", { name: "Davet kabul edildi" })).toBeVisible();
  const [path, init] = vi.mocked(fetch).mock.calls[0]!; expect(path).toBe(`/api/membership-invitations/${id}`); expect(Object.keys(JSON.parse(String(init?.body)))).toEqual(["request_id"]);
  expect(m.replace).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Çalışma alanına devam et" })); expect(m.replace).toHaveBeenCalledWith("/workspace");
});
it("suppresses a duplicate in-flight click synchronously", async () => {
  let done!: (v: Response) => void; vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { done = resolve; }));
  render(<MembershipInvitationCard invitation={invite}/>); const button=screen.getByRole("button",{name:"Daveti kabul et"}); fireEvent.click(button);fireEvent.click(button);expect(fetch).toHaveBeenCalledTimes(1);expect(button).toBeDisabled();await act(async()=>done(Response.json(success())));
});
it("retains one request identity after an uncertain response and accepts canonical ACTIVE retry", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(Error("lost response")); render(<MembershipInvitationCard invitation={invite}/>);fireEvent.click(screen.getByRole("button",{name:"Daveti kabul et"})); await screen.findByRole("alert");fireEvent.click(screen.getByRole("button",{name:"Daveti kabul et"}));await screen.findByRole("heading",{name:"Davet kabul edildi"});expect(vi.mocked(fetch).mock.calls[0]![1]?.body).toBe(vi.mocked(fetch).mock.calls[1]![1]?.body);
});
it.each(["INVITATION_REVOKED","INVITATION_UNAVAILABLE","INVITATION_NOT_FOUND","INVITATION_REPLAY_CONFLICT"])("conceals raw %s and stops offering acceptance after terminal rejection",async code=>{
  vi.mocked(fetch).mockResolvedValue(Response.json({code},{status:409}));render(<MembershipInvitationCard invitation={invite}/>);fireEvent.click(screen.getByRole("button",{name:"Daveti kabul et"}));const alert=await screen.findByRole("alert");expect(alert.textContent).not.toContain(code);expect(screen.queryByRole("button",{name:"Daveti kabul et"})).toBeNull();
});
it.each(["REVOKED","ORGANIZATION_UNAVAILABLE","LOCATION_UNAVAILABLE"] as const)("does not offer acceptance for %s",state=>{render(<MembershipInvitationCard invitation={{...invite,state,status:state==="REVOKED"?"revoked":"invited"}}/>);expect(screen.queryByRole("button",{name:"Daveti kabul et"})).toBeNull();});
it("uses fresh multiple contexts for the selector",async()=>{vi.mocked(fetch).mockResolvedValue(Response.json(success([context,{...context,location_id:id}])));render(<MembershipInvitationCard invitation={invite}/>);fireEvent.click(screen.getByRole("button",{name:"Daveti kabul et"}));await screen.findByRole("heading",{name:"Davet kabul edildi"});fireEvent.click(screen.getByRole("button",{name:"Çalışma alanına devam et"}));expect(m.replace).toHaveBeenCalledWith("/workspaces?choose=1");});
it("does not borrow unrelated active contexts when the accepted membership has no usable workspace",async()=>{vi.mocked(fetch).mockResolvedValue(Response.json(success([{...context,membership_id:cid}])));render(<MembershipInvitationCard invitation={invite}/>);fireEvent.click(screen.getByRole("button",{name:"Daveti kabul et"}));await screen.findByText("Çalışma alanı şu anda açılamıyor");expect(screen.queryByRole("button",{name:"Çalışma alanına devam et"})).toBeNull();expect(m.replace).not.toHaveBeenCalled();});
it("routes an expired identity to normal sign-in without preserving an invite locator",async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({code:"SESSION_EXPIRED"},{status:401}));render(<MembershipInvitationCard invitation={invite}/>);fireEvent.click(screen.getByRole("button",{name:"Daveti kabul et"}));await waitFor(()=>expect(m.replace).toHaveBeenCalledWith("/sign-in?reason=SESSION_EXPIRED&returnTo=%2Finvitations"));});
it("keeps an authorization failure distinct from an expired identity",async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({code:"FORBIDDEN"},{status:403}));render(<MembershipInvitationCard invitation={invite}/>);fireEvent.click(screen.getByRole("button",{name:"Daveti kabul et"}));await waitFor(()=>expect(m.replace).toHaveBeenCalledWith("/auth/access?reason=FORBIDDEN"));});
