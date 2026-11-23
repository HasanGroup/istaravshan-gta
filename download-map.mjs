import fs from 'fs';

const CENTER_LAT = 39.9115;
const CENTER_LON = 69.0035;
const METERS_PER_LAT = 111320;
const METERS_PER_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);

function latLonToXZ(lat, lon) {
  return [
    +((lon - CENTER_LON) * METERS_PER_LON).toFixed(2),
    +(-(lat - CENTER_LAT) * METERS_PER_LAT).toFixed(2),
  ];
}

const query = `
  [out:json][timeout:25];
  (
    way["building"](around:900,${CENTER_LAT},${CENTER_LON});
    way["highway"~"primary|secondary|tertiary|residential|unclassified"](around:900,${CENTER_LAT},${CENTER_LON});
  );
  out body;
  >;
  out skel qt;
`;

const mirrors = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function run() {
  for (const url of mirrors) {
    try {
      console.log('Скачиваю реальный Истаравшан с:', url);
      const res = await fetch(url, { method: 'POST', body: query });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const nodes = new Map();
      for (const el of data.elements) {
        if (el.type === 'node') nodes.set(el.id, latLonToXZ(el.lat, el.lon));
      }

      const roads = [];
      const buildings = [];
      const palette = ['#e2e8f0', '#cbd5e1', '#fde68a', '#fed7aa', '#f1f5f9'];

      for (const el of data.elements) {
        if (el.type !== 'way' || !el.nodes) continue;
        const pts = el.nodes.map((id) => nodes.get(id)).filter(Boolean);
        if (pts.length < 2) continue;

        if (el.tags?.highway) {
          const hw = el.tags.highway;
          const width = hw === 'primary' ? 13 : hw === 'secondary' ? 11 : 8;
          for (let i = 0; i < pts.length - 1; i++) {
            roads.push({ x1: pts[i][0], z1: pts[i][1], x2: pts[i + 1][0], z2: pts[i + 1][1], width });
          }
        } else if (el.tags?.building && pts.length >= 3) {
          const levels = parseInt(el.tags['building:levels'] || '0', 10);
          buildings.push({
            points: pts,
            height: levels > 0 ? levels * 3.5 : 4.5 + (el.id % 6) * 1.6,
            color: palette[el.id % palette.length],
            lit: el.id % 3 === 0,
          });
        }
      }

      if (roads.length > 10) {
        fs.mkdirSync('public', { recursive: true });
        fs.writeFileSync('public/istaravshan.json', JSON.stringify({ roads, buildings }));
        console.log(`ГОТОВО! Сохранено в public/istaravshan.json: ${buildings.length} зданий, ${roads.length} сегментов дорог.`);
        return;
      }
    } catch (e) {
      console.log('Зеркало не ответило, пробую следующее...', e.message);
    }
  }
  console.error('Не удалось скачать карту ни с одного зеркала. Проверь интернет.');
}

run();