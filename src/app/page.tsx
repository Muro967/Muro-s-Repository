import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/current-user";

export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(!user ? "/login" : user.onboardingComplete ? "/app/wardrobe" : "/app/onboarding");
}
