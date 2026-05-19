# Zementwerk-Simulator

Ein realistisches Aufbau- und Optimierungsspiel rund um den Betrieb eines
Zementwerks — bedienbar wie ein Handygame, direkt im Browser, ganz ohne
Installation oder Build-Schritt.

## Spielidee

Du leitest ein komplettes Zementwerk: vom Steinbruch über Rohmühle, Vorwärmer,
Calcinator und Drehrohrofen bis zur Zementmühle und zum Versand. Stelle Reglern,
Rezepturen und Brennstoffmischungen so ein, dass Qualität, Energieverbrauch,
CO₂-Ausstoß und Gewinn stimmen — und meistere Störungen und Marktschwankungen.

Das Modell rechnet mit echten Zusammenhängen:

- **Massenbilanz** Rohmehl → Klinker über den Glühverlust
- **Chemie** Kalkstandard (LSF), Silikat-/Tonerdemodul, Klinkerphasen nach Bogue,
  Freikalk
- **Wärmebilanz** spezifischer Brennstoffwärmebedarf abhängig von Vorwärmerstufen,
  Kühlerwirkungsgrad und Anlagenzustand
- **CO₂-Bilanz** prozessbedingte Entsäuerung + Brennstoffemissionen
- **Wirtschaft** Rohstoff-, Brennstoff-, Strom-, CO₂-Zertifikats-, Personal- und
  Wartungskosten gegen Markterlöse

## Spielen

Öffne die veröffentlichte Seite (siehe unten) auf dem Handy oder am Rechner.
Tippe ein Aggregat im Fließbild an, um es zu steuern. Über die Fußleiste
erreichst du Geschwindigkeit, Missionen, Ausbau, Markt und die Anleitung.
Der Spielstand wird automatisch im Browser gespeichert.

## Lokal testen

ES-Module benötigen HTTP (kein `file://`):

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000/` im Browser öffnen.

## Auf GitHub Pages veröffentlichen

Das Spiel ist eine rein statische Web-App und kann direkt über GitHub Pages
ausgeliefert werden:

1. Im Repository **Settings → Pages** öffnen.
2. Unter **Build and deployment** als Source **Deploy from a branch** wählen.
3. Den Branch `claude/cement-factory-simulator-JtyRC` und den Ordner `/ (root)`
   auswählen, speichern.
4. Nach kurzer Zeit ist das Spiel unter der angezeigten Pages-URL spielbar.

## Projektstruktur

```
index.html              Einstieg
style.css               Mobile-first Layout
src/
  main.js               Bootstrap
  util.js               Formatierungshelfer
  data/                 Rohstoffe, Brennstoffe, Zementsorten
  sim/                  physics, economy, events, simulation
  game/                 Spielstand, Upgrades, Missionen
  ui/                   Fließbild, Panels, HUD, App-Verdrahtung
```
