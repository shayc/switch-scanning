import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("mixed keyboard controls pass mapped Space through", async ({ page }) => {
  await page.goto("/");
  await page.getByText("More options", { exact: true }).click();
  const speech = page.getByRole("switch", {
    name: "Speak highlighted and selected items",
  });
  await speech.focus();
  await page.keyboard.press("Space");
  await expect(speech).toBeChecked();
  const dedicated = page.getByRole("radio", {
    name: "Use the keyboard as a dedicated switch",
  });
  await dedicated.check();
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    document.dispatchEvent(
      new KeyboardEvent("keyup", { code: "Space", bubbles: true }),
    );
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test("timing controls reject values below their configured minimum", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto("/");
  await page.getByText("More options", { exact: true }).click();
  const selectionDelay = page.getByRole("spinbutton", {
    name: "Input lockout after selection (seconds)",
  });
  await selectionDelay.fill("-1");
  await expect(selectionDelay).toHaveValue("0");
  const start = page.getByRole("button", { name: "Start scanning" });
  await start.click();
  await expect(
    page.getByRole("status", { name: "Scanner status" }),
  ).toContainText("Scanning");
  await expect(start).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pause scanning" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Automatic", exact: true }),
  ).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("control architecture stays responsive and exposes only relevant run actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Phrase board" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start scanning" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Scanning method" }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Pace" })).toBeVisible();
  const moreOptions = page.getByRole("button", { name: "More options" });
  await expect(moreOptions).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("switch", { name: "Show touch controls" }),
  ).not.toBeVisible();
  const previewBox = await page
    .getByRole("region", { name: "Phrase board", exact: true })
    .boundingBox();
  const setupBox = await page
    .getByRole("complementary", { name: "Setup" })
    .boundingBox();
  expect(previewBox).not.toBeNull();
  expect(setupBox).not.toBeNull();
  expect(previewBox!.y).toBeLessThan(setupBox!.y);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);

  await page.getByRole("button", { name: "Start scanning" }).click();
  await expect(
    page.getByRole("button", { name: "Pause scanning" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start over" })).toHaveCount(0);
  const preview = page.getByRole("region", {
    name: "Phrase board",
    exact: true,
  });
  await expect(
    preview.getByRole("button", { name: "Stop scanning", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pause scanning" }).click();
  await expect(
    page.getByRole("button", { name: "Resume scanning" }),
  ).toBeVisible();
  await preview
    .getByRole("button", { name: "Stop scanning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start scanning" }),
  ).toBeVisible();
});

test("scanning methods expose accurate method-specific setup copy", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByText(
      "The highlight moves automatically. Press the switch to select.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Pace" })).toContainText(
    "How long the highlight stays on each item before advancing.",
  );

  await page
    .getByRole("radio", { name: "Move and select", exact: true })
    .click();
  await expect(page.getByRole("group", { name: "Movement" })).toContainText(
    "Keep advancing while the Move switch is held.",
  );

  await page.getByRole("radio", { name: "Step and wait", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Selection timing" }),
  ).toContainText(
    "After you move, how long the highlight remains on an item before it is selected.",
  );

  await page
    .getByRole("radio", { name: "Hold and release", exact: true })
    .click();
  await expect(page.getByRole("group", { name: "Pace" })).toContainText(
    "How long each item stays highlighted while the switch is held.",
  );
});

test("wide layouts keep the event inspector below the preview, collapsed until opened", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");

  const preview = page.getByRole("region", {
    name: "Phrase board",
    exact: true,
  });
  const inspector = page.getByRole("region", { name: "Event inspector" });
  const details = inspector.getByRole("group", { name: "Inspect events" });
  const previewBox = await preview.boundingBox();
  const inspectorBox = await inspector.boundingBox();

  expect(previewBox).not.toBeNull();
  expect(inspectorBox).not.toBeNull();
  expect(inspectorBox!.y).toBeGreaterThan(previewBox!.y);
  await expect(details).not.toHaveAttribute("open", "");

  await page.getByRole("button", { name: "Start scanning" }).click();
  await page.getByText("Inspect events", { exact: true }).click();
  await expect(inspector.locator("[data-event]").first()).toBeVisible();
  await expect(inspector.locator("[data-event]").first()).toContainText(
    "highlight.changed",
  );
});

test("direct and scanner activation share the native button path", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByLabel("Selected phrases")).toContainText("Yes");

  await page.getByRole("button", { name: "Clear" }).click();
  await page.keyboard.press("Space"); // start on first row group
  await page.keyboard.press("Space"); // enter row
  await page.keyboard.press("Space"); // activate first phrase
  await expect(page.getByLabel("Selected phrases")).toContainText("I want");
});

test("auditory prompts preserve the held inverse-scan release", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class MockUtterance {
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(readonly text: string) {}
    }
    const speech = {
      cancel: () => undefined,
      getVoices: (): SpeechSynthesisVoice[] => [],
      speak: (utterance: MockUtterance) =>
        queueMicrotask(() => utterance.onend?.()),
    };
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: speech,
    });
  });
  await page.goto("/");
  await page.getByRole("radio", { name: "Hold and release" }).click();
  await page.getByText("More options", { exact: true }).click();
  await page
    .getByRole("switch", { name: "Speak highlighted and selected items" })
    .check();
  await page
    .getByRole("radio", { name: "Use the keyboard as a dedicated switch" })
    .check();

  await page.keyboard.down("Space");
  await expect(
    page.getByRole("status", { name: "Scanner status" }),
  ).toContainText("Scanning");
  await page.keyboard.up("Space");

  await page.getByText("Inspect events", { exact: true }).click();
  await page.getByRole("tab", { name: "State" }).click();
  const scope = page.getByLabel("Scope");
  await expect(scope).toHaveText("row-wants");
});

test("dedicated pointer surface owns, coalesces, and safely disconnects input", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Move and select" }).click();
  await page.getByText("More options", { exact: true }).click();
  await page.getByRole("switch", { name: "Show touch controls" }).check();
  const surface = page.getByRole("button", { name: "Move", exact: true });
  await expect(
    page.getByRole("button", { name: "Select", exact: true }),
  ).toBeVisible();
  await page.getByText("Inspect events", { exact: true }).click();
  await page.getByRole("tab", { name: "State" }).click();
  const position = page.getByLabel("Position");
  await expect(surface).toHaveAttribute("data-scan-pointer-switch", "");
  await expect(surface).toHaveCSS("touch-action", "none");
  await page.getByRole("button", { name: "Start scanning" }).click();
  await expect(position).toHaveText("1/4");

  await surface.dispatchEvent("pointerdown", {
    pointerId: 11,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("2/4");
  await surface.dispatchEvent("pointerdown", {
    pointerId: 12,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("2/4");
  await surface.dispatchEvent("pointerup", {
    pointerId: 11,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("2/4");
  await surface.dispatchEvent("pointerup", {
    pointerId: 12,
    pointerType: "touch",
    button: 0,
  });

  // Cancellation must close the logical press so the next contact is usable.
  await surface.dispatchEvent("pointerdown", {
    pointerId: 13,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("3/4");
  await surface.dispatchEvent("pointercancel", {
    pointerId: 13,
    pointerType: "touch",
    button: 0,
  });
  await surface.dispatchEvent("pointerup", {
    pointerId: 13,
    pointerType: "touch",
    button: 0,
  });
  await surface.dispatchEvent("pointerdown", {
    pointerId: 14,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("4/4");
  await surface.dispatchEvent("pointerup", {
    pointerId: 14,
    pointerType: "touch",
    button: 0,
  });

  // Window blur and hidden visibility both disconnect an in-flight contact.
  await surface.dispatchEvent("pointerdown", {
    pointerId: 15,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("1/4");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await surface.dispatchEvent("pointerup", {
    pointerId: 15,
    pointerType: "touch",
    button: 0,
  });
  await surface.dispatchEvent("pointerdown", {
    pointerId: 16,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("2/4");
  await surface.dispatchEvent("pointerup", {
    pointerId: 16,
    pointerType: "touch",
    button: 0,
  });

  await surface.dispatchEvent("pointerdown", {
    pointerId: 17,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("3/4");
  await page.evaluate(() => {
    const previousVisibility = document.visibilityState;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: previousVisibility,
    });
  });
  await surface.dispatchEvent("pointerup", {
    pointerId: 17,
    pointerType: "touch",
    button: 0,
  });
  await surface.dispatchEvent("pointerdown", {
    pointerId: 18,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("4/4");
  await surface.dispatchEvent("pointerup", {
    pointerId: 18,
    pointerType: "touch",
    button: 0,
  });

  // A real primary-mouse contact is captured. Its generated click is consumed,
  // while an explicit programmatic click remains available to the host.
  await surface.evaluate((element) => {
    const state = { clicks: 0, captures: 0 };
    (
      window as typeof window & { __pointerState?: typeof state }
    ).__pointerState = state;
    element.addEventListener("click", () => state.clicks++);
    element.addEventListener("gotpointercapture", () => state.captures++);
  });
  await surface.click();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __pointerState?: { clicks: number } })
          .__pointerState?.clicks,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __pointerState?: { captures: number } })
          .__pointerState?.captures,
    ),
  ).toBeGreaterThan(0);
  await surface.evaluate((element) => (element as HTMLElement).click());
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __pointerState?: { clicks: number } })
          .__pointerState?.clicks,
    ),
  ).toBe(1);
});

test("mobile touch switch remains reachable while scan events accumulate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("radio", { name: "Move and select" }).click();
  await page.getByText("More options", { exact: true }).click();
  await page.getByRole("switch", { name: "Show touch controls" }).check();
  await page
    .getByRole("radio", { name: "Use the keyboard as a dedicated switch" })
    .check();
  const surface = page.getByRole("button", { name: "Move", exact: true });
  await page.getByRole("button", { name: "Start scanning" }).click();

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Space");
  }

  expect(
    await surface.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }),
  ).toBe(true);
  await expect(page.locator("[data-scan-highlighted]")).toBeVisible();
});

test("highlight reveal scrolls an offscreen scan item into view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 240 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 0));
  const firstGroup = page.locator("[data-scan-group]").first();
  const before = await firstGroup.boundingBox();
  expect(before).not.toBeNull();
  expect(before!.y).toBeGreaterThan(240);

  await page
    .getByRole("button", { name: "Start scanning" })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await expect(firstGroup).toHaveAttribute("data-scan-highlighted", "");
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  const after = await firstGroup.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.y).toBeGreaterThanOrEqual(0);
  // Fractional CSS pixels can straddle the viewport edge by less than one
  // device-independent pixel while still being fully revealed.
  expect(after!.y + after!.height).toBeLessThanOrEqual(241);
});

test("Strict Mode provider cleanup removes decorations from its detached DOM", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/strict.html");
  await expect(page.getByRole("button", { name: "Target" })).toBeVisible();
  await page.evaluate(() => window.__strictFixture.start());
  await expect(page.getByRole("button", { name: "Target" })).toHaveAttribute(
    "data-scan-highlighted",
    "",
  );

  await page.evaluate(() => window.__strictFixture.unmount());
  expect(await page.evaluate(() => window.__strictFixture.isDecorated())).toBe(
    false,
  );
});

test("default highlight remains visible in forced colors", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "forced-colors emulation is Chromium-only",
  );
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");
  await page.getByRole("button", { name: "Start scanning" }).click();
  const highlighted = page.locator("[data-scan-highlighted]");
  await expect(highlighted).toBeVisible();
  expect(
    await highlighted.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe("none");
});

test("reference demo has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("More options", { exact: true }).click();

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });

    for (const method of [
      "Automatic",
      "Move and select",
      "Step and wait",
      "Hold and release",
    ]) {
      await page.getByRole("radio", { name: method, exact: true }).click();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `${colorScheme}: ${method}`).toEqual([]);
    }
  }
});
