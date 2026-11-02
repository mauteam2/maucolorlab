import { redirect } from "next/navigation";
import { entryDestination, pageEntryError } from "@/lib/auth-entry/server";
export default async function EntryPage() {
  let destination: string;
  try { destination = await entryDestination(); } catch (error) { return pageEntryError(error); }
  redirect(destination);
}
