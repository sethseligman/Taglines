/** Opens the SplashModal how-to-play panel from the main menu. */
export const OPEN_HTP_EVENT = "taglines:open-how-to-play";

export function openHowToPlayModal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_HTP_EVENT));
}
