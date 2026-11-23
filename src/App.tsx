import React, { useRef, useEffect, useState, useMemo, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sky, Environment, useGLTF, useAnimations } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider, CapsuleCollider } from '@react-three/rapier';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';


const LOCATIONS = [
  {
    name: 'Крепость Муг-Теппа',
    x: 0,
    z: 38,
    info: 'Древнее городище VI–IV вв. до н.э. — историческое сердце Истаравшана с монументальными воротами и голубым куполом.',
  },
  {
    name: 'Бозори Марказӣ (Рынок)',
    x: 110,
    z: 90,
    info: 'Главный рынок Истаравшана: горячие лепешки, виноград, ошхона и ряды мастеров-ножевщиков.',
  },
  {
    name: 'Проспект Исмоили Сомони',
    x: -110,
    z: 0,
    info: 'Центральный проспект современного Истаравшана.',
  },
  {
    name: 'Площадь Истиклол',
    x: 0,
    z: -90,
    info: 'Главная площадь города для праздников и вечерних прогулок.',
  },
  {
    name: 'Квартал Ҳунармандон',
    x: -110,
    z: 90,
    info: 'Ремесленные мастерские резчиков по дереву, кузнецов и вышивальщиц сюзане.',
  },
];

const RACE_CHECKPOINTS = [
  { x: 0, z: 60 },
  { x: 0, z: 160 },
  { x: 110, z: 160 },
  { x: 110, z: 0 },
  { x: 110, z: -90 },
  { x: -110, z: -90 },
  { x: -110, z: 0 },
  { x: 0, z: 0 },
];

const CARS = [
  { id: 0, name: 'Спорт-купе (Белый перламутр)', price: 0, color: '#f8fafc', maxSpeed: 38, accel: 26 },
  { id: 1, name: 'Спорт-купе (Серебристый)', price: 200, color: '#94a3b8', maxSpeed: 44, accel: 32 },
  { id: 2, name: 'Спорт-купе (Красный Rosso)', price: 400, color: '#dc2626', maxSpeed: 52, accel: 40 },
];

const TRAFFIC = [
  { id: 1, axis: 'x', lane: -3, dir: 1, start: -180, speed: 12, color: '#f8fafc' },
  { id: 2, axis: 'x', lane: 3, dir: -1, start: 160, speed: 14, color: '#eab308' },
  { id: 3, axis: 'z', lane: 3, dir: 1, start: -140, speed: 11, color: '#94a3b8' },
  { id: 4, axis: 'z', lane: -3, dir: -1, start: 190, speed: 13, color: '#1e293b' },
  { id: 5, axis: 'x', lane: 87, dir: 1, start: -120, speed: 10, color: '#f8fafc' },
  { id: 6, axis: 'x', lane: -93, dir: -1, start: 140, speed: 12, color: '#38bdf8' },
];

const PEDESTRIANS = [
  { id: 1, sideX: -9, startZ: -80, dir: 1 },
  { id: 2, sideX: 9, startZ: 70, dir: -1 },
  { id: 3, sideX: -9, startZ: 20, dir: 1 },
  { id: 4, sideX: 9, startZ: -40, dir: 1 },
  { id: 5, sideX: -9, startZ: 120, dir: -1 },
  { id: 6, sideX: 9, startZ: 140, dir: -1 },
];

const CITY_SIGNS = [
  { text: 'БОЗОРИ МАРКАЗӢ', x: 96, z: 82, rot: -Math.PI / 2, bg: '#0284c7' },
  { text: 'ОШХОНА • ПЛОВ', x: 124, z: 96, rot: Math.PI / 2, bg: '#d97706' },
  { text: 'НОНИ ИСТАРАВШАН', x: -16, z: 18, rot: Math.PI / 2, bg: '#b45309' },
  { text: 'ҲУНАРМАНДОН', x: -96, z: 86, rot: -Math.PI / 2, bg: '#059669' },
  { text: 'ЧОЙХОНАИ МИЛЛӢ', x: 16, z: -76, rot: -Math.PI / 2, bg: '#7c3aed' },
  { text: 'ДОРУХОНА 24/7', x: -96, z: -14, rot: -Math.PI / 2, bg: '#16a34a' },
];

interface RoadSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
}

const worldState = {
  carPos: new THREE.Vector3(0, 1.2, 0),
  activePos: new THREE.Vector3(0, 1.2, 0),
  heading: 0,
  traffic: {} as Record<number, { x: number; z: number }>,
  nearbyRoads: [] as RoadSegment[],
};

class SoundSystem {
  ctx: AudioContext | null = null;
  osc: OscillatorNode | null = null;
  gain: GainNode | null = null;
  radioTimer: number | null = null;
  lastScreech = 0;
  step = 0;

  ensureCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  playTone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.06) {
    this.ensureCtx();
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + dur);
  }

  playTireScreech() {
    const nowMs = performance.now();
    if (nowMs - this.lastScreech < 450) return;
    this.lastScreech = nowMs;
    this.ensureCtx();
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(920, now);
    o.frequency.exponentialRampToValueAtTime(540, now + 0.35);
    g.gain.setValueAtTime(0.055, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.38);
  }

  updateEngine(speedRatio: number, active: boolean) {
    const ctx = this.ctx;
    if (!active) {
      if (this.gain && ctx) this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      return;
    }
    if (!ctx && speedRatio > 0.02) {
      this.ensureCtx();
      const nextCtx = this.ctx;
      if (!nextCtx) return;
      this.osc = nextCtx.createOscillator();
      this.gain = nextCtx.createGain();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 45;
      this.gain.gain.value = 0.02;
      this.osc.connect(this.gain);
      this.gain.connect(nextCtx.destination);
      this.osc.start();
    }
    const activeCtx = this.ctx;
    if (activeCtx && this.osc && this.gain) {
      this.osc.frequency.setTargetAtTime(42 + speedRatio * 105, activeCtx.currentTime, 0.08);
      this.gain.gain.setTargetAtTime(0.015 + speedRatio * 0.022, activeCtx.currentTime, 0.08);
    }
  }

  setRadioStation(station: number) {
    if (this.radioTimer) {
      window.clearInterval(this.radioTimer);
      this.radioTimer = null;
    }
    if (station === 0) return;
    this.ensureCtx();
    const audioCtx = this.ctx;
    if (!audioCtx) return;

    const notes1 = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 554.37, 587.33];
    const notes2 = [110.0, 110.0, 130.81, 146.83, 164.81, 146.83, 130.81, 98.0];
    const scale = station === 1 ? notes1 : notes2;
    this.step = 0;

    this.radioTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = station === 1 ? 'triangle' : 'sawtooth';
      osc.frequency.value = scale[this.step % scale.length];
      g.gain.setValueAtTime(0.032, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
      this.step++;
    }, station === 1 ? 260 : 210);
  }
}
const soundSys = new SoundSystem();

function createAsphaltPBR() {
  const size = 256;
  const diffCanvas = document.createElement('canvas');
  const normCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  diffCanvas.width = normCanvas.width = roughCanvas.width = size;
  diffCanvas.height = normCanvas.height = roughCanvas.height = size;

  const dCtx = diffCanvas.getContext('2d')!;
  const nCtx = normCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  dCtx.fillStyle = '#252a32';
  dCtx.fillRect(0, 0, size, size);
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const bright = Math.random() > 0.5;
    dCtx.fillStyle = bright ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.22)';
    dCtx.fillRect(x, y, 2, 2);

    nCtx.fillStyle = bright ? 'rgb(148, 148, 255)' : 'rgb(108, 108, 255)';
    nCtx.fillRect(x, y, 2, 2);

    rCtx.fillStyle = bright ? '#ffffff' : '#808080';
    rCtx.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(diffCanvas);
  const normalMap = new THREE.CanvasTexture(normCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  [map, normalMap, roughnessMap].forEach((t) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 10);
  });
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap, roughnessMap };
}

function createSignTexture(text: string, bg: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPlateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 60);
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(4, 4, 38, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('TJ', 11, 40);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('777 AA 02', 52, 43);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function RainWeather() {
  const pointsRef = useRef<any>(null);
  const count = 2400;

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 120;
      arr[i * 3 + 1] = Math.random() * 45;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const posAttr = pts.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const px = worldState.activePos.x;
    const pz = worldState.activePos.z;

    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= 34 * delta;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3] = px + (Math.random() - 0.5) * 120;
        arr[i * 3 + 1] = 42 + Math.random() * 6;
        arr[i * 3 + 2] = pz + (Math.random() - 0.5) * 120;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} args={[positions, 3]} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#bae6fd" size={0.22} transparent opacity={0.65} />
    </points>
  );
}

function AnimatedPersonMesh({ actionName }: { actionName: 'Idle' | 'Walk' | 'Run' }) {
  const group = useRef<any>(null);
  const { scene, animations } = useGLTF(`${import.meta.env.BASE_URL}models/person.glb`);
  const cloned = useMemo(() => {
    const c = cloneSkeleton(scene);
    c.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const target = actions[actionName] || actions['Walk'] || Object.values(actions)[0];
    Object.values(actions).forEach((a) => a?.fadeOut(0.2));
    target?.reset().fadeIn(0.2).play();
  }, [actions, actionName]);

  return (
    <group ref={group}>
      <primitive object={cloned} scale={0.95} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

function FallbackCarMesh({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.85, 0.55, 4.2]} />
        <meshStandardMaterial color={color} roughness={0.25} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.52, -0.15]}>
        <boxGeometry args={[1.5, 0.48, 2.1]} />
        <meshStandardMaterial color="#0f172a" roughness={0.1} metalness={0.9} />
      </mesh>
    </group>
  );
}

function RealGLBCarModel({ color, wheelSpin }: { color: string; wheelSpin: React.MutableRefObject<number> }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/car.glb`);
  const wheelsRef = useRef<THREE.Object3D[]>([]);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const wheels: THREE.Object3D[] = [];

    clone.traverse((child: any) => {
      child.visible = true;
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        const matName = (child.material?.name || '').toLowerCase();
        const objName = (child.name || '').toLowerCase();

        if (matName.includes('body') || objName.includes('body')) {
          child.material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.7,
            roughness: 0.22,
          });
        }
      }
      if (
        child.name === 'wheel_fl' ||
        child.name === 'wheel_fr' ||
        child.name === 'wheel_rl' ||
        child.name === 'wheel_rr'
      ) {
        wheels.push(child);
      }
    });

    wheelsRef.current = wheels;
    return clone;
  }, [scene, color]);

  useFrame(() => {
    for (const w of wheelsRef.current) {
      w.rotation.x = wheelSpin.current;
    }
  });

  return <primitive object={clonedScene} scale={1.12} position={[0, -0.52, 0]} rotation={[0, Math.PI, 0]} />;
}
function CitySignBoard({
  text,
  x,
  z,
  rot,
  bg,
  timeMode,
}: {
  text: string;
  x: number;
  z: number;
  rot: number;
  bg: string;
  timeMode: number;
}) {
  const tex = useMemo(() => createSignTexture(text, bg), [text, bg]);
  return (
    <group position={[x, 4.2, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, -2.1, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 4.2, 8]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh>
        <boxGeometry args={[6.4, 1.6, 0.25]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={timeMode >= 1 ? 0.7 : 0.15}
        />
      </mesh>
    </group>
  );
}

// Спутниковая карта на весь Истаравшан (8 x 8 км)

// Здания для активных чанков вокруг игрока (с твердыми стенами)

function SurroundingMountains({ timeMode }: { timeMode: number }) {
  const peaks = useMemo(() => {
    const arr: { x: number; z: number; r: number; h: number }[] = [];
    const count = 44;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const dist = 4600 + (i % 4) * 320;
      arr.push({
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        r: 720 + (i % 5) * 140,
        h: 420 + (i % 6) * 110,
      });
    }
    return arr;
  }, []);

  const mountainColor = timeMode === 2 ? '#1e293b' : timeMode === 1 ? '#9a3412' : '#78716c';

  return (
    <group>
      {peaks.map((p, i) => (
        <mesh key={i} position={[p.x, p.h * 0.45, p.z]}>
          <coneGeometry args={[p.r, p.h, 7]} />
          <meshStandardMaterial color={mountainColor} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function MugTeppaMonument({ timeMode }: { timeMode: number }) {
  return (
    <RigidBody type="fixed" position={[0, 0, 45]}>
      <mesh castShadow position={[-7.5, 5.5, 0]}>
        <boxGeometry args={[4.5, 11, 5.5]} />
        <meshStandardMaterial color="#d97706" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[7.5, 5.5, 0]}>
        <boxGeometry args={[4.5, 11, 5.5]} />
        <meshStandardMaterial color="#d97706" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 11.5, 0]}>
        <boxGeometry args={[21, 3.2, 6]} />
        <meshStandardMaterial
          color="#0284c7"
          emissive={timeMode >= 1 ? '#38bdf8' : '#000000'}
          emissiveIntensity={timeMode === 2 ? 0.8 : timeMode === 1 ? 0.35 : 0}
        />
      </mesh>
      <mesh castShadow position={[0, 14.5, 6]}>
        <sphereGeometry args={[5.5, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#0ea5e9"
          roughness={0.2}
          metalness={0.4}
          emissive={timeMode >= 1 ? '#0284c7' : '#000000'}
          emissiveIntensity={timeMode === 2 ? 0.6 : 0.2}
        />
      </mesh>
      <mesh castShadow position={[-18, 3.5, 2]}>
        <boxGeometry args={[17, 7, 2.5]} />
        <meshStandardMaterial color="#b45309" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[18, 3.5, 2]}>
        <boxGeometry args={[17, 7, 2.5]} />
        <meshStandardMaterial color="#b45309" roughness={0.8} />
      </mesh>
    </RigidBody>
  );
}


function useControls() {
  const controls = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    brake: false,
  });

  useEffect(() => {
    const setKey = (code: string, val: boolean) => {
      if (code === 'KeyW' || code === 'ArrowUp') controls.current.forward = val;
      if (code === 'KeyS' || code === 'ArrowDown') controls.current.backward = val;
      if (code === 'KeyA' || code === 'ArrowLeft') controls.current.left = val;
      if (code === 'KeyD' || code === 'ArrowRight') controls.current.right = val;
      if (code === 'Space') controls.current.brake = val;
    };
    const down = (e: KeyboardEvent) => setKey(e.code, true);
    const up = (e: KeyboardEvent) => setKey(e.code, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return controls;
}

// Аккуратный городок Истаравшан: улицы, кварталы, ограждения, деревья/кусты, базар, больница и люди
const TOWN_ROADS: RoadSegment[] = [
  { x1: -420, z1: 0, x2: 420, z2: 0, width: 14 },
  { x1: 0, z1: -420, x2: 0, z2: 420, width: 14 },
  { x1: -360, z1: -140, x2: 360, z2: -140, width: 10 },
  { x1: -360, z1: 140, x2: 360, z2: 140, width: 10 },
  { x1: -180, z1: -360, x2: -180, z2: 360, width: 10 },
  { x1: 180, z1: -360, x2: 180, z2: 360, width: 10 },
];

const TOWN_BLOCKS: { x: number; z: number; w: number; h: number; d: number; color: string; roof?: string }[] = [
  { x: -90, z: -70, w: 50, h: 9, d: 34, color: '#cbd5e1', roof: '#475569' },
  { x: 90, z: -70, w: 54, h: 10, d: 36, color: '#e2e8f0', roof: '#334155' },
  { x: -90, z: 70, w: 48, h: 8, d: 32, color: '#d6d3d1', roof: '#57534e' },
  { x: 90, z: 70, w: 56, h: 10, d: 36, color: '#cbd5e1', roof: '#475569' },
  { x: -250, z: -70, w: 46, h: 8, d: 32, color: '#e7e5e4', roof: '#64748b' },
  { x: 250, z: -70, w: 48, h: 9, d: 34, color: '#cbd5e1', roof: '#475569' },
  { x: -250, z: 70, w: 44, h: 8, d: 32, color: '#d6d3d1', roof: '#57534e' },
  { x: 250, z: 70, w: 50, h: 9, d: 34, color: '#e2e8f0', roof: '#334155' },
];

const TOWN_FENCES: { x: number; z: number; len: number; rotY: number }[] = [
  { x: -45, z: 9, len: 24, rotY: 0 },
  { x: 45, z: 9, len: 24, rotY: 0 },
  { x: -45, z: -9, len: 24, rotY: 0 },
  { x: 45, z: -9, len: 24, rotY: 0 },
  { x: -135, z: 9, len: 22, rotY: 0 },
  { x: 135, z: 9, len: 22, rotY: 0 },
];

const TOWN_TREES: [number, number][] = [
  [-32, -11], [32, -11], [-32, 11], [32, 11],
  [-120, -11], [120, -11], [-120, 11], [120, 11],
  [-11, -65], [11, -65], [-11, 65], [11, 65],
];

const TOWN_BUSHES: [number, number, number][] = [
  [-22, -10.5, 1.1], [22, -10.5, 1.2], [-22, 10.5, 1.0], [22, 10.5, 1.15],
  [-105, -10.5, 1.1], [105, -10.5, 1.05], [-105, 10.5, 1.2], [105, 10.5, 1.1],
  [-10.5, -45, 1.1], [10.5, -45, 1.0], [-10.5, 45, 1.15], [10.5, 45, 1.05],
];

function BazaarZone() {
  const stalls = [
    [-24, 0, '#d97706'],
    [-8, 0, '#0284c7'],
    [8, 0, '#16a34a'],
    [24, 0, '#ea580c'],
  ] as const;

  return (
    <RigidBody type="fixed" position={[-180, 0, -140]}>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[68, 44]} />
        <meshStandardMaterial color="#a8a29e" roughness={0.9} />
      </mesh>
      {stalls.map(([sx, sz, col], idx) => (
        <group key={idx} position={[sx, 0, sz]}>
          <mesh position={[0, 1.1, 0]}>
            <boxGeometry args={[10, 2.2, 6]} />
            <meshStandardMaterial color="#f5f5f4" roughness={0.8} />
          </mesh>
          <mesh position={[0, 2.4, 0]}>
            <boxGeometry args={[11, 0.35, 7]} />
            <meshStandardMaterial color={col} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </RigidBody>
  );
}

function HospitalZone({ timeMode }: { timeMode: number }) {
  return (
    <RigidBody type="fixed" position={[180, 0, 140]}>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[64, 46]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.85} />
      </mesh>
      <mesh position={[0, 5.5, 0]}>
        <boxGeometry args={[36, 11, 18]} />
        <meshStandardMaterial
          color="#f8fafc"
          roughness={0.65}
          emissive={timeMode === 2 ? '#e0f2fe' : '#000000'}
          emissiveIntensity={timeMode === 2 ? 0.2 : 0}
        />
      </mesh>
      <mesh position={[0, 11.3, 0]}>
        <boxGeometry args={[37, 0.6, 19]} />
        <meshStandardMaterial color="#0284c7" roughness={0.5} />
      </mesh>
      <mesh position={[0, 7.2, 9.2]}>
        <boxGeometry args={[1.4, 4.2, 0.4]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 7.2, 9.2]}>
        <boxGeometry args={[4.2, 1.4, 0.4]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
      </mesh>
    </RigidBody>
  );
}

function IstaravshanCity({
  timeMode,
  isRain: _isRain,
  onStatus,
}: {
  timeMode: number;
  isRain: boolean;
  onStatus: (text: string) => void;
}) {
  const asphaltPBR = useMemo(() => createAsphaltPBR(), []);

  useEffect(() => {
    worldState.nearbyRoads = TOWN_ROADS;
    onStatus('Истаравшан: городок, базар и больница');
  }, [onStatus]);

  return (
    <group>
      <RigidBody type="fixed" position={[0, -0.25, 0]}>
        <CuboidCollider args={[900, 0.25, 900]} />
        <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1800, 1800]} />
          <meshStandardMaterial color="#8c9a7a" roughness={0.95} metalness={0.02} />
        </mesh>
      </RigidBody>

      <SurroundingMountains timeMode={timeMode} />
      <MugTeppaMonument timeMode={timeMode} />
      <BazaarZone />
      <HospitalZone timeMode={timeMode} />

      {CITY_SIGNS.map((s, idx) => (
        <CitySignBoard key={idx} {...s} timeMode={timeMode} />
      ))}

      {TOWN_ROADS.map((r, i) => {
        const dx = r.x2 - r.x1;
        const dz = r.z2 - r.z1;
        const len = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        return (
          <group
            key={i}
            position={[(r.x1 + r.x2) / 2, 0.03, (r.z1 + r.z2) / 2]}
            rotation={[0, angle, 0]}
          >
            <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[r.width, len]} />
              <meshStandardMaterial map={asphaltPBR.map} roughness={0.85} metalness={0.05} />
            </mesh>
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.16, len]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
          </group>
        );
      })}

      {TOWN_BLOCKS.map((b, i) => (
        <RigidBody key={i} type="fixed" position={[b.x, b.h / 2, b.z]}>
          <mesh>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial
              color={b.color}
              roughness={0.75}
              emissive={timeMode === 2 ? '#fef08a' : '#000000'}
              emissiveIntensity={timeMode === 2 ? 0.12 : 0}
            />
          </mesh>
          {b.roof && (
            <mesh position={[0, b.h / 2 + 0.25, 0]}>
              <boxGeometry args={[b.w + 0.6, 0.5, b.d + 0.6]} />
              <meshStandardMaterial color={b.roof} roughness={0.8} />
            </mesh>
          )}
        </RigidBody>
      ))}

      {TOWN_FENCES.map((f, i) => (
        <RigidBody key={i} type="fixed" position={[f.x, 0.6, f.z]} rotation={[0, f.rotY, 0]}>
          <mesh>
            <boxGeometry args={[f.len, 1.2, 0.22]} />
            <meshStandardMaterial color="#64748b" roughness={0.7} metalness={0.3} />
          </mesh>
        </RigidBody>
      ))}

      {TOWN_TREES.map(([tx, tz], i) => (
        <group key={i} position={[tx, 0, tz]}>
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.18, 0.28, 3.2, 6]} />
            <meshStandardMaterial color="#5c4033" roughness={0.9} />
          </mesh>
          <mesh position={[0, 4.1, 0]}>
            <dodecahedronGeometry args={[2.0, 0]} />
            <meshStandardMaterial color="#3f6212" roughness={0.85} />
          </mesh>
        </group>
      ))}

      {[-160, -80, 0, 80, 160].map((pos, idx) => (
        <group key={`lamp_${idx}`} position={[pos, 0, 8.2]}>
          <mesh position={[0, 3.2, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 6.4, 6]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 6.3, -0.4]}>
            <boxGeometry args={[0.35, 0.14, 0.9]} />
            <meshStandardMaterial
              color="#fef08a"
              emissive={timeMode >= 1 ? '#fef08a' : '#000000'}
              emissiveIntensity={timeMode === 2 ? 4 : timeMode === 1 ? 2 : 0}
            />
          </mesh>
        </group>
      ))}

      {TOWN_BUSHES.map(([bx, bz, s], i) => (
        <mesh key={i} position={[bx, 0.65 * s, bz]} scale={[s * 1.3, s * 0.85, s]}>
          <dodecahedronGeometry args={[0.9, 0]} />
          <meshStandardMaterial color="#4d7c0f" roughness={0.88} />
        </mesh>
      ))}
    </group>
  );
}

const TRAFFIC_UP_AXIS = new THREE.Vector3(0, 1, 0);
const TRAFFIC_QUAT = new THREE.Quaternion();

function TrafficCar({ cfg, timeMode }: { cfg: (typeof TRAFFIC)[number]; timeMode: number }) {
  const bodyRef = useRef<any>(null);
  const posVal = useRef(cfg.start);
  const curSpeed = useRef(cfg.speed);
  const wheelSpin = useRef(0);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    const dt = Math.min(delta, 0.05);
    const x = cfg.axis === 'x' ? posVal.current : cfg.lane;
    const z = cfg.axis === 'z' ? posVal.current : cfg.lane;

    const distToPlayer = Math.hypot(worldState.activePos.x - x, worldState.activePos.z - z);
    const targetSpeed = distToPlayer < 14 ? 0 : cfg.speed;
    curSpeed.current += (targetSpeed - curSpeed.current) * 6 * dt;

    posVal.current += cfg.dir * curSpeed.current * dt;
    if (posVal.current > 260) posVal.current = -260;
    if (posVal.current < -260) posVal.current = 260;
    wheelSpin.current += (curSpeed.current * dt) / 0.35;

    const angle =
      cfg.axis === 'x'
        ? cfg.dir === 1
          ? Math.PI / 2
          : -Math.PI / 2
        : cfg.dir === 1
        ? 0
        : Math.PI;

    body.setNextKinematicTranslation({ x, y: 0.58, z });
    TRAFFIC_QUAT.setFromAxisAngle(TRAFFIC_UP_AXIS, angle);
    body.setNextKinematicRotation(TRAFFIC_QUAT);
    worldState.traffic[cfg.id] = { x, z };
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      position={[cfg.axis === 'x' ? cfg.start : cfg.lane, 0.58, cfg.axis === 'z' ? cfg.start : cfg.lane]}
    >
      <Suspense fallback={<FallbackCarMesh color={cfg.color} />}>
        <RealGLBCarModel color={cfg.color} wheelSpin={wheelSpin} />
      </Suspense>
      {timeMode >= 1 && (
        <mesh position={[0, 0.1, 2.05]}>
          <boxGeometry args={[1.1, 0.12, 0.06]} />
          <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={4} />
        </mesh>
      )}
    </RigidBody>
  );
}

function Pedestrian({ cfg }: { cfg: (typeof PEDESTRIANS)[number] }) {
  const groupRef = useRef<any>(null);
  const posRef = useRef((cfg as any).start ?? 0);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    const speed = (cfg as any).speed ?? 1.8;
    const dir = (cfg as any).dir ?? 1;
    posRef.current += dir * speed * dt;
    if (posRef.current > 150) posRef.current = -150;
    if (posRef.current < -150) posRef.current = 150;

    const axis = (cfg as any).axis ?? 'x';
    const lane = (cfg as any).lane ?? 8;
    const x = axis === 'x' ? posRef.current : lane;
    const z = axis === 'z' ? posRef.current : lane;
    const bob = Math.abs(Math.sin(state.clock.elapsedTime * 7 + ((cfg as any).id ?? 0))) * 0.06;

    g.position.set(x, 0.9 + bob, z);
    g.rotation.y = axis === 'x' ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : dir === 1 ? 0 : Math.PI;
  });

  const shirtColor = (cfg as any).color ?? '#38bdf8';

  return (
    <group ref={groupRef} position={[0, 0.9, 8]}>
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.26, 0.85, 4, 8]} />
        <meshStandardMaterial color={shirtColor} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshStandardMaterial color="#f1c27d" roughness={0.8} />
      </mesh>
    </group>
  );
}

function MissionMarker({
  target,
  mode,
  onTrigger,
}: {
  target: { x: number; z: number };
  mode: 'taxi_start' | 'taxi_end' | 'race';
  onTrigger: () => void;
}) {
  const ringRef = useRef<any>(null);
  const cooldown = useRef(0);

  useFrame((state, delta) => {
    if (cooldown.current > 0) cooldown.current -= delta;
    if (ringRef.current) {
      ringRef.current.rotation.y += delta * 2.5;
      ringRef.current.position.y = 1.5 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
    }
    const dist = Math.hypot(worldState.activePos.x - target.x, worldState.activePos.z - target.z);
    if (dist < 6.5 && cooldown.current <= 0) {
      cooldown.current = 0.8;
      onTrigger();
    }
  });

  const color = mode === 'race' ? '#f43f5e' : mode === 'taxi_end' ? '#facc15' : '#22c55e';

  return (
    <group position={[target.x, 0, target.z]}>
      <mesh position={[0, 6, 0]}>
        <cylinderGeometry args={[2.7, 2.7, 12, 24, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.32} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.8, 0.18, 12, 32]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function PlayerCharacter({
  initialPos,
  firstPerson,
}: {
  initialPos: [number, number, number];
  firstPerson: boolean;
}) {
  const bodyRef = useRef<any>(null);
  const controls = useControls();
  const currentCamPos = useRef(new THREE.Vector3(initialPos[0], initialPos[1] + 3, initialPos[2] - 5));
  const currentLookAt = useRef(new THREE.Vector3(...initialPos));
  const heading = useRef(0);
  const [anim, setAnim] = useState<'Idle' | 'Walk'>('Idle');
  const lastAnim = useRef<'Idle' | 'Walk'>('Idle');

  useFrame((state, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    body.wakeUp();

    const { forward, backward, left, right, brake } = controls.current;
    const pos = body.translation();
    worldState.activePos.set(pos.x, pos.y, pos.z);

    if (left) heading.current += 2.8 * delta;
    if (right) heading.current -= 2.8 * delta;
    worldState.heading = heading.current;

    const walkSpeed = 7.5;
    let moveZ = 0;
    if (forward) moveZ += walkSpeed;
    if (backward) moveZ -= walkSpeed * 0.6;

    const nextAnim = Math.abs(moveZ) > 0.1 ? 'Walk' : 'Idle';
    if (nextAnim !== lastAnim.current) {
      lastAnim.current = nextAnim;
      setAnim(nextAnim);
    }

    const vx = Math.sin(heading.current) * moveZ;
    const vz = Math.cos(heading.current) * moveZ;
    const curVel = body.linvel();
    const vy = brake && Math.abs(curVel.y) < 0.15 ? 8.0 : curVel.y;

    body.setLinvel({ x: vx, y: vy, z: vz }, true);
    body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading.current),
      true
    );

    const charVec = new THREE.Vector3(pos.x, pos.y, pos.z);
    if (firstPerson) {
      const eyePos = charVec.clone().add(new THREE.Vector3(0, 1.15, 0));
      const lookDir = new THREE.Vector3(Math.sin(heading.current), -0.05, Math.cos(heading.current));
      state.camera.position.copy(eyePos);
      state.camera.lookAt(eyePos.clone().add(lookDir));
    } else {
      const offset = new THREE.Vector3(0, 2.8, -5.5).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        heading.current
      );
      currentCamPos.current.lerp(charVec.clone().add(offset), 1 - Math.exp(-10 * delta));
      currentLookAt.current.lerp(charVec.clone().add(new THREE.Vector3(0, 1.2, 0)), 1 - Math.exp(-12 * delta));
      state.camera.position.copy(currentCamPos.current);
      state.camera.lookAt(currentLookAt.current);
    }
  });

  return (
    <RigidBody ref={bodyRef} position={initialPos} mass={1} enabledRotations={[false, false, false]} colliders={false}>
      <CapsuleCollider args={[0.5, 0.35]} />
      {!firstPerson && (
        <group position={[0, -0.85, 0]}>
          <Suspense fallback={null}>
            <AnimatedPersonMesh actionName={anim} />
          </Suspense>
        </group>
      )}
    </RigidBody>
  );
}

function PlayerCar({
  isDriving,
  firstPerson,
  carSpec,
  timeMode,
  onSpeedChange,
}: {
  isDriving: boolean;
  firstPerson: boolean;
  carSpec: (typeof CARS)[number];
  timeMode: number;
  onSpeedChange: (kmh: number) => void;
}) {
  const carRef = useRef<any>(null);
  const wheelSpin = useRef(0);
  const controls = useControls();
  const currentSpeed = useRef(0);
  const cameraOffset = new THREE.Vector3(0, 3.3, -8.2);
  const currentCamPos = useRef(new THREE.Vector3(0, 5, -10));
  const currentLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const plateTex = useMemo(() => createPlateTexture(), []);

  useFrame((state, delta) => {
    const body = carRef.current;
    if (!body) return;
    body.wakeUp();

    const pos = body.translation();
    worldState.carPos.set(pos.x, pos.y, pos.z);

    const rot = body.rotation();
    const quaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const curVel = body.linvel();

    if (isDriving) {
      worldState.activePos.set(pos.x, pos.y, pos.z);
      worldState.heading = Math.atan2(forwardDir.x, forwardDir.z);

      const { forward, backward, left, right, brake } = controls.current;
      const drag = 10;

      if (forward) currentSpeed.current = Math.min(carSpec.maxSpeed, currentSpeed.current + carSpec.accel * delta);
      else if (backward) currentSpeed.current = Math.max(-15, currentSpeed.current - carSpec.accel * delta);
      else {
        if (Math.abs(currentSpeed.current) < 0.2) currentSpeed.current = 0;
        else currentSpeed.current -= Math.sign(currentSpeed.current) * drag * delta;
      }

      if (brake) {
        if (Math.abs(currentSpeed.current) > 14) {
          soundSys.playTireScreech();
        }
        currentSpeed.current *= Math.pow(0.05, delta);
      }

      wheelSpin.current -= currentSpeed.current * delta * 2.5;

      body.setLinvel(
        { x: forwardDir.x * currentSpeed.current, y: curVel.y, z: forwardDir.z * currentSpeed.current },
        true
      );

      if (Math.abs(currentSpeed.current) > 0.5) {
        const turnDir = currentSpeed.current > 0 ? 1 : -1;
        let angularY = 0;
        if (left) angularY += 2.35 * turnDir;
        if (right) angularY -= 2.35 * turnDir;
        body.setAngvel({ x: 0, y: angularY, z: 0 }, true);
      } else {
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }

      const absSpeed = Math.abs(currentSpeed.current);
      const speedRatio = absSpeed / carSpec.maxSpeed;
      onSpeedChange(Math.round(absSpeed * 3.6));
      soundSys.updateEngine(speedRatio, true);

      const cam = state.camera as THREE.PerspectiveCamera;
      const targetFov = firstPerson ? 68 + speedRatio * 10 : 54 + speedRatio * 18;
      cam.fov += (targetFov - cam.fov) * 6 * delta;
      cam.updateProjectionMatrix();

      const carPosVec = new THREE.Vector3(pos.x, pos.y, pos.z);
      if (firstPerson) {
        const seatOffset = new THREE.Vector3(0.38, 0.72, -0.05).applyQuaternion(quaternion).add(carPosVec);
        const lookAhead = new THREE.Vector3(0.32, 0.66, 6).applyQuaternion(quaternion).add(carPosVec);
        state.camera.position.copy(seatOffset);
        state.camera.lookAt(lookAhead);
      } else {
        const idealOffset = cameraOffset.clone().applyQuaternion(quaternion).add(carPosVec);
        const idealLookAt = new THREE.Vector3(0, 1.25, 4.5).applyQuaternion(quaternion).add(carPosVec);
        currentCamPos.current.lerp(idealOffset, 1 - Math.exp(-9 * delta));
        currentLookAt.current.lerp(idealLookAt, 1 - Math.exp(-13 * delta));
        state.camera.position.copy(currentCamPos.current);
        state.camera.lookAt(currentLookAt.current);
      }
    } else {
      soundSys.updateEngine(0, false);
      currentSpeed.current *= Math.pow(0.1, delta);
      body.setLinvel(
        { x: forwardDir.x * currentSpeed.current, y: curVel.y, z: forwardDir.z * currentSpeed.current },
        true
      );
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  return (
    <RigidBody
      ref={carRef}
      position={[0, 2.6, 0]}
      mass={10}
      ccd
      enabledRotations={[false, true, false]}
      colliders={false}
      onCollisionEnter={() => {
        if (Math.abs(currentSpeed.current) > 6) {
          soundSys.playTone(95, 0.18, 'sawtooth', 0.08);
          currentSpeed.current *= 0.35;
        }
      }}
    >
      <CuboidCollider args={[0.95, 0.55, 2.25]} />

      <Suspense fallback={<FallbackCarMesh color={carSpec.color} />}>
        <RealGLBCarModel color={carSpec.color} wheelSpin={wheelSpin} />
      </Suspense>

      <mesh position={[0, -0.1, -2.42]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.56, 0.14]} />
        <meshBasicMaterial map={plateTex} />
      </mesh>

      {timeMode >= 1 && <pointLight position={[0, 0.6, 3.4]} intensity={25} distance={34} color="#fef9c3" />}
    </RigidBody>
  );
}

function Radar({
  target,
  mode,
}: {
  target: { x: number; z: number };
  mode: 'taxi_start' | 'taxi_end' | 'race';
}) {
  const canvasRef = useRef<any>(null);

  useEffect(() => {
    let id = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const size = 150;
          const r = size / 2;
          const scale = 0.55;
          const px = worldState.activePos.x;
          const pz = worldState.activePos.z;

          ctx.clearRect(0, 0, size, size);
          ctx.save();
          ctx.beginPath();
          ctx.arc(r, r, r - 3, 0, Math.PI * 2);
          ctx.clip();

          ctx.fillStyle = '#090d16';
          ctx.fillRect(0, 0, size, size);

          ctx.translate(r, r);
          ctx.rotate(worldState.heading);

          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 4;
          for (const seg of worldState.nearbyRoads) {
            ctx.beginPath();
            ctx.moveTo((seg.x1 - px) * scale, (seg.z1 - pz) * scale);
            ctx.lineTo((seg.x2 - px) * scale, (seg.z2 - pz) * scale);
            ctx.stroke();
          }

          ctx.fillStyle = '#e2e8f0';
          Object.values(worldState.traffic).forEach((pos) => {
            ctx.beginPath();
            ctx.arc((pos.x - px) * scale, (pos.z - pz) * scale, 2.5, 0, Math.PI * 2);
            ctx.fill();
          });

          const tx = (target.x - px) * scale;
          const tz = (target.z - pz) * scale;
          const dist = Math.hypot(tx, tz);
          const maxR = r - 12;
          const cx = dist > maxR ? (tx / dist) * maxR : tx;
          const cz = dist > maxR ? (tz / dist) * maxR : tz;

          ctx.fillStyle = mode === 'race' ? '#f43f5e' : mode === 'taxi_end' ? '#facc15' : '#22c55e';
          ctx.beginPath();
          ctx.arc(cx, cz, 5, 0, Math.PI * 2);
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

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(r, r, r - 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [target, mode]);

  return (
    <canvas
      ref={canvasRef}
      width={150}
      height={150}
      style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 10, borderRadius: '50%' }}
    />
  );
}

export default function App() {
  const [isDriving, setIsDriving] = useState(true);
  const [firstPerson, setFirstPerson] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [charSpawnPos, setCharSpawnPos] = useState<[number, number, number]>([2, 1.5, 0]);
  const [energy, setEnergy] = useState(85);
  const [isRain, setIsRain] = useState(false);
  const [showHud, setShowHud] = useState(true);

  const [money, setMoney] = useState<number>(() => Number(localStorage.getItem('ist_money') || 250));
  const [ownedCars, setOwnedCars] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ist_cars') || '[0]');
    } catch {
      return [0];
    }
  });
  const [bestRaceSec, setBestRaceSec] = useState<number | null>(() => {
    const val = localStorage.getItem('ist_best_race');
    return val ? Number(val) : null;
  });

  const [isMissionActive, setIsMissionActive] = useState(false);
  const [targetLoc, setTargetLoc] = useState(LOCATIONS[0]);
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [timeMode, setTimeMode] = useState(0);
  const [carIndex, setCarIndex] = useState(0);
  const [, setMapStatus] = useState('Загрузка геоданных...');
  const [radioStation, setRadioStation] = useState(0);
  const [activeGuide, setActiveGuide] = useState<(typeof LOCATIONS)[number] | null>(null);

  const [raceActive, setRaceActive] = useState(false);
  const [raceStep, setRaceStep] = useState(0);
  const [raceTime, setRaceTime] = useState(0);

  const radioNames = ['Выкл', 'Радио Истаравшан FM', 'Вечерний проспект Wave'];
  const timeNames = ['День', 'Закат', 'Ночь'];

  useEffect(() => {
    localStorage.setItem('ist_money', String(money));
  }, [money]);

  useEffect(() => {
    localStorage.setItem('ist_cars', JSON.stringify(ownedCars));
  }, [ownedCars]);

  useEffect(() => {
    if (!raceActive) return;
    const t = window.setInterval(() => setRaceTime((prev) => +(prev + 0.1).toFixed(1)), 100);
    return () => window.clearInterval(t);
  }, [raceActive]);

  const showBanner = (text: string) => {
    setBannerText(text);
    setTimeout(() => setBannerText(null), 3500);
  };

  const handleMarkerTrigger = () => {
    if (raceActive) {
      soundSys.playTone(660, 0.14, 'triangle', 0.08);
      if (raceStep + 1 < RACE_CHECKPOINTS.length) {
        setRaceStep((s) => s + 1);
      } else {
        setRaceActive(false);
        setMoney((m) => m + 150);
        soundSys.playTone(880, 0.35, 'triangle', 0.1);
        if (!bestRaceSec || raceTime < bestRaceSec) {
          setBestRaceSec(raceTime);
          localStorage.setItem('ist_best_race', String(raceTime));
          showBanner(`НОВЫЙ РЕКОРД ГОНКИ: ${raceTime}с! +150 TJS`);
        } else {
          showBanner(`ФИНИШ ЗА ${raceTime}с! +150 TJS`);
        }
      }
      return;
    }

    if (!isMissionActive) {
      soundSys.playTone(520, 0.15, 'sine', 0.07);
      const candidates = LOCATIONS.filter((l) => l.name !== targetLoc.name);
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      setTargetLoc(next);
      setIsMissionActive(true);
      showBanner(`ЗАКАЗ: Отвези пассажира → ${next.name}`);
    } else {
      soundSys.playTone(780, 0.25, 'triangle', 0.09);
      setMoney((m) => m + 50);
      setEnergy((e) => Math.max(20, e - 10));
      setIsMissionActive(false);
      const candidates = LOCATIONS.filter((l) => l.name !== targetLoc.name);
      const nextStart = candidates[Math.floor(Math.random() * candidates.length)];
      setTargetLoc(nextStart);
      showBanner('МИССИЯ ВЫПОЛНЕНА! +50 TJS');
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        setIsRain((r) => {
          const next = !r;
          showBanner(next ? 'Погода: Дождь и мокрый асфальт' : 'Погода: Ясно');
          return next;
        });
      }
      if (e.code === 'KeyV') {
        setFirstPerson((fp) => {
          const next = !fp;
          showBanner(next ? 'Камера: Вид из салона / глаз' : 'Камера: От третьего лица');
          return next;
        });
      }
      if (e.code === 'KeyF') {
        if (isDriving) {
          setCharSpawnPos([worldState.carPos.x - 2.3, worldState.carPos.y + 0.5, worldState.carPos.z]);
          setIsDriving(false);
          setSpeedKmh(0);
        } else if (worldState.carPos.distanceTo(worldState.activePos) < 6) {
          setIsDriving(true);
        }
      }
      if (e.code === 'KeyN') {
        const nextT = (timeMode + 1) % 3;
        setTimeMode(nextT);
        showBanner(`Время суток: ${timeNames[nextT]}`);
      }
      if (e.code === 'KeyG') {
        if (raceActive) {
          setRaceActive(false);
          showBanner('Гонка отменена');
        } else {
          setRaceStep(0);
          setRaceTime(0);
          setRaceActive(true);
          soundSys.playTone(580, 0.2, 'square', 0.07);
          showBanner('СТАРТ ГОНКИ ПО ИСТАРАВШАНУ!');
        }
      }
      if (e.code === 'KeyR') {
        const nextSt = (radioStation + 1) % 3;
        setRadioStation(nextSt);
        soundSys.setRadioStation(nextSt);
        showBanner(`Радио: ${radioNames[nextSt]}`);
      }
      if (e.code === 'KeyE') {
        if (activeGuide) {
          setActiveGuide(null);
          return;
        }
        const near = LOCATIONS.find(
          (l) => Math.hypot(worldState.activePos.x - l.x, worldState.activePos.z - l.z) < 24
        );
        if (near) {
          setActiveGuide(near);
        } else {
          showBanner('Подъедь к Муг-Теппе, Бозори Марказӣ или Чойхоне (E)');
        }
      }
      if (e.code === 'KeyC') {
        const nextIdx = (carIndex + 1) % CARS.length;
        const nextCar = CARS[nextIdx];
        if (ownedCars.includes(nextIdx)) {
          setCarIndex(nextIdx);
          showBanner(`Авто: ${nextCar.name}`);
        } else if (money >= nextCar.price) {
          setMoney((m) => m - nextCar.price);
          setOwnedCars((prev) => [...prev, nextIdx]);
          setCarIndex(nextIdx);
          showBanner(`КУПЛЕНО: ${nextCar.name} (-${nextCar.price} TJS)`);
        } else {
          showBanner(`${nextCar.name} стоит ${nextCar.price} TJS (не хватает)`);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDriving, carIndex, ownedCars, money, radioStation, activeGuide, raceActive, timeMode]);

  const activeCar = CARS[carIndex];
  const currentTarget = raceActive ? RACE_CHECKPOINTS[raceStep] : targetLoc;
  const markerMode = raceActive ? 'race' : isMissionActive ? 'taxi_end' : 'taxi_start';

  const sunPos: [number, number, number] =
    timeMode === 2 ? [0, -30, 0] : timeMode === 1 ? [-120, 18, 160] : [80, 140, 60];
  const fogColor = isRain
    ? '#334155'
    : timeMode === 2
    ? '#070b19'
    : timeMode === 1
    ? '#f472b6'
    : '#bae6fd';

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
{showHud ? (
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 14,
          zIndex: 10,
          background: 'rgba(9, 13, 22, 0.72)',
          color: '#f8fafc',
          padding: '8px 12px',
          borderRadius: '10px',
          fontFamily: 'sans-serif',
          fontSize: '12px',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          maxWidth: '420px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
          <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>ISTARAVSHAN</span>
          <span style={{ color: '#94a3b8' }}>⚡ {energy}%</span>
        </div>
        {raceActive ? (
          <div style={{ color: '#f43f5e', fontWeight: 'bold', marginBottom: 3 }}>
            ГОНКА {raceStep + 1}/{RACE_CHECKPOINTS.length} • {raceTime}с
          </div>
        ) : (
          <div style={{ color: isMissionActive ? '#facc15' : '#4ade80', marginBottom: 3 }}>
            {isMissionActive ? `Цель: ${targetLoc.name}` : `Заказ: ${targetLoc.name}`}
          </div>
        )}
        <div style={{ color: '#cbd5e1', fontSize: '11px' }}>
          <b>V</b> вид • <b>F</b> выйти • <b>M</b> дождь • <b>N</b> свет • <b>C</b> авто • <b>E</b> место • <b>H</b> скрыть
        </div>
      </div>
      ) : (
        <button
          onClick={() => setShowHud(true)}
          style={{
            position: 'absolute',
            top: 12,
            left: 14,
            zIndex: 10,
            background: 'rgba(9, 13, 22, 0.65)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '8px',
            padding: '6px 10px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          HUD (H)
        </button>
      )}

      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 20,
          zIndex: 10,
          fontFamily: 'monospace',
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#22c55e',
          textShadow: '0 2px 10px rgba(0,0,0,0.9)',
        }}
      >
        {money} TJS
      </div>

      {activeGuide && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 25,
            width: '370px',
            background: 'rgba(9, 13, 22, 0.96)',
            color: '#f8fafc',
            padding: '20px',
            borderRadius: '14px',
            fontFamily: 'sans-serif',
            border: '1px solid #38bdf8',
            boxShadow: '0 15px 40px rgba(0,0,0,0.85)',
          }}
        >
          <div style={{ fontSize: '12px', color: '#38bdf8', marginBottom: 4 }}>ИСТАРАВШАН • ЛОКАЦИЯ</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: 10 }}>{activeGuide.name}</div>
          <div style={{ fontSize: '14px', lineHeight: 1.5, color: '#cbd5e1', marginBottom: 16 }}>
            {activeGuide.info}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => {
                if (money >= 25) {
                  setMoney((m) => m - 25);
                  setEnergy(100);
                  soundSys.playTone(620, 0.2, 'sine', 0.08);
                  showBanner('Обед в ошхоне: Плов и лепешка (-25 TJS, Энергия 100%)');
                  setActiveGuide(null);
                } else {
                  showBanner('Не хватает 25 TJS на обед');
                }
              }}
              style={{
                background: '#d97706',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Поесть плов (25 TJS)
            </button>
            <button
              onClick={() => setActiveGuide(null)}
              style={{
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Закрыть (E)
            </button>
          </div>
        </div>
      )}

      {bannerText && (
        <div
          style={{
            position: 'absolute',
            top: '22%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            background: 'rgba(9, 13, 22, 0.92)',
            color: '#facc15',
            padding: '14px 28px',
            borderRadius: '12px',
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            fontSize: '19px',
            border: '2px solid #38bdf8',
          }}
        >
          {bannerText}
        </div>
      )}

      <Radar target={currentTarget} mode={markerMode} />

      {isDriving && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            zIndex: 10,
            background: 'rgba(9, 13, 22, 0.85)',
            color: '#f8fafc',
            padding: '14px 22px',
            borderRadius: '12px',
            fontFamily: 'monospace',
            border: '1px solid rgba(56, 189, 248, 0.5)',
          }}
        >
          <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#38bdf8' }}>{speedKmh}</span>{' '}
          <span style={{ fontSize: '14px', color: '#94a3b8' }}>KM/H</span>
        </div>
      )}

      <Canvas
        shadows
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
        camera={{ fov: 54, near: 0.2, far: 6500 }}
      >
        <color attach="background" args={[fogColor]} />
        <fog attach="fog" args={[fogColor, isRain ? 120 : 280, isRain ? 1200 : 4800]} />

        {timeMode < 2 && !isRain && (
          <Sky
            sunPosition={sunPos}
            turbidity={timeMode === 1 ? 10 : 4}
            rayleigh={timeMode === 1 ? 3.5 : 1.2}
          />
        )}
        <Environment preset={timeMode === 2 ? 'night' : timeMode === 1 ? 'sunset' : 'city'} />

        <hemisphereLight
          args={[
            timeMode === 2 ? '#1e293b' : timeMode === 1 ? '#fbcfe8' : '#e0f2fe',
            timeMode === 2 ? '#0f172a' : '#3f4e3c',
            timeMode === 2 ? 0.35 : 0.85,
          ]}
        />
        <directionalLight
          castShadow
          position={sunPos}
          intensity={timeMode === 2 ? 0.2 : timeMode === 1 ? 2.2 : 1.8}
          color={timeMode === 2 ? '#93c5fd' : timeMode === 1 ? '#fdba74' : '#ffffff'}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-120}
          shadow-camera-right={120}
          shadow-camera-top={120}
          shadow-camera-bottom={-120}
        />

        {isRain && <RainWeather />}

        <Physics gravity={[0, -20, 0]}>
          <PlayerCar
            isDriving={isDriving}
            firstPerson={firstPerson}
            carSpec={activeCar}
            timeMode={timeMode}
            onSpeedChange={setSpeedKmh}
          />
          {!isDriving && <PlayerCharacter initialPos={charSpawnPos} firstPerson={firstPerson} />}
          <IstaravshanCity timeMode={timeMode} isRain={isRain} onStatus={setMapStatus} />
          {TRAFFIC.map((cfg) => (
            <TrafficCar key={cfg.id} cfg={cfg} timeMode={timeMode} />
          ))}
          {PEDESTRIANS.map((cfg) => (
            <Pedestrian key={cfg.id} cfg={cfg} />
          ))}
          <MissionMarker
            target={currentTarget}
            mode={markerMode}
            onTrigger={handleMarkerTrigger}
          />
        </Physics>
      </Canvas>
    </div>
  );
}