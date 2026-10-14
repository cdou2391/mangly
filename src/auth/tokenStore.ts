import * as SecureStore from "expo-secure-store";

const REFRESH_KEY = "mangly.refresh_token";

// The refresh token is the only credential persisted on the device (Android Keystore-backed).
// Access tokens live in memory only, so a stolen backup or storage dump never contains a usable one.
export const tokenStore = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(REFRESH_KEY, token),
  clear: () => SecureStore.deleteItemAsync(REFRESH_KEY),
};
