import * as THREE from 'three';
import { detailTexture, detailBump, facadeTexture, facadeEmissive, skyTexture } from './textures';
import { ISLAND_RADIUS, ISLAND_ZONES, type MaterialType, type WeaponId } from './catalog';

export interface HarvestableProp {
  id: string;
  kind: 'tree' | 'rock' | 'house' | 'car' | 'target';
  material: MaterialType;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAt?: number;
  mesh: THREE.Object3D;
}

export interface ChestNode {
  id: string;
  x: number;
  y: number;
  z: number;
  opened: boolean;
  mesh: THREE.Group;
  lid: THREE.Mesh;
}

export interface GroundLoot {
  id: string;
  weaponId: WeaponId;
  x: number;
  y: number;
  z: number;
  amount: number;
  picked: boolean;
  mesh: THREE.Group;
}

export interface BuiltStructure {
  id: string;
  type: 'wall' | 'floor' | 'ramp' | 'roof';
  material: MaterialType;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  maxHp: number;
  mesh: THREE.Mesh;
}

// Deterministic pseudo-random helper so terrain/props match across server & clients
function hash2D(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function groundHeightAt(x: number, z: number): number {
  const distCenter = Math.hypot(x, z);
  // Coastal dropoff into ocean
  if (distCenter > ISLAND_RADIUS + 42) return -4.5;
  let coastFalloff = 1;
  if (distCenter > ISLAND_RADIUS - 30) {
    const t = Math.min(1, (distCenter - (ISLAND_RADIUS - 30)) / 72);
    coastFalloff = 1 - t * t * (3 - 2 * t);
  }

  // Rolling gentle hills across island
  let h =
    2.2 +
    Math.sin(x * 0.018) * Math.cos(z * 0.018) * 3.4 +
    Math.sin(x * 0.041 + 1.2) * Math.sin(z * 0.037) * 1.4;

  // Frostpeak Summit (snowy mountain north)
  const dMtn = Math.hypot(x - 0, z - -210);
  if (dMtn < 120) {
    const m = Math.max(0, 1 - dMtn / 120);
    h += m * m * 29;
  }

  // Sunburst Dunes mesas
  const dDes = Math.hypot(x - 205, z - 145);
  if (dDes < 110) {
    const d = Math.max(0, 1 - dDes / 110);
    h += d * 4.5 + Math.sin(x * 0.05) * 1.4 * d;
  }

  // Flatten Brickwood Town & Gearworks Plant pads for crisp buildings
  const dCity = Math.hypot(x - 35, z - -35);
  if (dCity < 72) {
    const blend = Math.max(0, 1 - dCity / 72);
    h = h * (1 - blend * 0.88) + 2.4 * (blend * 0.88);
  }
  const dFactory = Math.hypot(x - 195, z - -115);
  if (dFactory < 76) {
    const blend = Math.max(0, 1 - dFactory / 76);
    h = h * (1 - blend * 0.88) + 2.6 * (blend * 0.88);
  }

  // Crystal Basin lake depression
  const dLake = Math.hypot(x - -175, z - 95);
  if (dLake < 72) {
    const l = Math.max(0, 1 - dLake / 72);
    h -= l * l * 7.8;
  }

  return h * coastFalloff - (1 - coastFalloff) * 4.5;
}

function biomeColorAt(x: number, z: number, y: number): THREE.Color {
  const c = new THREE.Color('#6f7a4a'); // dry scrubland
  const dist = Math.hypot(x, z);
  if (dist > ISLAND_RADIUS - 14) {
    return new THREE.Color('#d9c7a0'); // sandy beach ring
  }

  const dCity = Math.hypot(x - 35, z - -35);
  if (dCity < 62) {
    return new THREE.Color(dCity < 46 ? '#3b3f45' : '#55595f').lerp(new THREE.Color('#2a2d31'), 0.3);
  }

  const dFactory = Math.hypot(x - 195, z - -115);
  if (dFactory < 68) {
    return new THREE.Color('#4a4d52');
  }

  const dMtn = Math.hypot(x - 0, z - -210);
  if (dMtn < 98 || y > 13.5) {
    const t = Math.min(1, Math.max(0, (y - 8) / 10 + (1 - Math.min(1, dMtn / 98)) * 0.7));
    return c.lerp(new THREE.Color('#8a7f73'), t);
  }

  const dDes = Math.hypot(x - 205, z - 145);
  if (dDes < 115) {
    const t = Math.min(1, (1 - dDes / 115) * 1.45);
    return c.lerp(new THREE.Color('#c9a26b'), t);
  }

  const dForest = Math.hypot(x - -195, z - -125);
  if (dForest < 105) {
    const t = Math.min(1, (1 - dForest / 105) * 1.3);
    return c.lerp(new THREE.Color('#4d6a3a'), t);
  }

  const dLake = Math.hypot(x - -175, z - 95);
  if (dLake < 72) {
    return new THREE.Color('#8a7a55').lerp(new THREE.Color('#3b6f80'), 0.35);
  }

  return c;
}

export function buildSkyBus(): THREE.Group {
  // Transport helicopter (kept under the same name so engine logic is unchanged)
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.5, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 4.6, 6, 12), new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.45, metalness: 0.4 }));
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.95);
  body.castShadow = true;
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.45, 14, 10), new THREE.MeshStandardMaterial({ color: '#0e1a24', emissive: '#ffb347', emissiveIntensity: 0.2, roughness: 0.1, metalness: 0.7 }));
  glass.scale.set(1, 0.8, 1.2);
  glass.position.set(0, 0.4, 3.1);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.22, 6.4), new THREE.MeshStandardMaterial({ color: '#e8b923', roughness: 0.4 }));
  stripe.position.y = -0.3;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 6), dark);
  tail.position.set(0, 0.5, -6.2);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 1.1), dark);
  fin.position.set(0, 1.3, -8.9);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 8), dark);
  mast.position.y = 2.2;
  const rotor = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.45), dark);
    blade.rotation.y = i * Math.PI / 2;
    rotor.add(blade);
  }
  rotor.position.y = 2.7;
  rotor.userData.spin = true;
  const skidMat = dark;
  for (const sx of [-1.5, 1.5]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 5), skidMat);
    skid.position.set(sx, -2, 0.4);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), skidMat);
    leg.position.set(sx, -1.4, 1.4);
    g.add(skid, leg);
  }
  g.add(body, glass, stripe, tail, fin, mast, rotor);
  return g;
}

export interface IslandWorld {
  group: THREE.Group;
  props: HarvestableProp[];
  chests: ChestNode[];
  loots: GroundLoot[];
  buildings: BuiltStructure[];
  stormWall: THREE.Mesh;
  skyBus: THREE.Group;
}

export function buildIslandWorld(isCreative: boolean): IslandWorld {
  const group = new THREE.Group();
  const props: HarvestableProp[] = [];
  const chests: ChestNode[] = [];
  const loots: GroundLoot[] = [];
  const buildings: BuiltStructure[] = [];

  // 1. Bright Daytime Sky Dome
  const skyGeo = new THREE.SphereGeometry(980, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyDome);

  // Smoggy sunset haze clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffd9b0', roughness: 0.95, metalness: 0, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const rad = 260 + (i % 3) * 110;
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(12 + (k % 2) * 5, 10, 8), cloudMat);
      puff.position.set((k - 1.5) * 11, (k % 2) * 4, (k % 3) * 4);
      cloud.add(puff);
    }
    cloud.position.set(Math.cos(ang) * rad, 130 + (i % 4) * 16, Math.sin(ang) * rad);
    group.add(cloud);
  }

  // 2. Ocean Water Plane & Crystal Basin Lake Water
  const ocean = new THREE.Mesh(
    new THREE.CircleGeometry(960, 48),
    new THREE.MeshStandardMaterial({ color: '#1b4f66', roughness: 0.06, metalness: 0.55, envMapIntensity: 1.6 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -2.2;
  group.add(ocean);

  const lakeWater = new THREE.Mesh(
    new THREE.CircleGeometry(68, 32),
    new THREE.MeshStandardMaterial({
      color: '#2d7a8a',
      roughness: 0.18,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88
    })
  );
  lakeWater.rotation.x = -Math.PI / 2;
  lakeWater.position.set(-175, -0.4, 95);
  group.add(lakeWater);

  // 3. Vertex-Colored Urban Terrain Mesh (with tiled detail grain)
  const terrainDetail = detailTexture().clone();
  terrainDetail.repeat.set(70, 70); terrainDetail.needsUpdate = true;
  detailBump().repeat.set(70, 70);
  const segs = 112;
  const span = 880;
  const terrainGeo = new THREE.PlaneGeometry(span, span, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = groundHeightAt(vx, vz);
    posAttr.setY(i, vy);
    const col = biomeColorAt(vx, vz, vy);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: terrainDetail, bumpMap: detailBump(), bumpScale: 1.6, roughness: 0.92, metalness: 0 })
  );
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // Helper creators for props
  const woodMat = new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 0.9 });
  const leafGreen = new THREE.MeshStandardMaterial({ color: '#4f7a3a', roughness: 0.85 });
  const leafDark = new THREE.MeshStandardMaterial({ color: '#2f5a32', roughness: 0.85 });
  const leafSnow = new THREE.MeshStandardMaterial({ color: '#cfc7bd', roughness: 0.8 });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#6b6b6b', roughness: 0.9 });
  const cactusMat = new THREE.MeshStandardMaterial({ color: '#5f8a4a', roughness: 0.8 });

  const addTree = (id: string, x: number, z: number, pine: boolean, snow: boolean) => {
    const y = groundHeightAt(x, z);
    if (y < 0.2) return;
    const tGroup = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 3.6, 8), woodMat);
    trunk.position.y = 1.8;
    trunk.castShadow = true;
    tGroup.add(trunk);

    const canopyMat = snow ? leafSnow : pine ? leafDark : leafGreen;
    if (pine) {
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.4, 8), canopyMat);
      c1.position.y = 4.6;
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3.6, 8), canopyMat);
      c2.position.y = 6.7;
      tGroup.add(c1, c2);
    } else {
      const s1 = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 8), canopyMat);
      s1.position.y = 4.8;
      const s2 = new THREE.Mesh(new THREE.SphereGeometry(1.7, 9, 8), canopyMat);
      s2.position.set(1.1, 4.1, 0.6);
      tGroup.add(s1, s2);
    }
    tGroup.position.set(x, y, z);
    group.add(tGroup);
    props.push({
      id,
      kind: 'tree',
      material: 'wood',
      x,
      y,
      z,
      radius: 1.4,
      height: 7.5,
      hp: 100,
      maxHp: 100,
      alive: true,
      mesh: tGroup
    });
  };

  const addRock = (id: string, x: number, z: number, desert: boolean) => {
    const y = groundHeightAt(x, z);
    if (y < 0.2) return;
    const rGroup = new THREE.Group();
    const mat = desert ? new THREE.MeshStandardMaterial({ color: '#a9733a', roughness: 0.9 }) : rockMat;
    const m1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.9, 0), mat);
    m1.scale.set(1.2, 0.85, 1.0);
    m1.position.y = 1.2;
    m1.castShadow = true;
    rGroup.add(m1);
    rGroup.position.set(x, y, z);
    group.add(rGroup);
    props.push({
      id,
      kind: 'rock',
      material: 'brick',
      x,
      y,
      z,
      radius: 2.0,
      height: 2.5,
      hp: 120,
      maxHp: 120,
      alive: true,
      mesh: rGroup
    });
  };

  const wallMat = (hex: string, w: number, h: number, d: number) => {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.82, metalness: 0.02, map: facadeTexture().clone(), emissiveMap: facadeEmissive().clone(), emissive: new THREE.Color('#ffb060'), emissiveIntensity: 0.55 });
    const rx = Math.max(1, Math.round(Math.max(w, d) / 6)), ry = Math.max(1, Math.round(h / 4));
    for (const t of [m.map!, m.emissiveMap!]) { t.repeat.set(rx, ry); t.needsUpdate = true; }
    return m;
  };

  const addHouse = (id: string, x: number, z: number, w: number, h: number, d: number, wallHex: string, roofHex: string, isFactory = false) => {
    const y = groundHeightAt(x, z);
    const hGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      wallMat(wallHex, w, h, d)
    );
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    hGroup.add(body);

    // Dark glass door & windows
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 2.7, 0.25),
      new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.5, metalness: 0.3 })
    );
    door.position.set(0, 1.35, d / 2 + 0.05);
    hGroup.add(door);

    const winMat = new THREE.MeshStandardMaterial({ color: '#1c2a38', emissive: '#ffb347', emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.15 });
    for (const wx of [-w * 0.28, w * 0.28]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.22), winMat);
      win.position.set(wx, h * 0.62, d / 2 + 0.05);
      hGroup.add(win);
    }

    if (isFactory) {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6),
        new THREE.MeshStandardMaterial({ color: roofHex, roughness: 0.5, metalness: 0.25 })
      );
      roof.position.y = h + 0.3;
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.15, 6.5, 10),
        new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.35 })
      );
      stack.position.set(w * 0.3, h + 3.2, -d * 0.25);
      hGroup.add(roof, stack);
    } else {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5),
        new THREE.MeshStandardMaterial({ color: roofHex, roughness: 0.62 })
      );
      roof.position.y = h + 0.35;
      roof.castShadow = true;
      hGroup.add(roof);
    }

    hGroup.position.set(x, y, z);
    group.add(hGroup);
    props.push({
      id,
      kind: 'house',
      material: isFactory ? 'metal' : 'brick',
      x,
      y,
      z,
      radius: Math.max(w, d) * 0.56,
      height: h + 3,
      hp: 260,
      maxHp: 260,
      alive: true,
      mesh: hGroup
    });
  };

  const addCar = (id: string, x: number, z: number, color: string, rotY: number) => {
    const y = groundHeightAt(x, z);
    const cGroup = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.9, 4.4),
      new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 })
    );
    chassis.position.y = 0.7;
    chassis.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 0.85, 2.2),
      new THREE.MeshPhysicalMaterial({ color: '#0d1822', roughness: 0.04, metalness: 0.9, envMapIntensity: 2 })
    );
    cabin.position.set(0, 1.5, -0.2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.95 });
    for (const [wx, wz] of [[-1.15, 1.35], [1.15, 1.35], [-1.15, -1.35], [1.15, -1.35]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 10), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.45, wz);
      cGroup.add(w);
    }
    cGroup.add(chassis, cabin);
    cGroup.position.set(x, y, z);
    cGroup.rotation.y = rotY;
    group.add(cGroup);
    props.push({
      id,
      kind: 'car',
      material: 'metal',
      x,
      y,
      z,
      radius: 2.3,
      height: 2.1,
      hp: 140,
      maxHp: 140,
      alive: true,
      mesh: cGroup
    });
  };

  const addChest = (id: string, x: number, z: number) => {
    const y = groundHeightAt(x, z);
    if (y < 0.1) return;
    const cGroup = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.85, 1.05),
      new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#d97706', emissiveIntensity: 0.28, roughness: 0.3 })
    );
    base.position.y = 0.43;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.56, 0.38, 1.1),
      new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#f59e0b', emissiveIntensity: 0.35, roughness: 0.25 })
    );
    lid.position.y = 1.02;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.6 })
    );
    glow.position.y = 1.65;
    cGroup.add(base, lid, glow);
    cGroup.position.set(x, y, z);
    group.add(cGroup);
    chests.push({ id, x, y, z, opened: false, mesh: cGroup, lid });
  };

  const addLoot = (id: string, weaponId: WeaponId, x: number, z: number, amount = 1) => {
    const y = Math.max(0.2, groundHeightAt(x, z));
    const lGroup = new THREE.Group();
    const colorMap: Record<WeaponId, string> = {
      pickaxe: '#94a3b8',
      pistol: '#cbd5e1',
      rifle: '#38bdf8',
      shotgun: '#4ade80',
      smg: '#22c55e',
      sniper: '#c084fc',
      bandage: '#f8fafc',
      medkit: '#ef4444',
      minishield: '#38bdf8',
      bigshield: '#0284c7'
    };
    const col = colorMap[weaponId] || '#fbbf24';
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.9, 16),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    const orb = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.42, 0.62),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.25 })
    );
    orb.position.y = 0.72;
    lGroup.add(ring, orb);
    lGroup.position.set(x, y, z);
    group.add(lGroup);
    loots.push({ id, weaponId, x, y, z, amount, picked: false, mesh: lGroup });
  };

  // Populate Brickwood Town (city)
  const cityHouses: [number, number, number, number, number, string, string][] = [
    [16, -54, 11, 7.5, 10, '#f8fafc', '#ef4444'],
    [54, -52, 12, 9.5, 11, '#fef08a', '#0284c7'],
    [18, -16, 10, 6.5, 9, '#fbcfe8', '#ec4899'],
    [56, -18, 13, 11, 10, '#dbeafe', '#2563eb'],
    [35, -72, 14, 7.5, 9, '#dcfce7', '#16a34a']
  ];
  cityHouses.forEach(([hx, hz, w, h, d, wc, rc], i) => {
    addHouse(`city_house_${i}`, hx, hz, w, h, d, wc, rc, false);
    addChest(`city_chest_${i}`, hx, hz + d * 0.72);
  });
  addCar('city_car_0', 34, -36, '#ef4444', 0.3);
  addCar('city_car_1', 42, -28, '#facc15', 1.4);
  addCar('city_car_2', 26, -42, '#22c55e', -0.5);

  // Populate Clover Meadows (grassy barns & trees)
  addHouse('meadow_barn_1', -24, 75, 13, 7, 10, '#ef4444', '#f8fafc', false);
  addHouse('meadow_barn_2', 32, 95, 10, 6, 9, '#facc15', '#ea580c', false);
  addChest('meadow_chest_1', -14, 76);
  addChest('meadow_chest_2', 24, 96);

  // Populate Gearworks Plant (factory)
  addHouse('factory_1', 180, -130, 16, 9, 13, '#94a3b8', '#f59e0b', true);
  addHouse('factory_2', 216, -104, 14, 8, 12, '#cbd5e1', '#0284c7', true);
  addChest('factory_chest_1', 194, -118);
  addChest('factory_chest_2', 208, -124);
  addCar('factory_car_0', 192, -98, '#f97316', 0.8);
  addCar('factory_car_1', 204, -138, '#38bdf8', 2.2);

  // Populate Frostpeak Summit (snow cabins & pines)
  addHouse('snow_lodge', 0, -210, 12, 6.5, 10, '#92400e', '#e2e8f0', false);
  addChest('snow_chest_1', 9, -206);
  addChest('snow_chest_2', -10, -216);

  // Populate Sunburst Dunes (desert outposts & cacti)
  addHouse('desert_post_1', 195, 140, 10, 5.5, 9, '#f59e0b', '#78350f', false);
  addHouse('desert_post_2', 225, 162, 9, 5, 8, '#fdba74', '#b45309', false);
  addChest('desert_chest_1', 206, 150);
  addChest('desert_chest_2', 215, 138);

  // Populate Crystal Basin (lake boathouse)
  addHouse('lake_dock_house', -132, 95, 9, 5, 8, '#38bdf8', '#0369a1', false);
  addChest('lake_chest_1', -124, 95);

  // Populate Whispering Pines (forest ranger cabin)
  addHouse('forest_cabin', -190, -120, 10, 6, 9, '#78350f', '#15803d', false);
  addChest('forest_chest_1', -182, -116);

  // Scatter procedural Trees & Rocks across island biomes
  for (let i = 0; i < 125; i++) {
    const a = hash2D(i, 1.3) * Math.PI * 2;
    const r = 35 + Math.sqrt(hash2D(i, 4.7)) * (ISLAND_RADIUS - 55);
    const tx = Math.cos(a) * r;
    const tz = Math.sin(a) * r;
    // Skip town/factory centers and lake center
    if (Math.hypot(tx - 35, tz - -35) < 58) continue;
    if (Math.hypot(tx - 195, tz - -115) < 62) continue;
    if (Math.hypot(tx - -175, tz - 95) < 74) continue;

    const inDesert = Math.hypot(tx - 205, tz - 145) < 92;
    const inSnow = Math.hypot(tx - 0, tz - -210) < 92;
    const inForest = Math.hypot(tx - -195, tz - -125) < 105;

    if (inDesert) {
      if (i % 2 === 0) {
        addRock(`rock_${i}`, tx, tz, true);
      } else {
        // Cartoon cactus as wood/harvestable
        const cy = groundHeightAt(tx, tz);
        if (cy > 0.2) {
          const cac = new THREE.Group();
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 3.6, 8), cactusMat);
          stem.position.y = 1.8;
          const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 7), cactusMat);
          armL.position.set(-0.7, 2.1, 0);
          armL.rotation.z = 0.5;
          const armR = armL.clone();
          armR.position.x = 0.7;
          armR.rotation.z = -0.5;
          cac.add(stem, armL, armR);
          cac.position.set(tx, cy, tz);
          group.add(cac);
          props.push({
            id: `cactus_${i}`,
            kind: 'tree',
            material: 'wood',
            x: tx,
            y: cy,
            z: tz,
            radius: 1.1,
            height: 3.8,
            hp: 70,
            maxHp: 70,
            alive: true,
            mesh: cac
          });
        }
      }
    } else if (i % 4 === 0) {
      addRock(`rock_${i}`, tx, tz, false);
    } else {
      addTree(`tree_${i}`, tx, tz, inForest || inSnow, inSnow);
    }
  }

  // Scatter Ground Loot across all 7 named zones
  const lootPool: WeaponId[] = [
    'pistol', 'rifle', 'shotgun', 'smg', 'sniper',
    'bandage', 'medkit', 'minishield', 'bigshield'
  ];
  ISLAND_ZONES.forEach((zone, zi) => {
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2 + zi;
      const dist = 10 + (k % 3) * 14;
      const lx = zone.x + Math.cos(ang) * dist;
      const lz = zone.z + Math.sin(ang) * dist;
      const wId = lootPool[(zi * 3 + k) % lootPool.length];
      addLoot(`loot_${zi}_${k}`, wId, lx, lz, 1);
    }
  });

  // Extra Creative / Practice Target Range near Clover Meadows center
  if (isCreative) {
    for (let t = 0; t < 12; t++) {
      const ang = (t / 12) * Math.PI * 2;
      const rad = 26 + (t % 2) * 16;
      const tx = Math.cos(ang) * rad;
      const tz = 65 + Math.sin(ang) * rad;
      const ty = groundHeightAt(tx, tz);
      const tGroup = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.2, 8), woodMat);
      post.position.y = 1.1;
      const bullOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 0.2, 16),
        new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 })
      );
      bullOuter.rotation.x = Math.PI / 2;
      bullOuter.position.y = 2.4;
      const bullInner = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.24, 14),
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 })
      );
      bullInner.rotation.x = Math.PI / 2;
      bullInner.position.y = 2.4;
      tGroup.add(post, bullOuter, bullInner);
      tGroup.position.set(tx, ty, tz);
      tGroup.lookAt(0, ty + 2, 65);
      group.add(tGroup);
      props.push({
        id: `target_${t}`,
        kind: 'target',
        material: 'wood',
        x: tx,
        y: ty,
        z: tz,
        radius: 1.3,
        height: 3.4,
        hp: 60,
        maxHp: 60,
        alive: true,
        mesh: tGroup
      });
    }
  }

  // 4. Storm Cylinder Wall
  const stormWall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 220, 48, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#a855f7',
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  stormWall.position.y = 80;
  stormWall.visible = !isCreative;
  group.add(stormWall);

  // 5. Sky-Bus Airship
  const skyBus = buildSkyBus();
  skyBus.position.set(-340, 120, -240);
  group.add(skyBus);

  return { group, props, chests, loots, buildings, stormWall, skyBus };
}
