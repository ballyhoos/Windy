# 🌊 Generating Shoreline Orientation Data (Windy)

This guide explains how to download coastline data and generate the shoreline lookup file used by Windy to determine land vs sea direction.

---

## 🧠 Overview

Windy uses a precomputed dataset to determine:

- Which direction is sea
- Which direction is land
- How to rotate the land/sea circle in the UI

This process is performed offline and is not part of the app runtime.

---

## 📦 What you will create

After completing this process, the following files will be generated:

/public/data/shoreline-grid-vic.json  
/public/data/shoreline-grid-vic.meta.json  
/public/data/shoreline-grid-nsw.json  
/public/data/shoreline-grid-nsw.meta.json  
/public/data/shoreline-grid-qld.json  
/public/data/shoreline-grid-qld.meta.json  
/public/data/shoreline-grid-sa.json  
/public/data/shoreline-grid-sa.meta.json  
/public/data/shoreline-grid-wa.json  
/public/data/shoreline-grid-wa.meta.json  
/public/data/shoreline-grid-tas.json  
/public/data/shoreline-grid-tas.meta.json  
/public/data/shoreline-grid-nt.json  
/public/data/shoreline-grid-nt.meta.json  

These files are used directly by the Windy frontend.

---

## 📥 Step 1 — Download coastline data

Download the OpenStreetMap coastline dataset:

https://osmdata.openstreetmap.de/data/coastlines.html

Download:
- Coastlines (Shapefile)
- File name: coastline-split-4326.zip

---

## 📂 Step 2 — Extract the dataset

Unzip the downloaded file.

You should see files like:

lines.shp  
lines.dbf  
lines.shx  
lines.prj  

---

## 📁 Step 3 — Place files in project

Create the following directory:

/source-data/coastline/

Move the extracted files into it:

/source-data/coastline/lines.shp  
/source-data/coastline/lines.dbf  
/source-data/coastline/lines.shx  
/source-data/coastline/lines.prj  

---

## 🌍 Optional Step — Add land polygons (for higher accuracy)

Download land polygons:

https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/

Download:
ne_10m_land.zip

Extract into:

/source-data/land/

---

## ⚙️ Step 4 — Run the generator script

Run the preprocessing tool:

python scripts/generate_shoreline_grid.py \
  --input ./source-data/coastline/lines.shp \
  --output-dir ./public/data/ \
  --resolution 0.01 \
  --max-distance-km 25

Optional (with land polygons):

--land-polygon ./source-data/land/ne_10m_land.shp

---

## 🧱 Frontend build and Pages publish files

Windy uses two frontend outputs:

- `npm run build` -> standard app build in `/dist`
- `npm run build:docs` -> GitHub Pages artifact in `/docs`

`build:docs` produces:

- `/docs/index.html`
- `/docs/assets/*`

And adds cache busting to docs HTML by appending `?v=YYMMDD-HHMM` to CSS/JS asset URLs.

---

## 🔧 What the script does

The generator performs the following steps:

1. Loads coastline geometry
2. Generates a grid across Australia
3. For each grid point:
   - Finds the nearest coastline
   - Calculates shoreline direction
   - Determines which side is sea
4. Stores results in a compact lookup format

---

## 📊 Output format

Example:

{
  "cells": {
    "-37.94,145.00": [235, 420, 95]
  }
}

Where:
- 235 = sea bearing (degrees)
- 420 = distance to coast (metres)
- 95 = confidence (%)

---

## 📍 How the app uses this

At runtime:

User location → snapped to grid → lookup JSON → get sea bearing → rotate UI

No geospatial processing occurs in the app.

---

## 🧭 Example

For Hampton VIC:
- Sea direction is approximately southwest
- The UI rotates so the blue (sea) half faces Port Phillip Bay

---

## ⚠️ Notes

- Only coastal areas are included
- Inland locations will return no data
- Resolution affects file size and accuracy

---

## ⚖️ Resolution trade-offs

0.01° (~1 km)   → recommended balance  
0.005° (~500 m) → higher detail, larger files  
0.0025° (~250 m) → higher accuracy, larger file  

---

## 🔁 Updating the dataset

To regenerate:

1. Replace coastline data in /source-data/
2. Run the script again
3. Commit updated JSON files

---

## 💡 Summary

- Coastline data is downloaded once
- Processed offline into a lookup grid
- Stored as static JSON
- Used directly by the frontend
