export type CoastalStation = {
  stationId: string;
  productId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  state: string;
  aliases: string[];
  observationUrl: string;
};

// Static lookup table for preferred coastal BOM stations.
// This avoids runtime scraping of BOM coastal lookup pages and keeps the
// GitHub Pages deployment fully static. Add stations here after verifying
// their BOM product IDs and the launch spots/suburbs they should serve.
export const coastalStations: CoastalStation[] = [
  {
    stationId: '086220',
    productId: 'IDV60701.95864',
    stationName: 'ST KILDA HARBOUR - RMYS',
    latitude: -37.86,
    longitude: 144.96,
    state: 'VIC',
    aliases: [
      'St Kilda',
      'St Kilda Beach',
      'St Kilda Harbour',
      'St Kilda Pier',
      'St Kilda West',
      'Elwood',
      'Elwood Beach',
      'Middle Park',
      'Albert Park',
      'Port Melbourne',
      'South Melbourne',
    ],
    observationUrl: 'https://www.bom.gov.au/products/IDV60701/IDV60701.95864.shtml',
  },
  {
    stationId: '086376',
    productId: 'IDV60701.95872',
    stationName: 'FAWKNER BEACON',
    latitude: -37.95,
    longitude: 144.93,
    state: 'VIC',
    aliases: [
      'Hampton',
      'Hampton Beach',
      'Hampton Victoria',
      'Black Rock',
      'Black Rock Victoria',
      'Sandringham',
      'Sandringham Beach',
      'Brighton',
      'Brighton Beach',
      'Beaumaris',
      'Half Moon Bay',
    ],
    observationUrl: 'https://www.bom.gov.au/products/IDV60701/IDV60701.95872.shtml',
  },
];
