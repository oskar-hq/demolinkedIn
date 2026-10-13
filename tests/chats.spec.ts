import { expect, test } from '@playwright/test';
import { resetCockpit, signIn, trackErrors } from './helpers';

/** Chats (Messenger-Ansicht) gegen das Mock-Backend: Liste, Verlauf, Antwort eintragen, eigene Nachricht. */
test.beforeEach(async ({ request }) => resetCockpit(request));

test('Chats: Liste neueste zuerst, Verlauf öffnen, Antwort eintragen und selbst schreiben', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?ping=off');
  await signIn(page, 'nick');
  await page.getByTestId('nav-chats').click();
  const items = page.getByTestId('chat-item');
  await expect(items.first()).toBeVisible();
  await page.getByTestId('chats-search').fill('Ostermann');
  await expect(items).toHaveCount(1);
  await items.first().click();
  await expect(page.getByTestId('chat-title')).toHaveText('Ralf Ostermann');
  await expect(page.getByTestId('chat-thread')).toContainText('kein Bedarf');

  // Antwort von LinkedIn eintragen
  await page.getByRole('tab', { name: 'Antwort von Ralf' }).click();
  await page.locator('[data-testid=chats-view] textarea').fill('Doch, melden Sie sich gern im Januar.');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-thread')).toContainText('melden Sie sich gern im Januar');
  await expect(items.first()).toContainText('melden Sie sich gern im Januar');

  // Eigene Nachricht (Simulation: geht „über LinkedIn“)
  await page.getByRole('tab', { name: /Nachricht senden|Meine Nachricht/ }).click();
  await page.locator('[data-testid=chats-view] textarea').fill('Danke, ich melde mich im Januar!');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-thread')).toContainText('ich melde mich im Januar');
  await expect(items.first()).toContainText('Du: Danke, ich melde mich im Januar!');
  expect(errors).toEqual([]);
});

test('Chats passen auf ein Handy (390 px): erst Liste, dann Verlauf mit Zurück', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?ping=off');
  await signIn(page, 'nick');
  await page.getByTestId('nav-chats').click();
  await page.getByTestId('chat-item').first().click();
  await expect(page.getByTestId('chat-thread')).toBeVisible();
  await expect(page.getByTestId('chat-list')).toBeHidden();
  await page.getByRole('button', { name: 'Zurück zu den Chats' }).click();
  await expect(page.getByTestId('chat-list')).toBeVisible();
  // Das Gespräch gleitet nach rechts hinaus und ist danach weg.
  await expect(page.getByTestId('chat-thread')).toHaveCount(0);
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(390);

  // Die Liste ist sofort bedienbar – auch während das vorige Gespräch noch hinausgleitet.
  const second = page.getByTestId('chat-item').nth(1);
  const name = (await second.locator('span.truncate').first().textContent())!.trim();
  await page.getByTestId('chat-item').first().click();
  await page.getByRole('button', { name: 'Zurück zu den Chats' }).click();
  await second.click({ timeout: 1000 });
  await expect(page.getByTestId('chat-title')).toHaveCount(1); // das vorige ist hinausgeglitten
  await expect(page.getByTestId('chat-title')).toHaveText(name);
});

test('Chats: „Alle“ zeigt die Gespräche beider Gründer und über wessen Account sie laufen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?ping=off');
  await signIn(page, 'nick');
  await page.getByTestId('nav-chats').click();
  const items = page.getByTestId('chat-item');
  await expect(items.first()).toBeVisible();
  const mine = await items.count();
  // „Meine“: kein Account-Hinweis in der Liste, im Gespräch „über deinen Account“.
  await expect(page.getByTestId('chat-account')).toHaveCount(0);
  await items.first().click();
  await expect(page.getByTestId('chat-header-account')).toHaveText('· über deinen Account');

  await page.getByRole('tab', { name: 'Alle' }).click();
  await expect(items.filter({ hasText: 'über Johannes\' Account' }).first()).toBeVisible();
  expect(await items.count()).toBeGreaterThan(mine);
  await expect(items.filter({ hasText: 'über deinen Account' }).first()).toBeVisible();
  await items.filter({ hasText: 'über Johannes\' Account' }).first().click();
  await expect(page.getByTestId('chat-header-account')).toHaveText('· über Johannes\' Account');
  expect(errors).toEqual([]);
});
