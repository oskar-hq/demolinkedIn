# DESIGN.md – Schwarz & Weiß

Design-System aus dem *Outreach Cockpit*. Ziel: Neue Projekte sehen und fühlen sich sofort gleich an –
ruhig, schwarz-weiß, im Stil von Apple, mit einer Aufgabe pro Bildschirm.

> **Für Claude / Entwickler:** Diese Datei ist verbindlich. Werte (Farben, Größen, Kurven, Dauern) exakt
> übernehmen, nicht „ähnlich“ nachbauen. Abweichungen nur mit Begründung.

---

## 1. Grundprinzipien

1. **Schwarz & Weiß, eine Akzentfarbe.** Fast alles ist Schwarz, Weiß und Grau. Blau (`#2997ff`) nur sparsam
   für Hervorhebungen – nie flächig.
2. **Eine Sache pro Bildschirm.** Startseite = eine Zahl + ein Button. Aufgaben = eine ganze Seite pro Aufgabe
   mit genau zwei Entscheidungen unten. Details sind einen Klick entfernt (progressive Offenlegung).
3. **Typografie statt Kästen.** Hierarchie über Größe, Gewicht und Grauton – nicht über Rahmen und Boxen.
   Rahmen nur, wo etwas wirklich eine Fläche ist (Karte, Eingabefeld, Dialog).
4. **Bewegung erklärt, sie dekoriert nicht.** Sie zeigt, woher etwas kommt und wohin es geht. Häufige Aktionen
   bekommen kaum oder keine Animation, seltene Momente (Login, „Alles erledigt“) dürfen glänzen.
5. **Tastatur zuerst.** Enter = Haupt-Aktion, ← = ablehnen, Esc = zurück, Z = rückgängig. Kürzel stehen sichtbar
   auf den Buttons.
6. **Verzeihen statt fragen.** Rückgängig nach jeder Entscheidung. Bestätigungsdialoge nur für wirklich
   Zerstörerisches (z. B. „Demo zurücksetzen“).
7. **Sofortige Rückmeldung.** Jeder Klick reagiert beim Drücken (100 ms). Hintergrundprozesse zeigen Status
   („wird gesendet…“ → „Gesendet ✓“).

---

## 2. Technik

| Bereich | Wahl |
| --- | --- |
| Framework | React + Vite + TypeScript |
| Styling | Tailwind CSS v4 mit Tokens in `@theme` (siehe §11) |
| Animation | `motion` (`import { motion } from 'motion/react'`), App in `<MotionConfig reducedMotion="user">` |
| Icons | `lucide-react`, Größe 14–16 px (`h-3.5 w-3.5` / `h-4 w-4`), Stroke Standard |
| Diagramme | Recharts |
| Schrift-Fallback | `@fontsource-variable/inter` (für Windows/Linux; auf dem Mac greift SF Pro) |
| Auslieferung | Docker, Multi-Stage (Node-Build → nginx), SPA-Fallback |

---

## 3. Farben

Dunkles Theme, `color-scheme: dark`. Hintergrund ist **reines Schwarz**.

| Token | Wert | Verwendung |
| --- | --- | --- |
| `canvas` | `#000000` | Seitenhintergrund |
| `surface-1` | `#0c0c0d` | Karten, Panels |
| `surface-2` | `#141415` | Eingabefelder, Dialoge |
| `surface-3` | `#1c1c1e` | Menüs, Popover, Tooltips |
| `surface-4` | `#262628` | eigene Chat-Blasen, deaktivierte Flächen |
| `line` | `rgb(255 255 255 / 0.08)` | Haarlinien, Kartenrahmen |
| `line-strong` | `rgb(255 255 255 / 0.14)` | betonte Rahmen, Outline-Buttons |
| `ink` | `#f5f5f7` | Haupttext, Primär-Button-Fläche |
| `ink-2` | `#a1a1a6` | Sekundärtext |
| `ink-3` | `#6e6e73` | Labels, Zeitstempel, Hinweise |
| `ink-4` | `#48484a` | deaktiviert |
| `accent` | `#2997ff` | siehe Regeln unten |
| `accent-soft` | `rgb(41 151 255 / 0.14)` | hinterlegte Hervorhebung |
| `good` | `#30d158` | Status „passt / erledigt“ |
| `warn` | `#ff9f0a` | Status „Achtung / vermutlich unpassend“ |
| `bad` | `#ff453a` | Status „negativ“ |

**Regeln**

- **Akzentblau nur für:** Variablen im Text, Textauswahl, Fokusring, „Neu“-Marker, die zweite Datenreihe in
  Diagrammen, den besten Wert eines Diagramms. Nie für Buttons oder Flächen.
- **Primär-Button ist weiß** (`ink`) mit schwarzer Schrift – das ist die „Akzentfarbe“ der Bedienung.
- **Statusfarben nie allein:** immer als kleiner Punkt (6 px) oder Icon neben neutralem Text. Text bleibt `ink`.
- Weiße Flächen-Transparenzen als Abstufung: `white/[0.03]` (Fläche), `white/[0.06]` (Hover), `white/[0.08–0.12]`
  (sekundäre Buttons).

---

## 4. Typografie

Schrift: Systemschrift (SF Pro auf Apple-Geräten), Fallback Inter.

```
--font-sans:    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', 'Segoe UI', system-ui, sans-serif;
--font-display: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter Variable', 'Segoe UI', system-ui, sans-serif;
```

Body: 15 px, Zeilenhöhe 1.5, `antialiased`.

| Rolle | Größe | Gewicht | Tracking / Zeilenhöhe | Farbe |
| --- | --- | --- | --- | --- |
| Hero-Zahl (Startseite) | 96 px / sm: 120 px | 600 | −0.04em, leading-none | ink |
| Login-Headline | 44 px / sm: 64 px | 600 | `.display` | ink |
| Seitentitel (H1) | 34 px / sm: 40–44 px | 600 | `.display` (−0.025em, 1.08) | ink |
| Name / Fokus-Titel | 28–30 px / sm: 30–36 px | 600 | `.display` | ink |
| Abschnittstitel | 15 px | 600 | −0.01em | ink |
| Fließtext groß | 16–17 px | 400 | 1.6 | ink-2 |
| Fließtext | 14.5–15 px | 400 | 1.5–1.6 | ink / ink-2 |
| Sekundär | 13–14 px | 400–500 | – | ink-2 |
| Hinweis / Meta | 12–12.5 px | 400 | – | ink-3 |
| Eyebrow (Label über Inhalt) | 11.5–12 px | 500, UPPERCASE | +0.08–0.1em | ink-3 |

**Regeln**

- Große Schrift → negatives Tracking (`.display`), kleine Großbuchstaben → positives Tracking.
- Hierarchie über Gewicht + Größe + Grauton zusammen, nicht nur über Größe.
- `tabular-nums` nur für Zahlen, die sich ändern oder untereinander stehen (Zähler, Tabellen, Achsen).
- Deutsche Zahlenformate: `1.234`, `23,4 %`, `+1,6 Pp.`; Zeiten „Heute, 09:14“, „vor 3 Std.“.

```css
.display {
  font-family: var(--font-display);
  letter-spacing: -0.025em;
  line-height: 1.08;
}
```

---

## 5. Raster, Abstände, Radien, Tiefe

| Was | Wert |
| --- | --- |
| Seitenrand | `px-4 sm:px-6` (Fokus-Seiten `px-5`) |
| Max. Breite App/Navigation/Dashboard | 1240 px |
| Fokus-Spalte (eine Aufgabe) | 600 px, zentriert |
| Lesespalte für Fließtext | 460–540 px |
| Abstände | 4er-Raster; Abschnitte 24–40 px (`mt-6`…`mt-10`) |
| Navigation | Höhe 56 px (`h-14`), Fokus-Kopfleiste 64 px (`h-16`) |
| Radius Buttons, Pills, Tabs | `rounded-full` |
| Radius Karten | 24–28 px |
| Radius Felder / innere Flächen | 16–22 px (`rounded-2xl`, Editor 22 px) |
| Radius Tastenkürzel | 6 px |
| Rahmen | immer 1 px, `line` oder `line-strong` |
| Schatten (nur schwebende Elemente) | `0 24px 60px -12px rgb(0 0 0 / 0.85)` |
| Schatten Dialog | `0 40px 120px -20px rgb(0 0 0 / 0.9)` |

**Material („Glas“)** – nur für feststehende Leisten (Navigation), nie für bewegte Elemente:

```css
.glass {
  background: rgb(12 12 13 / 0.72);
  backdrop-filter: blur(24px) saturate(160%);
}
```

Trennlinie unter der Navigation erst zeigen, wenn Inhalt darunter scrollt (`useScrolled`).

---

## 6. Komponenten

Alle Bausteine liegen in `src/components/ui/` und können 1:1 kopiert werden.

### Button

Basis: `inline-flex items-center justify-center rounded-full font-medium tracking-[-0.01em]
transition-[background-color,color,transform,border-color,opacity] duration-100 ease-out active:scale-[0.97]
disabled:opacity-40`

| Variante | Klassen | Einsatz |
| --- | --- | --- |
| `primary` | `bg-ink text-black hover:bg-white` + `shadow-[0_1px_0_rgb(255_255_255/0.4)_inset]` | genau eine Haupt-Aktion pro Bildschirm |
| `outline` | `bg-canvas border border-line-strong text-ink hover:bg-surface-2` | Gegenentscheidung („Nicht senden“) |
| `secondary` | `bg-white/[0.08] hover:bg-white/[0.12]` | Nebenaktionen |
| `ghost` | `text-ink-2 hover:text-ink hover:bg-white/[0.06]` | Navigation, „Beenden“, „Bearbeiten“ |

| Größe | Höhe | Text |
| --- | --- | --- |
| `sm` | 32 px | 13 px |
| `md` | 40 px | 14 px |
| `lg` | 48 px | 15 px |
| `xl` | 56 px | 16 px – Entscheidungsleiste |
| Hero-CTA | 64 px | 17 px – Startseite |

Tastenkürzel als `Kbd` im Button: Haupt-Aktion `↵` am Ende, Ablehnen `←` am Anfang.

### Kbd (Tastenkürzel-Hinweis)

`h-5 min-w-5 rounded-[6px] px-1.5 text-[11px] font-medium`, auf dunklem Grund `border border-white/10
bg-white/[0.06] text-ink-2`, im weißen Button `bg-black/[0.08] text-black/55`. **Unter `md` ausgeblendet**
(Touch-Geräte haben keine Tastatur).

### Pill (Label / Status)

`rounded-full border border-line bg-white/[0.04] h-7 px-2.5 text-[13px] font-medium text-ink`, links ein 6-px-Punkt
in Statusfarbe **oder** ein Icon (14 px, `ink-2`).

### Segmented Control (Tabs, Varianten)

Container `rounded-full border border-line bg-white/[0.03] p-1`, Optionen `h-8 px-3.5 text-[13px]`. Aktive
Option: weiße Pille (`bg-ink`, Text schwarz), die per `layoutId` gleitet –
Feder `{ type: 'spring', bounce: 0, duration: 0.35 }`. Zähler als kleine Kapsel, Kürzel (1, 2, …) in `ink-3`.

### Karte / Fläche

`rounded-[24px] border border-line bg-surface-1 p-5 sm:p-6`. Keine Karten in Karten. Innere Gruppen nur über
Abstand und Eyebrow-Label trennen.

### Eingabefeld / Editor

`rounded-[22px] bg-white/[0.04]`, beim Fokus `border-white/25 bg-white/[0.05]`, Text 16 px / 1.6,
Innenabstand 18 × 22 px. Platzhalter (`{{vorname}}` usw.) werden im Text farbig hinterlegt:
transparente Textarea über einem Backdrop mit identischer Typografie (siehe `MessageEditor.tsx`,
Klasse `.variable-mark`). Unter dem Feld: links „Bearbeiten E“, rechts Zeichenzahl.

### Dialog (Modal)

Abdunkelung `bg-black/60 backdrop-blur-[6px]`, Fläche `rounded-[28px] border-line-strong bg-surface-2`,
max. 672 px (`max-w-2xl`), auf Mobil Bottom-Sheet. Wächst aus der Richtung, aus der er ausgelöst wurde
(`transformOrigin: '50% 100%'` bei Auslösung aus der unteren Leiste). Esc schließt, Enter bestätigt.

### Seitenpanel (Details / Historie)

Rechts, max. 500 px, `rounded-[24px]` mit 8 px Abstand zum Rand, `bg-surface-1/[0.97]`. Kommt von rechts und
geht nach rechts (`x: '105%'`, Feder 0.45 s). Leichte Abdunkelung `bg-black/45`. Esc schließt.

### Statusmeldung (Hintergrund-Aktion)

Immer **nur eine** Meldung gleichzeitig, Pille `h-11 rounded-full border-line-strong`. Ablauf: Spinner +
„… wird gesendet …“ → grüner Haken + „Gesendet“, danach „Rückgängig Z“. Im Fokus-Modus erscheint sie mittig
in der Kopfleiste (anstelle des Fortschritts), sonst unten mittig.

### Benachrichtigung (externes Ereignis, z. B. Slack)

Oben rechts, max. 380 px, `rounded-[18px]`, App-Icon links, Titel fett, Vorschau 2 Zeilen, Aktion als
Textlink in Akzentblau. Federt von rechts herein (`bounce 0.22`), verschwindet nach 15 s (pausiert bei Hover).

### Avatar

Initialen auf Graustufen-Verlauf (`from-[#3a3a3c] to-[#1c1c1e]`, 5 Varianten per Namens-Hash), innerer
Lichtrand `inset 0 1px 0 rgb(255 255 255 / 0.12)`. Keine Fotos in Demos.

### Hinweis „Demo mit Beispieldaten“

Unten links, `text-[11px] text-ink-3`, kleine Pille mit grauem Punkt.

---

## 7. Layout-Muster

### Willkommen / Login

Zentriert: Eyebrow → Headline (44/64 px) → ein Satz → zwei Auswahlkarten nebeneinander → kleiner Hinweis mit
Schloss-Icon. Unten ein **Horizont**: riesige schwarze Ellipse (`2200 × 1400 px`, `rounded-[50%]`,
`border-t border-white/25`, Leuchten `shadow-[0_-40px_160px_-20px_rgb(255_255_255/0.22)]`) bei 78 % der
Höhe, plus weicher Lichthof als radialer Verlauf. Kein Passwortfeld in Demos.

### Startseite („Heute“)

Nur: Datum, Begrüßung („Guten Tag, **Name**.“ – Name in `ink`, Rest in `ink-2`), **eine große Zahl**, darunter
was sie bedeutet, eine Zeile kleiner Einstiege („3 Antworten · 5 neue Leads“) und **ein** weißer Hero-Button.
Darunter eine Zeile Hinweis in `ink-3` („Antworten zuerst · ca. 4 Min.“). Enter startet.

### Fokus-Modus (eine Aufgabe pro Bildschirm)

```
┌──────────────────────────────────────────────────────┐
│ ✕ Beenden Esc        3 von 14 erledigt     Filter ▾  │  64 px, schwarz/80 + Blur
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│  1-px-Fortschrittslinie (weiß)
│                     EYEBROW                          │
│                     (Avatar)                         │
│                  Name der Person ›                   │  öffnet Details
│               Position · Firma                       │
│            Branche · Ort · Zeitbezug                 │
│                   [ Signal-Pill ]                    │
│            KI-ZUSAMMENFASSUNG (2–3 Sätze)            │
│               [ A | B ]  Variante                    │
│          ┌──────────────────────────────┐            │
│          │ Nachricht / Inhalt           │            │
│          └──────────────────────────────┘            │
│   ┌──────────────────┐  ┌──────────────────┐         │  sticky, Verlauf nach Schwarz
│   │ ← Nicht senden   │  │  Senden       ↵  │         │  2 Spalten, 56 px
│   └──────────────────┘  └──────────────────┘         │
└──────────────────────────────────────────────────────┘
```

- Keine Hauptnavigation. Raus kommt man über „Beenden“ (Esc).
- Unten **immer genau zwei** Buttons an derselben Stelle: links `outline` (negativ, ←), rechts `primary`
  (positiv, ↵). Leiste: `sticky bottom-0 bg-gradient-to-t from-black from-70% to-transparent`.
- Alles Wichtige ohne Scrollen sichtbar (Ziel: 1440 × 800). Weiteres hinter Textlinks („Verlauf anzeigen V“).
- Seiten lassen sich wischen (siehe §8).

### „Alles erledigt“

Großer weißer Kreis mit Haken (80 px, weißer Schein), Headline „Alles erledigt für heute 🎉“, ein Satz mit
Dauer, Kennzahlen als große Zahlen **ohne Kästen**, dann ein Primär-Button + ein Ghost-Button.

### Dashboard

Titel + Zeitraum, darunter **Tabs für Ansichten** (Überblick · Details · Vergleich) – jede Ansicht passt auf
einen Bildschirm. Filter (z. B. Person) rechts in derselben Zeile. KPI-Kacheln in einer Reihe, darunter max.
zwei Diagramme nebeneinander.

---

## 8. Bewegung

### Kurven & Federn

```css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);   /* Auftritte, Standard */
--ease-apple:  cubic-bezier(0.32, 0.72, 0, 1);   /* Schubladen, Seiten */
```

```ts
const SPRING = { type: 'spring', bounce: 0, duration: 0.35 };        // Menüs, Tabs, Dialoge
const SPRING_PAGE = { type: 'spring', bounce: 0, duration: 0.5 };    // Seitenwechsel
const SPRING_BACK = { type: 'spring', bounce: 0.25, duration: 0.5 }; // Zurückfedern nach einer Geste
```

Federn sind kritisch gedämpft (`bounce: 0`). Nachschwingen **nur**, wenn vorher eine Geste Schwung hatte.

### Dauern

| Was | Dauer |
| --- | --- |
| Button drücken | 100 ms (`active:scale-[0.97]`) |
| Hover, Farbe | 150–200 ms |
| Menü / Popover | Feder 0.3 s, `transform-origin` am Auslöser |
| Dialog | Feder 0.35 s, Start `scale 0.96, y 12` |
| Seitenwechsel im Fokus-Modus | Feder 0.45–0.5 s |
| Gestaffelter Auftritt | 70 ms zwischen Elementen |
| Login-Auftritt | 0.8 s pro Element, Horizont 1.8 s (seltener Moment) |

### Regeln

- **Nur `transform` und `opacity`** animieren. Nie `width`, `height`, `top`, `left` (Ausnahme: Akkordeon-Höhe).
- **Nie `scale(0)`** – Start bei `0.95–0.97` + `opacity: 0`.
- **Nie `ease-in`** für Oberflächen.
- **Räumlich konsistent:** Raus, wie es reinkam. Positive Entscheidung verlässt den Bildschirm nach rechts,
  negative nach links, die nächste Aufgabe kommt von unten. **Rückgängig** holt die Aufgabe von der Seite zurück,
  zu der sie ging. Seitenpanel: rechts rein, rechts raus.
- **Nie Eingaben blockieren** während einer Animation – die nächste Aufgabe ist sofort bedienbar.
- **Häufige Aktionen** (Tastenkürzel, 100+ Mal am Tag) bekommen höchstens eine minimale Rückmeldung.
- **Reduzierte Bewegung:** `<MotionConfig reducedMotion="user">` – Bewegungen entfallen, Einblenden bleibt.

### Wischgeste (Karten / Aufgaben)

- Ziehen folgt 1:1, leichte Neigung: `rotate = map(x, [-600, 0, 600], [-5°, 0, 5°])`.
- Beim Loslassen Endpunkt hochrechnen (Apple, „Designing Fluid Interfaces“):
  `projected = x + (v / 1000) * 0.998 / (1 - 0.998)`.
- Entscheidung, wenn `|projected| > 160 px` **und** Weg > 40 px; sonst `SPRING_BACK` zur Mitte.
- Beim Hinausfliegen übernimmt die Feder die Fingergeschwindigkeit.
- Hinweis in Gestenrichtung: Label („Senden →“ / „← Nicht senden“) blendet zwischen 24 und 140 px Auslenkung
  ein und ersetzt die Eyebrow-Zeile.
- Nicht auf Buttons, Feldern, Tabs starten; Textmarkierung beim Ziehen verhindern.

---

## 9. Interaktion & Tastatur

| Taste | Bedeutung (überall gleich) |
| --- | --- |
| `↵` Enter | Haupt-Aktion des Bildschirms (Start, Senden, Vernetzen, Exportieren, Bestätigen) |
| `→` | ebenfalls Haupt-Aktion (Alternative) |
| `←` | Ablehnen / Nicht senden / Verwerfen |
| `Esc` | Schließen bzw. eine Ebene zurück |
| `Z` | Rückgängig |
| `1`–`4` | Variante / Template wählen |
| `E` | Text bearbeiten |
| `V` | Verlauf ein-/ausblenden |
| `⌘/Strg + ↵` | Im Textfeld senden (Enter = Zeilenumbruch) |

- Kürzel sind auf den Buttons sichtbar (`Kbd`), auf Touch-Geräten ausgeblendet.
- Globale Kürzel sind aus, solange in ein Feld getippt wird oder ein Dialog offen ist.
- Hover-Effekte nur auf Geräten mit Maus/Trackpad (Tailwind v4 macht das bei `hover:` automatisch).
- Druck-Feedback beim Drücken, nicht erst beim Loslassen.
- Klickbare Namen öffnen Details: Unterstreichung + Chevron (›) erst bei Hover.

---

## 10. Texte & Ton

- Deutsch, per **Du**, kurz und konkret.
- Buttons sind Verben: „Vernetzen“, „Senden“, „Nicht senden“, „In Close exportieren“, „Beenden“.
- Status in zwei Schritten: „Nachricht wird gesendet…“ → „Gesendet“.
- Zahlen mit Bedeutung: „14 Aufgaben für heute“, „3 von 14 erledigt“.
- Leere Zustände sind freundlich und fassen zusammen („Alles erledigt für heute 🎉 – 14 Aufgaben in 3:12 Min.“).
- KI-Inhalte immer als solche kennzeichnen (Eyebrow „✦ KI-Zusammenfassung“, „KI-Einschätzung“).

---

## 11. Diagramme

| Element | Wert |
| --- | --- |
| Reihe 1 | `#e8e8ed` (fast weiß) |
| Reihe 2 / Hervorhebung | `#2997ff` |
| Gitter | `rgba(255,255,255,0.07)`, nur horizontal, 1 px |
| Achsen | keine Linie, Beschriftung `#6e6e73`, 11 px |
| Linien | 2 px, Fläche darunter als Verlauf 12–22 % → 0 % |
| Balken | max. 24–28 px breit, oben 4 px Radius, bester Wert in Blau |
| Tooltip | `surface-3`, Wert zuerst und fett, Reihenname danach, kurzer Farbstrich als Schlüssel |

Mehr als 2 Reihen vermeiden; eine Achse pro Diagramm; Legende ab 2 Reihen; Prozentwerte direkt über die Balken.

---

## 12. Barrierefreiheit

- Fokusring: `outline: 2px solid rgb(41 151 255 / 0.8); outline-offset: 2px` (`:focus-visible`).
- `prefers-reduced-motion`: Bewegung aus, Einblenden bleibt.
- `prefers-reduced-transparency` und `prefers-contrast: more`: Glas wird massiv, Linien/Texte kräftiger
  (siehe CSS unten).
- Dialoge mit `role="dialog"` + `aria-modal`, Esc schließt.
- Tipp-Ziele mindestens 44 px hoch für Hauptaktionen (`xl` = 56 px).

---

## 13. Bekannte Stolperfallen

| Problem | Lösung |
| --- | --- |
| Safari zeigt dunkle Kästen/Artefakte bei `backdrop-filter` auf animierten Elementen | Glas nur auf feststehenden Leisten; bewegte Karten mit massivem `surface-1` |
| Große `blur()`-Filter ruckeln / rendern falsch | Lichthöfe als `radial-gradient(closest-side, …)` statt `filter: blur` |
| Grid-Kind sprengt die Breite auf Mobil | `grid-cols-[minmax(0,1fr)]` |
| Meldungen verdecken Menüs | Ebenen: Benachrichtigung `z-25` < Navigation `z-30` < Statusmeldung `z-40` < Dialog/Panel `z-50` |
| Toasts stapeln sich und überdecken Inhalt | immer nur eine Meldung |
| Docker-Build bricht in Proxmox-LXC bei `npm ci` ab | in `docker-compose.yml`: `build: { context: ., network: host }` |
| KPIs sehen je nach Präsentationstag schlecht aus | Demo-Daten wochenweise mit festem Trend erzeugen, nicht tagesabhängig |

---

## 14. Startpaket

### `src/index.css`

```css
@import 'tailwindcss';

@theme {
  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', 'Segoe UI', system-ui, sans-serif;
  --font-display: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter Variable', 'Segoe UI', system-ui, sans-serif;

  --color-canvas: #000000;
  --color-surface-1: #0c0c0d;
  --color-surface-2: #141415;
  --color-surface-3: #1c1c1e;
  --color-surface-4: #262628;
  --color-line: rgb(255 255 255 / 0.08);
  --color-line-strong: rgb(255 255 255 / 0.14);
  --color-ink: #f5f5f7;
  --color-ink-2: #a1a1a6;
  --color-ink-3: #6e6e73;
  --color-ink-4: #48484a;
  --color-accent: #2997ff;
  --color-accent-soft: rgb(41 151 255 / 0.14);
  --color-good: #30d158;
  --color-warn: #ff9f0a;
  --color-bad: #ff453a;

  /* überschreibt Tailwinds `ease-out` mit einer kräftigeren Kurve */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-apple: cubic-bezier(0.32, 0.72, 0, 1);
}

@layer base {
  :root { color-scheme: dark; }
  html, body { background: var(--color-canvas); color: var(--color-ink); }
  body {
    font-family: var(--font-sans);
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  ::selection { background: rgb(41 151 255 / 0.35); }
  button { cursor: pointer; }
  :focus-visible { outline: 2px solid rgb(41 151 255 / 0.8); outline-offset: 2px; }
}

@layer components {
  .display { font-family: var(--font-display); letter-spacing: -0.025em; line-height: 1.08; }
  .glass {
    background: rgb(12 12 13 / 0.72);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--color-surface-1); backdrop-filter: none; -webkit-backdrop-filter: none; }
}

@media (prefers-contrast: more) {
  :root {
    --color-line: rgb(255 255 255 / 0.22);
    --color-line-strong: rgb(255 255 255 / 0.36);
    --color-ink-2: #d1d1d6;
    --color-ink-3: #a1a1a6;
  }
  .glass { background: var(--color-surface-1); backdrop-filter: none; -webkit-backdrop-filter: none; }
}
```

### Dateien zum Übernehmen aus diesem Repo

| Datei | Inhalt |
| --- | --- |
| `src/components/ui/Button.tsx` | Button mit Varianten, Größen, Kürzel-Hinweis |
| `src/components/ui/Kbd.tsx` | Tastenkürzel |
| `src/components/ui/Pill.tsx` | Label mit Status-Punkt/Icon |
| `src/components/ui/Segmented.tsx` | Tabs mit gleitender Auswahl |
| `src/components/ui/Modal.tsx` | Dialog mit Abdunkelung, Esc, Ausblend-Logik |
| `src/components/ui/Avatar.tsx` | Initialen-Avatar |
| `src/components/stack/FocusParts.tsx` | Fokus-Seite, Eyebrow, Personen-Kopf, Wisch-Hinweise |
| `src/components/stack/FocusView.tsx` | Kopfleiste, Seitenwechsel, Wischgeste |
| `src/components/stack/swipe.tsx` | Wisch-Aktionen + Projektionsformel |
| `src/components/stack/ActivityToasts.tsx` | Statusmeldung mit Rückgängig |
| `src/components/stack/MessageEditor.tsx` | Textfeld mit farbigen Variablen |
| `src/lib/useHotkeys.ts`, `src/lib/useScrolled.ts`, `src/lib/cn.ts` | Hilfsfunktionen |
| `src/pages/Login.tsx` | Willkommensseite mit Horizont-Animation |
| `Dockerfile`, `nginx.conf`, `docker-compose.yml` | Auslieferung |

---

## 15. Checkliste für jeden neuen Bildschirm

- [ ] Gibt es genau **eine** Haupt-Aktion (weißer Button, Enter)?
- [ ] Passt das Wichtigste ohne Scrollen auf 1440 × 800?
- [ ] Nur Schwarz/Weiß/Grau – Blau nur für Hervorhebung?
- [ ] Hierarchie über Typografie statt über Kästen?
- [ ] Kürzel sichtbar, Esc führt zurück, Rückgängig möglich?
- [ ] Bewegung nur mit `transform`/`opacity`, räumlich logisch, Eingaben nie blockiert?
- [ ] Reduzierte Bewegung, Fokusring und Kontrast geprüft?
- [ ] Mobil ohne horizontalen Überlauf (390 px)?
- [ ] Texte auf Deutsch, per Du, Buttons als Verben?
