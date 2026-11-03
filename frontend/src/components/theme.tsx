"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  THEME_STORAGE_KEY,
  isThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const ThemeContext = createContext({
  preference: "light" as ThemePreference,
  dark: false,
  setPreference: (_preference: ThemePreference) => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>("light");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let current: ThemePreference = "light";
    function apply(next: ThemePreference) {
      current = next;
      const resolved = next === "dark" || (next === "system" && media.matches);
      document.documentElement.dataset.theme = resolved ? "dark" : "light";
      updatePreference(next);
      setDark(resolved);
    }
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemePreference(saved)) current = saved;
    } catch {}
    apply(current);
    const onSystemChange = () => apply(current);
    const onPreference = (event: Event) =>
      apply((event as CustomEvent<ThemePreference>).detail);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null)
        apply(isThemePreference(event.newValue) ? event.newValue : "light");
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("issueflow:theme-change", onPreference);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("issueflow:theme-change", onPreference);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function setPreference(next: ThemePreference) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    window.dispatchEvent(
      new CustomEvent("issueflow:theme-change", { detail: next }),
    );
  }
  return (
    <ThemeContext.Provider value={{ preference, dark, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle() {
  const { dark, setPreference } = useContext(ThemeContext);
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setPreference(dark ? "light" : "dark")}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export function ThemeSwitcher() {
  const { preference, setPreference } = useContext(ThemeContext);
  return (
    <div className="theme-switcher" role="group" aria-label="Color theme">
      {(
        [
          { value: "light", label: "Light", icon: Sun },
          { value: "dark", label: "Dark", icon: Moon },
          { value: "system", label: "System", icon: Monitor },
        ] as const
      ).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}
