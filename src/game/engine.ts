import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { soundEngine } from './audio';
import {
  ISLAND_RADIUS,
  ISLAND_ZONES,
  WEAPONS,
  zoneAtPosition,
  type BuildPieceType,
  type EmoteId,
  type GameMode,
  type MaterialType,
  type PlayerLoadout,
  type WeaponId
} from './catalog';
import {
  animateCharacterPose,
  createStreetCharacter,
  setRigWeapon,
  type CharacterAnimState,
  type CharacterRig
} from './character';
import { buildIslandWorld, groundHeightAt, type BuiltStructure, type IslandWorld } from './world';
import { brOnline, type RemoteBrState } from '../online';

export interface HudSlot {
  weaponId: WeaponId;
  ammo: number;
  maxAmmo: number;
  count: number;
}

export interface MinimapActor {
  x: number;
  z: number;
  kind: 'teammate' | 'enemy' | 'bus';
  downed?: boolean;
}

export interface MatchResult {
  won: boolean;
  placement: number;
  totalPlayers: number;
  kills: number;
  damageDealt: number;
  buildsPlaced: number;
  survivalSec: number;
  xpEarned: number;
  coinsEarned: number;
  mode: GameMode;
  winnerName: string;
}

export interface HudSnapshot {
  inMatch: boolean;
  mode: GameMode;
  hp: number;
  shield: number;
  downed: boolean;
  revivingProgress: number;
  aliveCount: number;
  totalCount: number;
  kills: number;
  inBus: boolean;
  skydiving: boolean;
  gliding: boolean;
  zoneName: string;
  stormPhase: number;
  stormTimer: number;
  inStorm: boolean;
  stormX: number;
  stormZ: number;
  stormRadius: number;
  nextStormX: number;
  nextStormZ: number;
  nextStormRadius: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  materials: Record<MaterialType, number>;
  selectedMaterial: MaterialType;
  slots: (HudSlot | null)[];
  activeSlot: number; // -1 = pickaxe, 0..4 = hotbar slots
  buildPreview: BuildPieceType | null;
  nearbyPrompt: string | null;
  hitmarker: number;
  damageFlash: number;
  killFeed: string[];
  actors: MinimapActor[];
  pointerLocked: boolean;
  activeEmote: EmoteId | null;
  result: MatchResult | null;
}

interface BotAgent {
  id: string;
  name: string;
  teamId: number;
  isTeammate: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  shield: number;
  downed: boolean;
  bleedTimer: number;
  alive: boolean;
  inBus: boolean;
  jumpTime: number;
  gliding: boolean;
  weapon: WeaponId;
  fireCooldown: number;
  targetX: number;
  targetZ: number;
  retargetTimer: number;
  rig: CharacterRig;
  swingTimer: number;
}

interface RemotePeer {
  clientId: string;
  username: string;
  rig: CharacterRig;
  state: RemoteBrState;
}

interface TracerBeam {
  mesh: THREE.Mesh;
  ttl: number;
}

const GRID_SIZE = 4;

const BOT_NAMES = [
  'SunnyFox', 'BreezyBee', 'DashPanda', 'NovaSpark', 'CactusAce',
  'FrostOwl', 'PixelTiger', 'RocketJay', 'CometKoi', 'TurboMoose',
  'CloudPuff', 'ZestyLynx', 'PeppyBear', 'SkyHawk', 'BerryScout',
  'BoltGecko', 'FizzWhale', 'AstroDuck', 'SparkViper', 'GliderKid'
];

export class BattleRoyaleEngine {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pmrem: THREE.PMREMGenerator;
  private isSoftwareGl = false;

  private world: IslandWorld | null = null;
  private showcaseGroup = new THREE.Group();
  private showcaseRig: CharacterRig | null = null;
  private showcaseTeammates: CharacterRig[] = [];
  private showcaseEmote: EmoteId | null = null;
  private showcaseEmoteTimer = 0;

  private playerRig: CharacterRig | null = null;
  private bots: BotAgent[] = [];
  private remotePeers = new Map<string, RemotePeer>();
  private tracers: TracerBeam[] = [];
  private buildGhost: THREE.Mesh | null = null;

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private hudSyncTimer = 0;
  private netSyncTimer = 0;
  private disposed = false;

  // Callbacks & State
  private onHudUpdate: (hud: HudSnapshot) => void;
  private onMatchFinish?: (res: MatchResult) => void;

  private inMatch = false;
  private mode: GameMode = 'solo';
  private matchesPlayed = 0;
  private playerLoadout: PlayerLoadout = {
    skinTone: 'peach',
    hair: 'hair_spiky',
    skin: 'skin_scout',
    backpack: 'pack_trail',
    pickaxe: 'pick_timber',
    glider: 'glider_sunburst'
  };
  private playerName = 'SkyRunner';
  private isMobile = false;

  // Player Physics & Combat State
  private px = 0;
  private py = 120;
  private pz = 0;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private yaw = 0;
  private pitch = 0.25;
  private grounded = false;
  private crouching = false;
  private slideTimer = 0;
  private inBus = true;
  private busProgress = 0;
  private skydiving = false;
  private gliding = false;

  private hp = 100;
  private shield = 0;
  private downed = false;
  private bleedTimer = 35;
  private revivingProgress = 0;
  private kills = 0;
  private damageDealt = 0;
  private buildsPlaced = 0;
  private matchStartTime = 0;

  private materials: Record<MaterialType, number> = { wood: 50, brick: 30, metal: 20 };
  private selectedMaterial: MaterialType = 'wood';
  private slots: (HudSlot | null)[] = [null, null, null, null, null];
  private activeSlot = -1; // -1 = pickaxe
  private buildPreview: BuildPieceType | null = null;
  private fireCooldown = 0;
  private reloadTimer = 0;
  private swingTimer = 0;
  private activeEmote: EmoteId | null = null;
  private emoteTimer = 0;
  private hitmarker = 0;
  private damageFlash = 0;
  private killFeed: string[] = [];
  private result: MatchResult | null = null;

  // Storm State
  private stormX = 0;
  private stormZ = 0;
  private stormRadius = 420;
  private nextStormX = 0;
  private nextStormZ = 0;
  private nextStormRadius = 280;
  private stormPhase = 1;
  private stormTimer = 32;
  private stormTickAccum = 0;

  // Input State
  private keys = new Set<string>();
  private joyX = 0;
  private joyY = 0;
  private mouseDown = false;
  private aimDown = false;
  private touchShoot = false;
  private pointerLocked = false;
  private dragTouchId: number | null = null;
  private lastTouchX = 0;
  private lastTouchY = 0;

  // Pre-allocated Scratch Math Objects (Zero-GC)
  private readonly _camPos = new THREE.Vector3();
  private readonly _camLook = new THREE.Vector3();
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _rayDir = new THREE.Vector3();
  private readonly _tmpVec = new THREE.Vector3();
  private readonly _raycaster = new THREE.Raycaster();

  private unsubscribeNet: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    onHudUpdate: (hud: HudSnapshot) => void,
    onMatchFinish?: (res: MatchResult) => void
  ) {
    this.canvas = canvas;
    this.onHudUpdate = onHudUpdate;
    this.onMatchFinish = onMatchFinish;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    // Software GL check
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      this.isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rName);
    } catch {
      this.isSoftwareGl = false;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isSoftwareGl ? 1 : 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f2b27a');
    this.scene.fog = new THREE.FogExp2('#e3b087', 0.0016);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.25, 1300);

    // Golden-hour hazy city lighting
    const hemi = new THREE.HemisphereLight('#ffd2a1', '#5a4a40', 0.8);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#ffb36b', 2.1);
    sun.position.set(240, 120, 160);
    if (!this.isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.6;
      sun.shadow.camera.near = 20;
      sun.shadow.camera.far = 700;
      sun.shadow.camera.left = -220;
      sun.shadow.camera.right = 220;
      sun.shadow.camera.top = 220;
      sun.shadow.camera.bottom = -220;
    }
    this.scene.add(sun);

    if (!this.isSoftwareGl) this.setupPostFx();
    this.setupShowcaseScene();
    this.bindEvents();
    this.resize();
    this.subscribeMultiplayer();

    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  /** Cinematic post stack: bloom, warm grade + film grain + vignette, then tone-map. */
  private setupPostFx() {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(size, 0.35, 0.7, 0.88));
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
        float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))+time)*43758.5453); }
        void main(){
          vec2 d = vUv - 0.5;
          float ca = dot(d,d) * 0.006;
          vec3 c = vec3(texture2D(tDiffuse, vUv+d*ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-d*ca).b);
          float l = dot(c, vec3(0.299,0.587,0.114));
          c = mix(vec3(l), c, 0.88);                       // slight desaturation
          c = mix(c * vec3(0.96,0.99,1.06), c * vec3(1.08,1.0,0.92), smoothstep(0.2,0.8,l)); // teal shadows / warm highlights
          c = (c - 0.5) * 1.08 + 0.5;
          c *= 1.0 - dot(d,d) * 1.1;                       // vignette
          c += (rnd(vUv*1000.0) - 0.5) * 0.035;            // film grain
          gl_FragColor = vec4(c, 1.0);
        }`
    }));
    this.composer.addPass(new OutputPass());
  }

  private setupShowcaseScene() {
    this.showcaseGroup.clear();
    // Island lobby pedestal
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.8, 1.2, 24),
      new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.9 })
    );
    island.position.y = -0.6;
    island.receiveShadow = true;
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.4, 0.24, 24),
      new THREE.MeshStandardMaterial({ color: '#e8b923', roughness: 0.4 })
    );
    rim.position.y = -0.1;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(120, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#f2b27a', side: THREE.BackSide })
    );
    this.showcaseGroup.add(island, rim, sky);

    this.showcaseRig = createStreetCharacter(this.playerLoadout, 'pickaxe');
    this.showcaseRig.root.position.set(0, 0, 0);
    this.showcaseGroup.add(this.showcaseRig.root);

    this.scene.add(this.showcaseGroup);
  }

  public updateShowcaseLoadout(loadout: PlayerLoadout, username: string, partyLoadouts: PlayerLoadout[] = []) {
    this.playerLoadout = { ...loadout };
    this.playerName = username;

    if (this.showcaseRig) {
      this.showcaseGroup.remove(this.showcaseRig.root);
    }
    this.showcaseRig = createStreetCharacter(this.playerLoadout, 'pickaxe');
    this.showcaseRig.root.position.set(0, 0, 0);
    this.showcaseGroup.add(this.showcaseRig.root);

    for (const r of this.showcaseTeammates) {
      this.showcaseGroup.remove(r.root);
    }
    this.showcaseTeammates = [];
    partyLoadouts.slice(0, 3).forEach((pl, idx) => {
      const mate = createStreetCharacter(pl, 'rifle');
      const offsetX = idx === 0 ? -1.8 : idx === 1 ? 1.8 : -3.2;
      const offsetZ = idx === 2 ? -1.1 : -0.7;
      mate.root.position.set(offsetX, 0, offsetZ);
      mate.root.rotation.y = -offsetX * 0.12;
      this.showcaseGroup.add(mate.root);
      this.showcaseTeammates.push(mate);
    });
  }

  public previewEmote(emote: EmoteId) {
    if (this.inMatch) {
      this.triggerEmote(emote);
    } else {
      this.showcaseEmote = emote;
      this.showcaseEmoteTimer = 3.2;
    }
  }

  public setMobileMode(mobile: boolean) {
    this.isMobile = mobile;
  }

  public startMatch(opts: {
    mode: GameMode;
    loadout: PlayerLoadout;
    username: string;
    matchesPlayed: number;
    partyCount?: number;
  }) {
    this.cleanupMatchObjects();
    this.inMatch = true;
    this.showcaseGroup.visible = false;
    this.mode = opts.mode;
    this.playerLoadout = { ...opts.loadout };
    this.playerName = opts.username || 'SkyRunner';
    this.matchesPlayed = opts.matchesPlayed;
    this.result = null;

    const isCreative = opts.mode === 'creative';
    this.world = buildIslandWorld(isCreative);
    this.scene.add(this.world.group);

    this.playerRig = createStreetCharacter(this.playerLoadout, isCreative ? 'rifle' : 'pickaxe');
    this.scene.add(this.playerRig.root);

    // Player Initial Stats
    this.hp = 100;
    this.shield = isCreative ? 100 : 0;
    this.downed = false;
    this.bleedTimer = 35;
    this.revivingProgress = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.buildsPlaced = 0;
    this.matchStartTime = performance.now();
    this.killFeed = [];
    this.hitmarker = 0;
    this.damageFlash = 0;
    this.buildPreview = null;
    this.selectedMaterial = 'wood';
    this.materials = isCreative
      ? { wood: 999, brick: 999, metal: 999 }
      : { wood: 60, brick: 30, metal: 20 };

    if (isCreative) {
      this.slots = [
        { weaponId: 'rifle', ammo: 30, maxAmmo: 30, count: 1 },
        { weaponId: 'shotgun', ammo: 6, maxAmmo: 6, count: 1 },
        { weaponId: 'sniper', ammo: 4, maxAmmo: 4, count: 1 },
        { weaponId: 'smg', ammo: 35, maxAmmo: 35, count: 1 },
        { weaponId: 'bigshield', ammo: 0, maxAmmo: 0, count: 4 }
      ];
      this.activeSlot = 0;
      setRigWeapon(this.playerRig, 'rifle');
      this.inBus = false;
      this.skydiving = false;
      this.gliding = false;
      this.px = 0;
      this.pz = 65;
      this.py = groundHeightAt(this.px, this.pz) + 0.1;
    } else {
      this.slots = [
        { weaponId: 'pistol', ammo: 16, maxAmmo: 16, count: 1 },
        { weaponId: 'bandage', ammo: 0, maxAmmo: 0, count: 3 },
        null,
        null,
        null
      ];
      this.activeSlot = -1;
      setRigWeapon(this.playerRig, 'pickaxe');
      this.inBus = true;
      this.busProgress = 0.08;
      this.skydiving = false;
      this.gliding = false;
      this.px = -260;
      this.py = 120;
      this.pz = -180;
    }

    // Storm initialization
    this.stormX = 0;
    this.stormZ = 0;
    this.stormRadius = 420;
    this.nextStormX = (Math.random() - 0.5) * 140;
    this.nextStormZ = (Math.random() - 0.5) * 140;
    this.nextStormRadius = 270;
    this.stormPhase = 1;
    this.stormTimer = 28;
    this.stormTickAccum = 0;

    // Spawn 99 bots (friendly/easy onboarding in first 3 matches) -> 100 total players in BR/ZeroBuild!
    this.bots = [];
    if (!isCreative) {
      const teamSize = opts.mode === 'duo' ? 2 : opts.mode === 'squad' ? 4 : 1;
      const totalPlayers = 100;
      for (let i = 1; i < totalPlayers; i++) {
        const teamId = Math.floor(i / teamSize);
        const isMate = teamId === 0 && teamSize > 1;
        const zone = ISLAND_ZONES[i % ISLAND_ZONES.length];
        const ang = (i * 2.399) % (Math.PI * 2);
        const rad = 14 + (i % 7) * 11;
        const bx = zone.x + Math.cos(ang) * rad;
        const bz = zone.z + Math.sin(ang) * rad;
        const by = groundHeightAt(bx, bz);
        const skinIds = ['skin_scout', 'skin_captain', 'skin_neon', 'skin_frost', 'skin_nomad', 'skin_candy'];
        const hairIds = ['hair_spiky', 'hair_bob', 'hair_mohawk', 'hair_buns', 'hair_pomp'];
        const botLoadout: PlayerLoadout = {
          skinTone: 'peach',
          skin: isMate ? 'skin_captain' : skinIds[i % skinIds.length],
          hair: hairIds[i % hairIds.length],
          backpack: 'pack_trail',
          pickaxe: 'pick_timber',
          glider: 'glider_sunburst'
        };
        const botWeapon: WeaponId = (['pistol', 'rifle', 'shotgun', 'smg'] as WeaponId[])[i % 4];
        const rig = createStreetCharacter(botLoadout, botWeapon);
        rig.root.position.set(bx, Math.max(0.2, by), bz);
        // Only render nearest ~28 bots actively for ultra-smooth 60 FPS; rest update lightweight AI until close!
        rig.root.visible = false;
        this.scene.add(rig.root);

        this.bots.push({
          id: `bot_${i}`,
          name: isMate ? `Ally-${BOT_NAMES[i % BOT_NAMES.length]}` : BOT_NAMES[i % BOT_NAMES.length],
          teamId,
          isTeammate: isMate,
          x: bx,
          y: Math.max(0.2, by),
          z: bz,
          vx: 0,
          vz: 0,
          yaw: Math.random() * Math.PI * 2,
          hp: 100,
          shield: isMate ? 50 : this.matchesPlayed < 3 ? 0 : 25,
          downed: false,
          bleedTimer: 30,
          alive: true,
          inBus: false,
          jumpTime: (i % 15) * 0.6,
          gliding: false,
          weapon: botWeapon,
          fireCooldown: 1 + Math.random() * 2,
          targetX: bx,
          targetZ: bz,
          retargetTimer: Math.random() * 3,
          rig,
          swingTimer: 0
        });
      }
    }

    // Join online matchmaking room
    brOnline.matchmake(opts.mode, 1 + this.matchesPlayed, this.playerName, this.playerLoadout);
    this.emitHud();
  }

  public exitMatch() {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    brOnline.leaveMatch();
    this.cleanupMatchObjects();
    this.inMatch = false;
    this.showcaseGroup.visible = true;
    this.emitHud();
  }

  private cleanupMatchObjects() {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world = null;
    }
    if (this.playerRig) {
      this.scene.remove(this.playerRig.root);
      this.playerRig = null;
    }
    for (const b of this.bots) {
      this.scene.remove(b.rig.root);
    }
    this.bots = [];
    for (const peer of this.remotePeers.values()) {
      this.scene.remove(peer.rig.root);
    }
    this.remotePeers.clear();
    if (this.buildGhost) {
      this.scene.remove(this.buildGhost);
      this.buildGhost = null;
    }
    for (const tr of this.tracers) {
      this.scene.remove(tr.mesh);
    }
    this.tracers = [];
  }

  private subscribeMultiplayer() {
    this.unsubscribeNet = brOnline.subscribe((type, raw) => {
      if (!this.inMatch || !this.world) return;
      const p = raw as Record<string, unknown>;
      if (type === 'br:state') {
        const cid = String(p.clientId || '');
        if (!cid) return;
        let peer = this.remotePeers.get(cid);
        if (!peer) {
          const rig = createStreetCharacter((p.loadout as PlayerLoadout) || this.playerLoadout, (p.weapon as WeaponId) || 'rifle');
          this.scene.add(rig.root);
          peer = {
            clientId: cid,
            username: String(p.username || 'Player'),
            rig,
            state: {
              clientId: cid,
              username: String(p.username || 'Player'),
              x: Number(p.x || 0),
              y: Number(p.y || 0),
              z: Number(p.z || 0),
              yaw: Number(p.yaw || 0),
              anim: String(p.anim || 'idle'),
              weapon: (p.weapon as WeaponId) || 'rifle',
              hp: Number(p.hp ?? 100),
              shield: Number(p.shield ?? 0),
              downed: Boolean(p.downed),
              alive: p.alive !== false,
              inBus: Boolean(p.inBus)
            }
          };
          this.remotePeers.set(cid, peer);
        }
        Object.assign(peer.state, p);
        peer.rig.root.visible = peer.state.alive && !peer.state.inBus;
      } else if (type === 'br:playerLeft') {
        const cid = String(p.clientId || '');
        const peer = this.remotePeers.get(cid);
        if (peer) {
          this.scene.remove(peer.rig.root);
          this.remotePeers.delete(cid);
        }
      } else if (type === 'br:build') {
        this.placeStructureMesh(
          String(p.id || `net_${Date.now()}`),
          p.type as BuildPieceType,
          p.material as MaterialType,
          Number(p.x || 0),
          Number(p.y || 0),
          Number(p.z || 0),
          Number(p.rotY || 0)
        );
      } else if (type === 'br:shoot') {
        this.spawnTracer(
          new THREE.Vector3(Number(p.ox || 0), Number(p.oy || 0), Number(p.oz || 0)),
          new THREE.Vector3(Number(p.tx || 0), Number(p.ty || 0), Number(p.tz || 0)),
          '#fbbf24'
        );
      } else if (type === 'br:damage') {
        if (p.targetClientId && String(p.targetClientId) === 'self') {
          this.applyPlayerDamage(Number(p.amount || 10), String(p.attackerName || 'Opponent'));
        }
      }
    });
  }

  // ===== Controls & Input Actions (PC + Mobile) =====
  public setJoystick(x: number, y: number) {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
  }

  public setTouchShoot(down: boolean) {
    this.touchShoot = down;
  }

  public toggleAim(down?: boolean) {
    this.aimDown = down !== undefined ? down : !this.aimDown;
  }

  public triggerJump() {
    if (!this.inMatch || this.result) return;
    if (this.inBus) {
      this.jumpFromBus();
      return;
    }
    if (this.skydiving) {
      this.gliding = !this.gliding;
      return;
    }
    if (this.grounded && !this.downed) {
      this.vy = 11.2;
      this.grounded = false;
      this.crouching = false;
      soundEngine.jump();
    }
  }

  public triggerCrouchOrSlide() {
    if (!this.inMatch || this.downed || this.inBus || this.skydiving) return;
    const horizSpeed = Math.hypot(this.vx, this.vz);
    if (horizSpeed > 8.5 && this.grounded && this.slideTimer <= 0) {
      this.slideTimer = 0.65;
    } else {
      this.crouching = !this.crouching;
    }
  }

  public selectSlot(idx: number) {
    if (!this.inMatch || this.downed) return;
    this.buildPreview = null;
    this.updateBuildGhost();
    if (idx === -1) {
      this.activeSlot = -1;
      if (this.playerRig) setRigWeapon(this.playerRig, 'pickaxe');
      return;
    }
    if (idx >= 0 && idx < 5 && this.slots[idx]) {
      this.activeSlot = idx;
      if (this.playerRig) setRigWeapon(this.playerRig, this.slots[idx]!.weaponId);
    }
  }

  public cycleWeapon() {
    if (!this.inMatch) return;
    for (let step = 1; step <= 6; step++) {
      const next = ((this.activeSlot + 1 + step) % 6) - 1;
      if (next === -1 || this.slots[next]) {
        this.selectSlot(next);
        return;
      }
    }
  }

  public selectMaterial(mat: MaterialType) {
    this.selectedMaterial = mat;
    this.updateBuildGhost();
  }

  public triggerBuildPiece(type: BuildPieceType) {
    if (!this.inMatch || this.mode === 'zerobuild' || this.downed || this.inBus || this.skydiving) return;
    if (this.buildPreview === type) {
      this.placeCurrentBuild(type);
    } else {
      this.buildPreview = type;
      // Fast 1-button instant build if mats available!
      this.placeCurrentBuild(type);
    }
  }

  public triggerInteract() {
    if (!this.inMatch || !this.world || this.inBus || this.skydiving || this.downed) return;

    // 1. Check downed teammates for Revive
    for (const b of this.bots) {
      if (b.isTeammate && b.alive && b.downed) {
        const d = Math.hypot(b.x - this.px, b.z - this.pz);
        if (d < 4.5) {
          b.downed = false;
          b.hp = 55;
          b.bleedTimer = 30;
          this.pushFeed(`Revived ${b.name}!`);
          soundEngine.heal(false);
          return;
        }
      }
    }

    // 2. Open nearby Chest
    for (const c of this.world.chests) {
      if (!c.opened && Math.hypot(c.x - this.px, c.z - this.pz) < 4.2) {
        c.opened = true;
        c.lid.rotation.x = -0.95;
        soundEngine.chest();
        this.materials.wood += 30;
        this.materials.brick += 20;
        this.materials.metal += 15;
        const gunDrop: WeaponId = (['rifle', 'shotgun', 'smg', 'sniper'] as WeaponId[])[
          Math.floor(Math.random() * 4)
        ];
        const healDrop: WeaponId = Math.random() > 0.45 ? 'bigshield' : 'medkit';
        this.giveItem(gunDrop);
        this.giveItem(healDrop);
        this.pushFeed(`Opened Chest: ${WEAPONS[gunDrop].name} + ${WEAPONS[healDrop].name}`);
        return;
      }
    }

    // 3. Pick up Ground Loot
    let closestLoot = null;
    let bestD = 4.2;
    for (const l of this.world.loots) {
      if (l.picked) continue;
      const d = Math.hypot(l.x - this.px, l.z - this.pz);
      if (d < bestD) {
        bestD = d;
        closestLoot = l;
      }
    }
    if (closestLoot) {
      closestLoot.picked = true;
      closestLoot.mesh.visible = false;
      this.giveItem(closestLoot.weaponId);
      soundEngine.pickup();
    }
  }

  public triggerEmote(emote: EmoteId) {
    if (!this.inMatch || this.downed || this.inBus || this.skydiving) return;
    this.activeEmote = emote;
    this.emoteTimer = 3.2;
  }

  private giveItem(weaponId: WeaponId) {
    const def = WEAPONS[weaponId];
    // Stack consumables
    if (def.kind === 'heal') {
      for (let i = 0; i < 5; i++) {
        if (this.slots[i]?.weaponId === weaponId) {
          this.slots[i]!.count += 1;
          return;
        }
      }
    }
    // Empty slot
    for (let i = 0; i < 5; i++) {
      if (!this.slots[i]) {
        this.slots[i] = {
          weaponId,
          ammo: def.magSize,
          maxAmmo: def.magSize,
          count: 1
        };
        if (this.activeSlot === -1 && def.kind === 'gun') {
          this.selectSlot(i);
        }
        return;
      }
    }
    // Replace active slot if carrying slot 0..4
    const replaceIdx = this.activeSlot >= 0 ? this.activeSlot : 0;
    this.slots[replaceIdx] = {
      weaponId,
      ammo: def.magSize,
      maxAmmo: def.magSize,
      count: 1
    };
    this.selectSlot(replaceIdx);
  }

  private jumpFromBus() {
    if (!this.inBus) return;
    this.inBus = false;
    this.skydiving = true;
    this.gliding = false;
    this.vy = -12;
    soundEngine.jump();
  }

  private placeCurrentBuild(type: BuildPieceType) {
    if (!this.world || this.mode === 'zerobuild') return;
    const mat = this.selectedMaterial;
    if (this.mode !== 'creative' && this.materials[mat] < 10) {
      this.pushFeed('Need 10 materials to build!');
      return;
    }
    if (this.mode !== 'creative') {
      this.materials[mat] -= 10;
    }

    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const rawX = this.px + fwdX * (type === 'floor' ? 1.5 : 3.2);
    const rawZ = this.pz + fwdZ * (type === 'floor' ? 1.5 : 3.2);
    const gx = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
    const gz = Math.round(rawZ / GRID_SIZE) * GRID_SIZE;
    const gy = Math.max(groundHeightAt(gx, gz), Math.floor(this.py / 3) * 3);
    const snapRot = Math.round(this.yaw / (Math.PI / 2)) * (Math.PI / 2);
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.placeStructureMesh(id, type, mat, gx, gy, gz, snapRot);
    this.buildsPlaced += 1;
    soundEngine.build();
    brOnline.sendBuild({ id, type, material: mat, x: gx, y: gy, z: gz, rotY: snapRot });
  }

  private placeStructureMesh(
    id: string,
    type: BuildPieceType,
    material: MaterialType,
    x: number,
    y: number,
    z: number,
    rotY: number
  ) {
    if (!this.world) return;
    const matColor = material === 'wood' ? '#c2813d' : material === 'brick' ? '#c2593f' : '#64748b';
    const meshMat = new THREE.MeshStandardMaterial({
      color: matColor,
      roughness: material === 'metal' ? 0.35 : 0.78,
      metalness: material === 'metal' ? 0.45 : 0.05
    });

    let geo: THREE.BufferGeometry;
    let offsetY = 0;
    let rotX = 0;
    if (type === 'wall') {
      geo = new THREE.BoxGeometry(GRID_SIZE, 3.2, 0.36);
      offsetY = 1.6;
    } else if (type === 'floor') {
      geo = new THREE.BoxGeometry(GRID_SIZE, 0.3, GRID_SIZE);
      offsetY = 0.15;
    } else if (type === 'ramp') {
      geo = new THREE.BoxGeometry(GRID_SIZE, 0.3, GRID_SIZE * 1.32);
      offsetY = 1.55;
      rotX = -0.68;
    } else {
      geo = new THREE.ConeGeometry(GRID_SIZE * 0.74, 2.2, 4);
      offsetY = 2.4;
    }

    const mesh = new THREE.Mesh(geo, meshMat);
    mesh.position.set(x, y + offsetY, z);
    mesh.rotation.y = rotY + (type === 'roof' ? Math.PI / 4 : 0);
    if (rotX !== 0) mesh.rotateX(rotX);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.world.group.add(mesh);

    const maxHp = material === 'metal' ? 280 : material === 'brick' ? 200 : 140;
    const structure: BuiltStructure = {
      id,
      type,
      material,
      x,
      y,
      z,
      rotY,
      hp: maxHp,
      maxHp,
      mesh
    };
    this.world.buildings.push(structure);
  }

  private updateBuildGhost() {
    if (this.buildGhost) {
      this.scene.remove(this.buildGhost);
      this.buildGhost = null;
    }
    if (!this.buildPreview || !this.inMatch || this.mode === 'zerobuild') return;
    const geo =
      this.buildPreview === 'wall'
        ? new THREE.BoxGeometry(GRID_SIZE, 3.2, 0.36)
        : this.buildPreview === 'floor'
        ? new THREE.BoxGeometry(GRID_SIZE, 0.3, GRID_SIZE)
        : this.buildPreview === 'ramp'
        ? new THREE.BoxGeometry(GRID_SIZE, 0.3, GRID_SIZE * 1.32)
        : new THREE.ConeGeometry(GRID_SIZE * 0.74, 2.2, 4);
    this.buildGhost = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.45, wireframe: false })
    );
    this.scene.add(this.buildGhost);
  }

  private spawnTracer(origin: THREE.Vector3, target: THREE.Vector3, color: string) {
    const dist = origin.distanceTo(target);
    if (dist < 0.3) return;
    const geo = new THREE.CylinderGeometry(0.05, 0.05, dist, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin).lerp(target, 0.5);
    mesh.lookAt(target);
    this.scene.add(mesh);
    this.tracers.push({ mesh, ttl: 0.11 });
  }

  private performPlayerAction() {
    if (!this.world || this.downed || this.inBus || this.skydiving || this.result) return;
    if (this.fireCooldown > 0 || this.reloadTimer > 0) return;

    const slot = this.activeSlot >= 0 ? this.slots[this.activeSlot] : null;
    const weaponId: WeaponId = slot ? slot.weaponId : 'pickaxe';
    const def = WEAPONS[weaponId];

    // Consumable Heal / Shield
    if (def.kind === 'heal' && slot) {
      const cap = def.maxCap || 100;
      if (def.healAmount) {
        if (this.hp >= cap) return;
        this.hp = Math.min(cap, this.hp + def.healAmount);
        soundEngine.heal(false);
      } else if (def.shieldAmount) {
        if (this.shield >= cap) return;
        this.shield = Math.min(cap, this.shield + def.shieldAmount);
        soundEngine.heal(true);
      }
      this.fireCooldown = 1 / def.fireRate;
      slot.count -= 1;
      if (slot.count <= 0) {
        this.slots[this.activeSlot] = null;
        this.selectSlot(-1);
      }
      return;
    }

    // Pickaxe Harvest
    if (def.kind === 'tool') {
      this.fireCooldown = 1 / def.fireRate;
      this.swingTimer = 0.28;
      const fwdX = -Math.sin(this.yaw);
      const fwdZ = -Math.cos(this.yaw);
      for (const prop of this.world.props) {
        if (!prop.alive) continue;
        const dx = prop.x - this.px;
        const dz = prop.z - this.pz;
        const d = Math.hypot(dx, dz);
        if (d < prop.radius + 3.8) {
          const dot = (dx * fwdX + dz * fwdZ) / Math.max(0.1, d);
          if (dot > 0.25 || d < prop.radius + 1.8) {
            prop.hp -= def.damage;
            const gained = prop.material === 'wood' ? 14 : prop.material === 'brick' ? 12 : 10;
            this.materials[prop.material] = Math.min(999, this.materials[prop.material] + gained);
            soundEngine.harvest(prop.material);
            this.hitmarker = 0.14;
            if (prop.hp <= 0) {
              prop.alive = false;
              prop.mesh.visible = false;
              if (prop.kind === 'target') {
                prop.respawnAt = this.elapsed + 3.5;
              }
            }
            return;
          }
        }
      }
      soundEngine.harvest('wood');
      return;
    }

    // Gun Fire
    if (def.kind === 'gun' && slot) {
      if (slot.ammo <= 0) {
        this.reloadTimer = def.reloadTime;
        return;
      }
      slot.ammo -= 1;
      this.fireCooldown = 1 / def.fireRate;
      this.swingTimer = 0.12;
      soundEngine.shoot(weaponId);

      // Compute shoot origin & direction
      this.camera.getWorldPosition(this._rayOrigin);
      this.camera.getWorldDirection(this._rayDir);

      // Mobile Auto-Aim Assist: subtly steer toward closest enemy within 12deg cone
      if (this.isMobile) {
        let bestBot: BotAgent | null = null;
        let bestDot = 0.96;
        for (const b of this.bots) {
          if (!b.alive || b.isTeammate) continue;
          this._tmpVec.set(b.x, b.y + 1.2, b.z).sub(this._rayOrigin);
          const dist = this._tmpVec.length();
          if (dist > def.range) continue;
          this._tmpVec.normalize();
          const dot = this._rayDir.dot(this._tmpVec);
          if (dot > bestDot) {
            bestDot = dot;
            bestBot = b;
          }
        }
        if (bestBot) {
          this._rayDir.set(bestBot.x, bestBot.y + 1.2, bestBot.z).sub(this._rayOrigin).normalize();
        }
      }

      const muzzlePos = new THREE.Vector3(this.px, this.py + 1.45, this.pz);
      if (this.playerRig) {
        this.playerRig.muzzlePoint.getWorldPosition(muzzlePos);
      }

      for (let p = 0; p < def.pellets; p++) {
        const dir = this._rayDir.clone();
        dir.x += (Math.random() - 0.5) * def.spread;
        dir.y += (Math.random() - 0.5) * def.spread;
        dir.z += (Math.random() - 0.5) * def.spread;
        dir.normalize();

        let closestDist = def.range;
        let hitBot: BotAgent | null = null;
        let hitPeer: RemotePeer | null = null;
        let hitProp = false;

        // Check Bots
        for (const b of this.bots) {
          if (!b.alive || b.isTeammate) continue;
          this._tmpVec.set(b.x, b.y + 1.15, b.z).sub(this._rayOrigin);
          const proj = this._tmpVec.dot(dir);
          if (proj < 0 || proj > closestDist) continue;
          const perpSq = this._tmpVec.lengthSq() - proj * proj;
          if (perpSq < 0.88 * 0.88) {
            closestDist = proj;
            hitBot = b;
            hitPeer = null;
          }
        }

        // Check Remote Human Peers
        for (const peer of this.remotePeers.values()) {
          if (!peer.state.alive || peer.state.inBus) continue;
          this._tmpVec.set(peer.state.x, peer.state.y + 1.15, peer.state.z).sub(this._rayOrigin);
          const proj = this._tmpVec.dot(dir);
          if (proj < 0 || proj > closestDist) continue;
          const perpSq = this._tmpVec.lengthSq() - proj * proj;
          if (perpSq < 0.88 * 0.88) {
            closestDist = proj;
            hitPeer = peer;
            hitBot = null;
          }
        }

        // Check Creative practice targets / harvest props
        for (const prop of this.world.props) {
          if (!prop.alive) continue;
          this._tmpVec.set(prop.x, prop.y + prop.height * 0.5, prop.z).sub(this._rayOrigin);
          const proj = this._tmpVec.dot(dir);
          if (proj < 0 || proj > closestDist) continue;
          const perpSq = this._tmpVec.lengthSq() - proj * proj;
          if (perpSq < prop.radius * prop.radius) {
            closestDist = proj;
            hitBot = null;
            hitPeer = null;
            hitProp = true;
            if (prop.kind === 'target') {
              prop.hp -= def.damage;
              this.hitmarker = 0.16;
              soundEngine.hitmarker();
              if (prop.hp <= 0) {
                prop.alive = false;
                prop.mesh.visible = false;
                prop.respawnAt = this.elapsed + 2.8;
                this.kills += 1;
                soundEngine.elimination();
                this.pushFeed('Target Eliminated!');
              }
            }
          }
        }

        const hitPos = this._rayOrigin.clone().addScaledVector(dir, closestDist);
        this.spawnTracer(muzzlePos, hitPos, def.color);
        if (p === 0) {
          brOnline.sendShoot({
            ox: muzzlePos.x,
            oy: muzzlePos.y,
            oz: muzzlePos.z,
            tx: hitPos.x,
            ty: hitPos.y,
            tz: hitPos.z,
            weapon: weaponId
          });
        }

        if (hitBot) {
          this.damageBot(hitBot, def.damage, true);
        } else if (hitPeer) {
          this.hitmarker = 0.16;
          this.damageDealt += def.damage;
          soundEngine.hitmarker();
          brOnline.sendDamage(hitPeer.clientId, def.damage, this.playerName);
        } else if (hitProp) {
          // Visual impact only
        }
      }
    }
  }

  private damageBot(bot: BotAgent, dmg: number, byPlayer: boolean) {
    if (!bot.alive) return;
    if (byPlayer) {
      this.hitmarker = 0.16;
      this.damageDealt += dmg;
      soundEngine.hitmarker();
    }
    if (bot.shield > 0) {
      const absorb = Math.min(bot.shield, dmg);
      bot.shield -= absorb;
      dmg -= absorb;
    }
    bot.hp -= dmg;
    if (bot.hp <= 0) {
      const teamSize = this.mode === 'duo' ? 2 : this.mode === 'squad' ? 4 : 1;
      const hasAliveTeammate =
        teamSize > 1 &&
        !bot.downed &&
        this.bots.some((other) => other.id !== bot.id && other.teamId === bot.teamId && other.alive && !other.downed);

      if (hasAliveTeammate) {
        bot.downed = true;
        bot.hp = 100;
        bot.bleedTimer = 28;
        if (byPlayer) this.pushFeed(`Knocked ${bot.name}!`);
      } else {
        bot.alive = false;
        bot.hp = 0;
        bot.rig.root.visible = false;
        if (byPlayer) {
          this.kills += 1;
          soundEngine.elimination();
          this.pushFeed(`Eliminated ${bot.name}!`);
          // Drop loot orb at bot location
          if (this.world) {
            this.materials.wood += 25;
            this.materials.brick += 15;
            this.materials.metal += 10;
          }
        }
      }
    }
  }

  private applyPlayerDamage(amount: number, sourceName: string) {
    if (!this.inMatch || this.result || this.mode === 'creative') return;
    let rem = amount;
    if (this.shield > 0 && !this.downed) {
      const absorb = Math.min(this.shield, rem);
      this.shield -= absorb;
      rem -= absorb;
    }
    this.hp = Math.max(0, this.hp - rem);
    this.damageFlash = 0.35;

    if (this.hp <= 0) {
      const hasAliveTeammate =
        (this.mode === 'duo' || this.mode === 'squad') &&
        !this.downed &&
        this.bots.some((b) => b.isTeammate && b.alive && !b.downed);

      if (hasAliveTeammate) {
        this.downed = true;
        this.hp = 100;
        this.bleedTimer = 35;
        this.pushFeed(`Knocked down by ${sourceName}! Teammate coming to revive!`);
      } else {
        this.finishMatch(false, sourceName);
      }
    }
  }

  private pushFeed(msg: string) {
    this.killFeed = [msg, ...this.killFeed].slice(0, 4);
  }

  private finishMatch(won: boolean, killerName = '') {
    if (this.result) return;
    const aliveBots = this.bots.filter((b) => b.alive).length;
    const placement = won ? 1 : Math.max(2, aliveBots + 1);
    const survivalSec = Math.round((performance.now() - this.matchStartTime) / 1000);
    const xpEarned = (won ? 500 : 120) + this.kills * 75 + Math.min(300, survivalSec);
    const coinsEarned = (won ? 300 : 40) + this.kills * 25;

    if (won) soundEngine.victory();
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }

    this.result = {
      won,
      placement,
      totalPlayers: this.mode === 'creative' ? 1 : 100,
      kills: this.kills,
      damageDealt: Math.round(this.damageDealt),
      buildsPlaced: this.buildsPlaced,
      survivalSec,
      xpEarned,
      coinsEarned,
      mode: this.mode,
      winnerName: won ? this.playerName : killerName || 'Island Rival'
    };
    this.emitHud();
    if (this.onMatchFinish) {
      this.onMatchFinish(this.result);
    }
  }

  private getSupportHeightAt(x: number, z: number, curY: number): number {
    let h = groundHeightAt(x, z);
    if (!this.world) return h;
    for (const b of this.world.buildings) {
      if (b.type === 'floor' || b.type === 'ramp') {
        const dx = Math.abs(x - b.x);
        const dz = Math.abs(z - b.z);
        if (dx <= GRID_SIZE * 0.55 && dz <= GRID_SIZE * 0.55) {
          let bHeight = b.y + 0.3;
          if (b.type === 'ramp') {
            const fwdX = -Math.sin(b.rotY);
            const fwdZ = -Math.cos(b.rotY);
            const localAlong = (x - b.x) * fwdX + (z - b.z) * fwdZ;
            const t = Math.max(0, Math.min(1, (localAlong + GRID_SIZE * 0.5) / GRID_SIZE));
            bHeight = b.y + t * 3.1;
          }
          if (bHeight <= curY + 1.9 && bHeight > h) {
            h = bHeight;
          }
        }
      }
    }
    return h;
  }

  // ===== Main Animation Loop =====
  private loop = (now: number) => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += dt;

    if (!this.inMatch) {
      this.updateShowcase(dt);
    } else {
      this.updateMatch(dt);
    }

    if (this.composer) {
      const grade = (this.composer.passes[2] as ShaderPass).uniforms;
      grade.time.value = (this.elapsed % 10);
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.isSoftwareGl) {
      const afterDraw = (window as unknown as { __AFTER_DRAW__?: () => void }).__AFTER_DRAW__;
      if (typeof afterDraw === 'function') afterDraw();
    }
  };

  private updateShowcase(dt: number) {
    this.showcaseGroup.visible = true;
    const angle = this.elapsed * 0.28;
    this.camera.position.set(Math.sin(angle) * 4.4, 2.0, Math.cos(angle) * 4.4);
    this.camera.lookAt(0, 1.35, 0);

    if (this.showcaseEmoteTimer > 0) {
      this.showcaseEmoteTimer -= dt;
      if (this.showcaseEmoteTimer <= 0) this.showcaseEmote = null;
    }

    if (this.showcaseRig) {
      const anim: CharacterAnimState = this.showcaseEmote ? (`emote_${this.showcaseEmote}` as CharacterAnimState) : 'idle';
      animateCharacterPose(this.showcaseRig, anim, this.elapsed);
    }
    for (const mate of this.showcaseTeammates) {
      animateCharacterPose(mate, 'idle', this.elapsed + 1.2);
    }
  }

  private updateMatch(dt: number) {
    if (!this.world || !this.playerRig) return;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.swingTimer = Math.max(0, this.swingTimer - dt);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0 && this.activeSlot >= 0 && this.slots[this.activeSlot]) {
        this.slots[this.activeSlot]!.ammo = this.slots[this.activeSlot]!.maxAmmo;
      }
    }

    // Animate Chests & Loot spin
    for (const c of this.world.chests) {
      if (!c.opened) c.mesh.position.y = c.y + Math.sin(this.elapsed * 3) * 0.08;
    }
    for (const l of this.world.loots) {
      if (!l.picked) {
        l.mesh.rotation.y += dt * 1.8;
        l.mesh.position.y = l.y + Math.sin(this.elapsed * 3.5) * 0.1;
      }
    }

    // Respawn Creative Practice Targets
    for (const prop of this.world.props) {
      if (!prop.alive && prop.respawnAt && this.elapsed >= prop.respawnAt) {
        prop.alive = true;
        prop.hp = prop.maxHp;
        prop.mesh.visible = true;
        prop.respawnAt = undefined;
      }
    }

    // Update Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].ttl -= dt;
      if (this.tracers[i].ttl <= 0) {
        this.scene.remove(this.tracers[i].mesh);
        this.tracers.splice(i, 1);
      }
    }

    // 1. Sky-Bus & Player Movement
    if (this.inBus) {
      this.busProgress += dt * 0.042;
      this.px = -320 + this.busProgress * 640;
      this.pz = -240 + this.busProgress * 480;
      this.py = 120;
      this.world.skyBus.position.set(this.px, this.py, this.pz);
      this.world.skyBus.rotation.y = Math.atan2(640, 480);
      this.playerRig.root.visible = false;
      if (this.busProgress >= 0.94) {
        this.jumpFromBus();
      }
    } else {
      // Keep sky-bus cruising away visually
      if (this.busProgress < 1.3) {
        this.busProgress += dt * 0.042;
        this.world.skyBus.position.set(-320 + this.busProgress * 640, 120, -240 + this.busProgress * 480);
      this.world.skyBus.children.forEach((c) => { if (c.userData.spin) c.rotation.y += 0.6; });
      } else {
        this.world.skyBus.visible = false;
      }

      if (!this.result) {
        this.updatePlayerMovement(dt);
      }
    }

    // 2. Storm Update (disabled in Creative)
    if (this.mode !== 'creative' && !this.result) {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0) {
        this.stormPhase += 1;
        this.stormTimer = 26;
        this.nextStormRadius = Math.max(12, this.stormRadius * 0.62);
        this.nextStormX = this.stormX + (Math.random() - 0.5) * 38;
        this.nextStormZ = this.stormZ + (Math.random() - 0.5) * 38;
      }
      // Smoothly shrink toward next circle during final 14s of each phase
      if (this.stormTimer < 14) {
        const shrinkRate = dt * 0.14;
        this.stormRadius = THREE.MathUtils.lerp(this.stormRadius, this.nextStormRadius, shrinkRate);
        this.stormX = THREE.MathUtils.lerp(this.stormX, this.nextStormX, shrinkRate);
        this.stormZ = THREE.MathUtils.lerp(this.stormZ, this.nextStormZ, shrinkRate);
      }
      this.world.stormWall.position.set(this.stormX, 75, this.stormZ);
      this.world.stormWall.scale.set(this.stormRadius, 1, this.stormRadius);

      const distFromStormCenter = Math.hypot(this.px - this.stormX, this.pz - this.stormZ);
      if (!this.inBus && distFromStormCenter > this.stormRadius) {
        this.stormTickAccum += dt;
        if (this.stormTickAccum >= 1.0) {
          this.stormTickAccum = 0;
          const stormDmg = Math.min(10, 2 + this.stormPhase);
          this.hp = Math.max(0, this.hp - stormDmg);
          this.damageFlash = 0.25;
          if (this.hp <= 0) this.finishMatch(false, 'The Storm');
        }
      }
    }

    // 3. Bots AI Simulation & Squad Victory Check
    if (!this.result) {
      this.updateBots(dt);
    }

    // 4. Remote Multiplayer Peers Smooth Interpolation
    for (const peer of this.remotePeers.values()) {
      peer.rig.root.position.lerp(this._tmpVec.set(peer.state.x, peer.state.y, peer.state.z), Math.min(1, dt * 14));
      peer.rig.root.rotation.y = peer.state.yaw;
      animateCharacterPose(peer.rig, (peer.state.anim as CharacterAnimState) || 'idle', this.elapsed);
    }

    // 5. Camera Positioning
    this.updateCamera(dt);

    // 6. Network & HUD Throttled Sync
    this.netSyncTimer += dt;
    if (this.netSyncTimer >= 0.065) {
      this.netSyncTimer = 0;
      const curSlot = this.activeSlot >= 0 ? this.slots[this.activeSlot] : null;
      brOnline.sendState({
        username: this.playerName,
        x: Number(this.px.toFixed(2)),
        y: Number(this.py.toFixed(2)),
        z: Number(this.pz.toFixed(2)),
        yaw: Number(this.yaw.toFixed(3)),
        anim: this.computePlayerAnimState(),
        weapon: curSlot ? curSlot.weaponId : 'pickaxe',
        hp: Math.round(this.hp),
        shield: Math.round(this.shield),
        downed: this.downed,
        alive: !this.result,
        inBus: this.inBus,
        loadout: this.playerLoadout
      });
    }

    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }
  }

  private updatePlayerMovement(dt: number) {
    if (!this.playerRig) return;
    this.playerRig.root.visible = true;

    let moveX = this.joyX;
    let moveZ = -this.joyY;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ -= 1;

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    if (len > 0.1 && this.emoteTimer > 0) {
      this.emoteTimer = 0;
      this.activeEmote = null;
    }
    if (this.emoteTimer > 0) {
      this.emoteTimer -= dt;
      if (this.emoteTimer <= 0) this.activeEmote = null;
    }

    const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.crouching && !this.downed;
    if (this.slideTimer > 0) this.slideTimer -= dt;

    const baseSpeed = this.downed
      ? 2.8
      : this.skydiving
      ? this.gliding
        ? 22
        : 18
      : this.slideTimer > 0
      ? 15.5
      : this.crouching
      ? 5.2
      : sprinting
      ? 12.8
      : 8.6;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const worldDirX = moveX * cosY - moveZ * sinY;
    const worldDirZ = -moveX * sinY - moveZ * cosY;

    this.vx = worldDirX * baseSpeed;
    this.vz = worldDirZ * baseSpeed;

    this.px = THREE.MathUtils.clamp(this.px + this.vx * dt, -ISLAND_RADIUS - 18, ISLAND_RADIUS + 18);
    this.pz = THREE.MathUtils.clamp(this.pz + this.vz * dt, -ISLAND_RADIUS - 18, ISLAND_RADIUS + 18);

    // Simple obstacle push-out for solid houses/trees/rocks
    if (this.world && !this.skydiving) {
      for (const prop of this.world.props) {
        if (!prop.alive || prop.kind === 'target') continue;
        if (this.py > prop.y + prop.height - 0.5) continue;
        const dx = this.px - prop.x;
        const dz = this.pz - prop.z;
        const d = Math.hypot(dx, dz);
        const minR = prop.radius + 0.55;
        if (d < minR && d > 0.001) {
          this.px = prop.x + (dx / d) * minR;
          this.pz = prop.z + (dz / d) * minR;
        }
      }
    }

    const groundY = this.getSupportHeightAt(this.px, this.pz, this.py);

    if (this.skydiving) {
      if (this.py - groundY < 32) {
        this.gliding = true;
      }
      this.vy = this.gliding ? -7.8 : -24;
      this.py += this.vy * dt;
      if (this.py <= groundY) {
        this.py = groundY;
        this.vy = 0;
        this.skydiving = false;
        this.gliding = false;
        this.grounded = true;
      }
    } else {
      this.vy -= 28 * dt;
      this.py += this.vy * dt;
      if (this.py <= groundY) {
        this.py = groundY;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }

    // Downed bleedout & nearby teammate auto-revive assist
    if (this.downed) {
      this.bleedTimer -= dt;
      const nearbyMate = this.bots.find(
        (b) => b.isTeammate && b.alive && !b.downed && Math.hypot(b.x - this.px, b.z - this.pz) < 4.5
      );
      if (nearbyMate) {
        this.revivingProgress += dt / 3.0;
        if (this.revivingProgress >= 1) {
          this.downed = false;
          this.hp = 50;
          this.revivingProgress = 0;
          this.pushFeed(`${nearbyMate.name} revived you!`);
          soundEngine.heal(false);
        }
      } else {
        this.revivingProgress = 0;
        if (this.bleedTimer <= 0) {
          this.finishMatch(false, 'Bleedout');
          return;
        }
      }
    }

    // Firing (Mouse or Mobile Touch Shoot)
    if (this.mouseDown || this.touchShoot) {
      this.performPlayerAction();
    }

    // Build Ghost Preview Position
    if (this.buildGhost && this.buildPreview) {
      const fwdX = -Math.sin(this.yaw);
      const fwdZ = -Math.cos(this.yaw);
      const gx = Math.round((this.px + fwdX * (this.buildPreview === 'floor' ? 1.5 : 3.2)) / GRID_SIZE) * GRID_SIZE;
      const gz = Math.round((this.pz + fwdZ * (this.buildPreview === 'floor' ? 1.5 : 3.2)) / GRID_SIZE) * GRID_SIZE;
      const gy = Math.max(groundHeightAt(gx, gz), Math.floor(this.py / 3) * 3);
      const offsetY = this.buildPreview === 'floor' ? 0.15 : this.buildPreview === 'roof' ? 2.4 : 1.6;
      this.buildGhost.position.set(gx, gy + offsetY, gz);
      this.buildGhost.rotation.y = Math.round(this.yaw / (Math.PI / 2)) * (Math.PI / 2);
    }

    this.playerRig.root.position.set(this.px, this.py, this.pz);
    this.playerRig.root.rotation.y = this.yaw + Math.PI;
    animateCharacterPose(
      this.playerRig,
      this.computePlayerAnimState(),
      this.elapsed,
      this.swingTimer,
      this.aimDown || this.mouseDown || this.touchShoot
    );
  }

  private computePlayerAnimState(): CharacterAnimState {
    if (this.downed) return 'downed';
    if (this.skydiving) return this.gliding ? 'glide' : 'skydive';
    if (this.activeEmote) return `emote_${this.activeEmote}` as CharacterAnimState;
    if (this.slideTimer > 0) return 'slide';
    if (!this.grounded) return 'jump';
    if (this.crouching) return 'crouch';
    const spd = Math.hypot(this.vx, this.vz);
    if (spd > 10.2) return 'sprint';
    if (spd > 0.8) return 'run';
    return 'idle';
  }

  private updateBots(dt: number) {
    let aliveCount = 1; // Player
    let aliveEnemyCount = 0;

    for (const bot of this.bots) {
      if (!bot.alive) continue;
      aliveCount += 1;
      if (!bot.isTeammate) aliveEnemyCount += 1;

      if (bot.downed) {
        bot.bleedTimer -= dt;
        if (bot.bleedTimer <= 0) {
          bot.alive = false;
          bot.rig.root.visible = false;
        }
        continue;
      }

      // Storm avoidance & movement
      bot.retargetTimer -= dt;
      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      bot.swingTimer = Math.max(0, bot.swingTimer - dt);

      const distPlayer = Math.hypot(bot.x - this.px, bot.z - this.pz);
      const distStorm = Math.hypot(bot.x - this.stormX, bot.z - this.stormZ);

      if (distStorm > this.stormRadius * 0.85) {
        bot.targetX = this.stormX + (Math.random() - 0.5) * 40;
        bot.targetZ = this.stormZ + (Math.random() - 0.5) * 40;
      } else if (bot.isTeammate) {
        // Teammate follows player or runs to revive downed player!
        bot.targetX = this.px + (this.downed ? 0 : 4.5);
        bot.targetZ = this.pz + (this.downed ? 0 : 4.5);
      } else if (bot.retargetTimer <= 0) {
        bot.retargetTimer = 2.5 + Math.random() * 3.0;
        if (distPlayer < 45 && !this.inBus && !this.skydiving) {
          bot.targetX = this.px + (Math.random() - 0.5) * 14;
          bot.targetZ = this.pz + (Math.random() - 0.5) * 14;
        } else {
          bot.targetX = this.stormX + (Math.random() - 0.5) * Math.min(260, this.stormRadius * 1.1);
          bot.targetZ = this.stormZ + (Math.random() - 0.5) * Math.min(260, this.stormRadius * 1.1);
        }
      }

      const dx = bot.targetX - bot.x;
      const dz = bot.targetZ - bot.z;
      const distTarget = Math.hypot(dx, dz);
      const speed = bot.isTeammate ? 7.6 : 5.4;
      if (distTarget > 2.2) {
        bot.vx = (dx / distTarget) * speed;
        bot.vz = (dz / distTarget) * speed;
        bot.x += bot.vx * dt;
        bot.z += bot.vz * dt;
        bot.yaw = Math.atan2(bot.vx, bot.vz);
      } else {
        bot.vx = 0;
        bot.vz = 0;
      }
      bot.y = Math.max(0.1, groundHeightAt(bot.x, bot.z));

      // Storm damage on bots outside circle
      if (distStorm > this.stormRadius + 4) {
        bot.hp -= dt * 5;
        if (bot.hp <= 0) {
          bot.alive = false;
          bot.rig.root.visible = false;
          continue;
        }
      }

      // Bot Combat (Player engagement or ambient skirmishes)
      if (!bot.isTeammate && !this.inBus && !this.skydiving && distPlayer < 42 && bot.fireCooldown <= 0) {
        // First 3 matches: friendly easy bots (slower fire, gentler aim) so new players learn and win!
        const easyMode = this.matchesPlayed < 3;
        bot.fireCooldown = easyMode ? 1.85 + Math.random() * 1.1 : 0.95 + Math.random() * 0.7;
        bot.yaw = Math.atan2(this.px - bot.x, this.pz - bot.z);
        const hitChance = easyMode ? 0.24 : 0.45;
        const orig = new THREE.Vector3(bot.x, bot.y + 1.4, bot.z);
        const tgt = new THREE.Vector3(
          this.px + (Math.random() - 0.5) * (easyMode ? 3.5 : 1.6),
          this.py + 1.2,
          this.pz + (Math.random() - 0.5) * (easyMode ? 3.5 : 1.6)
        );
        this.spawnTracer(orig, tgt, '#f97316');
        if (Math.random() < hitChance) {
          this.applyPlayerDamage(easyMode ? 5 : 9, bot.name);
        }
      } else if (!bot.isTeammate && bot.fireCooldown <= 0 && Math.random() < 0.004 * dt * 60) {
        // Ambient background eliminations so the 100-player lobby progresses dynamically like a real match!
        const rival = this.bots.find(
          (o) => o.alive && !o.isTeammate && o.teamId !== bot.teamId && Math.hypot(o.x - bot.x, o.z - bot.z) < 55
        );
        if (rival) {
          bot.fireCooldown = 1.4;
          this.damageBot(rival, 28, false);
        }
      }

      // Teammate AI helps shoot nearby enemies!
      if (bot.isTeammate && bot.fireCooldown <= 0) {
        const enemy = this.bots.find((o) => o.alive && !o.isTeammate && Math.hypot(o.x - bot.x, o.z - bot.z) < 38);
        if (enemy) {
          bot.fireCooldown = 1.1;
          bot.yaw = Math.atan2(enemy.x - bot.x, enemy.z - bot.z);
          this.spawnTracer(
            new THREE.Vector3(bot.x, bot.y + 1.4, bot.z),
            new THREE.Vector3(enemy.x, enemy.y + 1.2, enemy.z),
            '#38bdf8'
          );
          this.damageBot(enemy, 22, false);
        }
      }

      // Render only bots within 140m for smooth framerate
      const show = distPlayer < 140;
      bot.rig.root.visible = show;
      if (show) {
        bot.rig.root.position.set(bot.x, bot.y, bot.z);
        bot.rig.root.rotation.y = bot.yaw;
        const anim: CharacterAnimState = bot.downed ? 'downed' : distTarget > 2.2 ? 'run' : 'idle';
        animateCharacterPose(bot.rig, anim, this.elapsed + bot.jumpTime, bot.swingTimer);
      }
    }

    if (this.mode !== 'creative' && aliveEnemyCount === 0 && this.remotePeers.size === 0 && aliveCount >= 1) {
      this.finishMatch(true);
    }
  }

  private updateCamera(dt: number) {
    const targetFov = this.aimDown ? 42 : this.slideTimer > 0 ? 70 : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 14));
      this.camera.updateProjectionMatrix();
    }

    if (this.inBus) {
      this._camPos.set(this.px - 22, this.py + 12, this.pz - 22);
      this._camLook.set(this.px, this.py + 2, this.pz);
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._camLook);
      return;
    }

    const camDist = this.skydiving ? 7.8 : this.aimDown ? 2.9 : 5.4;
    const shoulder = this.skydiving ? 0 : this.aimDown ? 0.85 : 0.72;
    const heightOff = this.crouching || this.downed ? 1.45 : 2.15;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);

    this._camPos.set(
      this.px + sinY * cosP * camDist + cosY * shoulder,
      Math.max(groundHeightAt(this.px, this.pz) + 0.6, this.py + heightOff + sinP * camDist),
      this.pz + cosY * cosP * camDist - sinY * shoulder
    );

    this._camLook.set(
      this.px - sinY * 14 + cosY * shoulder * 0.4,
      this.py + heightOff - sinP * 8,
      this.pz - cosY * 14 - sinY * shoulder * 0.4
    );

    this.camera.position.lerp(this._camPos, Math.min(1, dt * 22));
    this.camera.lookAt(this._camLook);
  }

  private emitHud() {
    const actors: MinimapActor[] = [];
    if (this.inBus) {
      actors.push({ x: this.px, z: this.pz, kind: 'bus' });
    }
    let aliveCount = 1;
    for (const b of this.bots) {
      if (!b.alive) continue;
      aliveCount += 1;
      if (b.isTeammate) {
        actors.push({ x: b.x, z: b.z, kind: 'teammate', downed: b.downed });
      } else if (Math.hypot(b.x - this.px, b.z - this.pz) < 110) {
        actors.push({ x: b.x, z: b.z, kind: 'enemy' });
      }
    }
    for (const peer of this.remotePeers.values()) {
      if (peer.state.alive) {
        aliveCount += 1;
        actors.push({ x: peer.state.x, z: peer.state.z, kind: 'enemy' });
      }
    }

    let nearbyPrompt: string | null = null;
    if (this.world && !this.inBus && !this.skydiving && !this.downed) {
      const downedMate = this.bots.find(
        (b) => b.isTeammate && b.alive && b.downed && Math.hypot(b.x - this.px, b.z - this.pz) < 4.5
      );
      if (downedMate) {
        nearbyPrompt = `[F] Revive ${downedMate.name}`;
      } else {
        const chest = this.world.chests.find((c) => !c.opened && Math.hypot(c.x - this.px, c.z - this.pz) < 4.2);
        if (chest) {
          nearbyPrompt = '[F] Open Golden Chest';
        } else {
          const loot = this.world.loots.find((l) => !l.picked && Math.hypot(l.x - this.px, l.z - this.pz) < 4.2);
          if (loot) {
            nearbyPrompt = `[F] Pick up ${WEAPONS[loot.weaponId].name}`;
          }
        }
      }
    }

    const zone = zoneAtPosition(this.px, this.pz);
    const inStorm =
      this.mode !== 'creative' && !this.inBus && Math.hypot(this.px - this.stormX, this.pz - this.stormZ) > this.stormRadius;

    this.onHudUpdate({
      inMatch: this.inMatch,
      mode: this.mode,
      hp: Math.round(this.hp),
      shield: Math.round(this.shield),
      downed: this.downed,
      revivingProgress: this.revivingProgress,
      aliveCount: this.mode === 'creative' ? 1 : aliveCount,
      totalCount: this.mode === 'creative' ? 1 : 100,
      kills: this.kills,
      inBus: this.inBus,
      skydiving: this.skydiving,
      gliding: this.gliding,
      zoneName: zone.name,
      stormPhase: this.stormPhase,
      stormTimer: Math.max(0, Math.ceil(this.stormTimer)),
      inStorm,
      stormX: this.stormX,
      stormZ: this.stormZ,
      stormRadius: this.stormRadius,
      nextStormX: this.nextStormX,
      nextStormZ: this.nextStormZ,
      nextStormRadius: this.nextStormRadius,
      playerX: this.px,
      playerY: this.py,
      playerZ: this.pz,
      playerYaw: this.yaw,
      materials: { ...this.materials },
      selectedMaterial: this.selectedMaterial,
      slots: this.slots.map((s) => (s ? { ...s } : null)),
      activeSlot: this.activeSlot,
      buildPreview: this.buildPreview,
      nearbyPrompt,
      hitmarker: this.hitmarker,
      damageFlash: this.damageFlash,
      killFeed: [...this.killFeed],
      actors,
      pointerLocked: this.pointerLocked,
      activeEmote: this.activeEmote,
      result: this.result
    });
  }

  // ===== Event Listeners =====
  private handleResize = () => this.resize();

  public resize() {
    const w = this.canvas.clientWidth || window.innerWidth || 1280;
    const h = this.canvas.clientHeight || window.innerHeight || 720;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.inMatch) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.keys.add(e.code);

    if (e.code === 'Space') {
      e.preventDefault();
      this.triggerJump();
    } else if (e.code === 'KeyF') {
      this.triggerInteract();
    } else if (e.code === 'KeyC' || e.code === 'ControlLeft') {
      this.triggerCrouchOrSlide();
    } else if (e.code === 'KeyR' && this.activeSlot >= 0 && this.slots[this.activeSlot]) {
      const def = WEAPONS[this.slots[this.activeSlot]!.weaponId];
      if (def.kind === 'gun') this.reloadTimer = def.reloadTime;
    } else if (e.code === 'KeyQ') {
      this.triggerBuildPiece('wall');
    } else if (e.code === 'KeyE') {
      this.triggerBuildPiece('ramp');
    } else if (e.code === 'KeyZ') {
      this.triggerBuildPiece('floor');
    } else if (e.code === 'KeyX') {
      this.triggerBuildPiece('roof');
    } else if (e.code === 'Backquote' || e.code === 'Digit0' || e.code === 'KeyG') {
      this.selectSlot(-1);
    } else if (e.code === 'Digit1') this.selectSlot(0);
    else if (e.code === 'Digit2') this.selectSlot(1);
    else if (e.code === 'Digit3') this.selectSlot(2);
    else if (e.code === 'Digit4') this.selectSlot(3);
    else if (e.code === 'Digit5') this.selectSlot(4);
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.inMatch) return;
    if (document.pointerLockElement === this.canvas || this.mouseDown) {
      this.yaw -= e.movementX * 0.0032;
      this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * 0.0026, -0.55, 1.05);
    }
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.inMatch || this.result) return;
    if (e.target !== this.canvas) return;
    if (!this.isMobile && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock?.();
    }
    if (e.button === 0) {
      this.mouseDown = true;
      this.performPlayerAction();
    } else if (e.button === 2) {
      this.aimDown = true;
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 2) this.aimDown = false;
  };

  private handlePointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    this.emitHud();
  };

  private handleContextMenu = (e: MouseEvent) => {
    if (this.inMatch) e.preventDefault();
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (!this.inMatch || e.target !== this.canvas) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX > window.innerWidth * 0.35 && this.dragTouchId === null) {
        this.dragTouchId = t.identifier;
        this.lastTouchX = t.clientX;
        this.lastTouchY = t.clientY;
      }
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (!this.inMatch || this.dragTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.dragTouchId) {
        const dx = t.clientX - this.lastTouchX;
        const dy = t.clientY - this.lastTouchY;
        this.lastTouchX = t.clientX;
        this.lastTouchY = t.clientY;
        this.yaw -= dx * 0.0052;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0042, -0.55, 1.05);
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.dragTouchId) {
        this.dragTouchId = null;
      }
    }
  };

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.rafId);
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lastTime = performance.now();
      this.loop(this.lastTime);
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    if (this.unsubscribeNet) this.unsubscribeNet();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
