import { expect, test } from "@playwright/test";
import { everyDayWorkbook, expectAccessible, importWorkbook, parisDate, sampleWorkbook, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("import the program and choose a Saturday option in the calendar", async ({ page }) => {
  await signIn(page);
  await importWorkbook(page, await sampleWorkbook(), "sample-program.xlsx");
  await expectAccessible(page);

  // The next Saturday at least 2 days ahead (never today, so it is editable).
  let offset = 2;
  while (parisDate(offset).weekday !== 6) offset++;
  const saturday = parisDate(offset).iso;

  await page.goto(`/calendar?view=week&d=${saturday}`);
  await page.getByRole("button", { name: /Option|Séance au choix/ }).last().click();
  const options = page.getByRole("radiogroup", { name: "Option" });
  await options.getByRole("radio", { name: "HIIT" }).click();
  await expect(options.getByRole("radio", { name: "HIIT" })).toHaveAttribute("aria-checked", "true");
  await expectAccessible(page);

  // Saved on the server: still chosen after a reload, and the title follows.
  await page.reload();
  await page.getByRole("button", { name: /Option 2 · HIIT/ }).click();
  await expect(page.getByRole("radiogroup", { name: "Option" }).getByRole("radio", { name: "HIIT" })).toHaveAttribute("aria-checked", "true");

  // Switching to another option.
  await page.getByRole("radiogroup", { name: "Option" }).getByRole("radio", { name: "Conditioning" }).click();
  await expect(page.getByRole("button", { name: /Option 3 · Conditioning/ })).toBeVisible();
});

test("sign in → Today → start → log sets → finish → Progress", async ({ page }) => {
  await signIn(page);
  await importWorkbook(page, await everyDayWorkbook(), "every-day.xlsx");

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alex");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Commencer la séance" }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByRole("button", { name: "Terminer la séance" })).toBeVisible();

  // Goblet squat: 2 sets with weight and reps.
  await page.getByLabel("Série 1, poids en kg").fill("16");
  await page.getByLabel("Série 1, répétitions").fill("10");
  await page.getByRole("button", { name: "Valider série 1" }).first().click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByLabel("Série 2, poids en kg").fill("18");
  await page.getByLabel("Série 2, répétitions").fill("8");
  await page.getByRole("button", { name: "Valider série 2" }).first().click();
  await expectAccessible(page);

  // Plank: a timed set. Finishing the squat already opened it (auto-advance).
  await expect(page.getByRole("button", { name: /Plank/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByLabel("Série 1, durée en secondes").fill("35");
  await page.getByRole("button", { name: "Valider série 1" }).last().click();

  // Refresh in the middle: nothing is lost.
  await page.waitForTimeout(1500);
  await page.reload();
  // The screen reopens the first unfinished exercise (Plank); the squat keeps its values.
  await expect(page.getByLabel("Série 1, durée en secondes")).toHaveValue("35");
  await page.getByRole("button", { name: /Goblet squat/ }).click();
  await expect(page.getByLabel("Série 2, poids en kg")).toHaveValue("18");

  await page.getByRole("button", { name: "Terminer la séance" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(page).toHaveURL(/\/workout\/.+\/summary/);
  await expect(page.getByRole("heading", { name: "Séance terminée" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Résumé" })).toContainText("3"); // 3 validated sets
  await expect(page.getByRole("region", { name: "Résumé" })).toContainText("304 kg"); // 16×10 + 18×8
  await expectAccessible(page);

  await page.goto("/");
  await expect(page.getByText("Séance du jour terminée")).toBeVisible();

  await page.goto("/progress");
  await expect(page.getByRole("region", { name: "Résumé" })).toContainText("Séances terminées");
  await expect(page.getByRole("region", { name: "Records" })).toContainText("18 kg");
  await expectAccessible(page);
});

test("settings: unit in lb, dark theme, export", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await expectAccessible(page);
  await page.getByText("lb", { exact: true }).click();
  await page.getByText("Sombre", { exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(page.getByRole("button", { name: "Enregistré" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto("/progress");
  await expect(page.getByRole("region", { name: "Records" })).toContainText("39,7 lb"); // 18 kg
  await expectAccessible(page); // dark mode contrast too

  const download = page.waitForEvent("download");
  await page.goto("/settings");
  await page.getByRole("link", { name: "Exporter les séries (CSV, pour Excel)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^my-training-sheet-.+\.csv$/);
});

test("program editor saves a new version", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/program");
  await expectAccessible(page);
  const name = page.getByLabel("Nom de l’exercice").first();
  await name.fill("Goblet squat (pause)");
  await page.getByRole("button", { name: /Enregistrer \(version 3\)/ }).click();
  await expect(page.getByRole("status")).toContainText("Version 3 enregistrée");
});
