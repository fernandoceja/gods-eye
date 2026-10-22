declare module "three" {
  export const SRGBColorSpace: string;
  export const AdditiveBlending: number;
  export const NormalBlending: number;
  export const FrontSide: number;
  export const BackSide: number;
  export const DoubleSide: number;

  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
    set(x: number, y: number): this;
  }

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
    clone(): Vector3;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    normalize(): this;
    multiplyScalar(s: number): this;
    length(): number;
    setScalar(s: number): this;
    addScaledVector(v: Vector3, s: number): this;
    lerp(v: Vector3, alpha: number): this;
    dot(v: Vector3): number;
    crossVectors(a: Vector3, b: Vector3): this;
    lerpVectors(a: Vector3, b: Vector3, t: number): this;
    applyMatrix4(m: Matrix4): this;
    project(camera: Camera): this;
    setFromMatrixPosition(m: Matrix4): this;
  }

  export class Quaternion {
    constructor(x?: number, y?: number, z?: number, w?: number);
    x: number;
    y: number;
    z: number;
    w: number;
    identity(): this;
    setFromRotationMatrix(m: Matrix4): this;
    copy(q: Quaternion): this;
  }

  export class Matrix4 {
    compose(position: Vector3, quaternion: Quaternion, scale: Vector3): this;
    makeBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): this;
    copy(m: Matrix4): this;
    identity(): this;
  }

  export class Color {
    constructor(hex?: number);
    r: number;
    g: number;
    b: number;
    setHex(hex: number): this;
  }

  export class Euler {
    set(x: number, y: number, z: number, order?: string): this;
  }

  export class BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number);
    array: ArrayLike<number>;
    needsUpdate: boolean;
    count: number;
  }

  export class Float32BufferAttribute extends BufferAttribute {}

  export class BufferGeometry {
    setAttribute(name: string, attribute: BufferAttribute): this;
    getAttribute(name: string): BufferAttribute;
    setDrawRange(start: number, count: number): void;
    rotateX(angle: number): this;
    translate(x: number, y: number, z: number): this;
    dispose(): void;
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }

  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number);
  }

  export class TorusGeometry extends BufferGeometry {
    constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number);
  }

  export class Material {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
    side: number;
    blending: number;
    vertexColors: boolean;
    needsUpdate: boolean;
    dispose(): void;
  }

  export class MeshBasicMaterial extends Material {
    constructor(params?: { color?: number; transparent?: boolean; opacity?: number; depthWrite?: boolean });
    color: Color;
  }

  export class MeshPhongMaterial extends Material {
    constructor(params?: {
      color?: number;
      emissive?: number;
      emissiveIntensity?: number;
      specular?: number;
      shininess?: number;
    });
    color: Color;
    map: Texture | null;
    emissive: Color;
    emissiveMap: Texture | null;
    emissiveIntensity: number;
    specular: Color;
    shininess: number;
  }

  export class ShaderMaterial extends Material {
    constructor(params?: {
      uniforms?: Record<string, { value: unknown }>;
      vertexShader?: string;
      fragmentShader?: string;
      side?: number;
      transparent?: boolean;
      depthWrite?: boolean;
      blending?: number;
    });
  }

  export class PointsMaterial extends Material {
    constructor(params?: {
      color?: number;
      size?: number;
      sizeAttenuation?: boolean;
      transparent?: boolean;
      opacity?: number;
    });
    color: Color;
    size: number;
    sizeAttenuation: boolean;
  }

  export class LineBasicMaterial extends Material {
    constructor(params?: { color?: number; transparent?: boolean; opacity?: number; vertexColors?: boolean });
    color: Color;
    vertexColors: boolean;
  }

  export class Texture {
    colorSpace: string;
    anisotropy: number;
    needsUpdate: boolean;
    dispose(): void;
  }

  export class TextureLoader {
    load(
      url: string,
      onLoad?: (texture: Texture) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: unknown) => void,
    ): Texture;
  }

  export class Object3D {
    position: Vector3;
    quaternion: Quaternion;
    scale: Vector3;
    rotation: Euler;
    matrix: Matrix4;
    visible: boolean;
    frustumCulled: boolean;
    userData: Record<string, unknown>;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    lookAt(x: number | Vector3, y?: number, z?: number): void;
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
  }

  export class Camera extends Object3D {}

  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    aspect: number;
    updateProjectionMatrix(): void;
  }

  export class Scene extends Object3D {
    background: Color | null;
  }

  export class Group extends Object3D {}

  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
    geometry: BufferGeometry;
    material: Material;
  }

  export class InstancedMesh extends Mesh {
    constructor(geometry: BufferGeometry, material: Material, count: number);
    count: number;
    instanceMatrix: BufferAttribute;
    instanceColor: BufferAttribute | null;
    setMatrixAt(index: number, matrix: Matrix4): void;
    setColorAt(index: number, color: Color): void;
  }

  export class LineSegments extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
    geometry: BufferGeometry;
    material: Material;
  }

  export class Line extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
    geometry: BufferGeometry;
  }

  export class Points extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
  }

  export class Light extends Object3D {
    intensity: number;
  }

  export class AmbientLight extends Light {
    constructor(color?: number, intensity?: number);
  }

  export class DirectionalLight extends Light {
    constructor(color?: number, intensity?: number);
  }

  export class WebGLRenderer {
    constructor(params?: { antialias?: boolean; canvas?: HTMLCanvasElement; alpha?: boolean });
    domElement: HTMLCanvasElement;
    outputColorSpace: string;
    capabilities: { getMaxAnisotropy(): number };
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setPixelRatio(value: number): void;
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
  }

  export class Raycaster {
    setFromCamera(coords: Vector2, camera: Camera): void;
    intersectObjects(objects: Object3D[], recursive?: boolean): Intersection[];
  }

  export interface Intersection {
    distance: number;
    point: Vector3;
    object: Object3D;
    instanceId?: number;
  }

  export class MathUtils {
    static degToRad(degrees: number): number;
    static radToDeg(radians: number): number;
    static clamp(value: number, min: number, max: number): number;
    static lerp(a: number, b: number, t: number): number;
  }
}

declare module "three/addons/controls/OrbitControls.js" {
  import { Camera, Vector3 } from "three";
  export class OrbitControls {
    constructor(object: Camera, domElement?: HTMLElement | null);
    enabled: boolean;
    target: Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    zoomSpeed: number;
    enableRotate: boolean;
    rotateSpeed: number;
    enablePan: boolean;
    minDistance: number;
    maxDistance: number;
    update(deltaTime?: number | null): boolean;
    addEventListener(type: string, listener: (event: { type: string }) => void): void;
    dispose(): void;
  }
}
