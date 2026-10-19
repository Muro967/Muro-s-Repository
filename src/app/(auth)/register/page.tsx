import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/current-user";
import { AuthForm } from "@/features/auth/auth-form";
import { AccountPage } from "@/features/auth/account-page";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardingComplete ? "/app/wardrobe" : "/app/onboarding");
  return <AccountPage title="让衣橱，慢慢成为你" description="使用朋友分享的邀请码，建立自己的衣橱。"><AuthForm mode="register" /></AccountPage>;
}
