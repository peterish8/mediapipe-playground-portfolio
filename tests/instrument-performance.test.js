import test from "node:test";
import assert from "node:assert/strict";
import {
  assignHandRoles,
  createMotionDetector,
  createNoteSelector,
  createPinchGate,
  createSmoother,
  createStableGestureSelector,
  deriveExpression,
  getPinchStrength,
} from "../src/instrument/performance-controls.js";

function hand({ wristX = 0.5, wristY = 0.5, thumbX = 0.45, thumbY = 0.45, indexX = 0.5, indexY = 0.5, middleX = 0.5, middleY = 0.35 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x: wristX, y: wristY, z: 0 }));
  points[0] = { x: wristX, y: wristY, z: 0 };
  points[4] = { x: thumbX, y: thumbY, z: 0 };
  points[8] = { x: indexX, y: indexY, z: 0 };
  points[9] = { x: middleX, y: middleY, z: 0 };
  return points;
}

const handedness = (label) => [{ categoryName: label, score: 0.99 }];

test("instrument performance assigns roles by handedness rather than array order", () => {
  const left = hand({ wristX: 0.2 });
  const right = hand({ wristX: 0.8 });
  const roles = assignHandRoles([left, right], [handedness("Left"), handedness("Right")], "Right");
  assert.equal(roles.sound?.landmarks, right);
  assert.equal(roles.expression?.landmarks, left);
  assert.equal(roles.sound?.index, 1);
});

test("instrument performance pinch gate uses separate on and off thresholds", () => {
  const gate = createPinchGate({ onThreshold: 0.65, offThreshold: 0.35 });
  assert.equal(gate.update(0.5), false);
  assert.equal(gate.update(0.7), true);
  assert.equal(gate.update(0.5), true);
  assert.equal(gate.update(0.3), false);
});

test("instrument performance gesture selector requires dwell and cooldown", () => {
  const selector = createStableGestureSelector({ dwellMs: 700, cooldownMs: 500 });
  assert.equal(selector.update("Thumb_Up", 0), null);
  assert.equal(selector.update("Thumb_Up", 699), null);
  assert.equal(selector.update("Thumb_Up", 700), "Thumb_Up");
  assert.equal(selector.update("Thumb_Up", 1400), null);
  assert.equal(selector.update("Open_Palm", 1500), null);
  assert.equal(selector.update("Open_Palm", 2199), null);
  assert.equal(selector.update("Open_Palm", 2200), "Open_Palm");
});

test("instrument performance note selector resists boundary jitter", () => {
  const selector = createNoteSelector(["C4", "D4", "E4"], { hysteresis: 0.12 });
  assert.equal(selector.update(0.5), "D4");
  assert.equal(selector.update(0.72), "D4");
  assert.equal(selector.update(0.82), "C4");
});

test("instrument performance expression stays inside musical ranges", () => {
  const low = deriveExpression(hand({ wristX: 0.95, wristY: 0.95, thumbX: 0.5, indexX: 0.51 }));
  const high = deriveExpression(hand({ wristX: 0.05, wristY: 0.05, thumbX: 0.1, indexX: 0.8, middleX: 0.8, middleY: 0.5 }));
  assert.ok(low.cutoff >= 250 && low.cutoff <= 9000);
  assert.ok(high.cutoff >= 250 && high.cutoff <= 9000);
  assert.ok(low.space >= 0 && low.space <= 1);
  assert.ok(high.intensity >= 0 && high.intensity <= 1);
  assert.ok(high.vibrato >= 0 && high.vibrato <= 1);
  assert.ok(high.cutoff > low.cutoff);
});

test("instrument performance motion detector emits riser and drop with cooldown", () => {
  const detector = createMotionDetector({ threshold: 0.8, cooldownMs: 600, smoothing: 1 });
  assert.equal(detector.update(0.8, 0).event, null);
  assert.equal(detector.update(0.6, 100).event, "riser");
  assert.equal(detector.update(0.4, 200).event, null);
  assert.equal(detector.update(0.95, 800).event, "drop");
});

test("instrument performance smoother damps sudden jumps", () => {
  const smoother = createSmoother(0.25);
  assert.equal(smoother.update(0), 0);
  assert.equal(smoother.update(1), 0.25);
  assert.equal(smoother.update(1), 0.4375);
});

test("instrument performance pinch strength increases as fingertips close", () => {
  const open = getPinchStrength(hand({ thumbX: 0.1, thumbY: 0.5, indexX: 0.9, indexY: 0.5 }));
  const closed = getPinchStrength(hand({ thumbX: 0.49, thumbY: 0.5, indexX: 0.51, indexY: 0.5 }));
  assert.ok(closed > open);
});