import { scrollDeltaForKeyboard } from "../keyboardMath";

const base = { windowHeight: 900, keyboardHeight: 320 };

describe("scrollDeltaForKeyboard", () => {
  it("does nothing while the keyboard is closed", () => {
    expect(scrollDeltaForKeyboard({ fieldBottom: 880, windowHeight: 900, keyboardHeight: 0 })).toBe(0);
  });

  it("does nothing when the field and what is below it already clear the keyboard", () => {
    // visible area ends at 900 - 320 - 24 = 556; field bottom 300 + 110 below = 410
    expect(scrollDeltaForKeyboard({ ...base, fieldBottom: 300 })).toBe(0);
  });

  it("scrolls by exactly the overlap when the field would be covered", () => {
    // 600 + 110 - 556 = 154
    expect(scrollDeltaForKeyboard({ ...base, fieldBottom: 600 })).toBe(154);
  });

  it("keeps room for the controls under the field, not just the field itself", () => {
    // the field (bottom 500) is visible on its own, but the button below it would not be
    expect(scrollDeltaForKeyboard({ ...base, fieldBottom: 500 })).toBe(54);
    expect(scrollDeltaForKeyboard({ ...base, fieldBottom: 500, below: 0 })).toBe(0);
  });

  it("is never negative", () => {
    expect(scrollDeltaForKeyboard({ ...base, fieldBottom: -50 })).toBe(0);
  });
});
