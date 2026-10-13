import type { AuthFounderId } from '../../../shared/auth.js';
import type { LeadStage } from '../../../shared/leads.js';
import type { DemoSeedLead } from './demoTypes.js';

/**
 * Demo: erfundener Verlauf der letzten acht Wochen (nur mit `DEMO_HISTORY=true`, siehe docker-compose.yml).
 *
 * Die 30 Demo-Leads aus `demoSeed.ts` bilden den heutigen Tagesstapel. Damit Dashboard, Vorlagen-Vergleich und
 * Leads-Board in der Vorführung nicht leer wirken, kommen hier abgeschlossene Verläufe dazu: Anfrage → Annahme →
 * Erstnachricht → Follow-ups → Antwort → Termin → Übergabe an Close (oder Verloren). Jeder Verlauf endet mindestens
 * einige Stunden vor „jetzt“ in einer Stufe ohne Aufgabe (Übergeben, Verloren, wenige Termine) – der Tagesstapel
 * bleibt dadurch genau der aus `demoSeed.ts`.
 *
 * Fester Zufalls-Seed: Bei jedem Zurücksetzen entstehen dieselben Personen und Zahlen (relativ zu jetzt).
 */

export interface DemoHistoryLead extends DemoSeedLead {
  /** Deal Value in Euro (nur Termin und Übergeben). */
  dealValue: number | null;
  /** Übergabe an Close (Zeit relativ zu jetzt), nur Stufe Übergeben. */
  handedOverOffsetMs: number | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** So viele Verläufe entstehen. */
const COUNT = 96;
/** Ältester Beginn eines Verlaufs (Tage vor jetzt). */
const MAX_AGE_DAYS = 58;

/** Kleiner deterministischer Zufallsgenerator (mulberry32). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Andreas', 'Bettina', 'Christian', 'Daniela', 'Elias', 'Franziska', 'Georg', 'Hanna', 'Ingo', 'Jana', 'Kai', 'Lena',
  'Marco', 'Nina', 'Oliver', 'Petra', 'Ralf', 'Sabine', 'Thomas', 'Ulrike', 'Volker', 'Wiebke', 'Yannick', 'Zoe',
  'Benedikt', 'Carina', 'Dominik', 'Eva', 'Florian', 'Greta', 'Henning', 'Isabel', 'Jörg', 'Katrin', 'Lars', 'Miriam',
];
const LAST_NAMES = [
  'Albrecht', 'Bachmann', 'Conrad', 'Dietz', 'Ebert', 'Falk', 'Gerlach', 'Hahn', 'Imhoff', 'Jansen', 'Kessler',
  'Lorenz', 'Matthes', 'Neubert', 'Oswald', 'Pfeiffer', 'Quast', 'Reuter', 'Seidel', 'Thiele', 'Ullrich', 'Vogt',
  'Wendt', 'Zander', 'Brandt', 'Christ', 'Dörr', 'Engel', 'Fiedler', 'Grote', 'Heinze', 'Jäger', 'Kunze', 'Lindner',
];
const CITIES = ['Hamburg', 'München', 'Berlin', 'Frankfurt am Main', 'Köln', 'Düsseldorf', 'Stuttgart', 'Leipzig', 'Dresden', 'Hannover', 'Nürnberg', 'Bremen', 'Münster', 'Mannheim'];
const KA_COMPANIES = [
  'Nordkap Kapitalanlagen', 'Sonnfeld Immobilienvertrieb', 'Ankerplatz Invest', 'Kontor 7 Anlageimmobilien', 'Brückner & Hahn Vermögenswerte',
  'Elbblick Investment', 'Alpenrand Kapital', 'Hanseatische Wohnwerte', 'Rheinkontor Immobilien', 'Lichtenberg Anlageberatung',
  'Vierlande Immobilienvertrieb', 'Isarwert Kapitalanlagen', 'Maingold Invest', 'Westfalen Wohnkapital',
];
const BT_COMPANIES = [
  'Lindenquartier Projektbau', 'Havelufer Wohnbau', 'Grünhof Projektentwicklung', 'Stadtgarten Bauträger', 'Neckarbogen Wohnprojekte',
  'Eichwald Bau & Vertrieb', 'Hafenkante Projektentwicklung', 'Weinberg Wohnbau',
];
const KA_POSITIONS = ['Geschäftsführer', 'Inhaber', 'Geschäftsführende Gesellschafterin', 'Vertriebsleiter', 'Gründer & Geschäftsführer'];
const BT_POSITIONS = ['Geschäftsführer', 'Leiterin Vertrieb', 'Geschäftsführender Gesellschafter', 'Projektentwickler'];

const KA_REASON = 'Eigener Vertrieb von Kapitalanlage-Immobilien an Privatanleger – Kernzielgruppe.';
const BT_REASON = 'Bauträger mit Eigenvertrieb und laufender Projektvermarktung.';

const POSITIVE_REPLIES = [
  'Hallo {absender}, danke für die Nachricht. Das Thema Anfragequalität beschäftigt uns gerade sehr – lass uns gern kurz telefonieren.',
  'Klingt spannend. Wir haben Meta im Frühjahr pausiert, weil die Leads nichts taugten. Wann hast du nächste Woche Zeit?',
  'Hi {absender}, passt gut, wir planen gerade das nächste Projekt. Schick mir gern einen Termin für Dienstag oder Mittwoch.',
  'Danke fürs Melden – ehrlich gesagt suchen wir genau so etwas. Lass uns sprechen.',
];
const NEGATIVE_REPLIES = [
  'Danke, aber wir sind mit unserer Agentur aktuell zufrieden.',
  'Hallo {absender}, im Moment kein Bedarf – wir haben alle Einheiten vertrieben.',
  'Kein Interesse, danke.',
  'Wir machen das inzwischen komplett inhouse. Trotzdem viel Erfolg!',
];

const FOUNDER_NAMES: Record<AuthFounderId, string> = { nick: 'Nick', johannes: 'Johannes' };

type Event = DemoSeedLead['events'][number];

export function buildDemoHistory(): DemoHistoryLead[] {
  const rand = random(20261013);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const between = (min: number, max: number) => min + rand() * (max - min);
  const result: DemoHistoryLead[] = [];
  const usedNames = new Set<string>();

  for (let index = 0; index < COUNT; index++) {
    const owner: AuthFounderId = index % 2 === 0 ? 'nick' : 'johannes';
    const by = owner;
    const sender = FOUNDER_NAMES[owner];
    // 70/30-Regel: sieben von zehn sind Kapitalanlage-Vertriebe.
    const ka = index % 10 < 7;
    let firstName = pick(FIRST_NAMES);
    let lastName = pick(LAST_NAMES);
    while (usedNames.has(`${firstName} ${lastName}`)) {
      firstName = pick(FIRST_NAMES);
      lastName = pick(LAST_NAMES);
    }
    usedNames.add(`${firstName} ${lastName}`);
    const city = pick(CITIES);
    const companyName = `${pick(ka ? KA_COMPANIES : BT_COMPANIES)} ${pick(['GmbH', 'GmbH & Co. KG', 'GmbH'])}`;
    const position = pick(ka ? KA_POSITIONS : BT_POSITIONS);
    const key = `h${String(index + 1).padStart(3, '0')}`;

    // Verlauf ab Tag 0 (relativ), am Ende auf die Zeitachse geschoben.
    const events: Event[] = [];
    let t = 0;
    const add = (kind: Event['kind'], title: string, text: string | null = null, label: string | null = null, actor: AuthFounderId | null = null) =>
      events.push({ kind, offsetMs: t, by: actor, title, text, label });
    add('created', 'Über die Lead-Suche gefunden', `${position} · ${companyName}`);
    t += between(2, 20) * 60 * 1000;
    add('assessed', `KI-Einschätzung: Passt (${ka ? 'Kapitalanlage-Vertrieb' : 'Bauträger / Projektentwicklung'})`, ka ? KA_REASON : BT_REASON);
    t += between(2, 30) * HOUR;
    add('invite_sent', `Vernetzungsanfrage gesendet von ${sender}`, `Über den LinkedIn-Account von ${sender}`, null, by);

    let stage: LeadStage;
    let template: string | null = null;
    let followUpsSent = 0;
    let dealValue: number | null = null;
    let handedOver: number | null = null;
    let nextStep: string | null = null;

    if (rand() < 0.22) {
      t += between(14, 21) * DAY;
      add('lost', 'Verloren', 'Anfrage nach drei Wochen nicht angenommen – zurückgezogen', null, by);
      stage = 'lost';
    } else {
      t += between(0.3, 4) * DAY;
      add('invite_accepted', 'Vernetzungsanfrage angenommen');
      t += between(1, 20) * HOUR;
      // Vorlagen unterschiedlich gut, damit der Vorlagen-Vergleich etwas zeigt.
      const roll = rand();
      template = roll < 0.42 ? 'G1' : roll < 0.78 ? 'G2' : 'R1';
      const replyChance = template === 'G1' ? 0.34 : template === 'G2' ? 0.22 : 0.4;
      add('message_sent', `Erstnachricht · Vorlage ${template} gesendet`, null, template, by);
      let replied = rand() < replyChance;
      for (let step = 1; !replied && step <= 2; step++) {
        t += between(2, 4) * DAY;
        const variant = `F${step}${rand() < 0.5 ? 'A' : 'B'}`;
        add('message_sent', `Follow-up ${step} · Variante ${variant} gesendet`, null, variant, by);
        followUpsSent = step;
        replied = rand() < (step === 1 ? 0.2 : 0.14);
      }
      if (!replied) {
        t += between(3, 6) * DAY;
        add('lost', 'Verloren', 'Keine Antwort nach zwei Follow-ups', null, by);
        stage = 'lost';
      } else {
        t += between(3, 40) * HOUR;
        const positive = rand() < 0.62;
        add('message_received', `Antwort von ${firstName} erhalten`, pick(positive ? POSITIVE_REPLIES : NEGATIVE_REPLIES).replace('{absender}', sender));
        if (!positive) {
          t += between(2, 20) * HOUR;
          add('lost', 'Verloren', 'Kein Interesse', null, by);
          stage = 'lost';
        } else {
          t += between(4, 30) * HOUR;
          add('meeting_booked', 'Termin vereinbart', 'Erstgespräch per Video, 30 Minuten', null, by);
          dealValue = Math.round(between(8, 48)) * 1000;
          if (rand() < 0.75) {
            t += between(1, 5) * DAY;
            add('handed_over', 'An Close übergeben', 'Lead in Close angelegt (Beispieldaten)', null, by);
            stage = 'handed_over';
            handedOver = t;
          } else {
            stage = 'meeting';
            nextStep = 'Angebot nach dem Erstgespräch schicken';
          }
        }
      }
    }

    // Auf die Zeitachse: Beginn zufällig in den letzten acht Wochen, Ende spätestens ein paar Stunden vor jetzt.
    const span = t;
    const latestEnd = -between(3, 60) * HOUR;
    const start = Math.min(-between(span / DAY + 0.5, MAX_AGE_DAYS) * DAY, latestEnd - span);
    for (const event of events) event.offsetMs = Math.round(start + event.offsetMs);

    const slug = `${firstName}-${lastName}`.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    result.push({
      key,
      owner,
      stage,
      person: {
        firstName,
        lastName,
        headline: `${position} · ${companyName}`,
        position,
        location: city,
        providerId: `demo-history-${key}`,
        publicIdentifier: `${slug}-${key}`,
        profileUrl: null,
        networkDistance: stage === 'lost' && !template ? 2 : 1,
      },
      company: { name: companyName, website: null, industry: ka ? 'Kapitalanlage-Vertrieb' : 'Bauträger / Projektentwicklung', region: city },
      assessment: {
        category: ka ? 'kapitalanlage_vertrieb' : 'bautraeger_projektentwickler',
        confidence: Math.round(between(0.65, 0.95) * 100) / 100,
        reason: ka ? KA_REASON : BT_REASON,
        summary: ka
          ? `Vertreibt Kapitalanlage-Immobilien an Privatanleger, Sitz in ${city}.`
          : `Entwickelt und vertreibt Wohnprojekte im Raum ${city}.`,
      },
      template,
      followUpsSent,
      nextStep,
      events,
      dealValue,
      handedOverOffsetMs: handedOver === null ? null : Math.round(start + handedOver),
    });
  }
  return result;
}
