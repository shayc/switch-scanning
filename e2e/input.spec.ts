import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/input.html");
  await expect(page.getByRole("button", { name: "Move" })).toBeVisible();
  await page.evaluate(() => window.__inputFixture.start());
  await expect(page.getByLabel("Position")).toHaveText("1/3");
});

test("dedicated keyboard input owns its mapped contact", async ({ page }) => {
  const prevented = await page.evaluate(() => {
    const down = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(down);
    document.dispatchEvent(
      new KeyboardEvent("keyup", {
        code: "Space",
        bubbles: true,
        cancelable: true,
      }),
    );
    return down.defaultPrevented;
  });

  expect(prevented).toBe(true);
  await expect(page.getByLabel("Position")).toHaveText("2/3");
});

test("pointer input owns, coalesces, and safely disconnects contacts", async ({
  page,
}) => {
  const surface = page.getByRole("button", { name: "Move", exact: true });
  const position = page.getByLabel("Position");
  await expect(surface).toHaveAttribute("data-scan-pointer-switch", "");
  await expect(surface).toHaveCSS("touch-action", "none");

  await surface.dispatchEvent("pointerdown", {
    pointerId: 11,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("2/3");
  await surface.dispatchEvent("pointerdown", {
    pointerId: 12,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("2/3");
  await surface.dispatchEvent("pointerup", {
    pointerId: 11,
    pointerType: "touch",
    button: 0,
  });
  await expect(position).toHaveText("2/3");
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
  await expect(position).toHaveText("3/3");
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
  await expect(position).toHaveText("1/3");
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
  await expect(position).toHaveText("2/3");
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
  await expect(position).toHaveText("3/3");
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
  await expect(position).toHaveText("1/3");
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
  await expect(position).toHaveText("2/3");
  await surface.dispatchEvent("pointerup", {
    pointerId: 18,
    pointerType: "touch",
    button: 0,
  });

  // Real pointer clicks are consumed, while explicit programmatic activation
  // remains available to the host application.
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
