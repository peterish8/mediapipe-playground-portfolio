/** @typedef {{x:number, y:number, z?:number}} Landmark */
/** @typedef {{landmarks: Landmark[], index: number, label: string}} HandRole */

export function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function handednessLabel(entry) {
  const category = entry?.[0];
  const label = category?.categoryName ?? category?.displayName ?? "";
  return label === "Left" || label === "Right" ? label : "";
}

export function assignHandRoles(landmarks, handednesses, soundHand = "Right") {
  /** @type {HandRole[]} */
  const hands = landmarks.map((points, index) => ({
    landmarks: points,
    index,
    label: handednessLabel(handednesses[index]),
  }));
  const sound = hands.find((hand) => hand.label === soundHand);
  const expression = hands.find((hand) => hand.label && hand.label !== soundHand);
  return { sound, expression };
}

export function createSmoother(alpha = 0.24) {
  const amount = clamp(alpha, 0.01, 1);
  let current;
  return {
    update(value) {
      if (!Number.isFinite(value)) return current ?? 0;
      current = current === undefined ? value : current + (value - current) * amount;
      return current;
    },
    reset(value) {
      current = value;
    },
    get value() {
      return current;
    },
  };
}

export function getPinchStrength(hand) {
  const thumb = hand[4];
  const index = hand[8];
  const wrist = hand[0];
  const middleMcp = hand[9];
  if (!thumb || !index || !wrist || !middleMcp) return 0;
  const palmScale = Math.max(0.025, distance(wrist, middleMcp));
  const ratio = distance(thumb, index) / palmScale;
  return 1 - clamp((ratio - 0.12) / 0.93);
}

export function getPalmTilt(hand) {
  const wrist = hand[0];
  const middleMcp = hand[9];
  if (!wrist || !middleMcp) return 0;
  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;
  return clamp(Math.abs(dx) / Math.max(0.001, Math.hypot(dx, dy)));
}

export function createPinchGate({ onThreshold = 0.64, offThreshold = 0.38 } = {}) {
  let active = false;
  return {
    update(strength) {
      if (!active && strength >= onThreshold) active = true;
      else if (active && strength <= offThreshold) active = false;
      return active;
    },
    reset() {
      active = false;
    },
    get active() {
      return active;
    },
  };
}

export function createStableGestureSelector({ dwellMs = 700, cooldownMs = 600 } = {}) {
  let candidate = "";
  let candidateSince = 0;
  let selected = "";
  let lastEmission = -Infinity;
  return {
    update(gesture, now) {
      const valid = gesture && gesture !== "None" && gesture !== "Unknown";
      if (!valid) {
        candidate = "";
        candidateSince = now;
        return null;
      }
      if (gesture !== candidate) {
        candidate = gesture;
        candidateSince = now;
        return null;
      }
      if (gesture === selected) return null;
      if (now - candidateSince < dwellMs || now - lastEmission < cooldownMs) return null;
      selected = gesture;
      lastEmission = now;
      return gesture;
    },
    reset() {
      candidate = "";
      selected = "";
      candidateSince = 0;
      lastEmission = -Infinity;
    },
  };
}

export function createNoteSelector(notes, { hysteresis = 0.12 } = {}) {
  let currentIndex;
  return {
    update(y) {
      if (!notes.length) return undefined;
      const position = clamp(1 - y) * (notes.length - 1);
      if (currentIndex === undefined) currentIndex = Math.round(position);
      else if (position > currentIndex + 0.5 + hysteresis) currentIndex = Math.round(position);
      else if (position < currentIndex - 0.5 - hysteresis) currentIndex = Math.round(position);
      currentIndex = Math.round(clamp(currentIndex, 0, notes.length - 1));
      return notes[currentIndex];
    },
    reset() {
      currentIndex = undefined;
    },
    get index() {
      return currentIndex;
    },
  };
}

export function deriveExpression(hand) {
  const wrist = hand[0] ?? { x: 0.5, y: 0.5 };
  const height = clamp(1 - wrist.y);
  const screenX = clamp(1 - wrist.x);
  const cutoff = 250 * Math.pow(9000 / 250, height);
  const pinchStrength = getPinchStrength(hand);
  return {
    cutoff,
    space: screenX,
    intensity: clamp(0.12 + (1 - pinchStrength) * 0.88),
    vibrato: getPalmTilt(hand),
  };
}

export function createMotionDetector({ threshold = 0.95, cooldownMs = 850, smoothing = 0.35 } = {}) {
  let previousY;
  let previousTime;
  let smoothedVelocity = 0;
  let lastEventAt = -Infinity;
  return {
    update(y, now) {
      if (!Number.isFinite(y) || !Number.isFinite(now)) return { event: null, velocity: smoothedVelocity };
      if (previousY === undefined || previousTime === undefined || now <= previousTime) {
        previousY = y;
        previousTime = now;
        return { event: null, velocity: smoothedVelocity };
      }
      const seconds = clamp((now - previousTime) / 1000, 0.016, 1);
      const velocity = (previousY - y) / seconds;
      smoothedVelocity += (velocity - smoothedVelocity) * clamp(smoothing, 0.01, 1);
      previousY = y;
      previousTime = now;
      let event = null;
      if (now - lastEventAt >= cooldownMs) {
        if (smoothedVelocity >= threshold) event = "riser";
        else if (smoothedVelocity <= -threshold) event = "drop";
      }
      if (event) lastEventAt = now;
      return { event, velocity: smoothedVelocity };
    },
    reset() {
      previousY = undefined;
      previousTime = undefined;
      smoothedVelocity = 0;
      lastEventAt = -Infinity;
    },
  };
}