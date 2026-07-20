import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  applyOrbitCameraPose,
  convexHull,
  DEFAULT_ORBIT_HORIZONTAL,
  DEFAULT_ORBIT_VERTICAL,
  projectConvexMeshToScreen,
  scaleOrbitAngleForDistance,
  screenPointToWorld,
  SUN_WORLD_DISTANCE,
  worldPointToScreen,
} from '../src/3d/sky-depth-sync.ts';

const WIDTH = 1440;
const HEIGHT = 900;
const CENTER = new THREE.Vector3(20, 35, 0);
const RADIUS = 350;

function createCamera(vertical = DEFAULT_ORBIT_VERTICAL) {
  const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT, 1, 2000);
  applyOrbitCameraPose(
    camera,
    CENTER,
    RADIUS,
    DEFAULT_ORBIT_HORIZONTAL,
    vertical,
  );
  return camera;
}

test('the default 3D camera preserves the existing CSS sun center', () => {
  const camera = createCamera();
  const expected = { x: 1015.25, y: 83.75 };
  const world = screenPointToWorld(camera, expected.x, expected.y, WIDTH, HEIGHT);
  const actual = worldPointToScreen(camera, world, WIDTH, HEIGHT);

  assert.ok(Math.abs(actual.x - expected.x) < 1e-6);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-6);
  assert.ok(Math.abs(camera.position.distanceTo(world) - SUN_WORLD_DISTANCE) < 1e-6);
  assert.equal(actual.visible, true);
});

test('the distant sun keeps its reference height and rotates less than a near cloud', () => {
  const referenceCamera = createCamera();
  const sunWorld = screenPointToWorld(referenceCamera, 1000, 90, WIDTH, HEIGHT);
  const cloudWorld = new THREE.Vector3(280, 108, -250);

  for (const sceneVertical of [0.05, 0.65]) {
    const sceneCamera = createCamera();
    const sunCamera = createCamera();
    const beforeSun = worldPointToScreen(sunCamera, sunWorld, WIDTH, HEIGHT);
    const beforeCloud = worldPointToScreen(sceneCamera, cloudWorld, WIDTH, HEIGHT);
    const sunVertical = scaleOrbitAngleForDistance(
      sceneVertical,
      DEFAULT_ORBIT_VERTICAL,
      RADIUS,
      SUN_WORLD_DISTANCE,
    );

    applyOrbitCameraPose(sceneCamera, CENTER, RADIUS, DEFAULT_ORBIT_HORIZONTAL, sceneVertical);
    applyOrbitCameraPose(sunCamera, CENTER, RADIUS, DEFAULT_ORBIT_HORIZONTAL, sunVertical);
    const afterSun = worldPointToScreen(sunCamera, sunWorld, WIDTH, HEIGHT);
    const afterCloud = worldPointToScreen(sceneCamera, cloudWorld, WIDTH, HEIGHT);
    const sunDeltaY = afterSun.y - beforeSun.y;
    const cloudDeltaY = afterCloud.y - beforeCloud.y;

    assert.ok(Math.abs(beforeSun.y - 90) < 1e-6);
    assert.ok(Math.abs(sunVertical - DEFAULT_ORBIT_VERTICAL)
      < Math.abs(sceneVertical - DEFAULT_ORBIT_VERTICAL));
    assert.notEqual(Math.sign(sunDeltaY), 0);
    assert.equal(Math.sign(sunDeltaY), Math.sign(cloudDeltaY));
    assert.ok(Math.abs(sunDeltaY) < Math.abs(cloudDeltaY));
  }
});

test('cloud occlusion uses the projected hull of the rendered outline mesh', () => {
  const camera = createCamera();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(30, 12, 8));
  mesh.position.set(280, 135, -250);
  mesh.scale.setScalar(1.015);
  mesh.updateMatrixWorld(true);

  const polygon = projectConvexMeshToScreen(mesh, camera, WIDTH, HEIGHT);
  assert.ok(polygon);
  assert.ok(polygon.points.length >= 8);
  assert.ok(polygon.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));

  assert.deepEqual(convexHull([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: 0.5, y: 0.5 },
  ]), [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]);
});
