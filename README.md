# windy
Paddle Board App

## GitHub Pages

Build the static GitHub Pages site into `docs/`:

```sh
npm run build:pages
```

In GitHub, set Pages to publish from the `main` branch and `/docs` folder. The app will be available at:

```text
https://ballyhoos.github.io/Windy/
```

## Coastal Station Lookup

The live site is fully static and does not use a backend proxy. Preferred coastal BOM stations are maintained in `src/data/coastalStations.ts`.

To add or tune a coastal station, update that file with the BOM station ID, product ID, station name, coordinates, state, launch spot aliases, and observation URL. The app checks alias matches first, then nearest station by coordinates, and falls back to BOM's public location API when no suitable coastal station is found or coastal observations cannot be read directly by the browser.
