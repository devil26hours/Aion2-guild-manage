/**
 * Shared by the root layout (server) and the theme store (client), so this file
 * stays free of "use client".
 */
export const THEME_STORAGE_KEY = "aion2-gc:theme";

/**
 * Runs while the HTML is parsed, before first paint, so a reload never flashes
 * the wrong theme. A saved choice wins; otherwise the system preference applies.
 */
export const THEME_INIT_SCRIPT = `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)})()`;
