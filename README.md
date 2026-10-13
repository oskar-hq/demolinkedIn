# Outreach Cockpit – Demo

Vorführversion des Outreach Cockpits. Es ist **dieselbe Software wie im echten Betrieb** (Stand des Repos
`oskar-hq/Scraper`, Branch `claude/lead-suche`), nur fest in der **Simulation**:

- alle Personen, Firmen, Nachrichten und Zahlen sind erfunden (30 Leads im heutigen Tagesstapel plus rund 100
  abgeschlossene Verläufe der letzten acht Wochen fürs Dashboard);
- es geht **nichts nach außen** – kein LinkedIn (Unipile), keine KI (Anthropic), kein Meta, kein Close, kein Slack.
  Suche, KI-Einstufung, KI-Vorschläge, Vernetzen, Senden und die Übergabe an Close werden simuliert;
- keine Schlüssel, keine `.env` nötig.

Alles, was man klickt, wird wie im echten Programm gespeichert (Datenbank im Docker-Volume). **„Zurücksetzen“** unten
links stellt den Ausgangszustand wieder her.

## Starten mit Docker (z. B. auf dem Proxmox-Server)

Voraussetzung: Docker mit Compose-Plugin (in einem Proxmox-LXC-Container muss dafür „Nesting“ aktiviert sein).

```bash
git clone <repo-url> outreach-cockpit-demo
cd outreach-cockpit-demo
docker compose up -d --build
```

Danach läuft die Demo unter **http://<server-ip>:8080** (anderer Port: `DEMO_PORT=80 docker compose up -d --build`).

| Aufgabe | Befehl |
| --- | --- |
| Status / Logs | `docker compose ps` · `docker compose logs -f` |
| Nach Änderungen neu bauen | `git pull && docker compose up -d --build` |
| Stoppen | `docker compose down` |
| Alles löschen (Datenbank der Demo) | `docker compose down -v` |

Die Demo ist für das Heimnetz bzw. für Vorführungen gedacht: Die Testkonten haben das feste Passwort `demo`.
Nicht auf denselben Server wie das echte Cockpit legen.

## Zugänge

Auf der Anmeldeseite genügt ein Klick auf eine Rolle (oder Name + Passwort `demo`):

| Konto | Rolle | Sieht / darf |
| --- | --- | --- |
| `nick` | Gründer | eigener Tagesstapel, Einstellungen, Konten, Zurücksetzen |
| `johannes` | Gründer | wie Nick, eigener Tagesstapel |
| `mitarbeiter` (Anna) | Mitarbeiterin von Nick | arbeitet Nicks Stapel ab, keine Einstellungen |
| `admin` | Admin | Aufgaben beider Gründer, nur eintragen, nichts senden |

## Vorschlag für die Vorführung

1. **Als Nick anmelden** → Startseite: 14 Aufgaben für heute, aufgeteilt in Antworten, Follow-ups, Erstnachrichten und
   neue Leads.
2. **„Starten“ (`↵`)** → Fokus-Modus: neue Leads vernetzen, Erstnachricht mit Vorlage senden, Follow-up wählen,
   Antwort mit KI-Einschätzung lesen und **an Close übergeben**. Wischen oder Tastatur (`↵` ja, `←` nein, `Z` rückgängig).
3. **Lead-Suche** → „Suche starten“: Der Trichter zählt live hoch (Suche → Dubletten → Profil → KI → Meta-Ads),
   am Ende stehen die Qualifizierten mit Begründung; `↵` legt sie in den Tagesstapel.
4. **Leads** → Board mit allen Stufen, Klick auf einen Namen öffnet das Lead-Panel mit Score, Firmendaten und Verlauf.
5. **Chats** → alle Gespräche wie in einem Messenger.
6. **Dashboard** → acht Wochen Verlauf, Trichter bis zum Termin, Deal Value, Vorlagen-Vergleich, Nick vs. Johannes,
   KI-Kosten.
7. **Einstellungen** (Konto-Menü oben rechts) → Verbindungen, automatische Suche, Vorlagen, Sicherungen.
8. Zum Schluss **„Zurücksetzen“** unten links – alles wieder wie vorher.

## Bedienung

- **Einstellungen:** Konto-Menü oben rechts (Admins und Gründer). Untermenüs in einer Seitenleiste (auf dem Handy
  erst die Liste, dann der Bereich), mit Suche auch nach einzelnen Werten: **Auf einen Blick** (was fehlt),
  **Verbindungen** (Unipile, KI, Meta, Firmendaten, Close und Slack – je mit „Verbindung testen“), **Outreach**
  (Lead-Suche, Automatische Suche, Senden über LinkedIn mit Accounts und Test-Nachricht, Tagesstapel, Vorlagen) und
  **System** (Sicherungen und Updates, Server und Anmeldung, Verlauf). Werte gelten nach dem Speichern sofort;
  Schlüssel nur mit Passwort und danach nie wieder sichtbar. Server-Werte gelten erst auf Probe.
  **Sicherungen und Updates**: Update einspielen (oder nachts automatisch), Sicherungen
  anlegen, herunterladen und wiederherstellen – jeweils mit Passwort. Einziger Notweg, falls die Seite gar nicht
  mehr erreichbar ist: `SETTINGS_SAFE_MODE=true` in der `.env`.
- **Vorlagen:** Einstellungen → „Vorlagen“ (oder im Dashboard „Vorlagen bearbeiten“). Alle Texte (Notiz zur
  Anfrage N1, Erstnachrichten G1/G2/R1/R2, Follow-ups F1A–F3B) mit Vorschau, Platzhaltern zum Einfügen und
  „Zurücksetzen“. Unbekannte Platzhalter und zu lange Notizen werden vor dem Speichern gemeldet. Die Karten im
  Tagesstapel füllen diese Texte aus: Erstnachricht passend zur Zielgruppe des Leads (Greenfield oder Reactivation),
  Follow-ups je Stufe; gemeldet wird die ID der Vorlage (Auswertung im Dashboard).
- **Konto einrichten:** Ein Einladungslink (`…/einladung#…`, erzeugt unter „Konten“) öffnet
  „Konto einrichten“: Passwort zweimal eingeben, danach ist man angemeldet. Der Link gilt einmal und läuft ab.
- **Automatische Suche:** Einstellungen → „Automatische Suche“ (Gründer: eigener Plan, Admin: beide).
  Wochentage, Uhrzeit (deutsche Zeit) und Suchprofil; der Server sucht dann selbst, neue Leads landen direkt im
  Tagesstapel („von Automatische Suche“ im Verlauf). „Jetzt einmal ausführen“ startet sofort; die Startseite zeigt den
  nächsten Lauf. **70/30:** Jeder Lauf sucht nur eine Zielgruppe – von 10 Läufen 7 nach Kapitalanlage-Vertrieben, 3 nach
  Bauträgern (bei 11 Läufen 8 zu 3, aufgerundet). Die Stichwörter des Profils werden dafür aufgeteilt (Bauträger-Begriffe
  wie „Bau…“, „Projekt…“ für Bauträger-Läufe, der Rest für Kapitalanlage). Die Seite zeigt, wen der nächste Lauf sucht.
- **Antworten direkt in der Antwort-Karte:** selbst schreiben oder „Antwort vorschlagen“ (KI) – der Vorschlag landet
  im Antwortfeld und lässt sich anpassen. „Antwort senden“ (über LinkedIn) bzw. „als gesendet eintragen“. Danach ist die
  Antwort-Aufgabe erledigt, bis die Person wieder schreibt.
- **Chats:** eigener Reiter in der Kopfleiste – alle Gespräche wie in einem Messenger (neueste zuerst, Punkt = Antwort
  offen). Rechts der Verlauf mit Eingabefeld: eigene Nachricht senden bzw. eintragen oder eine Antwort von LinkedIn
  eintragen.
- **Eigene Spalten im Leads-Board:** „+ Eigene Spalte“ (z. B. „Meeting Close“), Leads per Ziehen hineinlegen (die Stufe
  bleibt), umbenennen, löschen. Ohne Maus: im Lead-Panel „Spalte im Board“. In Stufen-Spalten lässt sich nur nach
  „Termin“ und „Verloren“ ziehen – die übrigen Stufen ändern sich über die Aufgaben.
- **Einstellungen:** oben „Auf einen Blick“ – was noch fehlt, welche Schlüssel gesetzt sind, wie viel gesucht und
  gesendet wird; ein Klick springt zum Feld. Abschnitte sind als Zugang (Schlüssel), Grenzen und Regeln oder System
  gekennzeichnet.
- **Aussortiert in der Lead-Suche:** In der Liste steht ein kurzer Grund („Falsche Branche“, „Einschätzung zu unsicher“),
  beim Aufklappen unter „Warum aussortiert“ die Erklärung. Die Prozentzahl der KI ist die Sicherheit ihrer Einordnung –
  90 % „Makler“ heißt: ziemlich sicher die falsche Branche, nicht „passt zu 90 %“.
- **Rollen:** **Admin** (kein eigener Tagesstapel): im Konto-Menü „Aufgaben von Nick/Johannes“ wählen, Entscheidungen
  nur eintragen, nichts über LinkedIn senden. **Gründer:** wie bisher, dazu Einstellungen und alle Konten. **Mitarbeiter:** arbeitet den Stapel seines
  Gründers ab und sendet in dessen Namen, ohne Einstellungen; Leads anderer Gründer nur ansehen. Im Verlauf steht bei
  fremden Buchungen „von Anna für Nick“.
- **Konten:** Konto-Menü → „Konten“ (Admins und Gründer). „Konto einladen“ erzeugt einen Link zum Weitergeben (jede
  Rolle); je Konto „Neuer Passwort-Link“ und „Entfernen“. Das letzte Admin- oder Gründer-Konto bleibt immer.
- **Startseite:** zeigt nur, wie viele Aufgaben heute anstehen, und den Button **„Aufgaben für heute abarbeiten“** (oder `↵`).
  Über die kleinen Zahlen darunter („3 Antworten“, „5 neue Leads“ …) lässt sich gezielt nur eine Aufgabenart abarbeiten.
- **Fokus-Modus:** Jede Aufgabe füllt den ganzen Bildschirm, unten stehen immer genau zwei Entscheidungen.
  Alternativ die Seite wie eine Karte **nach rechts (Ja) oder links (Nein) wischen** – mit Maus, Trackpad oder Finger.
  `↵` (oder `→`) Ja / Senden / Vernetzen · `←` Nein / Nicht senden / Kein Interesse · `1`/`2` Vorlage bzw. Variante (`3` eigene Nachricht) ·
  `E` bearbeiten · `V` Verlauf · `S` Antwort heute überspringen · `Z` rückgängig · `Esc` zurück zur Startseite.
  In der Close-Vorschau `↵` übergeben (im Notizfeld `⌘/Strg + ↵`). Im Textfeld `⌘/Strg + ↵` senden.
- **Antwort und Close:** Die Antwort-Karte zeigt oben die Einschätzung der Antwort und eine kurze Zusammenfassung des
  Verlaufs. „An Close übergeben“ legt den Lead in Close an, optional mit Notiz. Für Leads mit Termin geht das im
  Lead-Panel unter „Eintragen“, dort steht danach auch der Link nach Close. Ohne Close-Schlüssel kopierst du die
  Angaben und trägst die Übergabe nur ein.
- **Speichern:** Jede Entscheidung wird nach **5 Sekunden** gespeichert – so lange geht `Z` (die Leiste in der Meldung
  läuft ab; über die URL `?undo=2` änderbar). Beim Schließen der Seite oder Abmelden geht sie sofort raus, offline
  wartet sie und wird nachgetragen; eine Wiederholung bucht der Server nur einmal. „Nicht senden“ und „Heute
  überspringen“ nehmen die Aufgabe bis Mitternacht aus dem Stapel – auf allen Geräten, `Z` hebt es wieder auf.
- **Leads:** alle Leads aus der Datenbank als **Board** (eine Spalte je Stufe) oder **Tabelle**; „Meine“/„Alle“,
  sortiert nach „Länger nichts passiert“ oder Score, Suche nach Name und Firma. Klick öffnet das Lead-Panel.
- **Lead-Panel** (Klick auf den Namen): Score mit „Woraus?“ (ICP-Teile, Hard-Filter, Meta-Ads), **„Firmendaten
  holen“** (Treg bzw. Clay, mit Tageslimit) und **Eintragen**, was außerhalb passiert ist: nächster Schritt, Notiz,
  Antwort, Termin, verloren, an den anderen Gründer übergeben. Gilt sofort, ohne Rückgängig-Fenster; solange eine
  Entscheidung zum Lead noch nicht gespeichert ist, wartet das Panel darauf.
- **Senden über LinkedIn (Phase 3):** Mit `LINKEDIN_ACTIONS=on` gehen „Vernetzen“ und
  „Senden“ (nach dem Rückgängig-Fenster) über den LinkedIn-Account des angemeldeten Gründers. Die Startseite zeigt die
  Tageszähler, eine Pause oder „außerhalb der Arbeitszeit“ und „Jetzt abgleichen“ (angenommene Anfragen, neue
  Antworten); lehnt das Backend ab (Limit, Pause …), kommt die Karte mit dem Grund zurück.
- **Ohne LinkedIn-Aktionen** (Standard, oder kein Account verbunden): Das Cockpit sendet nichts selbst – die Knöpfe
  heißen „Anfrage eintragen“, „Als gesendet eintragen“, Nachrichten lassen sich kopieren, jede Karte verlinkt das
  LinkedIn-Profil.
- **Lead-Suche:** Suchprofil prüfen → `↵` startet. Der Trichter zählt live hoch, darunter sieht man je Lead den aktuellen
  Schritt. Am Ende steht die Ergebnistabelle mit Kategorie, Sicherheit und Begründung der KI. `↵` legt die Qualifizierten
  in den Tagesstapel – gespeichert wird beim Weiterarbeiten (bis dahin „Rückgängig“), ein weiteres `↵` startet sie
  direkt im Fokus-Modus.
- **Lead-Historie:** auf den Namen der Person klicken.
- **Dashboard:** echte Zahlen aus dem Verlauf aller Leads (`GET /api/dashboard`) – drei Ansichten (Überblick,
  Templates, Nick vs. Johannes), filterbar nach Gründer, letzte 8 Wochen mit Vergleich zur Vorwoche. Jede gespeicherte
  Entscheidung zählt sofort mit.

In der Demo gilt dabei: Verbindungen, Schlüssel und „Verbindung testen“ zeigen die Simulation an, Updates spielen
nichts ein, und gesendet wird nur zum Schein.

## Lokal entwickeln

```bash
npm ci && npm ci --prefix server
npm run dev:all          # Frontend http://localhost:5173, Backend 8787 (Simulation)
npm run verify           # Typprüfung, Backend-Tests, Build und Playwright-E2E
```

`dev:all` startet das Backend wie der Container (Simulation, Testkonten, acht Wochen Verlauf).

## Auf den neuesten Stand des echten Programms bringen

Die Demo ist eine Kopie von `oskar-hq/Scraper` mit wenigen Ergänzungen. Beim Abgleich diese Stellen erhalten:

| Ergänzung | Datei |
| --- | --- |
| Schnellzugang mit Rollen auf der Anmeldeseite | `src/pages/Login.tsx` (`DemoAccess`) |
| Hinweis „Demo mit Beispieldaten“ und „Zurücksetzen“ | `src/components/layout/DemoBadge.tsx`, eingebunden in `src/App.tsx` |
| Aufruf `POST /api/leads/demo/reset` | `src/lib/leadSearchApi.ts` (`demoApi`) |
| Acht Wochen Verlauf fürs Dashboard (`DEMO_HISTORY=true`) | `server/src/leads/demoHistory.ts`, `server/src/leads/leadStore.ts` (`resetDemo`), `server/src/config.ts` |
| Docker nur mit Frontend + Backend in der Simulation | `docker-compose.yml` |
| Test der Demo-Bedienung | `tests/demoAccess.spec.ts` |

Nicht übernommen: Update-Dienst und Caddy (`deploy/`), Agent-Abstimmung (`docs/`, `.claude/`, `scripts/agent-*`),
`.env.example`.

## Inhalte anpassen

| Was | Datei |
| --- | --- |
| Demo-Leads im Tagesstapel (Quelle des Seeds, `server/scripts/buildDemoSeed.ts`) | `src/data/leads.ts` |
| Verlauf der letzten acht Wochen | `server/src/leads/demoHistory.ts` |
| Simulierte Treffer der Lead-Suche | `server/src/adapters/mock/mockData.ts` |
| Nachrichtentexte | in der Software: Einstellungen → Vorlagen (Standard: `server/src/messages/defaults.ts`) |
| Gründer, Grußformeln | `src/data/founders.ts` |
| Farben, Schrift | `src/index.css` (`@theme`) |

Alle Personen und Firmen sind frei erfunden.
