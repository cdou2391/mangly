// MangaPulse palette: black, white and red, matching the icon and splash artwork. The app is dark-only.
export const palette = {
  bg: "#0A0A0A",
  card: "#121212",
  raised: "#171717",
  border: "#262626",
  text: "#F5F5F5",
  muted: "#8E8E93",
  faint: "#5C5C62",
  primary: "#FF2A2A",
  primaryDeep: "#B5000F",
  onPrimary: "#FFFFFF",
  danger: "#FF5A5A",
  success: "#3DDC97",
} as const;

export type Theme = typeof palette;
export const useTheme = (): Theme => palette;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
