import { expect, test, type Page } from '@playwright/test';
import { signIn, trackErrors, resetCockpit } from './helpers';

/** Jeder Test beginnt mit den 30 Demo-Leads (alle Tests teilen sich ein Mock-Backend). */
test.beforeEach(async ({ request }) => resetCockpit(request));

async function openLeadSearch(page: Page) {
  await page.goto('/?ping=off');
  await signIn(page, 'nick');
  await page.getByTestId('nav-search').click();
  await expect(page.getByTestId('start-search')).toBeEnabled();
}

/** „Suche starten“ (↵) öffnet den Dialog mit den Einstellungen, ↵ dort startet. */
async function startFromSheet(page: Page) {
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('search-start-sheet')).toBeVisible();
  await expect(page.getByTestId('start-search-confirm')).toBeEnabled();
  await page.keyboard.press('Enter');
}

async function runSearch(page: Page) {
  await startFromSheet(page);
  await expect(page.getByTestId('run-title')).toHaveText('Suche läuft …');
  await expect(page.getByTestId('live-list')).toBeVisible();
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 30_000 });
}

const funnel = (page: Page, key: string) => page.getByTestId(`funnel-${key}`).locator('span').first();

test('Lead-Suche: Lauf, Trichter, Ergebnis und Übergabe in den Tagesstapel', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeadSearch(page);
  // Kein Modus-Schild mehr – die Software läuft immer echt.
  await expect(page.getByTestId('mode-hint')).toHaveCount(0);
  await expect(page.getByText(/Simulation|Beispieldaten/)).toHaveCount(0);

  // Eine Zeile fasst Region, Anzahl und Kontaktgrad zusammen – „Anpassen“ klappt die Felder auf.
  await expect(page.getByTestId('search-summary')).toContainText('Deutschland · 400 Treffer · 15 Profile · 2./3. Grad');
  await page.getByTestId('search-options-toggle').click();
  await expect(page.getByLabel('Region')).toHaveValue('Deutschland');

  // Profile pro Lauf: frei eintippbar, ohne feste 25er-Grenze (11.10.), höchstens 1000.
  const perRun = page.getByTestId('max-results-input');
  await expect(perRun).toHaveValue('15');
  await expect(page.getByTestId('max-results')).not.toContainText('von');
  await perRun.fill('200');
  await expect(page.getByTestId('search-summary')).toContainText('200 Profile');
  await perRun.fill('9999');
  await expect(page.getByTestId('search-summary')).toContainText('1000 Profile');
  await perRun.fill('15');
  await page.getByRole('button', { name: 'Mehr' }).click();
  await page.getByRole('button', { name: 'Weniger' }).click();
  await expect(perRun).toHaveValue('15');
  await expect(page.getByTestId('change-search-account')).toBeVisible();
  await expect(page.getByTestId('meta-ads-hint')).toContainText('aktive Meta-Ads werden markiert');

  await runSearch(page);
  // 7 qualifiziert, davon 2 mit aktiven Meta-Ads – Meta ist kein Ausschluss, nur der Aufhänger der Nachricht
  await expect(page.getByTestId('run-title')).toHaveText('7 neue Leads gefunden');
  await expect(funnel(page, 'found')).toHaveText('40');
  await expect(funnel(page, 'unique')).toHaveText('33');
  // KI-Vorprüfung anhand der Headline: Hausverwaltung und Makler fliegen ohne Profilabruf raus.
  await expect(funnel(page, 'screened')).toHaveText('31');
  await expect(page.getByTestId('funnel-enriched')).toContainText('Profil gelesen');
  await expect(funnel(page, 'enriched')).toHaveText('15');
  await expect(page.getByTestId('funnel-fit')).toHaveCount(0);
  await expect(funnel(page, 'qualified')).toHaveText('7');
  await expect(page.getByRole('tab', { name: /Schalten Meta-Ads\s*2/ })).toBeVisible();
  await expect(page.getByTestId('funnel-qualified')).toContainText('2 davon schalten gerade Meta-Ads');

  const rows = page.getByTestId('result-row');
  // Das Ergebnis öffnet bei den Qualifizierten, „Alle“ ist der letzte Reiter.
  await expect(page.getByRole('tab', { name: /^Qualifiziert/ })).toHaveAttribute('aria-selected', 'true');
  await expect(rows).toHaveCount(5);
  await page.getByRole('tab', { name: /^Alle/ }).click();
  await expect(rows).toHaveCount(40);
  await expect(rows.first()).toHaveAttribute('data-status', 'qualified');
  await expect(page.getByTestId('results')).toContainText('Bereits im Cockpit · Nick');
  await page.getByRole('tab', { name: /Schalten Meta-Ads/ }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-status', 'ads_active');
  await expect(rows.first()).toContainText(/Aktive Meta-Ads \(\d\) – von Hand prüfen/);
  await page.getByRole('tab', { name: /Qualifiziert/ }).click();
  await expect(rows).toHaveCount(5);
  await expect(page.getByTestId('results')).toContainText('Keine Meta-Ads gefunden');
  await expect(page.getByTestId('results')).toContainText('Meta-Ads beendet am');
  // Aussortiert: klarer Grund in der Liste, Erklärung beim Aufklappen (nicht nur „Makler“ oder „Sonstige“).
  await page.getByRole('tab', { name: /Aussortiert/ }).click();
  const wrongBranch = page.locator('[data-testid=result-row][data-status=rejected]').filter({ hasText: 'Falsche Branche' }).first();
  await wrongBranch.getByTestId('result-toggle').click();
  await expect(wrongBranch.getByTestId('lead-details')).toContainText('Warum aussortiert');
  await expect(wrongBranch.getByTestId('lead-details')).toContainText('Falsche Branche – gesucht sind nur Kapitalanlage-Vertriebe und Bauträger');
  // Von der KI-Vorprüfung aussortiert: Grund aus der Headline, kein Profil gelesen.
  await expect(page.locator('[data-testid=result-row][data-status=screened_out]')).toHaveCount(2);
  await expect(page.getByTestId('results')).toContainText('Vorprüfung: Maklerbüro – vermittelt fremde Objekte');
  await expect(page.getByTestId('rejected-summary')).toContainText('2 in der Vorprüfung aussortiert');
  await page.getByRole('tab', { name: /Alle/ }).click();

  // Übergabe per Enter
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('handoff-done')).toContainText('7 Leads liegen in deinem Tagesstapel');
  await expect(page.getByTestId('nav-home')).toContainText('21');

  // Rückgängig nimmt sie wieder heraus, erneute Übergabe legt sie wieder hinein
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByTestId('nav-home')).toContainText('14');
  await page.getByTestId('handoff').click();
  await expect(page.getByTestId('handoff-done')).toBeVisible();

  // „Jetzt abarbeiten“ öffnet die neuen Leads im Fokus-Modus
  await page.keyboard.press('Enter');
  const card = page.locator('[data-testid=stack-card]').last();
  await expect(card).toHaveAttribute('data-card-type', 'lead');
  await expect(card).toContainText('Neuer Lead');
  await expect(card).toContainText('Henrik Vossberg');
  await expect(card).toContainText('Passt (Kapitalanlage-Vertrieb) · 94 %');
  await expect(card).toContainText('Keine Meta-Ads · 2. Grad');
  await expect(page.getByTestId('progress')).toHaveText('0 von 21 erledigt');
  const firstId = await card.getAttribute('data-card-id');
  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-card-id="${firstId}"]`)).toHaveCount(0);
  await expect(page.getByTestId('progress')).toHaveText('1 von 21 erledigt');

  // Historie zeigt die Herkunft
  await page.getByTitle('Lead-Historie öffnen').click();
  await expect(page.getByRole('dialog')).toContainText('Über die Lead-Suche gefunden');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('zweiter Lauf: bereits geprüfte und übergebene Leads werden aussortiert', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeadSearch(page);
  await runSearch(page);
  await page.getByTestId('handoff').click();
  await expect(page.getByTestId('handoff-done')).toBeVisible();

  await page.getByTestId('new-search').click();
  await expect(page.getByTestId('start-search')).toBeEnabled();
  await runSearch(page);
  // 15 mit Profil geprüfte und 2 in der Vorprüfung aussortierte zählen jetzt als „bereits geprüft“.
  await expect(funnel(page, 'unique')).toHaveText('16');
  await expect(funnel(page, 'qualified')).toHaveText('5');
  await page.getByRole('tab', { name: /^Alle/ }).click();
  await expect(page.getByTestId('results')).toContainText('In einem früheren Lauf bereits geprüft');
  await expect(page.getByTestId('results')).toContainText('Einschätzung zu unsicher (52 %)');
  expect(errors).toEqual([]);
});

test('Abbrechen beendet den Lauf, das Ergebnis bleibt sichtbar', async ({ page }) => {
  await openLeadSearch(page);
  await startFromSheet(page);
  await expect(page.getByTestId('run-title')).toHaveText('Suche läuft …');
  await page.waitForTimeout(1200);
  await page.getByTestId('cancel-search').click();
  await expect(page.getByTestId('run-title')).toHaveText('Suche abgebrochen');
  await expect(page.getByTestId('results')).toBeVisible();
});

test('Neuladen während eines Laufs: die laufende Suche wird übernommen statt blockiert', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeadSearch(page);
  await startFromSheet(page);
  await expect(page.getByTestId('run-title')).toHaveText('Suche läuft …');
  await page.reload();
  await signIn(page, 'nick');
  await page.getByTestId('nav-search').click();
  await page.getByTestId('start-search').click();
  await page.getByTestId('start-search-confirm').click();
  await expect(page.getByTestId('live-list').or(page.getByTestId('results'))).toBeVisible();
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('run-title')).toHaveText('7 neue Leads gefunden');
  expect(errors.filter((error) => !error.includes('409'))).toEqual([]);
});

test('Ergebnis: Details je Lead aufklappen', async ({ page }) => {
  await openLeadSearch(page);
  await page.getByTestId('search-options-toggle').click();
  await expect(page.getByTestId('tracking-row')).toContainText('Tracking-Liste hochladen');
  await runSearch(page);
  await page.getByTestId('result-toggle').first().click();
  const details = page.getByTestId('lead-details');
  await expect(details).toContainText('KI-Einschätzung');
  await expect(details).toContainText('Firmenbeschreibung');
  await expect(details).toContainText('KI-Zusammenfassung');
  await expect(page.getByTestId('profile-link')).toHaveAttribute('href', /linkedin\.com\/in\//);
  await expect(page.getByTestId('meta-ads-details')).toContainText(/Keine Meta-Ads gefunden|Beendet am/);
  await expect(page.getByTestId('ad-library-link')).toHaveAttribute('href', /^https:\/\/www\.facebook\.com\/ads\/library\/\?active_status=all&ad_type=all&country=DE/);
  await page.getByTestId('result-toggle').first().click();
  await expect(details).toHaveCount(0);
});

test('Aussortiert nennt die Gründe in einer Zeile', async ({ page }) => {
  await openLeadSearch(page);
  await runSearch(page);
  await expect(page.getByTestId('rejected-summary')).toHaveCount(0);
  await page.getByRole('tab', { name: /^Aussortiert/ }).click();
  await expect(page.getByTestId('rejected-summary')).toContainText('von der KI aussortiert');
  await expect(page.getByTestId('rejected-summary')).toContainText('Dubletten');
});

test('Nicht eingerichtet: Hinweis führt in die Einstellungen, nicht auf die Shell', async ({ page }) => {
  await page.route('**/api/lead-search/config*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, mode: 'live', ready: false, problems: ['Das Unipile-Token fehlt.'] } });
  });
  await page.goto('/?ping=off');
  await signIn(page, 'nick');
  await page.getByTestId('nav-search').click();
  const notice = page.getByRole('status').filter({ hasText: 'noch nicht eingerichtet' });
  await expect(notice).toContainText('Das Unipile-Token fehlt.');
  await expect(notice).not.toContainText('.env');
  await expect(page.getByTestId('start-search')).toBeDisabled();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-section-title')).toHaveText('Auf einen Blick');
  await expect(page.getByTestId('settings-overview')).toBeVisible();
});

test('Übergabe verteilt auf beide Gründer: Meldung nennt, wie viele bei wem gelandet sind', async ({ page }) => {
  const errors = trackErrors(page);
  // Das Backend verteilt mit LEAD_DISTRIBUTION=balanced – hier simuliert: 3 der neuen Leads gehören Johannes.
  await page.route('**/api/leads', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    body.created = body.created.map((lead: { owner: string }, index: number) => (index < 3 ? { ...lead, owner: 'johannes' } : lead));
    await route.fulfill({ response, json: body });
  });
  await openLeadSearch(page);
  await runSearch(page);
  await page.getByTestId('handoff').click();
  await expect(page.getByTestId('handoff-done')).toContainText('7 Leads liegen in deinem Tagesstapel');
  // Sofort speichern statt nach der Rückgängig-Frist: Tab geht in den Hintergrund (Outbox schickt dann alles los).
  await page.evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await expect(page.getByTestId('handoff-done')).toContainText('4 Leads bei dir, 3 bei Johannes');
  expect(errors).toEqual([]);
});

test('Start-Dialog: Einstellungen der Lead-Suche direkt vor dem Start ändern, „Jetzt suchen“ speichert und startet', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeadSearch(page);
  await page.getByTestId('start-search').click();
  const sheet = page.getByTestId('search-start-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('sheet-search-hits-input')).toHaveValue('400');
  // Erklärung, was der Lauf mit den Zahlen macht (Simulation: keine Warteliste).
  await expect(page.getByTestId('sheet-run-plan-hits')).toHaveText('Bis zu 400 neue Treffer von LinkedIn.');
  const profiles = await page.getByTestId('sheet-max-results-input').inputValue();
  await page.getByTestId('sheet-search-hits-input').fill('20');
  await page.getByTestId('sheet-max-results-input').fill('50');
  await expect(page.getByTestId('sheet-run-plan-hits')).toHaveText('Bis zu 50 neue Treffer von LinkedIn.');
  await expect(page.getByTestId('sheet-run-plan-raised')).toBeVisible();
  await page.getByTestId('sheet-max-results-input').fill(profiles);
  // Esc schließt, ohne etwas zu ändern.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await page.getByTestId('start-search').click();
  await page.getByTestId('sheet-confidence-input').fill('50');
  await page.getByTestId('sheet-auto-qualify').fill('Bauträger, Wohnbau');
  await page.getByRole('tab', { name: 'Auf beide' }).click();
  await page.getByTestId('start-search-confirm').click();
  await expect(page.getByTestId('run-title')).toHaveText('Suche läuft …');

  const saved = await page.evaluate(async () => (await (await fetch('/api/settings')).json()) as { settings: Array<{ key: string; value: unknown }> });
  const value = (key: string) => saved.settings.find((entry) => entry.key === key)?.value;
  expect(value('QUALIFY_MIN_CONFIDENCE')).toBe(0.5);
  expect(value('AUTO_QUALIFY_TERMS')).toBe('Bauträger, Wohnbau');
  expect(value('LEAD_DISTRIBUTION')).toBe('balanced');
  expect(value('SEARCH_HITS_PER_RUN')).toBe(400);
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 30_000 });
  // Aufräumen: Die Einstellungen gelten für alle späteren Tests (gemeinsames Mock-Backend).
  const reset = await page.evaluate(async () => {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ changes: { QUALIFY_MIN_CONFIDENCE: null, AUTO_QUALIFY_TERMS: null, LEAD_DISTRIBUTION: null } }),
    });
    return response.status;
  });
  expect(reset).toBe(200);
  expect(errors).toEqual([]);
});

test('Von Hand qualifizieren: vor der Übergabe zählt der Lead mit, danach liegt er sofort im Cockpit; Spielstand', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeadSearch(page);
  await runSearch(page);
  await expect(page.getByTestId('run-title')).toHaveText('7 neue Leads gefunden');

  // Spielstand: neue Leads, Preis je Lead, Trefferquote, Warteliste (ohne Tagesziel).
  await expect(page.getByTestId('run-score')).toBeVisible();
  await expect(page.getByTestId('score-leads-value')).toHaveText('+7');
  await expect(page.getByTestId('score-price-value')).toContainText('€');
  await expect(page.getByTestId('score-rate')).toContainText('7 von 40 Treffern');
  await expect(page.getByTestId('score-waiting-value')).toHaveText('16');

  // Aussortierte lassen sich von Hand qualifizieren – vor der Übergabe gehen sie dann mit.
  await page.getByRole('tab', { name: /^Aussortiert/ }).click();
  await expect(page.getByTestId('rejected-summary')).toContainText('Passt doch einer?');
  const rejected = page.locator('[data-testid="result-row"][data-status="rejected"]').first();
  await rejected.getByTestId('qualify-manually').click();
  await expect(page.getByTestId('handoff')).toContainText('8 Leads in den Tagesstapel');
  await expect(page.getByTestId('run-title')).toHaveText('8 neue Leads gefunden');
  await expect(page.getByTestId('score-leads')).toContainText('1 davon von Hand');
  await page.getByRole('tab', { name: /^Qualifiziert/ }).click();
  await expect(page.getByTestId('results')).toContainText('Von Hand qualifiziert');
  // Dubletten haben keinen Knopf.
  await page.getByRole('tab', { name: /^Alle/ }).click();
  await expect(page.locator('[data-testid="result-row"][data-status="duplicate"]').first().getByTestId('qualify-manually')).toHaveCount(0);

  await page.getByTestId('handoff').click();
  await expect(page.getByTestId('handoff-done')).toContainText('8 Leads');

  // Nach der Übergabe: sofort angelegt (auch ohne Profilabruf, z. B. aus der Vorprüfung).
  const total = async () => ((await (await page.request.get('/api/leads?limit=1')).json()) as { total: number }).total;
  await expect.poll(total).toBeGreaterThan(0);
  const before = await total();
  await page.getByRole('tab', { name: /^Aussortiert/ }).click();
  await page.locator('[data-testid="result-row"][data-status="screened_out"]').first().getByTestId('qualify-manually').click();
  await expect(page.getByTestId('manual-placed')).toHaveText('1 Lead von Hand qualifiziert – liegt im Cockpit');
  expect(await total()).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('Zielgruppe: Kapitalanlage oder Bauträger setzt das passende Preset, eigene Änderung hebt die Markierung auf', async ({ page }) => {
  const errors = trackErrors(page);
  await openLeadSearch(page);
  const picker = page.getByRole('tablist', { name: 'Zielgruppe' });
  // Standard = beide Zielgruppen.
  await expect(picker.getByRole('tab', { name: 'Beide' })).toHaveAttribute('aria-selected', 'true');
  await picker.getByRole('tab', { name: 'Bauträger' }).click();
  await expect(page.getByTestId('keywords')).toContainText('Projektentwickler');
  await expect(page.getByTestId('keywords')).not.toContainText('Kapitalanlage');
  await expect(page.getByTestId('positions')).toContainText('Prokurist');
  await expect(page.getByTestId('audience-hint')).toContainText('Bauträger und Projektentwickler');
  await picker.getByRole('tab', { name: 'Kapitalanlage' }).click();
  await expect(page.getByTestId('keywords')).toContainText('Kapitalanlageimmobilien');
  await expect(page.getByTestId('positions')).toContainText('Vertriebsleiter');
  await picker.getByRole('tab', { name: 'Beide' }).click();
  await expect(picker.getByRole('tab', { name: 'Beide' })).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});
