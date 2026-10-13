# Outreach Cockpit – Demo · Anweisungen für Claude

Vorführversion des echten Outreach Cockpits (`oskar-hq/Scraper`, Branch `claude/lead-suche`): dieselbe Software
(React-Frontend in `src/`, Fastify-Backend in `server/`, Vertrag in `shared/`), aber **fest in der Simulation**
(`LEAD_SEARCH_MODE=mock`, Testkonten mit Passwort `demo`, `DEMO_HISTORY=true`). Siehe `README.md`.

- Ein Agent für alles – keine Aufteilung in Frontend/Backend wie im echten Repo.
- **Nie** echte Schlüssel, `.env` oder Verbindungen zu LinkedIn, Anthropic, Meta, Close oder Slack einbauen. Die Demo
  muss ohne Netz nach außen funktionieren.
- Demo-Ergänzungen gegenüber dem echten Programm stehen in `README.md` → „Auf den neuesten Stand des echten
  Programms bringen“. Beim Abgleich mit `oskar-hq/Scraper` diese Stellen erhalten, alles andere übernehmen.
- Oberfläche und Meldungen auf Deutsch, Ansprache „du“, Code-Kommentare auf Deutsch. Design: `DESIGN.md`.
- Prüfen: `npm run verify` (Backend-Typprüfung und -Tests, Build, Playwright-E2E gegen die Simulation).
- Nur auf eigenem Branch arbeiten, PR gegen den Standard-Branch; gemergt wird nur auf Ansage des Nutzers.
