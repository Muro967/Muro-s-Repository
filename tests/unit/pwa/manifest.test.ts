import manifest from "@/app/manifest";

test("declares an installable standalone AI Wardrobe app", () => {
  const value = manifest();

  expect(value.name).toBe("AI Wardrobe");
  expect(value.short_name).toBe("Wardrobe");
  expect(value.display).toBe("standalone");
  expect(value.start_url).toBe("/");
  expect(value.theme_color).toBe("#F2EEE8");
  expect(value.background_color).toBe("#F2EEE8");
  expect(value.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }),
    expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" }),
    expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }),
    expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }),
  ]));
});
