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

const BBOX = '39.880,68.960,39.945,69.050';
const query = `[out:json][timeout:60];(way["highway"](${BBOX});way["building"](${BBOX}););out body;>;out skel qt;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchOSM() {
  for (const url of ENDPOINTS) {
    try {
      console.log(`Пробую сервер: ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
          'User-Agent': 'IstaravshanDigitalTwin/1.0',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.log(`Сервер не ответил (${e.message}), пробую следующий...`);
    }
  }
  throw new Error('Все серверы Overpass недоступны');
}

async function run() {
  const data = await fetchOSM();

  const nodes = new Map();
  for (const el of data.elements) {
    if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
  }

  const roads = [];
  const buildings = [];

  for (const el of data.elements) {
    if (el.type !== 'way' || !el.nodes) continue;
    const coords = el.nodes.map((id) => nodes.get(id)).filter(Boolean);
    if (coords.length < 2) continue;

    if (el.tags?.highway) {
      const hw = el.tags.highway;
      const width =
        hw === 'primary' || hw === 'trunk' ? 14 : hw === 'secondary' ? 11 : hw === 'residential' ? 7 : 5;
      for (let i = 0; i < coords.length - 1; i++) {
        const [x1, z1] = latLonToXZ(coords[i][0], coords[i][1]);
        const [x2, z2] = latLonToXZ(coords[i + 1][0], coords[i + 1][1]);
        roads.push({ x1, z1, x2, z2, width });
      }
    } else if (el.tags?.building && coords.length >= 4) {
      const points = coords.slice(0, -1).map(([lat, lon]) => latLonToXZ(lat, lon));
      const levels = Number(el.tags['building:levels']) || 1;
      buildings.push({
        points,
        height: levels * 3.6,
        color: '#ebe3d5',
        lit: levels >= 2,
      });
    }
  }

  fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/istaravshan.json', JSON.stringify({ roads, buildings }));
  console.log(`ГОТОВО! Дорог: ${roads.length}, Реальных зданий: ${buildings.length}`);
}

run().catch((err) => console.error('Ошибка:', err.message));
