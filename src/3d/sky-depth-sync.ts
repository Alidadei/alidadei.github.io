import * as THREE from 'three';

export const DEFAULT_ORBIT_HORIZONTAL = 0;
export const DEFAULT_ORBIT_VERTICAL = 0.35;
export const SUN_WORLD_DISTANCE = 1200;

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface ScreenPolygon {
  points: Array<{ x: number; y: number }>;
}

export function applyOrbitCameraPose(
  camera: THREE.PerspectiveCamera,
  center: THREE.Vector3,
  radius: number,
  horizontal: number,
  vertical: number,
) {
  const yAngle = vertical * Math.PI * 0.5;
  camera.position.set(
    center.x + Math.sin(horizontal) * Math.cos(yAngle) * radius,
    center.y + Math.sin(yAngle) * radius,
    center.z + Math.cos(horizontal) * Math.cos(yAngle) * radius,
  );
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
}

export function screenPointToWorld(
  camera: THREE.PerspectiveCamera,
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  distance = SUN_WORLD_DISTANCE,
) {
  camera.updateMatrixWorld(true);
  const point = new THREE.Vector3(
    screenX / viewportWidth * 2 - 1,
    1 - screenY / viewportHeight * 2,
    0.5,
  ).unproject(camera);

  return camera.position.clone().add(
    point.sub(camera.position).normalize().multiplyScalar(distance),
  );
}

export function worldPointToScreen(
  camera: THREE.PerspectiveCamera,
  worldPoint: THREE.Vector3,
  viewportWidth: number,
  viewportHeight: number,
): ScreenPoint {
  camera.updateMatrixWorld(true);

  const cameraSpace = worldPoint.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = worldPoint.clone().project(camera);
  return {
    x: (projected.x + 1) * 0.5 * viewportWidth,
    y: (1 - projected.y) * 0.5 * viewportHeight,
    visible: cameraSpace.z < -camera.near
      && cameraSpace.z > -camera.far
      && projected.z >= -1
      && projected.z <= 1,
  };
}

function cross(
  origin: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return (a.x - origin.x) * (b.y - origin.y)
    - (a.y - origin.y) * (b.x - origin.x);
}

export function convexHull(points: Array<{ x: number; y: number }>) {
  if (points.length <= 3) return points;

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Array<{ x: number; y: number }> = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Array<{ x: number; y: number }> = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function projectConvexMeshToScreen(
  mesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ScreenPolygon | null {
  const positions = mesh.geometry.getAttribute('position');
  if (!positions) return null;

  mesh.updateWorldMatrix(true, false);
  camera.updateMatrixWorld(true);

  const points: Array<{ x: number; y: number }> = [];
  const vertex = new THREE.Vector3();
  const cameraSpace = new THREE.Vector3();
  const projected = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    vertex.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
    cameraSpace.copy(vertex).applyMatrix4(camera.matrixWorldInverse);
    if (cameraSpace.z >= -camera.near || cameraSpace.z <= -camera.far) continue;

    projected.copy(vertex).project(camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) continue;
    points.push({
      x: (projected.x + 1) * 0.5 * viewportWidth,
      y: (1 - projected.y) * 0.5 * viewportHeight,
    });
  }

  const hull = convexHull(points);
  return hull.length >= 3 ? { points: hull } : null;
}
