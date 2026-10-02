import { notFound } from "next/navigation";
import { SignInAnimationPreview } from "@/components/sign-in-animation-preview";

export default function SignInAnimationPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SignInAnimationPreview />;
}
