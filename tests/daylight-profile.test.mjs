import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDaylightRenderProfile,
  getPaleSurfaceRenderProfile,
} from '../src/3d/daylight-profile.ts';

test('desktop reuses the mobile rendering profile in full daylight', () => {
  const mobile = getDaylightRenderProfile(1, true);
  const desktop = getDaylightRenderProfile(1, false);

  assert.deepEqual(desktop, mobile);
  assert.equal(desktop.exposure, 1.7);
  assert.equal(desktop.bloomStrength, 0);
  assert.equal(desktop.edgeStrength, 0.15);
});

test('desktop keeps its original rendering profile at night', () => {
  assert.deepEqual(getDaylightRenderProfile(0, false), {
    exposure: 0.92,
    bloomStrength: 0.4,
    edgeStrength: 0.35,
    sharedDaylightBlend: 0,
  });
});

test('desktop transitions smoothly during dawn and dusk', () => {
  const profile = getDaylightRenderProfile(0.075, false);
  assert.equal(profile.sharedDaylightBlend, 0.5);
  assert.equal(profile.bloomStrength, 0.2);
  assert.equal(profile.edgeStrength, 0.25);
});

test('desktop lifts only pale scene surfaces while mobile keeps its original material output', () => {
  assert.deepEqual(getPaleSurfaceRenderProfile(false), {
    emissive: 0xfff8f0,
    emissiveIntensity: 0.3,
  });
  assert.deepEqual(getPaleSurfaceRenderProfile(true), {
    emissive: 0xfff8f0,
    emissiveIntensity: 0,
  });
});
