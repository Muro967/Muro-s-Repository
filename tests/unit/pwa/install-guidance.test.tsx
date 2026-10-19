import { fireEvent, render, screen } from "@testing-library/react";
import InstallGuidance from "@/components/pwa/install-guidance";

function installPromptEvent() {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt: vi.fn().mockResolvedValue(undefined) });
  return event as Event & { prompt: () => Promise<void> };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("navigator", { ...window.navigator, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/131.0.0.0 Mobile" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("offers Android installation after the browser emits its install prompt", async () => {
  render(<InstallGuidance />);
  const event = installPromptEvent();
  fireEvent(window, event);

  fireEvent.click(await screen.findByRole("button", { name: "安装应用" }));
  expect(event.prompt).toHaveBeenCalledOnce();
});

test("shows iOS home-screen directions and remembers dismissal", () => {
  vi.stubGlobal("navigator", { ...window.navigator, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1" });
  const { unmount } = render(<InstallGuidance />);
  expect(screen.getByText(/分享.*添加到主屏幕/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "关闭安装提示" }));
  expect(screen.queryByText(/分享.*添加到主屏幕/)).not.toBeInTheDocument();
  expect(localStorage.getItem("ai-wardrobe-install-guidance-dismissed")).toBe("true");

  unmount();
  render(<InstallGuidance />);
  expect(screen.queryByText(/分享.*添加到主屏幕/)).not.toBeInTheDocument();
});

test("remains usable when local storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.stubGlobal("navigator", { ...window.navigator, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1" });

  render(<InstallGuidance />);
  expect(screen.getByText(/分享.*添加到主屏幕/)).toBeInTheDocument();
});
