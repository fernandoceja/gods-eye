import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { EARTH_RADIUS_KM, latLonToXyz, xyzToLatLon } from "../math/geodesy.ts";
import { SOCAL_BOX, UPLAND } from "../places.ts";
import { directionFor, rotateWithDirection } from "../track.ts";
import { MarkerBatch, type MarkerItem } from "./batch.ts";

export interface TrailPath {
  iss: boolean;
  points: { lat: number; lon: number; altKm: number }[];
}

export interface TrackPath {
  color: number;
  points: { lat: number; lon: number }[];
}

export interface PickHit {
  layer: string;
  id: string;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export class GlobeView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly sun: DirectionalLight;
  private readonly earth: Mesh;
  private readonly earthMat: MeshPhongMaterial;
  private readonly textures = new Map<string, Texture>();
  private readonly loader = new TextureLoader();
  private readonly batches = new Map<string, MarkerBatch>();
  private readonly trailGeometry = new BufferGeometry();
  private readonly trails: LineSegments;
  private readonly trackGeometry = new BufferGeometry();
  private readonly tracks: LineSegments;
  private readonly followGeometry = new BufferGeometry();
  private readonly followTrail: LineSegments;
  private followDir: Vector3 | null = null;
  onFollowInterrupt: (() => void) | null = null;
  private readonly box: LineSegments;
  private readonly ring: Mesh;
  private flightState: { from: Vector3; to: Vector3; start: number; dur: number } | null = null;
  private currentTexture: Texture | null = null;
  private imageryOn = true;
  private simTime = Date.now();
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new Color(0x07080c);

    this.camera = new PerspectiveCamera(42, 1, 1, EARTH_RADIUS_KM * 80);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.45;
    this.controls.zoomSpeed = 0.7;
    this.controls.minDistance = EARTH_RADIUS_KM * 1.06;
    this.controls.maxDistance = EARTH_RADIUS_KM * 14;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("start", () => {
      this.flightState = null;
      if (this.followDir) {
        this.followDir = null;
        this.onFollowInterrupt?.();
      }
    });

    this.earthMat = new MeshPhongMaterial({
      color: 0x8fb4d4,
      emissive: 0x123044,
      emissiveIntensity: 0.55,
      specular: 0x1c2c3d,
      shininess: 10,
    });
    this.earth = new Mesh(new SphereGeometry(EARTH_RADIUS_KM, 96, 64), this.earthMat);
    this.earth.userData.layer = "earth";
    this.scene.add(this.earth);

    const glow = new Mesh(
      new SphereGeometry(EARTH_RADIUS_KM * 1.055, 64, 48),
      new ShaderMaterial({
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            vec3 viewDir = normalize(cameraPosition - vWorld);
            float fres = pow(1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0), 2.5);
            vec3 color = mix(vec3(0.22, 0.45, 0.82), vec3(0.86, 0.93, 1.0), fres);
            gl_FragColor = vec4(color, fres * 0.95);
          }
        `,
      }),
    );
    this.scene.add(glow);

    this.scene.add(new AmbientLight(0x9eb4d4, 0.55));
    this.sun = new DirectionalLight(0xfff2dd, 1.15);
    this.scene.add(this.sun);

    this.addStars();

    const cone = new ConeGeometry(0.45, 1, 5);
    cone.rotateX(Math.PI / 2);
    cone.translate(0, 0, 0.15);
    const sphere = new SphereGeometry(1, 14, 10);
    this.batches.set("quakes", new MarkerBatch(this.scene, "quakes", sphere, "sphere"));
    this.batches.set("fires", new MarkerBatch(this.scene, "fires", sphere, "sphere"));
    this.batches.set("events", new MarkerBatch(this.scene, "events", sphere, "sphere"));
    this.batches.set("satellites", new MarkerBatch(this.scene, "satellites", sphere, "sphere"));
    this.batches.set("flights", new MarkerBatch(this.scene, "flights", cone, "chevron"));
    this.batches.set("cameras", new MarkerBatch(this.scene, "cameras", sphere, "sphere"));

    this.trails = new LineSegments(
      this.trailGeometry,
      new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
    );
    this.trails.frustumCulled = false;
    this.scene.add(this.trails);

    this.tracks = new LineSegments(
      this.trackGeometry,
      new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }),
    );
    this.tracks.frustumCulled = false;
    this.scene.add(this.tracks);

    this.followTrail = new LineSegments(
      this.followGeometry,
      new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }),
    );
    this.followTrail.frustumCulled = false;
    this.scene.add(this.followTrail);

    this.box = this.makeBox();
    this.scene.add(this.box);

    this.ring = new Mesh(
      new TorusGeometry(1, 0.08, 8, 28),
      new MeshBasicMaterial({ color: 0xf0d7a4 }),
    );
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.addUplandPin();

    const far = latLonToXyz(16, -130, 0, 1);
    this.camera.position.set(far.x * EARTH_RADIUS_KM * 8, far.y * EARTH_RADIUS_KM * 8, far.z * EARTH_RADIUS_KM * 8);
    this.camera.lookAt(0, 0, 0);
    this.flyTo(16, -130, EARTH_RADIUS_KM * 3.25, reducedMotion ? 1 : 1700);
    this.resize();
  }

  setMarkers(layer: string, items: MarkerItem[]): void {
    this.batches.get(layer)?.set(items);
  }

  setTrails(paths: TrailPath[]): void {
    this.writeLines(
      this.trailGeometry,
      paths.map((path) => ({
        color: path.iss ? 0xffd089 : 0x9eb6ee,
        altKm: null,
        points: path.points,
      })),
    );
  }

  setTracks(paths: TrackPath[]): void {
    this.writeLines(
      this.trackGeometry,
      paths.map((path) => ({ color: path.color, altKm: 30, points: path.points.map((point) => ({ ...point, altKm: 30 })) })),
    );
  }

  setFollowTrail(points: { lat: number; lon: number; altKm: number }[], color: number): void {
    this.writeLines(this.followGeometry, points.length > 1 ? [{ color, points }] : []);
  }

  /**
   * Keep a moving target centred: rotate the camera by the target's own move
   * since the last call. During a fly-to, only the direction is remembered,
   * so the follow takes over seamlessly when the flight lands.
   */
  followTo(lat: number, lon: number): void {
    const dir = directionFor(lat, lon);
    const next = new Vector3(dir.x, dir.y, dir.z);
    if (this.followDir && !this.flightState) {
      const rotated = rotateWithDirection(
        { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        { x: this.followDir.x, y: this.followDir.y, z: this.followDir.z },
        { x: next.x, y: next.y, z: next.z },
      );
      this.camera.position.set(rotated.x, rotated.y, rotated.z);
    }
    this.followDir = next;
  }

  stopFollow(): void {
    this.followDir = null;
  }

  setBoxVisible(visible: boolean): void {
    this.box.visible = visible;
  }

  setImageryVisible(visible: boolean): void {
    this.imageryOn = visible;
    if (visible && this.currentTexture) this.applyTexture(this.currentTexture);
    else if (!visible) {
      this.earthMat.map = null;
      this.earthMat.emissiveMap = null;
      this.earthMat.color.setHex(0x16324d);
      this.earthMat.emissive.setHex(0x0c2033);
      this.earthMat.emissiveIntensity = 0.7;
      this.earthMat.needsUpdate = true;
    }
  }

  setEarthImage(date: string, objectUrl: string): Promise<void> {
    const cached = this.textures.get(date);
    if (cached) {
      this.applyTexture(cached);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.loader.load(
        objectUrl,
        (texture) => {
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          this.textures.set(date, texture);
          this.applyTexture(texture);
          resolve();
        },
        undefined,
        () => reject(new Error("GIBS image failed to decode")),
      );
    });
  }

  setSelection(item: { lat: number; lon: number; altKm: number; sizeKm: number } | null): void {
    if (!item) {
      this.ring.visible = false;
      return;
    }
    const position = latLonToXyz(item.lat, item.lon, item.altKm, EARTH_RADIUS_KM);
    this.ring.position.set(position.x, position.y, position.z);
    this.ring.lookAt(0, 0, 0);
    const radius = Math.max(18, item.sizeKm * 1.7);
    this.ring.scale.set(radius, radius, radius);
    this.ring.visible = true;
  }

  setSunTime(ms: number): void {
    this.simTime = ms;
  }

  flyHome(): void {
    this.flyTo(UPLAND.lat, UPLAND.lon, EARTH_RADIUS_KM * 2.05, reducedMotion ? 1 : 1500);
  }

  flyTo(lat: number, lon: number, distanceKm: number, dur = 1400): void {
    const dir = latLonToXyz(lat, lon, 0, 1);
    this.flightState = {
      from: this.camera.position.clone(),
      to: new Vector3(dir.x * distanceKm, dir.y * distanceKm, dir.z * distanceKm),
      start: performance.now(),
      dur: Math.max(1, dur),
    };
  }

  pick(clientX: number, clientY: number): PickHit | null {
    this.setPointer(clientX, clientY);
    const meshes: Mesh[] = [];
    for (const batch of this.batches.values()) {
      if (batch.mesh && batch.mesh.visible) meshes.push(batch.mesh);
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    const hit = hits.find((item) => item.instanceId != null);
    if (!hit || hit.instanceId == null) return null;
    const layer = String(hit.object.userData.layer ?? "");
    const batch = this.batches.get(layer);
    const id = batch?.ids[hit.instanceId];
    if (!batch || !id) return null;
    return { layer, id };
  }

  groundAt(clientX: number, clientY: number): { lat: number; lon: number } | null {
    this.setPointer(clientX, clientY);
    const hits = this.raycaster.intersectObjects([this.earth], false);
    const hit = hits[0];
    if (!hit) return null;
    const geo = xyzToLatLon({ x: hit.point.x, y: hit.point.y, z: hit.point.z });
    return { lat: geo.lat, lon: geo.lon };
  }

  project(lat: number, lon: number, altKm: number): ScreenPoint {
    const position = latLonToXyz(lat, lon, altKm, EARTH_RADIUS_KM);
    const world = new Vector3(position.x, position.y, position.z);
    const toward = world.clone().normalize();
    const cameraDir = this.camera.position.clone().normalize();
    world.project(this.camera);
    const visible = world.z < 1 && toward.dot(cameraDir) > 0.12;
    return {
      x: (world.x * 0.5 + 0.5) * this.width,
      y: (-world.y * 0.5 + 0.5) * this.height,
      visible,
    };
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    this.width = Math.max(1, canvas.clientWidth);
    this.height = Math.max(1, canvas.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  frame(now: number): void {
    this.applyFlight(now);
    this.placeSun();
    if (!this.flightState) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private applyTexture(texture: Texture): void {
    this.currentTexture = texture;
    if (!this.imageryOn) return;
    this.earthMat.color.setHex(0xffffff);
    this.earthMat.emissive.setHex(0xffffff);
    this.earthMat.emissiveIntensity = 0.42;
    this.earthMat.map = texture;
    this.earthMat.emissiveMap = texture;
    this.earthMat.needsUpdate = true;
  }

  private applyFlight(now: number): void {
    const flight = this.flightState;
    if (!flight) return;
    const t = Math.min(1, (now - flight.start) / flight.dur);
    const k = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    const fromDir = flight.from.clone().normalize();
    const toDir = flight.to.clone().normalize();
    const dir = fromDir.lerp(toDir, k);
    if (dir.length() < 1e-5) dir.copy(toDir);
    dir.normalize();
    const distance = flight.from.length() + (flight.to.length() - flight.from.length()) * k;
    this.camera.position.copy(dir.multiplyScalar(distance));
    this.camera.lookAt(0, 0, 0);
    if (t >= 1) this.flightState = null;
  }

  private placeSun(): void {
    const date = new Date(this.simTime);
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const day = Math.floor((this.simTime - start) / 86_400_000);
    const decl = 23.44 * Math.sin((2 * Math.PI * (day - 81)) / 365);
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    let lon = (12 - hours) * 15;
    lon = ((lon + 540) % 360) - 180;
    const position = latLonToXyz(decl, lon, 0, EARTH_RADIUS_KM * 8);
    this.sun.position.set(position.x, position.y, position.z);
  }

  private setPointer(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private addStars(): void {
    const count = 1600;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = EARTH_RADIUS_KM * (28 + Math.random() * 36);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const stars = new Points(
      geometry,
      new PointsMaterial({ color: 0xd5deee, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.8 }),
    );
    stars.frustumCulled = false;
    this.scene.add(stars);
  }

  private addUplandPin(): void {
    const position = latLonToXyz(UPLAND.lat, UPLAND.lon, 20, EARTH_RADIUS_KM);
    const pin = new Mesh(new SphereGeometry(16, 12, 10), new MeshBasicMaterial({ color: 0xf0c36a }));
    pin.position.set(position.x, position.y, position.z);
    this.scene.add(pin);
  }

  private makeBox(): LineSegments {
    const corners: [number, number][] = [
      [SOCAL_BOX.lamin, SOCAL_BOX.lomin],
      [SOCAL_BOX.lamin, SOCAL_BOX.lomax],
      [SOCAL_BOX.lamax, SOCAL_BOX.lomax],
      [SOCAL_BOX.lamax, SOCAL_BOX.lomin],
    ];
    const positions: number[] = [];
    for (let edge = 0; edge < corners.length; edge += 1) {
      const start = corners[edge]!;
      const end = corners[(edge + 1) % corners.length]!;
      const steps = 20;
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const p0 = latLonToXyz(start[0] + (end[0] - start[0]) * t0, start[1] + (end[1] - start[1]) * t0, 18, EARTH_RADIUS_KM);
        const p1 = latLonToXyz(start[0] + (end[0] - start[0]) * t1, start[1] + (end[1] - start[1]) * t1, 18, EARTH_RADIUS_KM);
        positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const line = new LineSegments(
      geometry,
      new LineBasicMaterial({ color: 0x8fd6b4, transparent: true, opacity: 0.55 }),
    );
    line.frustumCulled = false;
    line.visible = false;
    return line;
  }

  private writeLines(
    geometry: BufferGeometry,
    paths: { color: number; points: { lat: number; lon: number; altKm: number }[] }[],
  ): void {
    let segments = 0;
    for (const path of paths) segments += Math.max(0, path.points.length - 1);
    const positions = new Float32Array(Math.max(2, segments) * 2 * 3);
    const colors = new Float32Array(Math.max(2, segments) * 2 * 3);
    let vertex = 0;
    for (const path of paths) {
      const red = ((path.color >> 16) & 255) / 255;
      const green = ((path.color >> 8) & 255) / 255;
      const blue = (path.color & 255) / 255;
      for (let i = 0; i < path.points.length - 1; i += 1) {
        const fadeA = 0.25 + 0.75 * (i / path.points.length);
        const fadeB = 0.25 + 0.75 * ((i + 1) / path.points.length);
        const a = path.points[i]!;
        const b = path.points[i + 1]!;
        const pa = latLonToXyz(a.lat, a.lon, a.altKm, EARTH_RADIUS_KM);
        const pb = latLonToXyz(b.lat, b.lon, b.altKm, EARTH_RADIUS_KM);
        writeVertex(positions, colors, vertex, pa, red * fadeA, green * fadeA, blue * fadeA);
        vertex += 1;
        writeVertex(positions, colors, vertex, pb, red * fadeB, green * fadeB, blue * fadeB);
        vertex += 1;
      }
    }
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.setDrawRange(0, vertex);
  }
}

function writeVertex(
  positions: Float32Array,
  colors: Float32Array,
  index: number,
  point: { x: number; y: number; z: number },
  red: number,
  green: number,
  blue: number,
): void {
  positions[index * 3] = point.x;
  positions[index * 3 + 1] = point.y;
  positions[index * 3 + 2] = point.z;
  colors[index * 3] = red;
  colors[index * 3 + 1] = green;
  colors[index * 3 + 2] = blue;
}
