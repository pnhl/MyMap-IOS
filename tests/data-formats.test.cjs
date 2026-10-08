const test = require('node:test');
const assert = require('node:assert/strict');

test('GPX regex parser extracts track points correctly', () => {
  const gpxSample = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyMap">
  <trk>
    <name>Test Route</name>
    <trkseg>
      <trkpt lat="10.776889" lon="106.700806">
        <ele>12.5</ele>
        <time>2026-09-18T03:00:00.000Z</time>
      </trkpt>
      <trkpt lat="10.777120" lon="106.701200">
        <ele>14.0</ele>
        <time>2026-09-18T03:00:15.000Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const points = [];
  const trkptRegex = /<trkpt\s+[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  let match;
  while ((match = trkptRegex.exec(gpxSample)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const inner = match[3] || '';
    const timeMatch = /<time>([^<]+)<\/time>/i.exec(inner);
    const eleMatch = /<ele>([^<]+)<\/ele>/i.exec(inner);

    points.push({
      latitude: lat,
      longitude: lon,
      altitude: eleMatch ? parseFloat(eleMatch[1]) : null,
      timestamp: timeMatch ? new Date(timeMatch[1]).getTime() : 0,
    });
  }

  assert.equal(points.length, 2);
  assert.equal(points[0].latitude, 10.776889);
  assert.equal(points[0].longitude, 106.700806);
  assert.equal(points[0].altitude, 12.5);
  assert.equal(points[1].latitude, 10.777120);
});

test('GeoJSON FeatureCollection parses LineString coordinates', () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [106.700806, 10.776889, 10],
            [106.701200, 10.777120, 12]
          ]
        }
      }
    ]
  };

  const points = [];
  for (const f of geojson.features) {
    if (f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)) {
      for (const c of f.geometry.coordinates) {
        points.push({
          latitude: c[1],
          longitude: c[0],
          altitude: c[2]
        });
      }
    }
  }

  assert.equal(points.length, 2);
  assert.equal(points[0].latitude, 10.776889);
  assert.equal(points[0].longitude, 106.700806);
});
