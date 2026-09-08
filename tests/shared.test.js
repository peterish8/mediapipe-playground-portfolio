import test from "node:test";
import assert from "node:assert/strict";
import { MonotonicTimestamp } from "../src/shared/timestamp-counter.js";
import { formatBytes, formatDuration } from "../src/shared/format.js";

test("MonotonicTimestamp never repeats or moves backwards", () => {
  const clock = new MonotonicTimestamp();
  const values = [clock.next(10), clock.next(10), clock.next(2), clock.next(12)];
  assert.ok(values[1] > values[0]);
  assert.ok(values[2] > values[1]);
  assert.ok(values[3] > values[2]);
});

test("format helpers create readable values", () => {
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1024 ** 2), "1.0 MB");
  assert.equal(formatDuration(65_000), "01:05");
});
