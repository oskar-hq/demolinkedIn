import { expect, test } from '@playwright/test';
import { resetCockpit, trackErrors } from './helpers';

/** Demo: Anmelden mit einem Klick und „Zurücksetzen“ unten links. */
test.beforeEach(async ({ request }) => resetCockpit(request));

test('Schnellzugang und Demo zurücksetzen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?ping=off');
  await page.getByTestId('demo-login-nick').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('demo-badge')).toContainText('Demo mit Beispieldaten');

  // Zwei Klicks: erst Rückfrage, dann zurücksetzen – die Seite lädt neu, die Sitzung bleibt.
  const reset = page.getByTestId('demo-reset');
  await reset.click();
  await expect(reset).toHaveText('Wirklich zurücksetzen?');
  const done = page.waitForResponse((response) => response.url().endsWith('/api/leads/demo/reset') && response.status() === 200);
  await reset.click();
  await done;
  await expect(page.getByTestId('home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Mitarbeiterin sieht kein Zurücksetzen', async ({ page }) => {
  await page.goto('/?ping=off');
  await page.getByTestId('demo-login-mitarbeiter').click();
  await expect(page.getByTestId('home').or(page.getByRole('heading', { name: /Anna/ })).first()).toBeVisible();
  await expect(page.getByTestId('demo-reset')).toHaveCount(0);
});
