import React, { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';

const CENTER_LAT = 39.9115;
const CENTER_LON = 69.0035;
const METERS_PER_LAT = 111320;
const METERS_PER_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);

function latLonToXZ(lat: number, lon: number): [number, number] {
  const x = (lon - CENTER_LON) * METERS_PER_LON;
  const z = -(lat - CENTER_LAT) * METERS_PER_LAT;
  return [x, z];
}

interface BuildingData {
  id: number;
  points: [number, number][];
  height: number;
  color: string;
}

interface RoadData {
  id: number;
  points: [number, number][];
  width: number;
}

// Резервная сетка центра Истаравшана, если Overpass API долго отвечает
function getFallbackCity(): { buildings: BuildingData[]; roads: RoadData[] } {
  const roads: RoadData[] = [
    { id: 1, points: [[-300, 0], [300, 0]], width: 12 }, // Проспект Исмоили Сомони
    { id: 2, points: [[0, -300], [0, 300]], width: 11 }, // Улица к крепости Муг-Теппа
    { id: 3, points: [[-300, 90], [300, 90]], width: 8 },
    { id: 4, points: [[-300, -90], [300, -90]], width: 8 },
    { id: 5, points: [[110, -300], [110, 300]], width: 8 },
    { id: 6, points: [[-110, -300], [-110, 300]], width: 8 },
  ];

  const buildings: BuildingData[] = [];
  const palette = ['#e2e8f0', '#cbd5e1', '#fde68a', '#fed7aa', '#f1f5f9'];
  let id = 10;

  for (let gx = -220; gx <= 220; gx += 55) {
    for (let gz = -220; gz <= 220; gz += 55) {
      if (Math.abs(gx) < 25 || Math.abs(gz) < 25 || Math.abs(Math.abs(gx) - 110) < 20 || Math.abs(Math.abs(gz) - 90) < 20) continue;
      const w = 16 + (Math.abs(gx * gz) % 12);
      const d = 14 + (Math.abs(gx + gz) % 10);
      const h = 5 + (Math.abs(gx + gz * 2) % 14);
      buildings.push({
        id: id++,
        points: [
          [gx - w / 2, gz - d / 2],
          [gx + w / 2, gz - d / 2],
          [gx + w / 2, gz + d / 2],
          [gx - w / 2, gz + d / 2],
        ],
        height: h,
        color: palette[id % palette.length],
      });
    }
  }
  return { buildings, roads };
}

export function IstaravshanMap({ onLoaded }: { onLoaded?: (status: string) => void }) {
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  const [roads, setRoads] = useState<RoadData[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // Максимум 6 секунд ожидания

    const fetchOSM = async () => {
      try {
        onLoaded?.('Загрузка улиц Истаравшана...');
        const query = `
          [out:json][timeout:10];
          (
            way["building"](around:550,${CENTER_LAT},${CENTER_LON});
            way["highway"~"primary|secondary|tertiary|residential"](around:550,${CENTER_LAT},${CENTER_LON});
          );
          out body;
          >;
          out skel qt;
        `;

        const res = await fetch('https://overpass.kumi.systems/api/interpreter', {
          method: 'POST',
          body: query,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await res.json();

        const nodes = new Map<number, [number, number]>();
        for (const el of data.elements) {
          if (el.type === 'node') nodes.set(el.id, latLonToXZ(el.lat, el.lon));
        }

        const loadedBuildings: BuildingData[] = [];
        const loadedRoads: RoadData[] = [];
        const palette = ['#e2e8f0', '#cbd5e1', '#f1f5f9', '#fde68a', '#fed7aa'];

        for (const el of data.elements) {
          if (el.type !== 'way' || !el.nodes) continue;
          const pts = el.nodes.map((id: number) => nodes.get(id)).filter(Boolean) as [number, number][];
          if (pts.length < 2) continue;

          if (el.tags?.building) {
            const levels = parseInt(el.tags['building:levels'] || '0', 10);
            loadedBuildings.push({
              id: el.id,
              points: pts,
              height: levels > 0 ? levels * 3.5 : 4 + (el.id % 5) * 1.8,
              color: palette[el.id % palette.length],
            });
          } else if (el.tags?.highway) {
            const isMain = el.tags.highway === 'primary' || el.tags.highway === 'secondary';
            loadedRoads.push({ id: el.id, points: pts, width: isMain ? 11 : 7 });
          }
        }

        if (!cancelled && loadedRoads.length > 0) {
          setBuildings(loadedBuildings);
          setRoads(loadedRoads);
          onLoaded?.(`OSM Истаравшан: ${loadedBuildings.length} зданий, ${loadedRoads.length} дорог`);
        } else {
          throw new Error('Empty OSM');
        }
      } catch {
        if (!cancelled) {
          const fallback = getFallbackCity();
          setBuildings(fallback.buildings);
          setRoads(fallback.roads);
          onLoaded?.('Истаравшан: локальная карта центра (готово)');
        }
      }
    };

    fetchOSM();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [onLoaded]);

  const buildingMeshes = useMemo(() => {
    return buildings.map((b) => {
      const shape = new THREE.Shape();
      b.points.forEach(([x, z], idx) => {
        if (idx === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      return { id: b.id, geometry, color: b.color };
    });
  }, [buildings]);

  return (
    <group>
      <RigidBody type="fixed" friction={1}>
        <mesh receiveShadow position={[0, -0.5, 0]}>
          <boxGeometry args={[1800, 1, 1800]} />
          <meshStandardMaterial color="#3f4e3c" roughness={0.95} />
        </mesh>
      </RigidBody>

      {/* Дороги с разметкой */}
      {roads.map((road) =>
        road.points.slice(0, -1).map((p1, idx) => {
          const p2 = road.points[idx + 1];
          const dx = p2[0] - p1[0];
          const dz = p2[1] - p1[1];
          const len = Math.hypot(dx, dz);
          if (len < 0.5) return null;
          const midX = (p1[0] + p2[0]) / 2;
          const midZ = (p1[1] + p2[1]) / 2;
          const angle = Math.atan2(dx, dz);

          return (
            <group key={`${road.id}-${idx}`} position={[midX, 0.03, midZ]} rotation={[0, angle, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[road.width, len + 1.5]} />
                <meshStandardMaterial color="#1e293b" roughness={0.85} />
              </mesh>
              {/* Осевая линия */}
              <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.25, len]} />
                <meshStandardMaterial color="#f8fafc" />
              </mesh>
            </group>
          );
        })
      )}

      {/* Здания (используем hull/cuboid вместо тяжелого trimesh для 60 FPS) */}
      {buildingMeshes.map((b) => (
        <RigidBody key={b.id} type="fixed" colliders="hull">
          <mesh geometry={b.geometry} castShadow receiveShadow>
            <meshStandardMaterial color={b.color} roughness={0.7} />
          </mesh>
        </RigidBody>
      ))}

      {/* Главная достопримечательность — Арка крепости Муг-Теппа */}
      <RigidBody type="fixed" position={[0, 0, 45]}>
        <mesh castShadow position={[-7, 5, 0]}>
          <boxGeometry args={[4, 10, 5]} />
          <meshStandardMaterial color="#d97706" />
        </mesh>
        <mesh castShadow position={[7, 5, 0]}>
          <boxGeometry args={[4, 10, 5]} />
          <meshStandardMaterial color="#d97706" />
        </mesh>
        <mesh castShadow position={[0, 11, 0]}>
          <boxGeometry args={[20, 3, 5.5]} />
          <meshStandardMaterial color="#0284c7" />
        </mesh>
      </RigidBody>
    </group>
  );
}