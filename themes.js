// Shared theme definitions (used by the side panel and the settings page).
const ST_THEMES = {
  midnight: {
    name: "Midnight", dark: true,
    bg: "#0e1016", panel: "rgba(16,18,26,.94)", card: "#171a24", card2: "#1f2330",
    border: "rgba(255,255,255,.08)", text: "#e9ebf3", muted: "#8a90a6",
    accent: "#7c6cff", accent2: "#b36cff", on: "#ffffff", hl: "rgba(124,108,255,.38)"
  },
  obsidian: {
    name: "Obsidian Gold", dark: true,
    bg: "#0a0a0b", panel: "rgba(14,14,15,.95)", card: "#161618", card2: "#1f1f23",
    border: "rgba(212,175,55,.2)", text: "#f2efe6", muted: "#9a9584",
    accent: "#d4af37", accent2: "#f1d78a", on: "#17130a", hl: "rgba(212,175,55,.35)"
  },
  aurora: {
    name: "Aurora", dark: true,
    bg: "#0a1214", panel: "rgba(11,22,24,.94)", card: "#111f22", card2: "#17292d",
    border: "rgba(45,212,191,.17)", text: "#e4f4f1", muted: "#7fa09b",
    accent: "#2dd4bf", accent2: "#4ade80", on: "#04201c", hl: "rgba(45,212,191,.32)"
  },
  rose: {
    name: "Rose Noir", dark: true,
    bg: "#140c10", panel: "rgba(24,13,18,.95)", card: "#1f1218", card2: "#2a1820",
    border: "rgba(251,113,133,.19)", text: "#f7e9ee", muted: "#a98591",
    accent: "#fb7185", accent2: "#f472b6", on: "#2a0b14", hl: "rgba(251,113,133,.33)"
  },
  ocean: {
    name: "Deep Ocean", dark: true,
    bg: "#0a1220", panel: "rgba(10,18,32,.95)", card: "#101b2f", card2: "#17253d",
    border: "rgba(56,189,248,.17)", text: "#e6eefb", muted: "#7f93b2",
    accent: "#38bdf8", accent2: "#6366f1", on: "#04182a", hl: "rgba(56,189,248,.32)"
  },
  paper: {
    name: "Paper (light)", dark: false,
    bg: "#f7f5f0", panel: "rgba(251,250,247,.97)", card: "#ffffff", card2: "#f0ede6",
    border: "rgba(0,0,0,.09)", text: "#1d1d1f", muted: "#6b6b73",
    accent: "#4f46e5", accent2: "#7c3aed", on: "#ffffff", hl: "rgba(250,204,21,.45)"
  }
};

const ST_VARS = ["bg", "panel", "card", "card2", "border", "text", "muted", "accent", "accent2", "on", "hl"];

function stApplyTheme(el, key) {
  const t = ST_THEMES[key] || ST_THEMES.midnight;
  for (const k of ST_VARS) el.style.setProperty("--" + k, t[k]);
  return t;
}
