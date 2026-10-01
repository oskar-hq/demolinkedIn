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
  await expect(page.getByTestId('progress')).toBeVisible();
}

/** Bearbeitet die aktuelle Karte per Tastatur und wartet, bis sie den Stapel verlassen hat. */
async function processCurrentCard(page: Page, index: number) {
  const card = page.locator('[data-testid=stack-card]').last();
  const id = await card.getAttribute('data-card-id');
  const type = await card.getAttribute('data-card-type');
  const positive = index % 3 !== 2;

  switch (type) {
    case 'reply':
      if (positive) {
        await page.keyboard.press('ArrowRight');
        await expect(page.getByRole('dialog')).toContainText('Export nach Close');
        await page.keyboard.press('Enter');
      } else {
        await page.keyboard.press('ArrowLeft');
      }
      break;
    case 'followup':
      await page.keyboard.press('2');
      await page.keyboard.press(positive ? 'ArrowRight' : 'ArrowLeft');
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
      await page.keyboard.press(positive ? 'ArrowRight' : 'ArrowLeft');
  }
  await expect(page.locator(`[data-card-id="${id}"]`)).toHaveCount(0);
  return type;
}

for (const founder of ['nick', 'johannes'] as const) {
  test(`kompletter Stapel-Durchlauf (${founder})`, async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, founder, '2');
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
    expect(errors).toEqual([]);
  });
}

test('Slack-Ping springt zur neuen Antwort', async ({ page }) => {
  await login(page, 'johannes', '1');
  const toast = page.getByTestId('slack-toast');
  await expect(toast).toContainText('Neue Antwort von Sabine Krüger an Johannes');
  // zuerst auf einen anderen Filter wechseln, damit der Sprung sichtbar ist
  await page.getByRole('tab', { name: /Neue Leads/ }).click();
  await toast.click();
  const card = page.locator('[data-testid=stack-card]').last();
  await expect(card).toHaveAttribute('data-card-id', 'j04');
  await expect(card).toContainText('Neue Antwort');
  await expect(page.getByTestId('progress')).toHaveText('0 von 15 erledigt');
});

test('Rückgängig stellt die letzte Entscheidung wieder her', async ({ page }) => {
  await login(page, 'nick');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('progress')).toHaveText('1 von 14 erledigt');
  await page.keyboard.press('z');
  await expect(page.getByTestId('progress')).toHaveText('0 von 14 erledigt');
  await expect(page.locator('[data-testid=stack-card]').last()).toHaveAttribute('data-card-id', 'n01');
});

test('Lead-Panel zeigt Historie und Zuordnung', async ({ page }) => {
  await login(page, 'nick');
  await page.getByTitle('Lead-Historie öffnen').first().click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Diesem Lead ist nur Nick zugeordnet – Johannes kann ihn nicht anschreiben.');
  await expect(panel).toContainText('Vernetzungsanfrage gesendet von Nick');
  await expect(panel).toContainText('Antwort von Tobias erhalten');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Dashboard rendert alle Diagramme', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'johannes');
  await page.getByRole('button', { name: /Dashboard/ }).click();
  for (const title of ['Anfragen diese Woche', 'Annahmequote', 'Antwortquote', 'Termine', 'Exporte nach Close', 'Funnel', 'Nick vs. Johannes']) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  expect(await page.locator('.recharts-surface').count()).toBeGreaterThanOrEqual(4);
  await page.getByRole('tab', { name: 'Nick' }).click();
  await expect(page.getByRole('tab', { name: 'Nick' })).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('Schnelles Durcharbeiten per Tastatur', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'nick');
  await page.getByRole('tab', { name: /Neue Leads/ }).click();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('progress')).toHaveText('5 von 14 erledigt');
  await expect(page.getByText('Keine offenen Neue Leads mehr')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Abmelden und Gründer wechseln', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'nick');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('progress')).toHaveText('1 von 14 erledigt');
  await page.getByRole('button', { name: 'Konto: Nick' }).click();
  await page.getByText('Abmelden / Gründer wechseln').click();
  await page.getByTestId('login-johannes').click();
  await expect(page.getByTestId('progress')).toHaveText('0 von 14 erledigt');
  await expect(page.locator('[data-testid=stack-card]').last()).toHaveAttribute('data-card-id', 'j01');
  expect(errors).toEqual([]);
});

test('Demo zurücksetzen stellt den Ausgangszustand her', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, 'nick', '1');
  await expect(page.getByTestId('slack-toast')).toBeVisible();
  for (let i = 0; i < 4; i++) await processCurrentCard(page, i);
  await expect(page.getByTestId('progress')).toHaveText('4 von 15 erledigt');

  await page.getByTestId('reset-button').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByText('Willkommen zurück.')).toBeVisible();
  await expect(page.getByTestId('login-nick')).toContainText('14 Karten');

  await page.getByTestId('login-nick').click();
  await expect(page.getByTestId('progress')).toHaveText('0 von 14 erledigt');
  await expect(page.locator('[data-testid=stack-card]').last()).toHaveAttribute('data-card-id', 'n01');
  // Slack-Ping kommt nach dem Reset erneut
  await expect(page.getByTestId('slack-toast')).toContainText('Jana Wiechert');
  expect(errors).toEqual([]);
});
