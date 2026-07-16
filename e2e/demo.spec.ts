import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("mixed keyboard controls pass mapped Space through", async ({ page }) => {
  await page.goto("/");
  await page.getByText("More options", { exact: true }).click();
  const touchControls = page.getByRole("switch", {
    name: "Show touch controls",
  });
  await touchControls.focus();
  await page.keyboard.press("Space");
  await expect(touchControls).toBeChecked();
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

test("standard keyboard mode leaves phrase-button Space activation native", async ({
  page,
}) => {
  await page.goto("/");
  const phrase = page.getByRole("button", { name: "Yes", exact: true });
  await phrase.focus();
  await page.keyboard.press("Space");

  await expect(page.getByLabel("Selected phrases")).toContainText("Yes");
  await expect(
    page.getByRole("button", { name: "Start scanning" }),
  ).toBeVisible();
  await expect(page.locator("[data-scan-highlighted]")).toHaveCount(0);
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
  await expect(page.locator("[data-scan-status]")).toContainText("Scanning");
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
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("Space"); // start on first row group
  await page.keyboard.press("Space"); // enter row
  await page.keyboard.press("Space"); // activate first phrase
  await expect(page.getByLabel("Selected phrases")).toContainText("I want");
});

test("live announcements report selections and scope changes, not landings", async ({
  page,
}) => {
  await page.goto("/");
  const announcements = page.getByRole("status", {
    name: "Scanner announcements",
  });
  await expect(announcements).toHaveCount(1);
  await expect(announcements).toHaveText("");

  await page
    .getByRole("radio", { name: "Move and select", exact: true })
    .click();
  await page.getByRole("button", { name: "Start scanning" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("Space");
  await expect(announcements).toHaveText("");

  await page.keyboard.press("Enter");
  await expect(announcements).toContainText("Entered Row");
  const entered = await announcements.textContent();
  expect(entered).not.toBeNull();
  await page.keyboard.press("Space");
  await expect(announcements).toHaveText(entered ?? "");

  await page.keyboard.press("Enter");
  await expect(announcements).toContainText("Selected");
});

test("event observers preserve the held inverse-scan release", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Hold and release" }).click();
  await page.getByText("More options", { exact: true }).click();
  await page
    .getByRole("radio", { name: "Use the keyboard as a dedicated switch" })
    .check();

  await page.keyboard.down("Space");
  await expect(page.locator("[data-scan-status]")).toContainText("Scanning");
  await page.keyboard.up("Space");

  await page.getByText("Inspect events", { exact: true }).click();
  await page.getByRole("tab", { name: "State" }).click();
  const scope = page.getByLabel("Scope");
  await expect(scope).toHaveText("row-wants");
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

test("default exit highlighting does not change the containing block", async ({
  page,
}) => {
  await page.goto("/");
  const positions = await page.evaluate(() => {
    const shell = document.createElement("div");
    shell.style.margin = "137px";
    const group = document.createElement("div");
    const child = document.createElement("span");
    child.style.position = "absolute";
    child.style.inset = "0 auto auto 0";
    child.textContent = "application child";
    group.appendChild(child);
    shell.appendChild(group);
    document.body.appendChild(shell);

    const read = () => {
      const rect = child.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    };
    const before = read();
    group.setAttribute("data-scan-exit-highlighted", "");
    const after = read();
    shell.remove();
    return { before, after };
  });

  expect(positions.after).toEqual(positions.before);
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

test("default highlight contrasts with a dark host background", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start scanning" }).click();
  const highlighted = page.locator("[data-scan-highlighted]");
  await expect(highlighted).toBeVisible();
  const colors = await highlighted.evaluate((element) => {
    const html = element as HTMLElement;
    html.style.backgroundColor = "rgb(24, 24, 24)";
    html.style.colorScheme = "dark";
    const style = getComputedStyle(html);
    return {
      background: style.backgroundColor,
      outline: style.outlineColor,
    };
  });
  expect(colors.outline).not.toBe(colors.background);
});

test("reference demo has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("More options", { exact: true }).click();
  await page.getByRole("switch", { name: "Show touch controls" }).check();
  await page.getByRole("button", { name: "Start scanning" }).click();
  await expect(
    page.getByRole("region", { name: "Touch controls" }),
  ).toBeVisible();

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
