import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/database.js';
import { buildDemoHistory } from '../src/leads/demoHistory.js';
import { LeadStore } from '../src/leads/leadStore.js';
import { computeTasks } from '../src/tasks/dailyTasks.js';
import { tempDataDir } from './helpers.js';

test('Demo-Verlauf: fest, abgeschlossen und vor jetzt', () => {
  const history = buildDemoHistory();
  assert.deepEqual(buildDemoHistory(), history, 'gleicher Seed → gleiche Daten');
  assert.ok(history.length >= 80);
  for (const lead of history) {
    assert.ok(['handed_over', 'lost', 'meeting'].includes(lead.stage), `${lead.key}: Stufe ${lead.stage}`);
    for (const event of lead.events) assert.ok(event.offsetMs < -2 * 60 * 60 * 1000, `${lead.key}: ${event.kind} zu spät`);
    assert.ok(lead.events.at(-1)!.offsetMs > -60 * 24 * 60 * 60 * 1000, `${lead.key}: älter als 60 Tage`);
  }
  const stages = new Set(history.map((lead) => lead.stage));
  assert.deepEqual([...stages].sort(), ['handed_over', 'lost', 'meeting']);
});

test('Demo-Verlauf ändert den Tagesstapel nicht', () => {
  const config = loadConfig({ LEAD_SEARCH_MODE: 'mock' });
  const now = Date.now();
  const tasksOf = (demoHistory: boolean) => {
    const db = openDatabase(tempDataDir());
    const store = new LeadStore(db, { demoHistory });
    const count = store.resetDemo(now);
    const leads = store.list({ limit: 5000 }).leads;
    assert.equal(leads.length, count);
    // Wie die Route: Antworten vor dem Termin sind keine offene Antwort mehr.
    const tasks = (owner: 'nick' | 'johannes') => computeTasks(leads, owner, config.tasks, now, {}, undefined, store.meetingsBookedAt(owner)).tasks.length;
    return { count, nick: tasks('nick'), johannes: tasks('johannes') };
  };
  const plain = tasksOf(false);
  const withHistory = tasksOf(true);
  assert.ok(withHistory.count > plain.count);
  assert.equal(withHistory.nick, plain.nick);
  assert.equal(withHistory.johannes, plain.johannes);
});
