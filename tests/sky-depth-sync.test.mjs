import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  applyOrbitCameraPose,
  DEFAULT_ORBIT_HORIZONTAL,
  DEFAULT_ORBIT_VERTICAL,
  encodeOcclusionRuns,
  equalArcMotionScale,
  occlusionCoverageInCircle,
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

test('the distant sun uses a smaller angle for the same cloud-layer travel distance', () => {
  for (const sceneVertical of [0.05, 0.65]) {
    const sunVertical = scaleOrbitAngleForDistance(
      sceneVertical,
      DEFAULT_ORBIT_VERTICAL,
      RADIUS,
      SUN_WORLD_DISTANCE,
    );
    const cloudTravel = Math.abs(sceneVertical - DEFAULT_ORBIT_VERTICAL) * RADIUS;
    const sunTravel = Math.abs(sunVertical - DEFAULT_ORBIT_VERTICAL) * SUN_WORLD_DISTANCE;
    assert.ok(Math.abs(sunVertical - DEFAULT_ORBIT_VERTICAL)
      < Math.abs(sceneVertical - DEFAULT_ORBIT_VERTICAL));
    assert.ok(Math.abs(sunTravel - cloudTravel) < 1e-10);
    assert.ok(Math.abs(equalArcMotionScale(
      sceneVertical,
      DEFAULT_ORBIT_VERTICAL,
      RADIUS,
      SUN_WORLD_DISTANCE,
    ) - 1) < 1e-12);
  }
});

test('the full-scene WebGL readback becomes a top-origin SVG mask', () => {
  const width = 4;
  const height = 3;
  const pixels = new Uint8Array(width * height * 4).fill(255);
  const blockScreenPixel = (x, y) => {
    const sourceY = height - 1 - y;
    const offset = (sourceY * width + x) * 4;
    pixels.fill(0, offset, offset + 4);
  };
  blockScreenPixel(1, 0);
  blockScreenPixel(2, 0);
  blockScreenPixel(3, 1);
  blockScreenPixel(0, 2);

  assert.deepEqual(encodeOcclusionRuns(pixels, width, height), [
    [1, 0, 2],
    [3, 1, 1],
    [0, 2, 1],
  ]);
});

test('disc coverage reads the same top-origin scene mask', () => {
  const width = 5;
  const height = 5;
  const pixels = new Uint8Array(width * height * 4).fill(255);
  for (const [x, y] of [[2, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) {
    const sourceY = height - 1 - y;
    const offset = (sourceY * width + x) * 4;
    pixels.fill(0, offset, offset + 4);
  }

  assert.equal(occlusionCoverageInCircle(pixels, width, height, 2, 2, 1), 1);
});
