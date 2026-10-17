import { requireDevelopmentPreview } from "@/lib/env/preview";
import { SignInAnimationPreview } from "@/components/sign-in-animation-preview";

export default async function SignInAnimationPreviewPage() {
  await requireDevelopmentPreview();
  return <SignInAnimationPreview />;
}
