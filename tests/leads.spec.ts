import { expect, test, type Page } from '@playwright/test';
import { findLead, resetCockpit, signIn, trackErrors } from './helpers';

/** Leads-Ansicht gegen das Mock-Backend (`GET /api/leads`): Board nach Stufe, Tabelle, Suche, Zuständig. */
test.beforeEach(async ({ request }) => resetCockpit(request));

async function openLeads(page: Page) {
  await page.goto('/?ping=off');
  await signIn(page, 'nick');
  await page.getByTestId('nav-leads').click();
  await expect(page.getByTestId('leads-view')).toBeVisible();
}

test('Leads: Board nach Stufe, Tabelle mit Suche, Panel per Klick', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeads(page);

  const board = page.getByTestId('leads-board');
  await expect(board.getByTestId('column-replied')).toContainText('Ralf Ostermann');
  await expect(board.getByTestId('column-new')).toContainText('Henrik Saalfeld');
  // Nur Nicks Leads
  await expect(board).not.toContainText('Anja Reimers');

  await page.getByTestId('leads-view-options').click();
  await page.getByRole('menuitemradio', { name: 'Tabelle' }).click();
  await expect(page.getByTestId('leads-view-options')).toBeFocused();
  const table = page.getByTestId('leads-table');
  await expect(table).toBeVisible();
  await page.getByTestId('leads-search').fill('Ostermann');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.getByRole('button', { name: 'Ralf Ostermann' }).click();
  await expect(page.getByRole('dialog')).toContainText('Ralf Ostermann');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Alle Gründer
  await page.getByTestId('leads-search').fill('');
  await page.getByRole('tab', { name: 'Alle' }).click();
  await expect(table).toContainText('Anja Reimers');
  await expect(table).toContainText('Johannes');

  // Die Ansicht merkt sich Tabelle
  await page.getByTestId('nav-home').click();
  await page.getByTestId('nav-leads').click();
  await expect(page.getByTestId('leads-table')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Leads passen auf ein Handy (390 px) ohne seitliches Scrollen der Seite', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLeads(page);
  await expect(page.getByTestId('column-new')).toBeVisible();
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(390);
});

test('Leads: Ansicht-Menü schließt mit Esc, Sortierung nach Score', async ({ page }) => {
  await openLeads(page);
  await expect(page.getByTestId('leads-count')).toHaveText(/^\d+/);
  const trigger = page.getByTestId('leads-view-options');
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Ansicht' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('menuitemradio', { name: 'Score' }).click();
  await expect(trigger).toContainText('Board · Score');
});

test('Eigene Spalte im Board: anlegen, Lead hineinziehen, im Panel zurück, löschen', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeads(page);
  const name = `Meeting Close ${Date.now() % 100000}`;
  await page.getByTestId('board-column-new').click();
  await page.getByTestId('board-column-name').fill(name);
  await page.getByTestId('board-column-add').click();
  const column = page.getByTestId('custom-column').filter({ hasText: name });
  await expect(column).toBeVisible();

  // Ziehen: Lead aus „Antwort“ in die eigene Spalte – die Stufe bleibt.
  const lead = page.getByTestId('column-replied').getByTestId('board-card').filter({ hasText: 'Ralf Ostermann' });
  await lead.dragTo(column);
  await expect(column).toContainText('Ralf Ostermann');
  await expect(column).toContainText('Antwort');
  await expect(page.getByTestId('column-replied')).not.toContainText('Ralf Ostermann');

  // Zurück über das Lead-Panel (ohne Ziehen).
  await column.getByTestId('board-card').filter({ hasText: 'Ralf Ostermann' }).click();
  await page.getByTestId('board-column-select').selectOption('');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('column-replied')).toContainText('Ralf Ostermann');

  // Löschen
  page.once('dialog', (dialog) => void dialog.accept());
  await column.getByRole('button', { name: `Spalte „${name}“ löschen` }).click();
  await expect(page.getByTestId('custom-column').filter({ hasText: name })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Eigene Spalte bleibt vollständig: verlorener Lead darin bleibt sichtbar, auch wenn Abgeschlossene ausgeblendet sind', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeads(page);
  const name = `Abgeschlossen ${Date.now() % 100000}`;
  await page.getByTestId('board-column-new').click();
  await page.getByTestId('board-column-name').fill(name);
  await page.getByTestId('board-column-add').click();
  const column = page.getByTestId('custom-column').filter({ hasText: name });
  await expect(column).toBeVisible();
  await page.getByTestId('column-replied').getByTestId('board-card').filter({ hasText: 'Ralf Ostermann' }).dragTo(column);
  await expect(column).toContainText('Ralf Ostermann');

  // Verloren (wie aus dem Lead-Panel) – der Lead bleibt in der eigenen Spalte.
  const lead = await findLead(page, 'nick', 'Ralf Ostermann');
  expect((await page.request.post(`/api/leads/${lead.id}/events`, { data: { action: 'lost' } })).status()).toBe(200);
  await page.getByTestId('nav-home').click();
  await page.getByTestId('nav-leads').click();
  await expect(column.getByTestId('board-card').filter({ hasText: 'Ralf Ostermann' })).toBeVisible();
  await expect(page.getByTestId('column-lost')).toContainText('Ausgeblendet');
  await expect(page.getByTestId('column-lost')).not.toContainText('Ralf Ostermann');

  page.once('dialog', (dialog) => void dialog.accept());
  await column.getByRole('button', { name: `Spalte „${name}“ löschen` }).click();
  await expect(page.getByTestId('custom-column').filter({ hasText: name })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Eigene Spalten: Mitarbeiter sieht sie, kann sie aber nicht anlegen, umbenennen oder löschen', async ({ page, browser }) => {
  const errors = trackErrors(page);
  await openLeads(page);
  const name = `Nur ansehen ${Date.now() % 100000}`;
  await page.getByTestId('board-column-new').click();
  await page.getByTestId('board-column-name').fill(name);
  await page.getByTestId('board-column-add').click();
  await expect(page.getByTestId('custom-column').filter({ hasText: name })).toBeVisible();

  const context = await browser.newContext();
  const anna = await context.newPage();
  await anna.goto('/?ping=off');
  await signIn(anna, 'mitarbeiter');
  await anna.getByTestId('nav-leads').click();
  const column = anna.getByTestId('custom-column').filter({ hasText: name });
  await expect(column).toBeVisible();
  await expect(column.getByRole('button', { name: `Spalte „${name}“ umbenennen` })).toHaveCount(0);
  await expect(column.getByRole('button', { name: `Spalte „${name}“ löschen` })).toHaveCount(0);
  await expect(anna.getByTestId('board-column-new')).toHaveCount(0);
  await context.close();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('custom-column').filter({ hasText: name }).getByRole('button', { name: `Spalte „${name}“ löschen` }).click();
  await expect(page.getByTestId('custom-column').filter({ hasText: name })).toHaveCount(0);
  expect(errors).toEqual([]);
});
