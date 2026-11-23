import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';

export interface MissionPoint {
  name: string;
  x: number;
  z: number;
}

export type TrafficMap = Record<number, { x: number; z: number }>;

export const LOCATIONS: MissionPoint[] = [
  { name: 'Крепость Муг-Теппа', x: 0, z: 38 },
  { name: 'Центральный рынок', x: 110, z: 90 },
  { name: 'Проспект Исмоили Сомони', x: -110, z: 0 },
  { name: 'Площадь Истиклол', x: 0, z: -90 },
  { name: 'Ремесленный квартал', x: -110, z: 90 },
];

interface TrafficCarConfig {
  id: number;
  axis: 'x' | 'z';
  lanePos: number;
  dir: 1 | -1;
  startOffset: number;
  speed: number;
  color: string;
}

const TRAFFIC_CONFIGS: TrafficCarConfig[] = [
  { id: 1, axis: 'x', lanePos: -3, dir: 1, startOffset: -180, speed: 12, color: '#f8fafc' },
  { id: 2, axis: 'x', lanePos: 3, dir: -1, startOffset: 160, speed: 14, color: '#eab308' },
  { id: 3, axis: 'z', lanePos: 3, dir: 1, startOffset: -140, speed: 11, color: '#94a3b8' },
  { id: 4, axis: 'z', lanePos: -3, dir: -1, startOffset: 190, speed: 13, color: '#1e293b' },
  { id: 5, axis: 'x', lanePos: 87, dir: 1, startOffset: -120, speed: 10, color: '#f8fafc' },
  { id: 6, axis: 'x', lanePos: -93, dir: -1, startOffset: 140, speed: 12, color: '#38bdf8' },
  { id: 7, axis: 'z', lanePos: 113, dir: 1, startOffset: -170, speed: 13, color: '#eab308' },
  { id: 8, axis: 'z', lanePos: -107, dir: -1, startOffset: 130, speed: 11, color: '#cbd5e1' },
];

function TrafficCar({
  cfg,
  positionsRef,
}: {
  cfg: TrafficCarConfig;
  positionsRef: React.MutableRefObject<TrafficMap>;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const posVal = useRef(cfg.startOffset);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    posVal.current += cfg.dir * cfg.speed * delta;
    if (posVal.current > 260) posVal.current = -260;
    if (posVal.current < -260) posVal.current = 260;

    const x = cfg.axis === 'x' ? posVal.current : cfg.lanePos;
    const z = cfg.axis === 'z' ? posVal.current : cfg.lanePos;
    const angle =
      cfg.axis === 'x'
        ? cfg.dir === 1
          ? Math.PI / 2
          : -Math.PI / 2
        : cfg.dir === 1
        ? 0
        : Math.PI;

    body.setNextKinematicTranslation({ x, y: 0.65, z });
    body.setNextKinematicRotation(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle)
    );
    positionsRef.current[cfg.id] = { x, z };
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" position={[0, 0.65, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.85, 0.72, 4.1]} />
        <meshStandardMaterial color={cfg.color} roughness={0.35} metalness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 0.6, -0.15]}>
        <boxGeometry args={[1.6, 0.55, 2.1]} />
        <meshStandardMaterial color="#0f172a" roughness={0.1} metalness={0.8} />
      </mesh>
    </RigidBody>
  );
}

export function CityWorldSystems({
  playerPosRef,
  activeTarget,
  isMissionActive,
  onTriggerMarker,
  trafficPositionsRef,
}: {
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  activeTarget: MissionPoint;
  isMissionActive: boolean;
  onTriggerMarker: () => void;
  trafficPositionsRef: React.MutableRefObject<TrafficMap>;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const cooldown = useRef(0);

  useFrame((state, delta) => {
    if (cooldown.current > 0) cooldown.current -= delta;

    if (ringRef.current) {
      ringRef.current.rotation.y += delta * 2;
      ringRef.current.position.y = 1.5 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
    }

    const dx = playerPosRef.current.x - activeTarget.x;
    const dz = playerPosRef.current.z - activeTarget.z;
    if (Math.hypot(dx, dz) < 5.5 && cooldown.current <= 0) {
      cooldown.current = 1.5;
      onTriggerMarker();
    }
  });

  const markerColor = isMissionActive ? '#facc15' : '#22c55e';

  return (
    <group>
      {TRAFFIC_CONFIGS.map((cfg) => (
        <TrafficCar key={cfg.id} cfg={cfg} positionsRef={trafficPositionsRef} />
      ))}

      <group position={[activeTarget.x, 0, activeTarget.z]}>
        <mesh position={[0, 6, 0]}>
          <cylinderGeometry args={[2.5, 2.5, 12, 24, 1, true]} />
          <meshBasicMaterial
            color={markerColor}
            transparent
            opacity={0.28}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={ringRef} position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.6, 0.15, 12, 32]} />
          <meshBasicMaterial color={markerColor} />
        </mesh>
      </group>
    </group>
  );
}

export function GtaRadar({
  playerPosRef,
  playerHeadingRef,
  activeTarget,
  isMissionActive,
  trafficPositionsRef,
}: {
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  playerHeadingRef: React.MutableRefObject<number>;
  activeTarget: MissionPoint;
  isMissionActive: boolean;
  trafficPositionsRef: React.MutableRefObject<TrafficMap>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animId: number;
    const renderRadar = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const size = 156;
          const r = size / 2;
          const scale = 0.55;
          const px = playerPosRef.current.x;
          const pz = playerPosRef.current.z;
          const heading = playerHeadingRef.current;

          ctx.clearRect(0, 0, size, size);

          ctx.save();
          ctx.beginPath();
          ctx.arc(r, r, r - 3, 0, Math.PI * 2);
          ctx.clip();

          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, size, size);

          ctx.translate(r, r);
          ctx.rotate(heading);

          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 6;
          const drawRoad = (x1: number, z1: number, x2: number, z2: number) => {
            ctx.beginPath();
            ctx.moveTo((x1 - px) * scale, (z1 - pz) * scale);
            ctx.lineTo((x2 - px) * scale, (z2 - pz) * scale);
            ctx.stroke();
          };
          drawRoad(-300, 0, 300, 0);
          drawRoad(0, -300, 0, 300);
          drawRoad(-300, 90, 300, 90);
          drawRoad(-300, -90, 300, -90);
          drawRoad(110, -300, 110, 300);
          drawRoad(-110, -300, -110, 300);

          ctx.fillStyle = '#e2e8f0';
          Object.values(trafficPositionsRef.current).forEach((pos) => {
            ctx.beginPath();
            ctx.arc((pos.x - px) * scale, (pos.z - pz) * scale, 2.5, 0, Math.PI * 2);
            ctx.fill();
          });

          const tx = (activeTarget.x - px) * scale;
          const tz = (activeTarget.z - pz) * scale;
          const dist = Math.hypot(tx, tz);
          const maxR = r - 12;
          const clampedX = dist > maxR ? (tx / dist) * maxR : tx;
          const clampedZ = dist > maxR ? (tz / dist) * maxR : tz;

          ctx.fillStyle = isMissionActive ? '#facc15' : '#22c55e';
          ctx.beginPath();
          ctx.arc(clampedX, clampedZ, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();

          ctx.save();
          ctx.translate(r, r);
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(0, -7);
          ctx.lineTo(5, 6);
          ctx.lineTo(0, 3);
          ctx.lineTo(-5, 6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(r, r, r - 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      animId = requestAnimationFrame(renderRadar);
    };
    animId = requestAnimationFrame(renderRadar);
    return () => cancelAnimationFrame(animId);
  }, [activeTarget, isMissionActive, playerHeadingRef, playerPosRef, trafficPositionsRef]);

  return (
    <canvas
      ref={canvasRef}
      width={156}
      height={156}
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        zIndex: 10,
        borderRadius: '50%',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      }}
    />
  );
}