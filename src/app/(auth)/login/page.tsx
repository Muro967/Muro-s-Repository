import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/current-user";
import { AuthForm } from "@/features/auth/auth-form";
import { AccountPage } from "@/features/auth/account-page";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardingComplete ? "/app/wardrobe" : "/app/onboarding");
  return <AccountPage title="欢迎回来" description="登录，回到属于你的衣橱。"><AuthForm mode="login" /></AccountPage>;
}
