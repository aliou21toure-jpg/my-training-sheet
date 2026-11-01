import { expect, test } from "@playwright/test";
import { E2E_EMAIL, expectAccessible } from "./helpers";

test.describe("privacy and security", () => {
  test("every private page redirects to sign-in without a session", async ({ page }) => {
    for (const path of ["/", "/workout", "/calendar", "/progress", "/settings", "/settings/program", "/settings/import"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
    }
  });

  test("private API routes answer 401 without a session", async ({ request }) => {
    for (const path of ["/api/export?format=json", "/api/export?format=csv", "/api/reminders"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test("a forged session cookie is refused", async ({ page, context }) => {
    await context.addCookies([{ name: "mts_session", value: "forged", url: "http://localhost:3200" }]);
    await page.goto("/progress");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("wrong password gives a generic message", async ({ page }) => {
    await page.goto("/sign-in");
    await expectAccessible(page);
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Mot de passe").fill("not-the-password");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.locator("form [role=alert]")).toHaveText("Email ou mot de passe incorrect.");
  });

  test("security headers are sent", async ({ request }) => {
    const res = await request.get("/sign-in");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});
