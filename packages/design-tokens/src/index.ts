export const tokens = {
  color: {
    light: { canvas: "#f7f8f8", surface: "#ffffff", ink: "#172126", muted: "#657278", accent: "#167d87", success: "#24836b", warning: "#b46831", danger: "#b84d49", border: "#dce3e4" },
    dark: { canvas: "#111719", surface: "#182124", ink: "#edf3f3", muted: "#a0acad", accent: "#59b7bd", success: "#59ad91", warning: "#dc9660", danger: "#df7772", border: "#2c3a3d" },
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 4, md: 7, lg: 10 },
  type: { body: 16, caption: 13, title: 24, display: 34 },
  status: { active: "accent", complete: "success", attention: "warning", failed: "danger" },
} as const;
