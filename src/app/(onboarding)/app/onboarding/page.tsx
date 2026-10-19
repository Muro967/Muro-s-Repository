import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/current-user";
import { AccountPage } from "@/features/auth/account-page";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.onboardingComplete) redirect("/app/wardrobe");
  return <AccountPage title="先认识一下你" description="记下日常所在的城市与发型，再给第一个衣柜取个名字。"><OnboardingForm defaultName={user.name} /></AccountPage>;
}
