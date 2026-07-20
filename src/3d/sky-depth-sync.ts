import * as THREE from 'three';

export const DEFAULT_ORBIT_HORIZONTAL = 0;
export const DEFAULT_ORBIT_VERTICAL = 0.35;
export const SUN_WORLD_DISTANCE = 1200;

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export type OcclusionRun = [x: number, y: number, width: number];

export function scaleOrbitAngleForDistance(
  currentAngle: number,
  referenceAngle: number,
  sceneRadius: number,
  distantRadius: number,
) {
  const response = Math.max(0, Math.min(1, sceneRadius / distantRadius));
  return referenceAngle + (currentAngle - referenceAngle) * response;
}

export function equalArcMotionScale(
  currentAngle: number,
  referenceAngle: number,
  sceneRadius: number,
  distantRadius: number,
) {
  const sceneAngleDelta = currentAngle - referenceAngle;
  if (Math.abs(sceneAngleDelta) < Number.EPSILON || sceneRadius <= 0 || distantRadius <= 0) {
    return 1;
  }

  const distantAngle = scaleOrbitAngleForDistance(
    currentAngle,
    referenceAngle,
    sceneRadius,
    distantRadius,
  );
  const sceneTravel = sceneAngleDelta * sceneRadius;
  const distantTravel = (distantAngle - referenceAngle) * distantRadius;
  return distantTravel / sceneTravel;
}

/**
 * Convert a WebGL RGBA readback into top-to-bottom one-pixel-high mask runs.
 * WebGL readbacks start at the bottom row, while SVG mask coordinates start
 * at the top row, so the row order is deliberately inverted here.
 */
export function encodeOcclusionRuns(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  threshold = 128,
): OcclusionRun[] {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    throw new RangeError('Occlusion buffer dimensions do not match its RGBA pixels.');
  }

  const runs: OcclusionRun[] = [];
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const occupied = x < width
        && pixels[(sourceY * width + x) * 4] < threshold;
      if (occupied && start < 0) start = x;
      if (!occupied && start >= 0) {
        runs.push([start, y, x - start]);
        start = -1;
      }
    }
  }
  return runs;
}

export function occlusionCoverageInCircle(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  threshold = 128,
) {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    throw new RangeError('Occlusion buffer dimensions do not match its RGBA pixels.');
  }

  let covered = 0;
  let samples = 0;
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 > radius ** 2) continue;
      samples += 1;
      const sourceY = height - 1 - y;
      if (pixels[(sourceY * width + x) * 4] < threshold) covered += 1;
    }
  }
  return samples ? covered / samples : 0;
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
