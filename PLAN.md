# Plan – LinkedIn Outreach Cockpit (Demo)

Reines Frontend, alle Daten im Code, Zustand nur im Speicher.

## Stack
- React 19 + Vite + TypeScript, Tailwind CSS v4
- `motion` für Karten- und Panel-Animationen, `recharts` für das Dashboard, `lucide-react` für Icons
- Schrift: System-Font (SF Pro auf dem Mac), Inter als gebündelter Fallback
- Auslieferung: Docker (Node-Build → nginx), `docker-compose.yml`

## Datenstruktur (`src/data`, `src/state/types.ts`)
- `founders.ts` – Nick und Johannes inkl. Grußformel
- `templates.ts` – **alle Nachrichtentexte als Konstanten** (Erstnachricht A/B/C, Follow-up A/B/C je Stufe 1–3) mit Platzhaltern `{{vorname}}`, `{{firma}}`, `{{stelle}}`, `{{thema}}`, `{{grussformel}}`
- `leads.ts` – 30 erfundene Leads. Jeder Lead gehört genau einem Gründer und steht an einer Stelle der Pipeline (`lead` → `first` → `followup` → `reply`). Daraus entsteht genau eine Karte pro Lead. Zwei Antworten kommen erst per Slack-Ping dazu.
  - Lead: Name, Position, Firma, Branche, Region, Signal (Meta Ads / Stellenanzeige), KI-Zusammenfassung, KI-Einschätzung inkl. Begründung
  - Verlauf: welches Template, welche Follow-ups, Antworten des Leads – Nachrichten und Timeline werden daraus mit relativen Zeitstempeln erzeugt
- `dashboard.ts` – 16 Wochen Tageswerte je Gründer aus einem festen Zufalls-Seed (8 Wochen sichtbar, der Rest für Vorperioden-Vergleiche)

## Zustand (`src/state/demo.tsx`)
`useReducer` + Context: eingeloggter Gründer, Ansicht, Filter, Kartenstatus, Reihenfolge des Stapels, Session-Nachrichten und -Ereignisse, Slack-Ping, offenes Lead-Panel, Undo-Verlauf.
Aktionen: `LOGIN`, `LOGOUT`, `RESET`, `DECIDE`, `UNDO`, `PING_ARRIVE`, `FOCUS_CARD`, `OPEN_PANEL` …
„Demo zurücksetzen“ = `RESET` → alles zurück auf den Ausgangszustand (Login-Seite).

## Komponenten
- `pages/Login` – Auswahl Nick / Johannes
- `layout/TopNav` – Navigation (Tages-Stapel, Dashboard), Nutzer, Reset; `DemoBadge` unten links
- `stack/StackView` – Fortschritt, Filter-Tabs, Kartenstapel, Tastaturkürzel, leerer Zustand
  - `LeadCard`, `FirstMessageCard`, `FollowUpCard`, `ReplyCard`
  - `MessageEditor` (Textfeld mit farbig hinterlegten Variablen), `ChatThread`, `CloseExportModal`
  - `ActivityToasts` („wird gesendet…“ → „Gesendet ✓“, mit Rückgängig)
- `lead/LeadPanel` – Seitenpanel mit vollständiger Timeline
- `slack/SlackToast` – simulierter Slack-Ping nach ~20 s
- `dashboard/*` – KPI-Kacheln, Linien-, Funnel-, Balkendiagramme, Vergleich Nick vs. Johannes

## Tests
Playwright-Durchlauf: Login → kompletter Stapel per Tastatur → leerer Zustand → Slack-Ping → Reset.
