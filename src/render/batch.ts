import {
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Scene,
  Vector3,
} from "three";
import { EARTH_RADIUS_KM, enuBasis, latLonToXyz } from "../math/geodesy.ts";

export interface MarkerItem {
  id: string;
  lat: number;
  lon: number;
  altKm: number;
  color: number;
  sizeKm: number;
  headingDeg?: number;
}

export class MarkerBatch {
  mesh: InstancedMesh | null = null;
  ids: string[] = [];
  private capacity = 0;
  private readonly material = new MeshBasicMaterial({ color: 0xffffff });
  private readonly dummy = new Object3D();
  private readonly tint = new Color();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly forward = new Vector3();
  private readonly basis = new Matrix4();
  private readonly scene: Scene;
  readonly layer: string;
  private readonly geometry: BufferGeometry;
  private readonly mode: "sphere" | "chevron";

  constructor(scene: Scene, layer: string, geometry: BufferGeometry, mode: "sphere" | "chevron") {
    this.scene = scene;
    this.layer = layer;
    this.geometry = geometry;
    this.mode = mode;
    this.material.depthWrite = true;
  }

  set(items: MarkerItem[]): void {
    this.ensure(items.length);
    const mesh = this.mesh;
    if (!mesh) return;
    this.ids = items.map((item) => item.id);
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]!;
      const position = latLonToXyz(item.lat, item.lon, item.altKm, EARTH_RADIUS_KM);
      this.dummy.position.set(position.x, position.y, position.z);
      if (this.mode === "chevron") {
        this.orient(item.lat, item.lon, item.headingDeg ?? 0);
        const length = Math.max(8, item.sizeKm);
        this.dummy.scale.set(length * 0.22, length * 0.16, length);
      } else {
        this.dummy.quaternion.identity();
        const radius = Math.max(4, item.sizeKm);
        this.dummy.scale.set(radius, radius, radius);
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      mesh.setColorAt(i, this.tint.setHex(item.color));
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = items.length > 0;
  }

  private ensure(count: number): void {
    if (count <= this.capacity && this.mesh) return;
    const next = Math.max(32, this.capacity || 32, count);
    let grown = next;
    while (grown < count) grown *= 2;
    const mesh = new InstancedMesh(this.geometry, this.material, grown);
    mesh.frustumCulled = false;
    mesh.userData.layer = this.layer;
    this.scene.add(mesh);
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = mesh;
    this.capacity = grown;
  }

  private orient(lat: number, lon: number, headingDeg: number): void {
    const frame = enuBasis(lat, lon);
    const heading = (headingDeg * Math.PI) / 180;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    this.forward.set(
      frame.north.x * cos + frame.east.x * sin,
      frame.north.y * cos + frame.east.y * sin,
      frame.north.z * cos + frame.east.z * sin,
    );
    this.up.set(frame.up.x, frame.up.y, frame.up.z);
    this.right.crossVectors(this.forward, this.up).normalize();
    this.forward.crossVectors(this.up, this.right).normalize();
    this.basis.makeBasis(this.right, this.up, this.forward);
    this.dummy.quaternion.setFromRotationMatrix(this.basis);
  }
}
