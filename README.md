# Outreach Cockpit – klickbare Demo

Klickbare Demo eines LinkedIn-Outreach-Cockpits für die Kundenpräsentation. Reines Frontend:
alle Daten sind erfundene Beispieldaten im Code, der Zustand lebt nur im Browser-Speicher.
Ein Neuladen der Seite oder **„Demo zurücksetzen“** stellt den Ausgangszustand wieder her.

Aufbau und Datenstruktur: siehe [`PLAN.md`](PLAN.md). Design-Regeln für dieses und künftige Projekte: [`DESIGN.md`](DESIGN.md).

## Starten mit Docker (z. B. auf dem Proxmox-Server)

Voraussetzung: Docker mit Compose-Plugin (in einem Proxmox-LXC-Container muss dafür
„Nesting“ aktiviert sein, in einer VM ist nichts weiter nötig).

```bash
git clone <repo-url> outreach-cockpit
cd outreach-cockpit
docker compose up -d --build
```

Danach läuft die Demo unter **http://<server-ip>:8080**.

| Aufgabe | Befehl |
| --- | --- |
| Status / Logs | `docker compose ps` · `docker compose logs -f` |
| Nach Änderungen neu bauen | `git pull && docker compose up -d --build` |
| Stoppen | `docker compose down` |
| Anderer Port (z. B. 80) | in `docker-compose.yml` `"8080:80"` → `"80:80"` |

Der Container startet nach einem Server-Neustart automatisch wieder (`restart: unless-stopped`).

## Lokal entwickeln

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # Produktions-Build nach dist/
npm run test:e2e   # Playwright-Durchlauf (baut vorher selbst)
```

## Bedienung in der Präsentation

- **Login:** Nick oder Johannes wählen – jeder sieht nur seine eigenen Aufgaben, Nachrichten enden mit seiner Grußformel.
- **Startseite:** zeigt nur, wie viele Aufgaben heute anstehen, und den Button **„Aufgaben für heute abarbeiten“** (oder `↵`).
  Über die kleinen Zahlen darunter („3 Antworten“, „5 neue Leads“ …) lässt sich gezielt nur eine Aufgabenart abarbeiten.
- **Fokus-Modus:** Jede Aufgabe füllt den ganzen Bildschirm, unten stehen immer genau zwei Entscheidungen.
  Alternativ die Seite wie eine Karte **nach rechts (Ja) oder links (Nein) wischen** – mit Maus, Trackpad oder Finger.
  `↵` (oder `→`) Ja / Senden / Vernetzen · `←` Nein / Nicht senden · `1`–`4` Template bzw. Variante · `E` bearbeiten · `V` Verlauf ·
  `Z` rückgängig · `Esc` zurück zur Startseite. In der Close-Vorschau `↵` exportieren. Im Textfeld `⌘/Strg + ↵` senden.
- **Lead-Historie:** auf den Namen der Person klicken.
- **Slack-Ping:** kommt ca. 20 Sekunden nach dem Login, ein Klick öffnet direkt die neue Antwort. Über die URL steuerbar:
  `?ping=5` (nach 5 Sekunden) oder `?ping=off` (kein Ping).
- **Dashboard:** drei Ansichten – Überblick, Templates, Nick vs. Johannes – filterbar nach Gründer.
  Aktionen aus der laufenden Demo fließen in den heutigen Tag ein.

## Inhalte anpassen

| Was | Datei |
| --- | --- |
| Nachrichtentexte (Erstnachricht A/B/C, Follow-ups je Stufe) | `src/data/templates.ts` |
| Gründer, Grußformeln | `src/data/founders.ts` |
| Leads, Antworten, KI-Texte | `src/data/leads.ts` |
| Dashboard-Kennzahlen | `src/data/dashboard.ts` |
| Farben, Schrift | `src/index.css` (`@theme`) |

Alle Personen und Firmen sind frei erfunden.
