import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";

export default async function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/sign-in");
  }

  return children;
}

