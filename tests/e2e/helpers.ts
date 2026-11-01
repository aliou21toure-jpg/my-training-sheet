import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { buildWorkbook, sampleSheets, type SheetSpec } from "../fixtures/sample-workbook";

export const E2E_EMAIL = "e2e-owner@example.test";
export const E2E_PASSWORD = "e2e-password-not-secret";

export async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

/** No serious or critical accessibility violation on the current page. */
export async function expectAccessible(page: Page) {
  // Measure the settled page, not a fade-in halfway through.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** The synthetic sample (Saturday with 3 options). */
export const sampleWorkbook = () => buildWorkbook(sampleSheets);

/** Every day of the week is a training day: the journey test works whatever today is. */
export async function everyDayWorkbook() {
  const day = (name: string): SheetSpec => ({
    rows: [
      [`${name} - Full body`],
      [],
      ["Strength - 45 min"],
      ["Exercise", "Sets x Reps", "Rest"],
      ["Goblet squat", "2 x 10", "60 s"],
      ["Plank", "2 x 30 s", "45 s"],
    ],
  });
  const overview = structuredClone(sampleSheets["Week Overview"]!);
  for (const row of overview.rows) if (row[0] === "Sunday") row[1] = "Full body";
  return buildWorkbook({
    "Week Overview": overview,
    Mon: day("Monday"),
    Tue: day("Tuesday"),
    Wed: day("Wednesday"),
    Thu: day("Thursday"),
    Fri: day("Friday"),
    Sat: day("Saturday"),
    Sun: day("Sunday"),
    "Rules & Progression": sampleSheets["Rules & Progression"]!,
  });
}

export async function importWorkbook(page: Page, bytes: Uint8Array, name: string) {
  await page.goto("/settings/import");
  await page.locator("#workbook").setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(bytes) });
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await page.getByRole("button", { name: "Enregistrer le programme" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Programme enregistré" })).toBeVisible();
}

/** "2026-11-07" in Paris, n days from now. */
export function parisDate(daysFromNow = 0): { iso: string; weekday: number } {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d).map((p) => [p.type, p.value]));
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!) + 1 };
}
