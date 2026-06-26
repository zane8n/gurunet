export const paletteStorageKey = "gurunet.palette.v1";

export const themePalettes = [
  {
    id: "forest",
    label: "Forest",
    description: "Calm green with technical neutrals.",
    swatches: ["#1f6f43", "#e6f2df", "#0f172a"],
  },
  {
    id: "nord",
    label: "Nord",
    description: "Cool blue-gray, quiet and precise.",
    swatches: ["#5e81ac", "#e5edf5", "#2e3440"],
  },
  {
    id: "solarized",
    label: "Solarized",
    description: "Classic low-glare blue and amber.",
    swatches: ["#268bd2", "#eee8d5", "#073642"],
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    description: "Warm terminal palette without shouting.",
    swatches: ["#b57614", "#f3eadb", "#282828"],
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Soft violet accent for dark-mode people.",
    swatches: ["#bd93f9", "#f1eafd", "#282a36"],
  },
  {
    id: "tokyo",
    label: "Tokyo",
    description: "Deep indigo with a modern blue signal.",
    swatches: ["#7aa2f7", "#e8efff", "#1a1b26"],
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    description: "Muted rose and latte neutrals.",
    swatches: ["#d20f39", "#f4e8ea", "#4c4f69"],
  },
  {
    id: "mono",
    label: "Mono",
    description: "Black, white, and restrained graphite.",
    swatches: ["#171717", "#f4f4f5", "#52525b"],
  },
] as const;

export type ThemePaletteId = (typeof themePalettes)[number]["id"];

export function isThemePaletteId(value: string): value is ThemePaletteId {
  return themePalettes.some((palette) => palette.id === value);
}

export function initialPalette(): ThemePaletteId {
  if (typeof window === "undefined") return "forest";
  try {
    const saved = window.localStorage.getItem(paletteStorageKey);
    return saved && isThemePaletteId(saved) ? saved : "forest";
  } catch {
    return "forest";
  }
}
