# Outreach Cockpit – klickbare Demo

Klickbare Demo eines LinkedIn-Outreach-Cockpits für die Kundenpräsentation. Reines Frontend:
alle Daten sind erfundene Beispieldaten im Code, der Zustand lebt nur im Browser-Speicher.
Ein Neuladen der Seite oder **„Demo zurücksetzen“** stellt den Ausgangszustand wieder her.

Aufbau und Datenstruktur: siehe [`PLAN.md`](PLAN.md).

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

- **Login:** Nick oder Johannes wählen – jeder sieht nur seine eigenen Karten, Nachrichten enden mit seiner Grußformel.
- **Tages-Stapel:** `→` positive Aktion · `←` ablehnen · `E` bearbeiten · `1`–`4` Template/Variante · `V` Verlauf · `Z` rückgängig.
  In der Close-Vorschau `↵` exportieren, `Esc` abbrechen. Im Textfeld `⌘/Strg + ↵` senden.
- **Lead-Historie:** auf den Namen einer Karte klicken.
- **Slack-Ping:** kommt ca. 20 Sekunden nach dem Login. Über die URL steuerbar:
  `?ping=5` (nach 5 Sekunden) oder `?ping=off` (kein Ping).
- **Dashboard:** Kennzahlen der letzten 8 Wochen, filterbar nach Gründer. Aktionen aus der laufenden Demo fließen in den heutigen Tag ein.

## Inhalte anpassen

| Was | Datei |
| --- | --- |
| Nachrichtentexte (Erstnachricht A/B/C, Follow-ups je Stufe) | `src/data/templates.ts` |
| Gründer, Grußformeln | `src/data/founders.ts` |
| Leads, Antworten, KI-Texte | `src/data/leads.ts` |
| Dashboard-Kennzahlen | `src/data/dashboard.ts` |
| Farben, Schrift | `src/index.css` (`@theme`) |

Alle Personen und Firmen sind frei erfunden.
