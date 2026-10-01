import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function login(page: Page, founder: 'nick' | 'johannes', ping = 'off') {
  await page.goto(`/?ping=${ping}`);
  await page.getByTestId(`login-${founder}`).click();
  await expect(page.getByTestId('start-focus')).toBeVisible();
}

/** Von der Startseite in den Fokus-Modus. */
async function startFocus(page: Page) {
  await page.getByTestId('start-focus').click();
  await expect(page.getByTestId('progress')).toBeVisible();
}

const currentCard = (page: Page) => page.locator('[data-testid=stack-card]').last();

/** Bearbeitet die aktuelle Aufgabe per Tastatur und wartet, bis die Seite gewechselt hat. */
async function processCurrentCard(page: Page, index: number) {
  const card = currentCard(page);
  const id = await card.getAttribute('data-card-id');
  const type = await card.getAttribute('data-card-type');
  const positive = index % 3 !== 2;

  switch (type) {
    case 'reply':
      if (positive) {
        // Enter öffnet die Close-Vorschau, ein zweites Enter exportiert
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toContainText('Export nach Close');
        await page.keyboard.press('Enter');
      } else {
        await page.keyboard.press('ArrowLeft');
      }
      break;
    case 'followup':
      await page.keyboard.press('2');
      await page.keyboard.press(positive ? 'Enter' : 'ArrowLeft');
      break;
    case 'first':
      if (positive) {
        await page.keyboard.press('e');
        await page.keyboard.type(' PS: Kurzer Zusatz.');
        await page.keyboard.press('Control+Enter');
      } else {
        await page.keyboard.press('ArrowLeft');
      }
      break;
    default:
      await page.keyboard.press(positive ? 'Enter' : 'ArrowLeft');
  }
  await expect(page.locator(`[data-card-id="${id}"]`)).toHaveCount(0);
  return type;
}

test('Startseite zeigt nur die Aufgaben des Tages und einen Start-Button', async ({ page }) => {
  await login(page, 'nick');
  await expect(page.getByTestId('open-count')).toHaveText('14');
  await expect(page.getByText('Aufgaben für heute', { exact: true })).toBeVisible();
  await expect(page.getByTestId('start-focus')).toContainText('Aufgaben für heute abarbeiten');
  // Im Fokus-Modus gibt es keine Hauptnavigation mehr – nur eine Aufgabe pro Bildschirm.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('progress')).toHaveText('0 von 14 erledigt');
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(0);
  await expect(page.locator('[data-testid=stack-card]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('start-focus')).toBeVisible();
});

for (const founder of ['nick', 'johannes'] as const) {
  test(`kompletter Durchlauf aller Aufgaben (${founder})`, async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, founder, '2');
    await startFocus(page);
    await expect(page.getByTestId('progress')).toHaveText('0 von 14 erledigt');

    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      if (await page.getByText('Alles erledigt für heute').isVisible()) break;
      seen.push((await processCurrentCard(page, i)) ?? '?');
    }

    await expect(page.getByText('Alles erledigt für heute 🎉')).toBeVisible();
    await expect(page.getByTestId('progress')).toHaveText('15 von 15 erledigt');
    expect(seen).toHaveLength(15);
    // Antworten kommen immer zuerst
    expect(seen.slice(0, 3)).toEqual(['reply', 'reply', 'reply']);
    expect(seen.filter((type) => type === 'reply')).toHaveLength(4);

    await page.getByRole('button', { name: 'Zur Übersicht' }).click();
    await expect(page.getByText('Alles erledigt für heute 🎉')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('Slack-Ping springt zur neuen Antwort', async ({ page }) => {
  await login(page, 'johannes', '1');
  const toast = page.getByTestId('slack-toast');
  await expect(toast).toContainText('Neue Antwort von Sabine Krüger an Johannes');
  // Klick von der Startseite aus öffnet direkt die Antwort im Fokus-Modus
  await toast.click();
  await expect(currentCard(page)).toHaveAttribute('data-card-id', 'j04');
  await expect(currentCard(page)).toContainText('Neue Antwort');
  await expect(page.getByTestId('progress')).toHaveText('0 von 15 erledigt');
});

test('Filter: nur eine Aufgabenart abarbeiten', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'nick');
  await page.getByTestId('start-lead').click();
  await expect(currentCard(page)).toHaveAttribute('data-card-type', 'lead');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('progress')).toHaveText('5 von 14 erledigt');
  await expect(page.getByText('Alle neuen Leads erledigt')).toBeVisible();
  await page.getByRole('button', { name: /Mit allen weitermachen/ }).click();
  await expect(currentCard(page)).toHaveAttribute('data-card-type', 'reply');

  await page.getByTestId('filter-menu').click();
  await page.getByRole('menuitemradio', { name: /Follow-ups/ }).click();
  await expect(currentCard(page)).toHaveAttribute('data-card-type', 'followup');
  expect(errors).toEqual([]);
});

/** Zieht die aktuelle Seite horizontal – Start auf einer Fläche ohne Bedienelement. */
async function swipe(page: Page, dx: number, steps: number) {
  const box = await page.getByTestId('ai-summary').or(page.getByText('KI-Zusammenfassung')).first().boundingBox();
  if (!box) throw new Error('Keine Fläche zum Wischen gefunden');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps });
  await page.mouse.up();
}

test('Wischen entscheidet wie die Pfeiltasten', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'nick');
  await page.getByTestId('start-lead').click();
  await expect(currentCard(page)).toHaveAttribute('data-card-id', 'n11');

  // Kurzes, langsames Ziehen reicht nicht – die Seite federt zurück.
  await swipe(page, 60, 30);
  await page.waitForTimeout(700);
  await expect(page.getByTestId('progress')).toHaveText('0 von 14 erledigt');
  await expect(currentCard(page)).toHaveAttribute('data-card-id', 'n11');

  // Weit nach rechts ziehen = Vernetzen
  await swipe(page, 320, 12);
  await expect(page.locator('[data-card-id="n11"]')).toHaveCount(0);
  await expect(page.getByTestId('progress')).toHaveText('1 von 14 erledigt');

  // Nach links = Nicht geeignet
  await expect(currentCard(page)).toHaveAttribute('data-card-id', 'n12');
  await swipe(page, -320, 12);
  await expect(page.locator('[data-card-id="n12"]')).toHaveCount(0);
  await expect(page.getByTestId('progress')).toHaveText('2 von 14 erledigt');

  // Rückgängig holt die Aufgabe zurück
  await page.keyboard.press('z');
  await expect(currentCard(page)).toHaveAttribute('data-card-id', 'n12');
  expect(errors).toEqual([]);
});

test('Rückgängig stellt die letzte Entscheidung wieder her', async ({ page }) => {
  await login(page, 'nick');
  await startFocus(page);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('progress')).toHaveText('1 von 14 erledigt');
  await page.keyboard.press('z');
  await expect(page.getByTestId('progress')).toHaveText('0 von 14 erledigt');
  await expect(currentCard(page)).toHaveAttribute('data-card-id', 'n01');
});

test('Lead-Panel zeigt Historie und Zuordnung', async ({ page }) => {
  await login(page, 'nick');
  await startFocus(page);
  await page.getByTitle('Lead-Historie öffnen').click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Diesem Lead ist nur Nick zugeordnet – Johannes kann ihn nicht anschreiben.');
  await expect(panel).toContainText('Vernetzungsanfrage gesendet von Nick');
  await expect(panel).toContainText('Antwort von Tobias erhalten');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Esc schließt nur das Panel, nicht den Fokus-Modus
  await expect(page.getByTestId('progress')).toBeVisible();
});

test('Dashboard rendert alle Ansichten', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'johannes');
  await page.getByRole('button', { name: /Dashboard/ }).click();
  for (const title of ['Anfragen diese Woche', 'Annahmequote', 'Antwortquote', 'Termine', 'Exporte nach Close', 'Funnel']) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator('.recharts-surface').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Templates' }).click();
  await expect(page.getByText('Antwortquote je Template')).toBeVisible();
  await expect(page.getByText('Antwortquote je Follow-up-Stufe')).toBeVisible();
  expect(await page.locator('.recharts-surface').count()).toBeGreaterThanOrEqual(2);

  await page.getByRole('tab', { name: 'Nick vs. Johannes' }).click();
  await expect(page.getByText('Termine pro Woche')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Gesamt' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Abmelden und Gründer wechseln', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'nick');
  await startFocus(page);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('progress')).toHaveText('1 von 14 erledigt');
  await page.getByRole('button', { name: /Beenden/ }).click();
  await page.getByRole('button', { name: 'Konto: Nick' }).click();
  await page.getByText('Abmelden / Gründer wechseln').click();
  await page.getByTestId('login-johannes').click();
  await expect(page.getByTestId('open-count')).toHaveText('14');
  await startFocus(page);
  await expect(currentCard(page)).toHaveAttribute('data-card-id', 'j01');
  expect(errors).toEqual([]);
});

test('Demo zurücksetzen stellt den Ausgangszustand her', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'nick', '1');
  await expect(page.getByTestId('slack-toast')).toBeVisible();
  await startFocus(page);
  for (let i = 0; i < 4; i++) await processCurrentCard(page, i);
  await expect(page.getByTestId('progress')).toHaveText('4 von 15 erledigt');
  await page.keyboard.press('Escape');

  await page.getByTestId('reset-button').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByText('Willkommen zurück.')).toBeVisible();
  await expect(page.getByTestId('login-nick')).toContainText('14 Aufgaben');

  await page.getByTestId('login-nick').click();
  await expect(page.getByTestId('open-count')).toHaveText(/^1[45]$/);
  await startFocus(page);
  // 14 oder 15 – je nachdem, ob der Slack-Ping (nach 1 s) schon eingetroffen ist
  await expect(page.getByTestId('progress')).toHaveText(/^0 von 1[45] erledigt$/);
  await expect(currentCard(page)).toHaveAttribute('data-card-id', 'n01');
  // Slack-Ping kommt nach dem Reset erneut
  await expect(page.getByTestId('slack-toast')).toContainText('Jana Wiechert');
  expect(errors).toEqual([]);
});
