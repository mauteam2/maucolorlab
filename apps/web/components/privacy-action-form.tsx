"use client";
import type { ReactNode } from "react";
import { lockDraftVault } from "@/lib/offline/vault";
export function PrivacyActionForm({ action, children }: { action: (data: FormData) => void | Promise<void>; children: ReactNode }) {
 return <form action={action} onSubmit={() => {
  lockDraftVault(); window.dispatchEvent(new Event("elifora-offline-lock"));
  if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("elifora-offline-privacy"); channel.postMessage("LOCK"); channel.close(); }
 }}>{children}</form>;
}
