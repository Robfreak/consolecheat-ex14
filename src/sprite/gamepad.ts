// Gamepad and keyboard cursor for the pixel canvas.
//
// Standard layout (buttons.pressed, polled once per animation frame):
//   D-pad 12-15 or left stick  move the pixel cursor (one cell per press, repeats while held)
//   × (0)                      paint the cursor pixel with the current color
//   ○ (1)                      erase the cursor pixel
//   □ (2) / △ (3)              previous / next palette color
//   L1 (4) / R1 (5)            previous / next frame
//   L2 (6) / R2 (7)            undo / redo
//   Options (9)                play / stop the preview
//
// Buttons fire on the rising edge only. The first poll of a pad only seeds the
// memory, so a button that is already held when the pad is first seen does nothing
// until it is released and pressed again.

import { TRANSPARENT, parseHex, setPixel } from "../draw/buffer.ts";
import { paintCurrent, selectFrame } from "./frames.ts";
import type { FrameSnapshot } from "./model.ts";

export const PAD_BUTTONS = {
  paint: 0,
  erase: 1,
  colorPrev: 2,
  colorNext: 3,
  framePrev: 4,
  frameNext: 5,
  undo: 6,
  redo: 7,
  play: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

export const STICK_THRESHOLD = 0.5;
/** Time a direction must be held before it repeats, then the gap between repeats. */
export const REPEAT_DELAY_MS = 320;
export const REPEAT_INTERVAL_MS = 90;

export type PadAction =
  | { type: "move"; dx: number; dy: number }
  | { type: "paint" }
  | { type: "erase" }
  | { type: "colorPrev" }
  | { type: "colorNext" }
  | { type: "framePrev" }
  | { type: "frameNext" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "play" };

export type PadMemory = {
  buttons: boolean[];
  dx: number;
  dy: number;
  nextRepeat: number;
};

export type PadSnapshot = {
  index: number;
  id: string;
  connected: boolean;
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
};

type PadLike = { buttons: readonly { pressed: boolean }[]; axes: readonly number[] };

const BUTTON_ACTIONS: ReadonlyArray<readonly [number, PadAction]> = [
  [PAD_BUTTONS.paint, { type: "paint" }],
  [PAD_BUTTONS.erase, { type: "erase" }],
  [PAD_BUTTONS.colorPrev, { type: "colorPrev" }],
  [PAD_BUTTONS.colorNext, { type: "colorNext" }],
  [PAD_BUTTONS.framePrev, { type: "framePrev" }],
  [PAD_BUTTONS.frameNext, { type: "frameNext" }],
  [PAD_BUTTONS.undo, { type: "undo" }],
  [PAD_BUTTONS.redo, { type: "redo" }],
  [PAD_BUTTONS.play, { type: "play" }],
];

const WATCHED = [...BUTTON_ACTIONS.map(([index]) => index), 12, 13, 14, 15];

function down(buttons: readonly { pressed: boolean }[], index: number): boolean {
  return buttons[index]?.pressed === true;
}

function axisStep(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value <= -STICK_THRESHOLD) return -1;
  if (value >= STICK_THRESHOLD) return 1;
  return 0;
}

/** D-pad wins over the stick on an axis. Opposite D-pad buttons cancel out. */
export function padDirection(pad: PadLike): { dx: number; dy: number } {
  const left = down(pad.buttons, PAD_BUTTONS.left);
  const right = down(pad.buttons, PAD_BUTTONS.right);
  const up = down(pad.buttons, PAD_BUTTONS.up);
  const downBtn = down(pad.buttons, PAD_BUTTONS.down);
  const padX = (right ? 1 : 0) - (left ? 1 : 0);
  const padY = (downBtn ? 1 : 0) - (up ? 1 : 0);
  return {
    dx: padX !== 0 ? padX : axisStep(pad.axes[0]),
    dy: padY !== 0 ? padY : axisStep(pad.axes[1]),
  };
}

function snapshotMemory(pad: PadLike, timeMs: number): PadMemory {
  const buttons: boolean[] = [];
  for (const index of WATCHED) buttons[index] = down(pad.buttons, index);
  const { dx, dy } = padDirection(pad);
  return { buttons, dx, dy, nextRepeat: timeMs + REPEAT_DELAY_MS };
}

/**
 * One pad, one poll. The first call (no memory) seeds and emits nothing.
 * With `blocked` set (a text field has focus, a dialog is open) the memory still
 * follows the pad, so a button held through the block does not fire afterwards.
 */
export function pollPad(
  pad: PadLike | null,
  memory: PadMemory | null,
  timeMs: number,
  blocked = false,
): { actions: PadAction[]; memory: PadMemory | null } {
  if (!pad) return { actions: [], memory: null };
  const seeded = snapshotMemory(pad, timeMs);
  if (!memory) return { actions: [], memory: seeded };
  if (blocked) return { actions: [], memory: seeded };

  const actions: PadAction[] = [];
  for (const [index, action] of BUTTON_ACTIONS) {
    if (seeded.buttons[index] && !memory.buttons[index]) actions.push(action);
  }

  const { dx, dy } = seeded;
  const held = dx !== 0 || dy !== 0;
  const changed = dx !== memory.dx || dy !== memory.dy;
  let nextRepeat = memory.nextRepeat;
  if (held && changed) {
    actions.push({ type: "move", dx, dy });
    nextRepeat = timeMs + REPEAT_DELAY_MS;
  } else if (held && timeMs >= memory.nextRepeat) {
    actions.push({ type: "move", dx, dy });
    nextRepeat = timeMs + REPEAT_INTERVAL_MS;
  }
  return { actions, memory: { buttons: seeded.buttons, dx, dy, nextRepeat } };
}

export function connectedPads(pads: readonly (PadSnapshot | null)[]): PadSnapshot[] {
  return pads.filter((pad): pad is PadSnapshot => pad !== null && pad.connected).sort((a, b) => a.index - b.index);
}

/** Polls the connected pad with the lowest index. Memory for any other pad is dropped. */
export function pollPads(
  pads: readonly (PadSnapshot | null)[],
  memory: Map<number, PadMemory>,
  timeMs: number,
  blocked = false,
): { actions: PadAction[]; memory: Map<number, PadMemory> } {
  const active = connectedPads(pads)[0] ?? null;
  const next = new Map<number, PadMemory>();
  if (!active) return { actions: [], memory: next };
  const result = pollPad(active, memory.get(active.index) ?? null, timeMs, blocked);
  if (result.memory) next.set(active.index, result.memory);
  return { actions: result.actions, memory: next };
}

type GamepadLike = {
  index: number;
  id: string;
  connected: boolean;
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
};

export function readNavigatorPads(nav: {
  getGamepads?: () => readonly (GamepadLike | null)[] | null;
}): (PadSnapshot | null)[] {
  try {
    const list = nav.getGamepads?.() ?? null;
    if (!list) return [];
    return Array.from(list).map((pad) => {
      if (!pad) return null;
      return { index: pad.index, id: pad.id, connected: pad.connected, buttons: pad.buttons, axes: pad.axes };
    });
  } catch {
    return [];
  }
}

export type Cursor = { x: number; y: number };

export function clampCursor(size: number, cursor: Cursor): Cursor {
  const max = Math.max(0, Math.floor(size) - 1);
  const fix = (value: number) => (Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0);
  return { x: fix(cursor.x), y: fix(cursor.y) };
}

export function centerCursor(size: number): Cursor {
  return clampCursor(size, { x: Math.floor(size / 2), y: Math.floor(size / 2) });
}

export function moveCursor(size: number, cursor: Cursor, dx: number, dy: number): Cursor {
  return clampCursor(size, { x: cursor.x + dx, y: cursor.y + dy });
}

/** Keyboard cursor, active while the canvas has focus. Arrows move, Enter or Space paint, Delete or Backspace erase. */
export function cursorKeyAction(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): PadAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null;
  switch (event.key) {
    case "ArrowLeft":
      return { type: "move", dx: -1, dy: 0 };
    case "ArrowRight":
      return { type: "move", dx: 1, dy: 0 };
    case "ArrowUp":
      return { type: "move", dx: 0, dy: -1 };
    case "ArrowDown":
      return { type: "move", dx: 0, dy: 1 };
    case "Enter":
    case " ":
    case "Spacebar":
      return { type: "paint" };
    case "Delete":
    case "Backspace":
      return { type: "erase" };
    default:
      return null;
  }
}

/** Next or previous color in the palette. A color outside it starts from the first or last swatch. */
export function cycleColor(colors: readonly string[], current: string, direction: 1 | -1): string | null {
  if (colors.length === 0) return null;
  const at = colors.indexOf(current.toLowerCase());
  if (at < 0) return direction === 1 ? (colors[0] ?? null) : (colors[colors.length - 1] ?? null);
  return colors[(at + direction + colors.length) % colors.length] ?? null;
}

/** Paint (hex) or erase (null) one pixel of the current frame. Returns the same snapshot when nothing changes. */
export function paintCell(snapshot: FrameSnapshot, cursor: Cursor, hex: string | null): FrameSnapshot {
  const spot = clampCursor(snapshot.size, cursor);
  const color = hex === null ? TRANSPARENT : parseHex(hex);
  if (!color) return snapshot;
  return paintCurrent(snapshot, (frame, size) => setPixel(size, frame, spot.x, spot.y, color));
}

export type PadModel = {
  snapshot: FrameSnapshot;
  cursor: Cursor;
  color: string;
  colors: readonly string[];
};

export type PadStep = PadModel & {
  /** What the editor has to do with the result. */
  effect: "none" | "cursor" | "commit" | "select" | "color";
};

/** The pure part of an action: cursor, pixels, frame selection, color. Undo, redo, and play stay with the editor. */
export function stepPad(model: PadModel, action: PadAction): PadStep {
  const { snapshot, color, colors } = model;
  const cursor = clampCursor(snapshot.size, model.cursor);
  switch (action.type) {
    case "move": {
      const moved = moveCursor(snapshot.size, cursor, action.dx, action.dy);
      const same = moved.x === model.cursor.x && moved.y === model.cursor.y;
      return { ...model, cursor: moved, effect: same ? "none" : "cursor" };
    }
    case "paint":
    case "erase": {
      const next = paintCell(snapshot, cursor, action.type === "paint" ? color : null);
      return { ...model, cursor, snapshot: next, effect: next === snapshot ? "none" : "commit" };
    }
    case "framePrev":
    case "frameNext": {
      const next = selectFrame(snapshot, snapshot.index + (action.type === "frameNext" ? 1 : -1));
      return { ...model, cursor, snapshot: next, effect: next === snapshot ? "none" : "select" };
    }
    case "colorPrev":
    case "colorNext": {
      const next = cycleColor(colors, color, action.type === "colorNext" ? 1 : -1);
      if (!next || next === color) return { ...model, cursor, effect: "none" };
      return { ...model, cursor, color: next, effect: "color" };
    }
    default:
      return { ...model, cursor, effect: "none" };
  }
}
