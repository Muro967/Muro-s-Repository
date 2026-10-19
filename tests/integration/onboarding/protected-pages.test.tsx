import ProtectedLayout from "@/app/(app)/app/layout";
import OnboardingLayout from "@/app/(onboarding)/app/onboarding/layout";
import LoginPage from "@/app/(auth)/login/page";
import RootPage from "@/app/page";

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({ getCurrentUser: currentUser }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
const account = { id: "user", email: "muro@example.com", name: "Muro", onboardingComplete: false };

test("anonymous requests cannot enter protected tabs or onboarding", async () => {
  currentUser.mockResolvedValue(null);
  await expect(ProtectedLayout({ children: "private" })).rejects.toThrow("redirect:/login");
  await expect(OnboardingLayout({ children: "private" })).rejects.toThrow("redirect:/login");
  await expect(RootPage()).rejects.toThrow("redirect:/login");
});
test("incomplete users enter onboarding and cannot open tabs or login", async () => {
  currentUser.mockResolvedValue(account);
  await expect(ProtectedLayout({ children: "private" })).rejects.toThrow("redirect:/app/onboarding");
  await expect(LoginPage()).rejects.toThrow("redirect:/app/onboarding");
  expect(await OnboardingLayout({ children: "welcome" })).toBe("welcome");
});
test("complete users enter tabs and leave onboarding", async () => {
  currentUser.mockResolvedValue({ ...account, onboardingComplete: true });
  expect(await ProtectedLayout({ children: "wardrobe" })).toBe("wardrobe");
  await expect(OnboardingLayout({ children: "private" })).rejects.toThrow("redirect:/app/wardrobe");
  await expect(RootPage()).rejects.toThrow("redirect:/app/wardrobe");
});
