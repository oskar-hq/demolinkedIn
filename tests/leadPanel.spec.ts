import { expect, test, type Page } from '@playwright/test';
import { findLead, resetCockpit, settledBox, signIn, trackErrors } from './helpers';

/**
 * Lead-Panel gegen das Mock-Backend: Score-Karte, Firmendaten holen (`POST /api/leads/:id/enrich`) und von Hand
 * eintragen (`POST /api/leads/:id/events`, `PATCH /api/leads/:id`). Neue Leads sind in der Simulation noch nicht
 * angereichert – der erste neue Lead von Nick ist Henrik Saalfeld.
 */
test.beforeEach(async ({ request }) => resetCockpit(request));

async function openFirstNewLead(page: Page) {
  await page.goto('/?ping=off');
  await signIn(page, 'nick');
  await page.getByTestId('start-lead').click();
  await expect(page.locator('[data-testid=stack-card]').last().getByTestId('lead-name')).toHaveText('Henrik Saalfeld');
  await page.getByTitle('Lead-Historie öffnen').click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Henrik Saalfeld');
  return panel;
}

test('Lead-Panel: Score, Firmendaten holen, Notiz und nächster Schritt', async ({ page }) => {
  const errors = trackErrors(page);
  const panel = await openFirstNewLead(page);

  // Score-Teile hinter „Details“
  const score = panel.getByTestId('score-card');
  await expect(score.getByTestId('score-total')).toHaveText(/^\d{1,3}\s*\/ 100$/);
  await panel.getByTestId('panel-details-toggle').click();
  await expect(panel.getByTestId('score-details')).toContainText('Hard-Filter');

  // Firmendaten: neutral beschriftet, Ergebnis aus der Simulation
  const company = panel.getByTestId('company-data');
  await company.getByRole('button', { name: 'Firmendaten holen' }).click();
  await expect(company).toContainText('Mitarbeiter', { timeout: 10_000 });
  await expect(company).toContainText('Beispieldaten');
  await expect(company.getByRole('button', { name: 'Firmendaten holen' })).toHaveCount(0);
  await expect(panel).toContainText('Firmendaten ergänzt');

  // Notiz
  const actions = panel.getByTestId('lead-actions');
  await actions.getByRole('button', { name: 'Notiz' }).click();
  await actions.getByLabel('Notiz').fill('Hat auf der Messe Interesse gezeigt.');
  await actions.getByRole('button', { name: 'Notiz speichern' }).click();
  await expect(panel).toContainText('Hat auf der Messe Interesse gezeigt.');

  // Nächster Schritt: Esc verwirft (Panel bleibt offen), ↵ speichert
  await actions.getByTestId('next-step').click();
  await actions.getByLabel('Nächster Schritt').fill('Verworfen');
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await expect(actions.getByTestId('next-step')).toContainText('noch keiner');
  await actions.getByTestId('next-step').click();
  await actions.getByLabel('Nächster Schritt').fill('Nach der Anfrage Termin vorschlagen');
  await page.keyboard.press('Enter');
  await expect(actions.getByTestId('next-step')).toContainText('Nach der Anfrage Termin vorschlagen');

  // Wirklich gespeichert
  const lead = (await findLead(page, 'nick', 'Henrik Saalfeld')) as { nextStep?: string | null; enrichment?: { status: string } | null };
  expect(lead.nextStep).toBe('Nach der Anfrage Termin vorschlagen');
  expect(lead.enrichment?.status).toBe('done');

  // Aus der Stufe „Neu“ gehen Antwort und Termin noch nicht
  await expect(actions.getByRole('button', { name: 'Antwort eintragen' })).toHaveCount(0);
  await expect(actions.getByRole('button', { name: 'Termin vereinbart' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Lead-Panel: an den anderen Gründer übergeben und als verloren eintragen', async ({ page }) => {
  const errors = trackErrors(page);
  const panel = await openFirstNewLead(page);
  const actions = panel.getByTestId('lead-actions');

  await actions.getByRole('button', { name: 'An Johannes übergeben' }).click();
  await expect(panel).toContainText('Zuständig: Johannes');
  expect((await findLead(page, 'johannes', 'Henrik Saalfeld')).stage).toBe('new');

  await actions.getByRole('button', { name: 'Verloren' }).click();
  await actions.getByLabel('Als verloren markieren').fill('Passt doch nicht');
  await actions.getByRole('button', { name: 'Als verloren eintragen' }).click();
  await expect(panel).toContainText('Passt doch nicht');
  await expect(actions.getByRole('button', { name: 'Verloren' })).toHaveCount(0);
  expect((await findLead(page, 'johannes', 'Henrik Saalfeld')).stage).toBe('lost');

  // „Verloren“ ist nicht endgültig: wieder öffnen – ohne Anfrage zurück nach „Neu“.
  await actions.getByTestId('action-reopen').click();
  await expect(actions.getByRole('button', { name: 'Verloren' })).toBeVisible();
  await expect(actions.getByTestId('action-reopen')).toHaveCount(0);
  expect((await findLead(page, 'johannes', 'Henrik Saalfeld')).stage).toBe('new');

  // Zurück im Stapel: die Karte ist nicht mehr Nicks Aufgabe
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('stale-card').or(page.locator('[data-testid=stack-card]').last())).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('Touch', () => {
  test.use({ hasTouch: true });

  test('Lead-Panel: mit dem Finger nach rechts wegwischen schließt, kurzer Zug federt zurück', async ({ page }) => {
    const panel = await openFirstNewLead(page);
    const box = await settledBox(panel);
    const y = box.y + 160;
    const startX = box.x + 60;
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (distance: number, steps: number, holdMs = 0) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + (distance * i) / steps, y }] });
      }
      if (holdMs) await page.waitForTimeout(holdMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    // Kurz und langsam: bleibt offen und kehrt an seinen Platz zurück.
    await swipe(30, 6, 150);
    await expect(panel).toBeVisible();
    expect((await settledBox(panel)).x).toBeCloseTo(box.x, 0);

    // Weit nach rechts: schließt.
    await swipe(260, 8);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test('Lead-Panel: Deal Value und Meta-Ads von Hand – Dashboard zeigt den offenen Deal Value', async ({ page }) => {
  const errors = trackErrors(page);
  const panel = await openFirstNewLead(page);
  const actions = panel.getByTestId('lead-actions');

  // Deal Value: „25.000“ wird zu 25000 €
  await expect(actions.getByTestId('deal-value')).toContainText('noch keiner');
  await actions.getByTestId('deal-value').click();
  await actions.getByTestId('deal-value-input').fill('25.000');
  await page.keyboard.press('Enter');
  await expect(actions.getByTestId('deal-value')).toContainText('25.000 €');
  await expect(panel).toContainText('Deal Value: 25.000 €');

  // Meta-Ads: „Aus“ seit einem Datum → Reactivation, mit Dauer
  await actions.getByTestId('meta-ads').click();
  await actions.getByTestId('meta-ads-stopped').click();
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await actions.getByTestId('meta-ads-since').fill(since);
  await expect(actions.getByTestId('meta-ads-form')).toContainText('seit rund 4 Monaten');
  await actions.getByTestId('meta-ads-save').click();
  await expect(actions.getByTestId('meta-ads')).toContainText('aus · seit rund 4 Monaten · von Hand');
  const lead = (await findLead(page, 'nick', 'Henrik Saalfeld')) as { dealValue?: number | null; metaAds?: { state: string; manual?: boolean } | null; score?: { leadType: string } | null };
  expect(lead.dealValue).toBe(25000);
  expect(lead.metaAds?.state).toBe('stopped');
  expect(lead.score?.leadType).toBe('reactivation');

  // Dashboard: offener Deal Value (Esc schließt das Panel, dann den Fokus-Modus)
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByTestId('nav-dashboard').click();
  await expect(page.getByTestId('deal-value-total')).toHaveText(/25\.000\s€/);
  await expect(page.getByTestId('deal-value-new')).toContainText('25.000');
  // KI-Kosten gegen den offenen Deal Value (Simulation: Beispielwerte der letzten 21 Tage).
  const aiCost = page.getByTestId('ai-cost-section');
  await expect(aiCost).toBeVisible();
  await expect(page.getByTestId('ai-cost-total')).toHaveText(/^\d+,\d{2}\s€$/);
  await expect(page.getByTestId('ai-cost-deal-value')).toHaveText(/25\.000\s€/);
  await expect(page.getByTestId('ai-cost-ratio')).toContainText('Der offene Deal Value deckt die KI-Kosten');
  // Durchschnitt je qualifiziertem Lead (Simulation: Demo-Leads), je Abschluss noch keiner übergeben.
  await expect(page.getByTestId('ai-cost-per-lead')).toHaveText(/^\d+,\d{2}\s€$/);
  await expect(page.getByTestId('ai-cost-per-closed')).toHaveText('–');
  await expect(page.getByTestId('ai-cost-section')).toContainText('noch keiner übergeben');
  await expect(page.getByTestId('ai-cost-qualify')).toContainText('Einstufung der Profile');
  expect(errors).toEqual([]);
});
