/** Applies saved look-and-feel settings (theme, text size, contrast, motion, density) to the whole app. */
export interface Appearance {
  fontSize: "small" | "medium" | "large";
  highContrast: boolean;
}
const KEY = "agritrace-appearance";
export const defaultAppearance: Appearance = { fontSize: "medium", highContrast: false };

export function loadAppearance(): Appearance {
  try {
    return { ...defaultAppearance, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return defaultAppearance;
  }
}
export function saveAppearance(a: Appearance) {
  localStorage.setItem(KEY, JSON.stringify(a));
  applyAppearance();
}
export function applyAppearance() {
  if (typeof document === "undefined") return;
  let s: { theme?: string; display?: { compact_mode?: boolean; animated_ui?: boolean } } = {};
  try {
    s = JSON.parse(localStorage.getItem("agritrace-settings") ?? "{}");
  } catch {
    /* ignore a corrupt value */
  }
  const a = loadAppearance();
  const root = document.documentElement;
  const dark =
    s.theme === "dark" ||
    (s.theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", !!dark);
  root.dataset["font"] = a.fontSize;
  root.dataset["contrast"] = a.highContrast ? "high" : "normal";
  root.dataset["motion"] = s.display?.animated_ui === false ? "off" : "on";
  root.dataset["compact"] = s.display?.compact_mode ? "true" : "false";
}
