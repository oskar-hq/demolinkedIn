import { expect, test, type Page } from '@playwright/test';
import { findLead, resetCockpit, signIn, trackErrors } from './helpers';

/**
 * Manueller Betrieb (gesendet wird von Hand auf LinkedIn): angenommene Anfragen eintragen, „Braucht Aufmerksamkeit“,
 * „Wieder öffnen“, Board-Ziehen nach „Vernetzt“/„Verloren“ und ein Stapel, der neue Antworten und Leads aufnimmt.
 */
test.beforeEach(async ({ request }) => resetCockpit(request));

const DAY = 24 * 60 * 60 * 1000;

interface ApiLead {
  id: string;
  stage: string;
  person: { firstName: string; lastName: string };
}

async function login(page: Page, params = 'ping=off&undo=0') {
  await page.goto(`/?${params}`);
  await signIn(page, 'nick');
}

const nameOf = (lead: ApiLead) => `${lead.person.firstName} ${lead.person.lastName}`;

async function leadsIn(page: Page, stage: string): Promise<ApiLead[]> {
  const response = await page.request.get(`/api/leads?owner=nick&stage=${stage}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { leads: ApiLead[] }).leads;
}

async function act(page: Page, leadId: string, body: object) {
  const response = await page.request.post(`/api/leads/${leadId}/events`, { data: body });
  expect(response.status(), await response.text()).toBe(200);
}

/** Startseite neu aufbauen (Seite neu laden, Sitzung bleibt). */
async function reloadHome(page: Page) {
  await page.reload();
  await signIn(page, 'nick');
}

test('Startseite: offene Anfragen als angenommen eintragen, „Braucht Aufmerksamkeit“, verloren und wieder öffnen', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  const [stale, recent] = await leadsIn(page, 'new');
  await act(page, stale.id, { action: 'invite_sent', at: Date.now() - 20 * DAY });
  await act(page, recent.id, { action: 'invite_sent' });
  await reloadHome(page);

  await expect(page.getByTestId('start-first')).toContainText('3');
  await expect(page.getByTestId('invites-toggle')).toContainText('Offene Anfragen · 2');
  await expect(page.getByTestId('attention-toggle')).toContainText('Braucht Aufmerksamkeit · 1');

  // Offene Anfragen: älteste zuerst, „Angenommen“ mit einem Klick – die Erstnachricht steht danach im Stapel.
  await page.getByTestId('invites-toggle').click();
  const rows = page.getByTestId('invites-list').getByTestId('invite-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(nameOf(stale));
  await rows.filter({ hasText: nameOf(recent) }).getByTestId('row-accepted').click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('start-first')).toContainText('4');
  expect((await findLead(page, 'nick', nameOf(recent))).stage).toBe('connected');

  // Braucht Aufmerksamkeit: Anfrage seit 20 Tagen offen → verloren (mit Rückfrage).
  await page.getByTestId('attention-toggle').click();
  const item = page.getByTestId('attention-list').getByTestId('attention-invite_stale');
  await expect(item).toContainText(nameOf(stale));
  await expect(item).toContainText('Anfrage seit 20 Tagen offen');
  page.once('dialog', (dialog) => void dialog.dismiss());
  await item.getByTestId('row-lost').click();
  expect((await findLead(page, 'nick', nameOf(stale))).stage).toBe('invited');
  page.once('dialog', (dialog) => void dialog.accept());
  await item.getByTestId('row-lost').click();
  await expect(page.getByTestId('home-lists')).toHaveCount(0);
  expect((await findLead(page, 'nick', nameOf(stale))).stage).toBe('lost');

  // Im Board unter „Abgeschlossene zeigen“ wiederfinden und wieder öffnen – zurück nach „Anfrage gesendet“.
  await page.getByTestId('nav-leads').click();
  await expect(page.getByTestId('column-lost')).toContainText('Ausgeblendet');
  await page.getByTestId('show-closed-lost').click();
  await page.getByTestId('column-lost').getByTestId('board-card').filter({ hasText: nameOf(stale) }).click();
  await page.getByRole('dialog').getByTestId('action-reopen').click();
  await expect(page.getByRole('dialog')).toContainText('Wieder geöffnet · Anfrage gesendet');
  expect((await findLead(page, 'nick', nameOf(stale))).stage).toBe('invited');
  expect(errors).toEqual([]);
});

test('Lead-Panel: „Anfrage angenommen“ aus „Neu“; Board: nach „Vernetzt“ ziehen, „Verloren“ nur mit Rückfrage', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  const [first, second] = await leadsIn(page, 'new');
  await act(page, second.id, { action: 'invite_sent' });

  await page.getByTestId('nav-leads').click();
  const board = page.getByTestId('leads-board');
  // Abgeschlossene sind zunächst ausgeblendet; das Menü blendet sie ein und wieder aus.
  await expect(board.getByTestId('column-handed_over')).toContainText('Ausgeblendet');
  await page.getByTestId('leads-view-options').click();
  await page.getByRole('menuitemcheckbox', { name: 'Abgeschlossene zeigen' }).click();
  await expect(board.getByTestId('column-handed_over')).not.toContainText('Ausgeblendet');
  await page.getByTestId('leads-view-options').click();
  await page.getByRole('menuitemcheckbox', { name: 'Abgeschlossene zeigen' }).click();
  await expect(board.getByTestId('column-handed_over')).toContainText('Ausgeblendet');

  // Ziehen: „Anfrage gesendet“ → „Vernetzt“ = angenommen.
  const card = board.getByTestId('column-invited').getByTestId('board-card').filter({ hasText: nameOf(second) });
  await card.dragTo(board.getByTestId('column-connected'));
  await expect(board.getByTestId('column-connected')).toContainText(nameOf(second));
  expect((await findLead(page, 'nick', nameOf(second))).stage).toBe('connected');

  // Ziehen nach „Verloren“ (hier aus „Antwort“ – beide Spalten müssen zugleich sichtbar sein): erst Rückfrage,
  // Abbrechen lässt alles, wie es ist.
  const [replied] = await leadsIn(page, 'replied');
  await board.getByTestId('column-lost').scrollIntoViewIfNeeded();
  const repliedCard = board.getByTestId('column-replied').getByTestId('board-card').filter({ hasText: nameOf(replied) });
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void (dialogs.length === 1 ? dialog.dismiss() : dialog.accept());
  });
  await repliedCard.dragTo(board.getByTestId('column-lost'));
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain(`${nameOf(replied)} als verloren markieren?`);
  await expect(board.getByTestId('column-replied')).toContainText(nameOf(replied));
  expect((await findLead(page, 'nick', nameOf(replied))).stage).toBe('replied');
  await repliedCard.dragTo(board.getByTestId('column-lost'));
  await expect.poll(() => dialogs.length).toBe(2);
  await expect(board.getByTestId('column-replied')).not.toContainText(nameOf(replied));
  expect((await findLead(page, 'nick', nameOf(replied))).stage).toBe('lost');

  // Lead-Panel: angenommen eintragen, ohne die Anfrage vorher im Cockpit gebucht zu haben.
  await board.getByTestId('column-new').getByTestId('board-card').filter({ hasText: nameOf(first) }).click();
  const panel = page.getByRole('dialog');
  await panel.getByTestId('action-accepted').click();
  await expect(panel.getByTestId('action-accepted')).toHaveCount(0);
  expect((await findLead(page, 'nick', nameOf(first))).stage).toBe('connected');
  expect(errors).toEqual([]);
});

test('Leads: Hinweis, wenn nicht alle Leads geladen sind', async ({ page }) => {
  await login(page);
  await page.route(/\/api\/leads\?/, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { leads: unknown[]; total: number };
    await route.fulfill({ response, json: { ...body, total: 1234 } });
  });
  await page.getByTestId('nav-leads').click();
  // Board: „Neu“ und die übrigen Stufen sind zwei Abfragen (je 1234 Treffer).
  await expect(page.getByTestId('leads-limit')).toContainText('zuletzt bearbeiteten von 2468 Leads');
});

test('Stapel: zweite Antwort am selben Tag ist wieder offen, neue Leads kommen hinten dazu', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await expect(page.getByTestId('start-reply')).toContainText('3');
  await expect(page.getByTestId('start-lead')).toContainText('5');

  // Antwort beantworten …
  await page.getByTestId('start-reply').click();
  const card = page.locator('[data-testid=stack-card]').last();
  await expect(card).toHaveAttribute('data-card-type', 'reply');
  const name = await card.getByTestId('lead-name').textContent();
  await card.getByTestId('reply-answer').locator('textarea').fill('Danke – Donnerstag passt!');
  const saved = page.waitForResponse((response) => /\/api\/leads\/[^/]+\/(events|linkedin\/message)$/.test(response.url()) && response.request().method() === 'POST');
  await card.getByTestId('reply-send').click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByTestId('progress')).toContainText('1 von');

  // … und der Lead schreibt noch am selben Tag zurück: neue Aufgabe, nicht „erledigt“.
  const lead = await findLead(page, 'nick', name ?? '');
  await act(page, lead.id, { action: 'message_received', text: 'Super, und wer kommt noch dazu?' });
  // Ein Lead aus einer Suche, die gerade anderswo lief (z. B. automatische Suche).
  const created = await page.request.post('/api/leads', {
    data: {
      owner: 'nick',
      cards: [
        {
          runId: '22222222-2222-4222-8222-222222222222',
          mode: 'mock',
          providerId: `ACoNEUWORKFLOW${Date.now()}`,
          publicIdentifier: null,
          profileUrl: null,
          firstName: 'Wiebke',
          lastName: 'Neumann',
          headline: 'Geschäftsführerin · Neumann Wohnbau',
          position: 'Geschäftsführerin',
          company: 'Neumann Wohnbau GmbH',
          location: 'Bremen',
          website: null,
          networkDistance: 2,
          category: 'bautraeger_projektentwickler',
          confidence: 0.9,
          reason: 'Bauträger mit Eigenvertrieb.',
          summary: 'Bauträger aus Bremen.',
          metaAds: null,
        },
      ],
    },
  });
  expect(created.status(), await created.text()).toBe(200);

  // Esc zurück zur Startseite (ein erstes Esc verlässt ggf. nur das Textfeld der nächsten Karte).
  await expect(async () => {
    if (!(await page.getByTestId('home').isVisible())) await page.keyboard.press('Escape');
    await expect(page.getByTestId('home')).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(page.getByTestId('start-reply')).toContainText('3');
  await expect(page.getByTestId('start-lead')).toContainText('6');
  expect(errors).toEqual([]);
});
