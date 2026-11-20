import * as THREE from 'three';
import {
  getCosmetic,
  SKIN_TONES,
  type EmoteId,
  type PlayerLoadout,
  type WeaponId
} from './catalog';

export type CharacterAnimState =
  | 'idle'
  | 'run'
  | 'sprint'
  | 'jump'
  | 'crouch'
  | 'slide'
  | 'glide'
  | 'skydive'
  | 'downed'
  | 'revive'
  | 'emote_dance'
  | 'emote_wave'
  | 'emote_laugh'
  | 'emote_point';

export interface CharacterRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  glider: THREE.Group;
  heldTool: THREE.Group;
  heldGun: THREE.Group;
  muzzlePoint: THREE.Object3D;
  nameSprite?: THREE.Sprite;
  activeEmote: EmoteId | null;
}

function matStreet(color: string | number, roughness = 0.8, metalness = 0.08): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

function buildHairMesh(hairId: string): THREE.Group {
  const cos = getCosmetic(hairId);
  const g = new THREE.Group();
  const mainMat = matStreet(cos.primaryColor, 0.58);
  const subMat = matStreet(cos.secondaryColor, 0.55);
  const accMat = matStreet(cos.accentColor, 0.4, 0.25);

  if (hairId === 'hair_visor') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), mainMat);
    dome.scale.set(1.04, 1.02, 1.04);
    g.add(dome);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.24, 0.26),
      new THREE.MeshStandardMaterial({
        color: cos.accentColor,
        emissive: cos.accentColor,
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0.4
      })
    );
    visor.position.set(0, 0.03, 0.31);
    g.add(visor);
    const earL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), subMat);
    earL.rotation.z = Math.PI / 2;
    earL.position.set(-0.42, 0, 0);
    const earR = earL.clone();
    earR.position.x = 0.42;
    g.add(earL, earR);
    return g;
  }

  // Base hair cap
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.39, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mainMat);
  cap.position.y = 0.04;
  cap.rotation.x = -0.15;
  g.add(cap);

  if (hairId === 'hair_spiky') {
    const spikeGeo = new THREE.ConeGeometry(0.11, 0.28, 7);
    const offsets: [number, number, number, number, number][] = [
      [0, 0.44, 0.08, 0.25, 0],
      [-0.18, 0.4, 0.02, 0.1, 0.4],
      [0.18, 0.4, 0.02, 0.1, -0.4],
      [-0.11, 0.38, -0.18, -0.35, 0.25],
      [0.11, 0.38, -0.18, -0.35, -0.25],
      [0, 0.35, 0.24, 0.65, 0]
    ];
    for (const [x, y, z, rx, rz] of offsets) {
      const s = new THREE.Mesh(spikeGeo, mainMat);
      s.position.set(x, y, z);
      s.rotation.set(rx, 0, rz);
      g.add(s);
    }
  } else if (hairId === 'hair_bob') {
    const sideL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), mainMat);
    sideL.position.set(-0.3, -0.05, -0.02);
    const sideR = sideL.clone();
    sideR.position.x = 0.3;
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), subMat);
    back.position.set(0, -0.05, -0.22);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.045, 8, 18), accMat);
    band.rotation.x = Math.PI / 2 - 0.2;
    band.position.y = 0.16;
    g.add(sideL, sideR, back, band);
  } else if (hairId === 'hair_mohawk') {
    for (let i = 0; i < 5; i++) {
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28 - i * 0.02, 0.16), i % 2 === 0 ? mainMat : subMat);
      crest.position.set(0, 0.42 - i * 0.02, 0.18 - i * 0.12);
      crest.rotation.x = 0.25 - i * 0.18;
      g.add(crest);
    }
  } else if (hairId === 'hair_buns') {
    const bunL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), mainMat);
    bunL.position.set(-0.33, 0.36, -0.04);
    const bunR = bunL.clone();
    bunR.position.x = 0.33;
    const ringL = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 12), accMat);
    ringL.position.copy(bunL.position);
    ringL.rotation.y = Math.PI / 3;
    const ringR = ringL.clone();
    ringR.position.copy(bunR.position);
    ringR.rotation.y = -Math.PI / 3;
    g.add(bunL, bunR, ringL, ringR);
  } else if (hairId === 'hair_pomp') {
    const pomp = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 10), mainMat);
    pomp.rotation.x = Math.PI / 2.2;
    pomp.position.set(0, 0.38, 0.15);
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.35), accMat);
    streak.position.set(0.08, 0.44, 0.12);
    g.add(pomp, streak);
  }
  return g;
}

function buildBackpackMesh(packId: string): THREE.Group {
  const cos = getCosmetic(packId);
  const g = new THREE.Group();
  const mainMat = matStreet(cos.primaryColor, 0.55);
  const subMat = matStreet(cos.secondaryColor, 0.5);
  const accMat = matStreet(cos.accentColor, 0.4, 0.2);

  if (packId === 'pack_jet') {
    const tankL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.44, 10), mainMat);
    tankL.position.set(-0.12, 0.02, -0.06);
    const tankR = tankL.clone();
    tankR.position.x = 0.12;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.12), subMat);
    bridge.position.set(0, 0.06, -0.02);
    const nozL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 8), accMat);
    nozL.position.set(-0.12, -0.24, -0.06);
    const nozR = nozL.clone();
    nozR.position.x = 0.12;
    g.add(tankL, tankR, bridge, nozL, nozR);
  } else if (packId === 'pack_dino') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mainMat);
    shell.scale.set(1.0, 1.25, 0.68);
    g.add(shell);
    for (let i = -1; i <= 1; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 6), subMat);
      spike.position.set(0, i * 0.14, -0.18);
      spike.rotation.x = -Math.PI / 2;
      g.add(spike);
    }
  } else if (packId === 'pack_boom') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.18), mainMat);
    const spkL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), subMat);
    spkL.rotation.x = Math.PI / 2;
    spkL.position.set(-0.13, 0, -0.09);
    const spkR = spkL.clone();
    spkR.position.x = 0.13;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.2), accMat);
    g.add(box, spkL, spkR, trim);
  } else {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.2), mainMat);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.08), subMat);
    pocket.position.set(0, -0.08, -0.12);
    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), accMat);
    badge.position.set(0, 0.1, -0.12);
    g.add(bag, pocket, badge);
  }
  return g;
}

function buildPickaxeMesh(pickId: string): THREE.Group {
  const cos = getCosmetic(pickId);
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.85, 8), matStreet(cos.primaryColor, 0.6));
  handle.position.y = 0.35;
  g.add(handle);

  const headMat = matStreet(cos.secondaryColor, 0.4, 0.35);
  const tipMat = matStreet(cos.accentColor, 0.3, 0.4);
  if (pickId === 'pick_starwand') {
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), tipMat);
    star.position.y = 0.82;
    g.add(star);
  } else {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.12), headMat);
    cross.position.y = 0.76;
    const tipL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 6), tipMat);
    tipL.rotation.z = Math.PI / 2;
    tipL.position.set(-0.28, 0.76, 0);
    const tipR = tipL.clone();
    tipR.rotation.z = -Math.PI / 2;
    tipR.position.x = 0.28;
    g.add(cross, tipL, tipR);
  }
  return g;
}

function buildGliderMesh(gliderId: string): THREE.Group {
  const cos = getCosmetic(gliderId);
  const g = new THREE.Group();
  const mainMat = matStreet(cos.primaryColor, 0.45, 0.15);
  const subMat = matStreet(cos.secondaryColor, 0.5, 0.1);
  const accMat = matStreet(cos.accentColor, 0.35, 0.25);

  if (gliderId === 'glider_parasol') {
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.42, 12), mainMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 16), subMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.04;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), accMat);
    pole.position.y = -0.4;
    g.add(canopy, ring, pole);
  } else if (gliderId === 'glider_cloud') {
    for (const [x, y, z, r] of [
      [0, 0.08, 0, 0.52],
      [-0.48, 0, 0, 0.4],
      [0.48, 0, 0, 0.4],
      [-0.82, -0.05, 0, 0.28],
      [0.82, -0.05, 0, 0.28]
    ] as [number, number, number, number][]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mainMat);
      puff.position.set(x, y, z);
      g.add(puff);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), subMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = -0.45;
    g.add(bar);
  } else {
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.72), mainMat);
    wingL.position.set(-0.56, 0.05, 0);
    wingL.rotation.z = 0.15;
    const wingR = wingL.clone();
    wingR.position.x = 0.56;
    wingR.rotation.z = -0.15;
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.92), subMat);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 8), accMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.58;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), accMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.y = -0.48;
    g.add(wingL, wingR, spine, nose, handle);
  }
  return g;
}

export function buildWeaponMesh(weaponId: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const darkMat = matStreet('#1e293b', 0.45, 0.4);
  if (weaponId === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.32), matStreet('#cbd5e1', 0.35, 0.5));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.1), darkMat);
    grip.position.set(0, -0.12, -0.08);
    g.add(slide, grip);
  } else if (weaponId === 'shotgun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.64), matStreet('#15803d', 0.5, 0.2));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.62, 8), darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, 0.2);
    g.add(body, barrel);
  } else if (weaponId === 'smg') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.48), matStreet('#22c55e', 0.45, 0.25));
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.08), darkMat);
    mag.position.set(0, -0.16, 0.08);
    g.add(body, mag);
  } else if (weaponId === 'sniper') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.92), matStreet('#7e22ce', 0.45, 0.25));
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 8), matStreet('#38bdf8', 0.3, 0.5));
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.12, 0.05);
    g.add(body, scope);
  } else if (weaponId === 'rifle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.72), matStreet('#0284c7', 0.45, 0.3));
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), darkMat);
    mag.position.set(0, -0.14, 0.08);
    mag.rotation.x = 0.2;
    g.add(body, mag);
  } else {
    // Heal / shield item cube
    const col = weaponId === 'medkit' ? '#ef4444' : weaponId === 'bandage' ? '#f8fafc' : '#38bdf8';
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), matStreet(col, 0.35, 0.1));
    g.add(box);
  }
  return g;
}

export function createStreetCharacter(loadout: PlayerLoadout, weaponId: WeaponId = 'pickaxe'): CharacterRig {
  const skinInfo = SKIN_TONES.find((s) => s.id === loadout.skinTone) || SKIN_TONES[0];
  const outfit = getCosmetic(loadout.skin);

  const skinMat = matStreet(skinInfo.hex, 0.68, 0.02);
  const outfitMat = matStreet(outfit.primaryColor, 0.58, 0.08);
  const pantsMat = matStreet(outfit.secondaryColor, 0.65, 0.05);
  const accentMat = matStreet(outfit.accentColor, 0.42, 0.2);
  const shoeMat = matStreet('#1a1a1c', 0.7, 0.1);
  const eyeWhiteMat = matStreet('#ffffff', 0.3);
  const pupilMat = matStreet('#0f172a', 0.2);

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  // Torso
  const torso = new THREE.Group();
  hips.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.34, 6, 12), outfitMat);
  chest.position.y = 0.34;
  chest.scale.set(1.1, 1, 0.78);
  chest.castShadow = true;
  torso.add(chest);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.44), accentMat);
  stripe.position.y = 0.34;
  torso.add(stripe);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.4), pantsMat);
  belt.position.y = 0.06;
  torso.add(belt);

  // Backpack
  const backpack = buildBackpackMesh(loadout.backpack);
  backpack.position.set(0, 0.36, -0.25);
  torso.add(backpack);

  // Big Stylized Cartoon Head
  const head = new THREE.Group();
  head.position.y = 0.8;
  torso.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.33, 18, 16), skinMat);
  skull.position.y = 0.28;
  skull.scale.set(1.06, 1.0, 1.02);
  skull.castShadow = true;
  head.add(skull);

  // Sunglasses & stern mouth (street look)
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.15, metalness: 0.7 });
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.1, 0.05), shadeMat);
    lens.position.set(side * 0.13, 0.3, 0.35);
    head.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.04), shadeMat);
  bridge.position.set(0, 0.31, 0.35);
  head.add(bridge);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.03), matStreet('#4a1f1f', 0.6));
  mouth.position.set(0, 0.17, 0.35);
  head.add(mouth);

  // Hair / Helmet
  const hair = buildHairMesh(loadout.hair);
  hair.position.y = 0.28;
  head.add(hair);

  // Arms
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.37, 0.56, 0);
  torso.add(leftArm);
  const lSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 6, 8), outfitMat);
  lSleeve.position.y = -0.22;
  lSleeve.castShadow = true;
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), skinMat);
  lHand.position.y = -0.46;
  leftArm.add(lSleeve, lHand);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.37, 0.56, 0);
  torso.add(rightArm);
  const rSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 6, 8), outfitMat);
  rSleeve.position.y = -0.22;
  rSleeve.castShadow = true;
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), skinMat);
  rHand.position.y = -0.46;
  rightArm.add(rSleeve, rHand);

  // Held Pickaxe & Held Weapon
  const heldTool = buildPickaxeMesh(loadout.pickaxe);
  heldTool.position.set(0, -0.46, 0.08);
  heldTool.rotation.x = Math.PI / 2.2;
  rightArm.add(heldTool);

  const heldGun = buildWeaponMesh(weaponId === 'pickaxe' ? 'rifle' : weaponId);
  heldGun.position.set(-0.04, -0.46, 0.18);
  heldGun.rotation.x = Math.PI / 2;
  heldGun.visible = weaponId !== 'pickaxe';
  heldTool.visible = weaponId === 'pickaxe';
  rightArm.add(heldGun);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0, 0.45);
  heldGun.add(muzzlePoint);

  // Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.15, 0, 0);
  hips.add(leftLeg);
  const lPant = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.42, 6, 8), pantsMat);
  lPant.position.y = -0.34;
  lPant.castShadow = true;
  const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.32), shoeMat);
  lShoe.position.set(0, -0.76, 0.05);
  const lSole = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.05, 0.33), accentMat);
  lSole.position.set(0, -0.83, 0.05);
  leftLeg.add(lPant, lShoe, lSole);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.15, 0, 0);
  hips.add(rightLeg);
  const rPant = lPant.clone();
  const rShoe = lShoe.clone();
  const rSole = lSole.clone();
  rightLeg.add(rPant, rShoe, rSole);

  // Glider
  const glider = buildGliderMesh(loadout.glider);
  glider.position.set(0, 2.25, 0);
  glider.visible = false;
  root.add(glider);

  return {
    root,
    hips,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    glider,
    heldTool,
    heldGun,
    muzzlePoint,
    activeEmote: null
  };
}

export function setRigWeapon(rig: CharacterRig, weaponId: WeaponId) {
  const isTool = weaponId === 'pickaxe';
  rig.heldTool.visible = isTool;
  rig.heldGun.visible = !isTool;
  if (!isTool) {
    rig.rightArm.remove(rig.heldGun);
    const nextGun = buildWeaponMesh(weaponId);
    nextGun.position.set(-0.04, -0.46, 0.18);
    nextGun.rotation.x = Math.PI / 2;
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, 0.45);
    nextGun.add(muzzle);
    rig.heldGun = nextGun;
    rig.muzzlePoint = muzzle;
    rig.rightArm.add(nextGun);
  }
}

export function animateCharacterPose(
  rig: CharacterRig,
  state: CharacterAnimState,
  time: number,
  swingTimer = 0,
  aiming = false
) {
  rig.glider.visible = state === 'glide';
  rig.hips.position.set(0, 0.92, 0);
  rig.hips.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0);
  rig.leftLeg.rotation.set(0, 0, 0);
  rig.rightLeg.rotation.set(0, 0, 0);
  rig.leftArm.rotation.set(0, 0, 0.12);
  rig.rightArm.rotation.set(0, 0, -0.12);

  if (state === 'run' || state === 'sprint') {
    const freq = state === 'sprint' ? 12.5 : 9.2;
    const amp = state === 'sprint' ? 0.85 : 0.62;
    const s = Math.sin(time * freq);
    rig.hips.position.y = 0.92 + Math.abs(Math.cos(time * freq)) * 0.08;
    rig.torso.rotation.x = state === 'sprint' ? 0.22 : 0.1;
    rig.leftLeg.rotation.x = s * amp;
    rig.rightLeg.rotation.x = -s * amp;
    rig.leftArm.rotation.x = -s * amp * 0.8;
    rig.rightArm.rotation.x = aiming ? -1.45 : s * amp * 0.7;
  } else if (state === 'jump') {
    rig.torso.rotation.x = 0.12;
    rig.leftLeg.rotation.x = -0.45;
    rig.rightLeg.rotation.x = 0.35;
    rig.leftArm.rotation.z = 0.55;
    rig.rightArm.rotation.x = aiming ? -1.45 : -0.4;
  } else if (state === 'crouch') {
    rig.hips.position.y = 0.62;
    rig.torso.rotation.x = 0.28;
    rig.leftLeg.rotation.x = -0.65;
    rig.rightLeg.rotation.x = 0.55;
    rig.rightArm.rotation.x = aiming ? -1.4 : -0.8;
  } else if (state === 'slide') {
    rig.hips.position.y = 0.42;
    rig.hips.rotation.x = -0.52;
    rig.leftLeg.rotation.x = 0.9;
    rig.rightLeg.rotation.x = -0.25;
    rig.leftArm.rotation.z = 0.65;
    rig.rightArm.rotation.x = -1.1;
  } else if (state === 'skydive') {
    rig.hips.rotation.x = 1.25;
    rig.leftArm.rotation.z = 1.2;
    rig.rightArm.rotation.z = -1.2;
    rig.leftLeg.rotation.x = Math.sin(time * 8) * 0.25;
    rig.rightLeg.rotation.x = -Math.sin(time * 8) * 0.25;
  } else if (state === 'glide') {
    rig.hips.position.y = 0.85 + Math.sin(time * 3) * 0.06;
    rig.leftArm.rotation.x = -2.6;
    rig.rightArm.rotation.x = -2.6;
    rig.leftLeg.rotation.x = 0.15 + Math.sin(time * 2.5) * 0.1;
    rig.rightLeg.rotation.x = -0.15 - Math.sin(time * 2.5) * 0.1;
  } else if (state === 'downed') {
    rig.hips.position.y = 0.34;
    rig.hips.rotation.x = 1.35;
    rig.leftArm.rotation.x = -0.6 + Math.sin(time * 5) * 0.3;
    rig.rightArm.rotation.x = -0.6 - Math.sin(time * 5) * 0.3;
  } else if (state === 'revive') {
    rig.hips.position.y = 0.64;
    rig.torso.rotation.x = 0.48;
    rig.leftArm.rotation.x = -1.1;
    rig.rightArm.rotation.x = -1.1;
  } else if (state === 'emote_dance') {
    rig.hips.position.y = 0.92 + Math.abs(Math.sin(time * 7)) * 0.12;
    rig.hips.rotation.y = Math.sin(time * 3.5) * 0.4;
    rig.leftArm.rotation.z = 0.9 + Math.sin(time * 7) * 0.6;
    rig.rightArm.rotation.z = -0.9 - Math.cos(time * 7) * 0.6;
    rig.leftLeg.rotation.x = Math.sin(time * 7) * 0.45;
    rig.rightLeg.rotation.x = -Math.sin(time * 7) * 0.45;
  } else if (state === 'emote_wave') {
    rig.rightArm.rotation.x = -2.4;
    rig.rightArm.rotation.z = -0.4 + Math.sin(time * 10) * 0.45;
    rig.head.rotation.z = 0.12;
  } else if (state === 'emote_laugh') {
    rig.hips.position.y = 0.88 + Math.abs(Math.sin(time * 12)) * 0.08;
    rig.torso.rotation.x = -0.22 + Math.sin(time * 14) * 0.12;
    rig.leftArm.rotation.x = -0.8;
    rig.rightArm.rotation.x = -0.8;
  } else if (state === 'emote_point') {
    rig.rightArm.rotation.x = -1.55;
    rig.leftArm.rotation.z = 0.35;
    rig.torso.rotation.y = -0.25;
  } else {
    // Idle gentle bounce
    rig.hips.position.y = 0.92 + Math.sin(time * 2.4) * 0.025;
    rig.torso.rotation.y = Math.sin(time * 1.2) * 0.04;
    if (aiming || rig.heldGun.visible) {
      rig.rightArm.rotation.x = -1.42;
      rig.leftArm.rotation.x = -0.85;
      rig.leftArm.rotation.z = -0.3;
    }
  }

  // Pickaxe / Attack swing overlay
  if (swingTimer > 0) {
    rig.rightArm.rotation.x = -1.6 + Math.sin(swingTimer * 24) * 1.1;
    rig.torso.rotation.y = Math.sin(swingTimer * 18) * 0.28;
  }
}
