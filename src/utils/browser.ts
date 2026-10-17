import * as WebBrowser from "expo-web-browser";
import { palette } from "@/theme";

/**
 * How links to the source sites (and the web app) are shown: Chrome's Custom Tab dressed to look like part of the app.
 *  - createTask false: it opens in the app's own task instead of as a separate entry in Android's recent apps, so Back (or
 *    the close button) returns to the app and the app does not look like it was left. A side effect: if Android has to end
 *    the app's process while the tab is open, the tab closes with it.
 *  - the toolbar takes the app's colours, shows the page title and slides away while scrolling, to leave room for the page.
 */
export const BROWSER_OPTIONS: WebBrowser.WebBrowserOpenOptions = {
  createTask: false,
  toolbarColor: palette.bg,
  controlsColor: palette.text,
  showTitle: true,
  enableBarCollapsing: true,
};

export const openInBrowser = (url: string) => WebBrowser.openBrowserAsync(url, BROWSER_OPTIONS);

/**
 * Gets the browser ready so the page opens faster: starts it up, and tells it which page is likely next. A hint only, so
 * nothing here may ever get in the way: it never throws and never waits for an answer.
 */
export async function warmUpBrowser(url?: string | null): Promise<void> {
  try {
    await WebBrowser.warmUpAsync();
    if (url) await WebBrowser.mayInitWithUrlAsync(url);
  } catch {
    // no Custom Tabs browser, or not Android: the page still opens, just not as quickly
  }
}
