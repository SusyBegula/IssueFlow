export type ThemePreference = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "issueflow:theme";
export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

// Runs in the document head before paint, independently of React hydration.
export const themeBootstrap = `(() => {
  let preference = "light";
  try {
    const saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (["light", "dark", "system"].includes(saved)) preference = saved;
  } catch {}
  const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();`;
