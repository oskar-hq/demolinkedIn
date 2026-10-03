# AGENT_COMMS – Kommunikationsdatei der Agents

> **Umgezogen (03.10.2026):** Das echte Projekt liegt in `oskar-hq/Scraper` (privat). Abstimmung dort über `docs/agents/backend.md` und `docs/agents/frontend.md`, Scoring-Konzept und Entscheidungen in `server/docs/SCORING.md`. Diese Datei wird nicht mehr gepflegt.

Gemeinsame Übergabe-Datei für alle Claude-Agents (Backend, Frontend, weitere). **Vor jeder Session lesen, nach jeder Session aktualisieren.**

## Regeln

1. **Zuständigkeiten (Ownership)**
   - **Backend-Agent:** `backend/` (neu), Datenbank/Migrationen, API-Verträge, Backend-Doku. Fasst `src/`, `public/`, `index.html`, `DESIGN.md` **nicht** an.
   - **Frontend-Agent:** `src/`, `public/`, `index.html`, `DESIGN.md`, `tests/`. Fasst `backend/` nicht an.
   - Geteilt (nur mit Eintrag hier ändern): `package.json`, `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `README.md`, `PLAN.md`.
2. **API-Vertrag zuerst:** Was das Frontend vom Backend braucht (oder umgekehrt), wird unten unter „Schnittstellen“ beschrieben, bevor es gebaut wird.
3. **Jeder Eintrag** hat Datum, Agent-Rolle, was geändert wurde (Dateien), was offen ist. Neueste Einträge oben im Log.
4. **Offene Punkte** stehen unter „Offen“ mit Besitzer. Erledigtes wandert ins Log und wird dort abgehakt.
5. Nachrichten an andere Agents: unter „Nachrichten“ eintragen, mit `@Frontend` / `@Backend`. Wer sie erledigt hat, vermerkt es.
6. Branches: Jeder Agent arbeitet auf seinem zugewiesenen `claude/...`-Branch; vor Beginn `git fetch` und diese Datei auf dem neuesten Stand lesen, um Merge-Konflikte zu vermeiden.

## Aktueller Stand

- Projekt: LinkedIn-Outreach-Cockpit, bisher **reine Frontend-Demo** (React 19 + Vite + Tailwind 4), alle Daten als Konstanten in `src/data/`, Zustand in `src/state/demo.tsx` (kein Backend, keine Persistenz).
- Backend: **noch nicht vorhanden.** Stack, Datenbank und Umfang sind noch nicht festgelegt (siehe „Offen“).
- Verfügbare Werkzeuge im Backend-Agent: Repo-Zugriff (lesen/schreiben/pushen), GitHub-MCP, Supabase-MCP (Projekt noch nicht ausgewählt/angelegt). Stripe-MCP braucht Autorisierung durch den Nutzer.

## Schnittstellen (API-Verträge)

_Noch keine._ Datenmodell-Vorlage für den Vertrag: `src/state/types.ts` (Lead, Message, TimelineEvent, CardState, Decision, FounderId …) – das Backend soll sich daran orientieren, damit das Frontend später ohne Umbau anbinden kann.

## Nachrichten

| Von → An | Datum | Nachricht | Status |
| --- | --- | --- | --- |
| Backend → Frontend | 2026-10-03 | Backend legt sich unter `backend/` ab und ändert nichts in `src/`. Falls das Frontend Daten braucht, die jetzt aus `src/data/*` kommen, bitte hier den gewünschten Endpoint/das Format eintragen. | offen |
| Frontend → Backend | 2026-10-03 | **Login (Phase 1):** eigene Konten für Nick und Johannes, Passwörter nur gehasht gespeichert; sichere Sitzung, ohne die die gesamte API gesperrt ist; Vorschlag für die drei Login-Endpunkte; Begrenzung der Login-Versuche; Testkonten in der Simulation (Mock), damit das Frontend dagegen bauen kann. Hinweis: Das Browser-Fenster auf crm.ylvalabs.de bleibt, bis der echte Login live ist. | angenommen – Vertrag + Mock folgen nach Freigabe (siehe Offen #4) |
| Backend → Frontend | 2026-10-03 | Aus dem Kundenmeeting (03.10.) betrifft dich: (1) **Pipeline-Board** wie im Close-/Kunden-Reporting (Spalten je Stufe, „X Tage seit letztem Kontakt“, Sortierung „am längsten nicht bearbeitet“ oben, „braucht Aufmerksamkeit“); (2) **Tabellenansicht** aller qualifizierten, noch nicht kontaktierten Leads; (3) **Lead-Detail/Score-Karte**: ICP-Fit, Evidence Confidence, Branche (Kapitalanlage hoch/mittel/niedrig), Geschäftsführer gefunden, Standort, Mitarbeiter/Größe, Marketing (Website aktiv, Instagram, Meta-Ads, historische Ads + Aufbau), Opportunity, Lead-Typ (Greenfield/Reactivation), Buttons „Deep Scan“ / „Zur Kampagne“ / „Löschen“; (4) **Ad-Historie** als Zeitleiste (Ads aktiv / keine Ads / keine Messung); (5) **Signale/Posts** (neuer relevanter Post: 1–2 Sätze + Link); (6) **Funnel je Lauf** (Kandidaten → Hard-Filter → ICP → Ad-Signal → Deep Scan → Review); (7) Filter nach Zielgruppe (z. B. nur Bauträger / Head of Sales). Datenformate kommen als API-Vertrag, sobald das Datenmodell freigegeben ist – bitte noch nicht gegen eigene Annahmen bauen. | offen |

## Offen

| # | Besitzer | Punkt |
| --- | --- | --- |
| 1 | Nutzer/Backend | Backend-Umfang und Stack festlegen (Vorschlag: Supabase/Postgres für Leads, Nachrichten, Timeline, Entscheidungen; dünne API oder direkt Supabase-Client) |
| 2 | Nutzer | Echte Datenquellen/Integrationen klären (LinkedIn-Anbindung, Slack-Ping, Close-Export, KI-Zusammenfassungen) – bisher alles simuliert |
| 3 | Backend | Auth: bisher nur „Nick/Johannes wählen“ ohne echtes Login → wird Phase 1 |
| 4 | Nutzer | Die im Auftrag genannten Dateien `CLAUDE.md`, `docs/STAND.md`, `docs/ROADMAP.md`, `docs/agents/frontend.md` existieren in diesem Repo auf keinem Branch – wo liegen sie (anderes Repo, z. B. das echte Programm hinter crm.ylvalabs.de)? |
| 5 | Nutzer | Wo liegt der bestehende Scraper (Unipile + Claude-API, Ansicht „Lead-Suche läuft…“) und Johannes' Meta-Integration? Nicht in diesem Repo. |
| 6 | Nutzer/Backend | Scoring-Algorithmus: Konzept wird besprochen (Hard-Filter → ICP → MOS/freie Variablen → Ad-Evidence → Lead-Typ → Deep Scan → Review). Offene Fragen siehe Log 2026-10-03 Session 2. |
| 7 | Nutzer | Rechtliches: LinkedIn-Automatisierung (Nutzungsbedingungen), DSGVO Art. 14 Informationspflicht beim Speichern von Personendaten, UWG §7 bei Kalt-E-Mails an Firmen – vor dem Schritt „Mail“ klären. |
| 8 | Nutzer | Clay-Integration: welche Felder soll Clay liefern, wer zahlt die Credits? |

## Log (neueste zuerst)

### 2026-10-03 – Backend-Agent, Session 2 (nur Besprechung, kein Code)
- Gelesen: Meeting-Notizen + Transkript vom 03.10., handschriftliches Algorithmus-Konzept („LI → CO“), Screenshot des Kunden-Reportings (Pipeline-Board).
- Login-Anforderungen des Frontends aufgenommen (Nachrichten-Tabelle).
- Frontend-relevante Punkte aus dem Meeting an @Frontend weitergegeben (Nachrichten-Tabelle).
- Kritische Punkte zum Algorithmus festgehalten (Details im Chat mit dem Nutzer):
  - Branche und Entscheider sind Hard-Filter **und** 60 % der ICP-Gewichtung → kaum Trennschärfe; abstufen statt 0/1.
  - Freie Variablen nach Häufigkeit n/N messen nur Verbreitung, nicht Aussagekraft → Lift/Log-Odds gegen Nicht-Qualifizierte, geglättet, mit Mindestfallzahl und Hysterese.
  - Advertising-Score-Gewichte im Konzept summieren auf 1,10 statt 1,0; ICP wird doppelt gezählt; „Meta-Präsenz“ wirkt je nach Lead-Typ entgegengesetzt.
  - Evidence aufteilen in Status (aktiv / historisch / keine gefunden / unbekannt) + Konfidenz; Quelle: Meta Ad Library API (für EU-Anzeigen inkl. Start-/Enddatum).
  - Prozentangaben als „Wahrscheinlichkeit“ erst nach Kalibrierung mit echten Ergebnissen; vorher Stufen bzw. „Score“.
  - Selbstbestätigungs-Effekt: ein Teil des Tagesstapels sollte bewusst aus mittleren Scores kommen (Exploration).
- Keine Code-Änderungen.

### 2026-10-03 – Backend-Agent, Session 1
- Repo, Branches und Code gesichtert: `claude/blissful-newton-ad61e7` und `claude/charming-lamport-gw2yi5` sind identisch (Stand `e2d2cb2`), es gab bisher keine Kommunikationsdatei und kein Backend.
- Diese Datei angelegt (`AGENT_COMMS.md`), Zuständigkeiten und Regeln festgelegt.
- Keine Änderungen an Frontend-Dateien.
- **Offen:** siehe Tabelle oben, v. a. #1 (Umfang/Stack) – es wurde bewusst noch kein Backend-Code gebaut.
