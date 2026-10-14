import { useColorScheme } from "react-native";

const dark = {
  bg: "#0F1115",
  card: "#171A21",
  border: "#262B36",
  text: "#F2F4F8",
  muted: "#9AA3B2",
  primary: "#7C5CFF",
  onPrimary: "#FFFFFF",
  danger: "#FF6B6B",
  success: "#3DDC97",
};

const light: typeof dark = {
  bg: "#F6F7FA",
  card: "#FFFFFF",
  border: "#E3E6EE",
  text: "#14171F",
  muted: "#5F6877",
  primary: "#5B3FE0",
  onPrimary: "#FFFFFF",
  danger: "#D64545",
  success: "#1E9E6A",
};

export type Theme = typeof dark;
export const useTheme = (): Theme => (useColorScheme() === "light" ? light : dark);
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
