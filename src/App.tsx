import { useEffect, useRef, useState } from 'react';
import *
 as THREE from 'three';

type MapTheme = {
  name: string;
  subtitle: string;
  distance: string;
  laps: number;
  sky: number;
  ground: number;
  road: number;
  accent: number;
  shape: 'oval' | 'city' | 'figure' | 'mountain';
};

const maps: MapTheme[] = [
  { name: 'Sunset Speedway', subtitle: 'Fast oval · Evening', distance: '3.2 KM', laps: 3, sky: 0xd96531, ground: 0x8a6947, road: 0x25262a, accent: 0xf59e0b, shape: 'oval' },
  { name: 'Neon District', subtitle: 'Technical street circuit', distance: '4.8 KM', laps: 3, sky: 0x17132e, ground: 0x111827, road: 0x17191f, accent: 0x06b6d4, shape: 'city' },
  { name: 'Alpine Pass', subtitle: 'Mountain switchbacks', distance: '5.6 KM', laps: 2, sky: 0x77b5d9, ground: 0x4d6550, road: 0x46474b, accent: 0x10b981, shape: 'mountain' },
  { name: 'Diamond Ring', subtitle: 'Figure-eight challenge', distance: '3.9 KM', laps: 4, sky: 0x7d93ac, ground: 0x9e9b79, road: 0x303137, accent: 0xef4444, shape: 'figure' },
];

function buildTrack(shape: MapTheme['shape']): THREE.CatmullRomCurve3 {
  let points: THREE.Vector3[];
  if (shape === 'oval') {
    points = Array.from({ length: 24 }, (_, i) => {
      const a = i / 24 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 48, 0, Math.sin(a) * 27);
    });
  } else if (shape === 'city') {
    points = [
      [-36,-24],[18,-25],[34,-12],[28,18],[10,25],[-18,20],[-38,8],[-36,-24]
    ].map(([x,z]) => new THREE.Vector3(x, 0, z));
  } else if (shape === 'mountain') {
    points = Array.from({ length: 28 }, (_, i) => {
      const a = i / 28 * Math.PI * 2;
      const r = 32 + Math.sin(a * 3) * 8;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 2) * 2, Math.sin(a) * r);
    });
  } else {
    points = [
      [-48,-4],[-30,-20],[0,-18],[22,-4],[44,-4],[22,4],[0,18],[-30,20],[-48,4],[-48,-4]
    ].map(([x,z]) => new THREE.Vector3(x, 0, z));
  }
  return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.12);
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [lap, setLap] = useState(1);
  const map = maps[selected];

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    mount.innerHTML = '';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(map.sky);
    scene.fog = new THREE.Fog(map.sky, 55, 150);
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 300);
    camera.position.set(-58, 38, 58);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffe0bd, 0x334455, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(-30, 60, 20);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ color: map.ground, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    scene.add(ground);

    const curve = buildTrack(map.shape);
    const roadPoints = curve.getSpacedPoints(240);
    const roadGeometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const width = 9;

    roadPoints.forEach((point, i) => {
      const next = roadPoints[(i + 1) % roadPoints.length];
      const tangent = next.clone().sub(point).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      vertices.push(point.x + side.x * width, 0.02, point.z + side.z * width);
      vertices.push(point.x - side.x * width, 0.02, point.z - side.z * width);
      if (i < roadPoints.length - 1) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    });
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeometry.setIndex(indices);
    roadGeometry.computeVertexNormals();
    scene.add(new THREE.Mesh(roadGeometry, new THREE.MeshStandardMaterial({ color: map.road, roughness: 0.85 })));

    const curbPositions: number[] = [];
    roadPoints.forEach((point, i) => {
      if (i % 5 !== 0) return;
      const next = roadPoints[(i + 1) % roadPoints.length];
      const tangent = next.clone().sub(point).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      curbPositions.push(point.x + side.x * 9.7, point.z + side.z * 9.7,
        point.x - side.x * 9.7, point.z - side.z * 9.7);
    });
    const curbMaterial = new THREE.MeshBasicMaterial({ color: i % 2 ? map.accent : 0xffffff });

    for (let i = 0; i < curbPositions.length; i += 2) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.5), curbMaterial);
      curb.position.set(curbPositions[i], 0.12, curbPositions[i + 1]);
      scene.add(curb);
    }

    const car = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.7, 4.2),
      new THREE.MeshStandardMaterial({ color: map.accent, metalness: 0.45, roughness: 0.32 })
    );
    body.position.y = 0.7;
    car.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.62, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.6, roughness: 0.18 })
    );
    cabin.position.set(0, 1.35, -0.15);
    car.add(cabin);
    [[-1.15,.45,-1.35],[1.15,.45,-1.35],[-1.15,.45,1.35],[1.15,.45,1.35]].forEach(([x,y,z]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.32,12), new THREE.MeshStandardMaterial({ color: 0x090909 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x,y,z);
      car.add(wheel);
    });
    scene.add(car);

    let progress = 0;
    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      if (started) progress += dt * 0.018;
      const position = curve.getPointAt(progress % 1);
      const tangent = curve.getTangentAt(progress % 1);
      car.position.copy(position);
      car.position.y = 0;
      car.rotation.y = Math.atan2(tangent.x, tangent.z);

      if (started) {
        const desired = position.clone().add(tangent.clone().multiplyScalar(-12)).add(new THREE.Vector3(0,7,0));
        camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
        camera.lookAt(position.clone().add(tangent.clone().multiplyScalar(5)).add(new THREE.Vector3(0,1,0)));
      }
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      mount.innerHTML = '';
    };
  }, [map, started]);

  useEffect(() => {
    if (!started) return;
    const timer = window.setInterval(() => {
      setSpeed(v => {
        const next = v < 168 ? v + 7 : 168;
        return next;
      });
    }, 80);
    return () => clearInterval(timer);
  }, [started]);

  return (
    <main className="game">
      <div ref={mountRef} className="canvas" />
      <section className={`panel ${started ? 'racing' : ''}`}>
        {!started ? (
          <>
            <header className="topbar">
              <div className="brand">APEX <span>RUSH</span></div>
              <div className="level">MAP SELECT</div>
            </header>
            <div className="map-picker">
              <div>
                <p className="eyebrow">RACE LOCATION</p>
                <h1>{map.name}</h1>
                <p className="subtitle">{map.subtitle}</p>
                <div className="details">
                  <span><b>{map.distance}</b> DISTANCE</span>
                  <span><b>{map.laps}</b> LAPS</span>
                </div>
              </div>
              <button className="launch" onClick={() => { setSpeed(0); setLap(1); setStarted(true); }}>
                RACE NOW <span>›</span>
              </button>
            </div>
            <div className="map-list">
              {maps.map((item, index) => (
                <button key={item.name} className={index === selected ? 'active' : ''} onClick={() => setSelected(index)}>
                  <div className="map-number">0{index + 1}</div>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="race-top">
              <div><span>POSITION</span><strong>1 / 6</strong></div>
              <div><span>LAP</span><strong>{lap} / {map.laps}</strong></div>
            </div>
            <button className="exit" onClick={() => setStarted(false)}>EXIT RACE</button>
            <div className="speedometer">
              <strong>{speed}</strong>
              <span>MPH</span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
