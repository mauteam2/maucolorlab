import { sendHairMutation } from "@/lib/hair-passport/mutate";
import { hairMutationCommand } from "@/lib/hair-passport/mutations";
import { sendObservation } from "@/lib/hair-passport/observation-mutate";
import { observationCommand } from "@/lib/hair-passport/observations";
import { sendPhysicalTest } from "@/lib/hair-passport/physical-test-mutate";
import { physicalTestCommand } from "@/lib/hair-passport/physical-tests";
import { sendHistory } from "@/lib/hair-passport/history-mutate";
import { historyCommand } from "@/lib/hair-passport/history";
import { liveCommand } from "@/lib/live/model";
import { salonCommand } from "@/lib/salon/model";
import { currentVault, readOfflineAttachment } from "./vault";
import type { Dispatch } from "./coordinator";
export const dispatchDraft: Dispatch = async (draft, signal) => {
 const reference = draft.workspace_reference;
 switch (draft.domain) {
  case "HAIR_CORE": await sendHairMutation(hairMutationCommand.parse(draft.payload), reference, signal); return {};
  case "HAIR_OBSERVATION": await sendObservation(observationCommand.parse(draft.payload), reference, signal); return {};
  case "HAIR_PHYSICAL_TEST": await sendPhysicalTest(physicalTestCommand.parse(draft.payload), reference, signal); return {};
  case "HAIR_HISTORY": await sendHistory(historyCommand.parse(draft.payload), reference, signal); return {};
  case "APPOINTMENT": {
   const command = salonCommand.parse(draft.payload);
   if (command.type !== "APPOINTMENT_SAVE" || command.mutation_id !== draft.mutation_id) throw new Error("OFFLINE_CRITICAL_OPERATION");
   const response = await fetch("/api/salon", { method: "POST", headers: { "Content-Type": "application/json", "X-Workspace-Reference": reference }, body: JSON.stringify(command), cache: "no-store", signal });
   const body = await response.json(); if (!response.ok) throw new Error(body.code ?? "NETWORK_ERROR");
   return { correlationId: body.correlationId };
  }
  case "LIVE": {
   const payload = draft.payload as { command?: unknown };
   const command = liveCommand.parse(payload.command ?? draft.payload);
   if (!["NOTE", "USAGE", "MATERIAL_RECONCILE", "CHECKPOINT_RECORD", "PHOTO"].includes(command.type) || !draft.session_id || !draft.entity_id) throw new Error("OFFLINE_CRITICAL_OPERATION");
   const response = await fetch(`/api/live-sessions/${draft.session_id}?client_id=${draft.entity_id}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Workspace-Reference": reference }, body: JSON.stringify(command), cache: "no-store", signal });
   const body = await response.json(); if (!response.ok) throw new Error(body.code ?? "NETWORK_ERROR");
   if (command.type === "PHOTO") {
    const vault = currentVault(), photo = vault && await readOfflineAttachment(vault, draft.draft_id);
    if (!photo) throw new Error("LIVE_PHOTO_MISSING");
    const uploaded = await fetch(`/api/live-sessions/${draft.session_id}/photos/${command.photo_id}?client_id=${draft.entity_id}`, { method: "POST", headers: { "Content-Type": photo.type, "X-Workspace-Reference": reference }, body: photo, signal });
    if (!uploaded.ok) throw new Error("NETWORK_ERROR");
   }
   return { correlationId: body.correlationId };
  }
  default: throw new Error("DRAFT_REQUIRES_DOMAIN_REVIEW");
 }
};
