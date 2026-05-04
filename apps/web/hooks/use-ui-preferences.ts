"use client";

import { useCallback, useEffect, useState } from "react";

type ThemeMode = "light" | "dark";
type DirectionMode = "rtl" | "ltr";
type DensityMode = "comfortable" | "compact";
/** وضع مسار العمل — منفصل عن «كثافة العرض» (مدمج/مريح سابقًا). */
export type WorkspaceMode = "reception" | "integrated" | "doctor";

function normalizeWorkspace(raw: string | null): WorkspaceMode {
  if (raw === "doctor") return "doctor";
  if (raw === "integrated") return "integrated";
  return "reception";
}

export function useUiPreferences() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [direction, setDirection] = useState<DirectionMode>("rtl");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>("reception");

  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = (localStorage.getItem("theme-mode") as ThemeMode | null) ?? "light";
    const savedDir = (localStorage.getItem("direction-mode") as DirectionMode | null) ?? "rtl";
    const savedDensity = (localStorage.getItem("density-mode") as DensityMode | null) ?? "comfortable";
    const savedWorkspace = normalizeWorkspace(localStorage.getItem("workspace-mode"));
    setTheme(savedTheme);
    setDirection(savedDir);
    setDensity(savedDensity);
    setWorkspaceModeState(savedWorkspace);
    root.classList.toggle("dark", savedTheme === "dark");
    root.setAttribute("dir", savedDir);
    root.setAttribute("lang", savedDir === "rtl" ? "ar" : "en");
    root.setAttribute("data-density", savedDensity);
    root.setAttribute("data-workspace", savedWorkspace);
  }, []);

  const setWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    setWorkspaceModeState(mode);
    localStorage.setItem("workspace-mode", mode);
    document.documentElement.setAttribute("data-workspace", mode);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme-mode", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const toggleDirection = () => {
    const next = direction === "rtl" ? "ltr" : "rtl";
    setDirection(next);
    localStorage.setItem("direction-mode", next);
    document.documentElement.setAttribute("dir", next);
    document.documentElement.setAttribute("lang", next === "rtl" ? "ar" : "en");
  };

  const toggleDensity = () => {
    const next: DensityMode = density === "compact" ? "comfortable" : "compact";
    setDensity(next);
    localStorage.setItem("density-mode", next);
    document.documentElement.setAttribute("data-density", next);
  };

  /** للتوافق: يدوّر بين الأوضاع الثلاثة. */
  const cycleWorkspaceMode = useCallback(() => {
    const order: WorkspaceMode[] = ["reception", "integrated", "doctor"];
    const i = order.indexOf(workspaceMode);
    const next = order[(i + 1) % order.length]!;
    setWorkspaceMode(next);
  }, [workspaceMode, setWorkspaceMode]);

  return {
    theme,
    direction,
    density,
    workspaceMode,
    setWorkspaceMode,
    toggleTheme,
    toggleDirection,
    toggleDensity,
    /** @deprecated استخدم setWorkspaceMode أو أزرار التقسيم في الشريط */
    toggleWorkspaceMode: cycleWorkspaceMode,
  };
}
