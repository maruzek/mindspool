import type { TextStyle } from "react-native";

/** Mirrors the `--ms-*` tokens in packages/ui/src/styles/globals.css (light theme). */
export const colors = {
  bg: "#ece7f4",
  surface: "#f8f6fb",
  text: "#1e1330",
  accent: "#5b2fc9",
  divider: "#3b2a5e",
  onAccent: "#ffffff",
  accent100: "#efe9fb",
  accent300: "#c3aff0",
  accent700: "#3f1d91",
  neutral100: "#f4f1f8",
  neutral200: "#e6e1ee",
  neutral800: "#352b47",
  /** `--muted-foreground`: text at 62% opacity. */
  muted: "rgba(30, 19, 48, 0.62)",
  /** `bg-foreground/8`, the thumb tile. */
  tile: "rgba(30, 19, 48, 0.08)",
  tileGlyph: "rgba(30, 19, 48, 0.55)",
  hover: "rgba(30, 19, 48, 0.05)",
  destructive: "#c10007",
  success: "#10b981",
} as const;

/** The web uses zero radius and 2px rules everywhere. */
export const radius = 0;
export const rule = 2;

/** Loaded in App.tsx from @expo-google-fonts/archivo. */
export const fonts = {
  regular: "Archivo_400Regular",
  medium: "Archivo_500Medium",
  bold: "Archivo_700Bold",
  extraBold: "Archivo_800ExtraBold",
} as const;

export const text = {
  body: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  title: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  small: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  heading: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.text,
  },
} satisfies Record<string, TextStyle>;
