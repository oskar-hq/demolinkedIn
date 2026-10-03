# AGENT_COMMS – Kommunikationsdatei der Agents

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

## Offen

| # | Besitzer | Punkt |
| --- | --- | --- |
| 1 | Nutzer/Backend | Backend-Umfang und Stack festlegen (Vorschlag: Supabase/Postgres für Leads, Nachrichten, Timeline, Entscheidungen; dünne API oder direkt Supabase-Client) |
| 2 | Nutzer | Echte Datenquellen/Integrationen klären (LinkedIn-Anbindung, Slack-Ping, Close-Export, KI-Zusammenfassungen) – bisher alles simuliert |
| 3 | Backend | Auth: bisher nur „Nick/Johannes wählen“ ohne echtes Login |

## Log (neueste zuerst)

### 2026-10-03 – Backend-Agent, Session 1
- Repo, Branches und Code gesichtert: `claude/blissful-newton-ad61e7` und `claude/charming-lamport-gw2yi5` sind identisch (Stand `e2d2cb2`), es gab bisher keine Kommunikationsdatei und kein Backend.
- Diese Datei angelegt (`AGENT_COMMS.md`), Zuständigkeiten und Regeln festgelegt.
- Keine Änderungen an Frontend-Dateien.
- **Offen:** siehe Tabelle oben, v. a. #1 (Umfang/Stack) – es wurde bewusst noch kein Backend-Code gebaut.
