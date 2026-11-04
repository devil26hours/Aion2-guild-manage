"use client";

import { useLayoutEffect } from "react";
import { syncTheme, watchTheme } from "@/lib/theme";

/** Mounted once in the root layout: keeps `<html data-theme>` matching the preference. */
export function ThemeSync() {
  useLayoutEffect(() => {
    syncTheme();
    return watchTheme();
  }, []);
  return null;
}
