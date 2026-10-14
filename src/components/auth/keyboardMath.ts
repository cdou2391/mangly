/**
 * How far to scroll so a focused field (and the controls just below it) end up above the keyboard.
 * Returns 0 when nothing needs to move.
 *
 * @param fieldBottom  bottom edge of the focused field, in window coordinates
 * @param windowHeight height of the window
 * @param keyboardHeight height of the keyboard (0 when hidden)
 * @param below  space that must stay visible under the field (hint, links, the submit button)
 * @param gap  breathing room between the content and the keyboard
 */
export function scrollDeltaForKeyboard(opts: {
  fieldBottom: number;
  windowHeight: number;
  keyboardHeight: number;
  below?: number;
  gap?: number;
}): number {
  const { fieldBottom, windowHeight, keyboardHeight, below = 110, gap = 24 } = opts;
  if (keyboardHeight <= 0) return 0;
  const visibleBottom = windowHeight - keyboardHeight - gap;
  return Math.max(0, Math.round(fieldBottom + below - visibleBottom));
}
