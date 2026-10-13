import type { MessageKind, TemplateAudience } from '../../../shared/messages.js';

/**
 * Standard-Vorlagen (Vertrag `shared/messages.ts`) – seit 12.10. die Outreach-Nachrichten des Kunden (Wunsch des
 * Nutzers: „das sind deren Outreach-Nachrichten, als Standard eintragen“). Zielgruppe: Firmen **ohne** Meta-Ads
 * (Greenfield, „Meta Ads nie“) und Firmen, die **aufgehört** haben (Reactivation, „Meta Ads aus seit“, {{metastopp}} =
 * „vor rund 4 Monaten“). Zahlen und Kundennamen stammen vom Kunden. Je Follow-up-Stufe eine Nachricht (die früheren
 * B-Varianten F1B–F3B sind entfallen). Die IDs sind stabil (stehen als `label` im Verlauf); in der Software geänderte
 * Texte bleiben, bis man sie unter Einstellungen → Vorlagen zurücksetzt.
 */
export interface DefaultTemplate {
  id: string;
  kind: MessageKind;
  stage: number | null;
  audience: TemplateAudience;
  name: string;
  description: string;
  text: string;
}

export const DEFAULT_TEMPLATES: readonly DefaultTemplate[] = [
  {
    id: 'G1',
    kind: 'first',
    stage: null,
    audience: 'greenfield',
    name: 'Meta Ads nie · Option 1',
    description: 'Keine Werbeanzeigen in der Meta Ad Library – Frage nach Empfehlung oder externen Leads, Zahlen der Kunden.',
    text: `Hey {{vorname}},

hab in der Meta Ad Library gesehen, dass ihr aktuell bei {{firma}} keine Werbeanzeigen schaltet.

Läuft bei euch aktuell alles über Empfehlung oder holt ihr Leads extern dazu?

Ich frage, weil wir die Werbeanzeigen für Vertriebe wie Betongold, Finanzstarter oder Proper API mit folgenden Ergebnissen erstellen:

— Bonitäts-Lead (über 3.000 € netto, 10.000 € EK, schufafrei): 100–200 €

— Kosten pro abgeschlossener Reservierung: 1.000–2.000 €

Falls ihr aktuell nicht voll ausgelastet seid: Macht ein 15-Minuten-Call Sinn, in dem ich dir zeige, wieso unsere Strategie so gut funktioniert und was bei euch drin wäre?`,
  },
  {
    id: 'G2',
    kind: 'first',
    stage: null,
    audience: 'greenfield',
    name: 'Meta Ads nie · Option 2',
    description: 'Keine Meta Ads – „Hand aufs Herz, woran lag’s?“ mit drei Gründen und drei Kundenbeispielen.',
    text: `Hey {{vorname}},

mir ist aufgefallen, dass ihr aktuell keine Meta Ads schaltet. Hand aufs Herz, woran lag's:

1. Wird seit Monaten aufgeschoben, nie der „richtige“ Zeitpunkt

2. Die letzte Agentur hat mal wieder 10.000 € Ad Spend verbrannt

3. Nicht die gewünschten Ergebnisse

Wir lösen genau das. Mit unserem Bonitäts-Leadflow-System schließen unsere Kunden im Schnitt 5–8 Einheiten pro Monat zum Notar ab, bei unter 1.000 € pro Termin.

Drei Beispiele:

— Proper API: Von 100k € auf 500k € Monatsumsatz in 9 Monaten

— Finanzstarter: 12 neue Reservierungen pro Monat – ausschließlich durch uns

— Betongold: 120 € pro Bonitäts-Lead (>3k € netto, 10k € EK, schufafrei), 800 € pro Reservierung

Macht ein 15-Minuten-Call Sinn?

PS: Expose uns bitte danach öffentlich auf LinkedIn, falls wir Scheiße labern sollten.`,
  },
  {
    id: 'R1',
    kind: 'first',
    stage: null,
    audience: 'reactivation',
    name: 'Meta Ads aus seit · Option 1',
    description: 'Hat aufgehört, Meta Ads zu schalten – drei mögliche Gründe, Tipp auf 1., drei Kundenbeispiele.',
    text: `Hey {{vorname}},

mir ist aufgefallen, dass ihr {{metastopp}} aufgehört habt, Meta Ads zu schalten. Hand aufs Herz, woran lag's:

1. Die letzte Agentur hat mal wieder 10.000 € Ad Spend verbrannt ohne Ergebnisse
2. Vertrieb war überlastet
3. Aktuell keine Zeit mehr

(Basierend auf den Werbeanzeigen tippe ich auf 1., hab ich recht?)

Wir lösen genau das. Mit unserem Bonitäts-Leadflow-System schließen unsere Kunden im Schnitt 5–8 Einheiten pro Monat zum Notar ab, bei unter 1.000 € pro Termin.

Drei Beispiele, damit du weißt, dass wir keine Schwätzer sind und Ergebnisse liefern:

— Proper API: Von 100k € auf 500k € Monatsumsatz in 9 Monaten
— Finanzstarter: 12 neue Reservierungen pro Monat – ausschließlich durch uns
— Betongold: 120 € pro Bonitäts-Lead (>3k € netto, 10k € EK, schufafrei), 800 € pro Reservierung

Macht ein 15-Minuten-Call Sinn?

PS: Expose uns bitte danach öffentlich auf LinkedIn, falls wir Scheiße labern sollten.`,
  },
  {
    id: 'R2',
    kind: 'first',
    stage: null,
    audience: 'reactivation',
    name: 'Meta Ads aus seit · Option 2',
    description: 'Kurze Variante im Stil von „Meta Ads nie · Option 1“ – Ad Library, aufgehört, Zahlen der Kunden.',
    text: `Hey {{vorname}},

hab in der Meta Ad Library gesehen, dass ihr bei {{firma}} {{metastopp}} aufgehört habt, Werbeanzeigen zu schalten.

Läuft bei euch inzwischen alles über Empfehlung oder holt ihr Leads extern dazu?

Ich frage, weil wir die Werbeanzeigen für Vertriebe wie Betongold, Finanzstarter oder Proper API mit folgenden Ergebnissen erstellen:

— Bonitäts-Lead (über 3.000 € netto, 10.000 € EK, schufafrei): 100–200 €

— Kosten pro abgeschlossener Reservierung: 1.000–2.000 €

Falls ihr aktuell nicht voll ausgelastet seid: Macht ein 15-Minuten-Call Sinn, in dem ich dir zeige, was beim zweiten Anlauf bei euch drin wäre?`,
  },
  // Schaltet gerade Meta-Ads (12.10., Wunsch des Nutzers: „vielleicht verbrennst du da gerade Kohle“) – Entwurf im Stil
  // der Kundenvorlagen, Zahlen wie dort. Der Kunde passt sie unter Einstellungen → Vorlagen an.
  {
    id: 'S1',
    kind: 'first',
    stage: null,
    audience: 'active',
    name: 'Schaltet Meta Ads · Option 1',
    description: 'Schaltet gerade Meta Ads – läuft es so wie gedacht? Zahlen der Kunden als Vergleich.',
    text: `Hey {{vorname}},

hab in der Meta Ad Library gesehen, dass ihr bei {{firma}} gerade Werbeanzeigen schaltet.

Kurze ehrliche Frage: Läuft das so, wie ihr euch das vorstellt, oder geht gerade mehr Ad Spend drauf, als hinten rauskommt?

Ich frage, weil wir die Werbeanzeigen für Vertriebe wie Betongold, Finanzstarter oder Proper API mit folgenden Ergebnissen erstellen:

— Bonitäts-Lead (über 3.000 € netto, 10.000 € EK, schufafrei): 100–200 €

— Kosten pro abgeschlossener Reservierung: 1.000–2.000 €

Falls eure Zahlen da nicht rankommen: Macht ein 15-Minuten-Call Sinn, in dem ich mir eure aktuellen Anzeigen anschaue und dir zeige, was drin wäre?`,
  },
  {
    id: 'S2',
    kind: 'first',
    stage: null,
    audience: 'active',
    name: 'Schaltet Meta Ads · Option 2',
    description: 'Schaltet gerade Meta Ads – „Hand aufs Herz, wie läuft’s?“ mit drei Möglichkeiten und drei Kundenbeispielen.',
    text: `Hey {{vorname}},

mir ist aufgefallen, dass ihr gerade Meta Ads schaltet. Hand aufs Herz, wie läuft's:

1. Leads kommen, aber ohne Bonität und Eigenkapital

2. Die Kosten pro Termin sind deutlich höher als gedacht

3. Läuft super – dann ignorier diese Nachricht einfach

Falls es 1. oder 2. ist: Mit unserem Bonitäts-Leadflow-System schließen unsere Kunden im Schnitt 5–8 Einheiten pro Monat zum Notar ab, bei unter 1.000 € pro Termin.

Drei Beispiele:

— Proper API: Von 100k € auf 500k € Monatsumsatz in 9 Monaten

— Finanzstarter: 12 neue Reservierungen pro Monat – ausschließlich durch uns

— Betongold: 120 € pro Bonitäts-Lead (>3k € netto, 10k € EK, schufafrei), 800 € pro Reservierung

Macht ein 15-Minuten-Call Sinn?`,
  },
  {
    id: 'F1A',
    kind: 'followup',
    stage: 1,
    audience: 'any',
    name: 'Follow-up 1 · Update Finanzstarter',
    description: 'Erinnerung mit frischem Kundenergebnis, Frage nach 30-Minuten-Call.',
    text: `Hey {{vorname}},

ich hatte dir eine Nachricht gesendet bzgl. unserer Meta-Ads-Strategie.

Nur ein kleines Update von einem unserer Kunden: Finanzstarter hat diesen Monat 6 Reservierungen und einen Umsatz von 120.000 € zusätzlich durch uns gewonnen.

Lohnt sich ein kurzer 30-Minuten-Call, in dem ich dir zeige, wie genau das für euch aussehen könnte?

Beste Grüße`,
  },
  {
    id: 'F2A',
    kind: 'followup',
    stage: 2,
    audience: 'any',
    name: 'Follow-up 2 · Case Study Proper API',
    description: 'Case Study: von Bestandskunden abhängig zu planbarem Wachstum.',
    text: `Hey {{vorname}},

ich wollte dir kurz eine weitere Case Study von uns zeigen:

Dariusch von Proper API war 3 Jahre lang abhängig von Bestandskunden – mit schwankenden Umsätzen und Stagnation bei circa 100k/Monat, obwohl er eigentlich skalieren wollte.

Ergebnis durch unser Bonitäts-Leadflow-System:

1. +400k monatlich wiederkehrender Umsatz in 7 Monaten
2. 150 € pro Bonitätsanfrage
3. Ein System, das jeden Monat planbar zu Neukunden führt

Klingt das grundsätzlich interessant?

Beste Grüße`,
  },
  {
    id: 'F3A',
    kind: 'followup',
    stage: 3,
    audience: 'any',
    name: 'Follow-up 3 · Drei Antworten',
    description: 'Letzte Nachricht: „Nicht interessiert“, „Zu viel zu tun“ oder „Call“.',
    text: `Hey {{vorname}},

ich habe von dir bisher noch keine Rückmeldung bekommen.

Antworte einfach mit:

„Nicht interessiert“ – und wir melden uns nie wieder bei dir

„Zu viel zu tun“ – und wir schreiben dir in ein paar Wochen nochmal

„Call“ – und ich zeige dir in 30 Minuten, wie wir für unsere Kunden Reservierungen für im Schnitt 1.000–1.500 € generieren

So oder so, all good!

Beste Grüße`,
  },
  {
    id: 'N1',
    kind: 'invite_note',
    stage: null,
    audience: 'any',
    name: 'Notiz zur Vernetzungsanfrage',
    description: 'Optional, höchstens 300 Zeichen.',
    text: `Hallo {{vorname}}, ich vernetze mich gern mit Entscheidern aus der Immobilienbranche – {{firma}} ist mir dabei aufgefallen. Freue mich auf den Austausch!`,
  },
];
