import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPixel, parseHex } from "../draw/buffer.ts";
import { paletteColors } from "../draw/palettes.ts";
import {
  PAD_BUTTONS,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  centerCursor,
  clampCursor,
  connectedPads,
  cursorKeyAction,
  cycleColor,
  moveCursor,
  paintCell,
  padDirection,
  pollPad,
  pollPads,
  readNavigatorPads,
  stepPad,
  type PadAction,
  type PadMemory,
  type PadModel,
  type PadSnapshot,
} from "./gamepad.ts";
import { emptySnapshot, type FrameSnapshot } from "./model.ts";
import { copy } from "./messages.ts";

function pad(down: number[] = [], axes: number[] = [0, 0], index = 0, connected = true): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, button) => ({ pressed: down.includes(button) }));
  return { index, id: `Pad ${index}`, connected, buttons, axes };
}

/** A fake navigator whose pad state the test changes between polls. */
function fakeNavigator(initial: PadSnapshot[]) {
  let current: (PadSnapshot | null)[] = initial;
  let calls = 0;
  return {
    set(next: (PadSnapshot | null)[]) {
      current = next;
    },
    get calls() {
      return calls;
    },
    getGamepads: () => {
      calls += 1;
      return current;
    },
  };
}

function types(actions: PadAction[]): string[] {
  return actions.map((action) => action.type);
}

const colors = paletteColors("pico8");

function model(overrides: Partial<PadModel> = {}): PadModel {
  return { snapshot: emptySnapshot(16), cursor: { x: 4, y: 4 }, color: "#ff004d", colors, ...overrides };
}

function pixel(snapshot: FrameSnapshot, x: number, y: number) {
  const frame = snapshot.frames[snapshot.index];
  assert.ok(frame);
  return getPixel(snapshot.size, frame, x, y);
}

test("edge detection: the first poll only seeds, a press fires once, a held button does not repeat", () => {
  let result = pollPad(pad([PAD_BUTTONS.paint]), null, 0);
  assert.deepEqual(result.actions, [], "a button held at connect time does nothing");
  let memory = result.memory;
  assert.ok(memory);

  result = pollPad(pad([PAD_BUTTONS.paint]), memory, 16);
  assert.deepEqual(result.actions, [], "still held, no edge");
  memory = result.memory as PadMemory;

  result = pollPad(pad(), memory, 32);
  assert.deepEqual(result.actions, []);
  memory = result.memory as PadMemory;

  result = pollPad(pad([PAD_BUTTONS.paint]), memory, 48);
  assert.deepEqual(types(result.actions), ["paint"], "released then pressed is a new edge");
  memory = result.memory as PadMemory;

  result = pollPad(pad([PAD_BUTTONS.paint]), memory, 64);
  assert.deepEqual(result.actions, []);
  assert.equal(pollPad(null, memory, 80).memory, null, "no pad drops the memory");
});

test("button mapping: standard layout buttons become the documented actions", () => {
  const cases: Array<[number, string]> = [
    [0, "paint"],
    [1, "erase"],
    [2, "colorPrev"],
    [3, "colorNext"],
    [4, "framePrev"],
    [5, "frameNext"],
    [6, "undo"],
    [7, "redo"],
    [9, "play"],
  ];
  for (const [button, expected] of cases) {
    const seeded = pollPad(pad(), null, 0).memory;
    const result = pollPad(pad([button]), seeded, 16);
    assert.deepEqual(types(result.actions), [expected], `button ${button}`);
  }
  for (const unmapped of [8, 10, 11, 16]) {
    const seeded = pollPad(pad(), null, 0).memory;
    assert.deepEqual(pollPad(pad([unmapped]), seeded, 16).actions, [], `button ${unmapped} is unused`);
  }
});

test("two buttons pressed in the same frame both fire, once", () => {
  const seeded = pollPad(pad(), null, 0).memory;
  const result = pollPad(pad([0, 5]), seeded, 16);
  assert.deepEqual(types(result.actions), ["paint", "frameNext"]);
});

test("D-pad and left stick give a direction, the D-pad wins and opposite buttons cancel", () => {
  assert.deepEqual(padDirection(pad([12])), { dx: 0, dy: -1 });
  assert.deepEqual(padDirection(pad([13, 15])), { dx: 1, dy: 1 });
  assert.deepEqual(padDirection(pad([14])), { dx: -1, dy: 0 });
  assert.deepEqual(padDirection(pad([14, 15])), { dx: 0, dy: 0 });
  assert.deepEqual(padDirection(pad([], [0.9, -0.8])), { dx: 1, dy: -1 });
  assert.deepEqual(padDirection(pad([], [0.3, -0.3])), { dx: 0, dy: 0 }, "inside the dead zone");
  assert.deepEqual(padDirection(pad([14], [0.9, 0])), { dx: -1, dy: 0 }, "D-pad beats stick on that axis");
  assert.deepEqual(padDirection({ buttons: [], axes: [] }), { dx: 0, dy: 0 });
});

test("a direction moves once on the edge, waits, then repeats while held", () => {
  let memory = pollPad(pad(), null, 0).memory as PadMemory;
  let result = pollPad(pad([15]), memory, 100);
  assert.deepEqual(result.actions, [{ type: "move", dx: 1, dy: 0 }]);
  memory = result.memory as PadMemory;

  result = pollPad(pad([15]), memory, 100 + REPEAT_DELAY_MS - 1);
  assert.deepEqual(result.actions, [], "still inside the repeat delay");
  memory = result.memory as PadMemory;

  result = pollPad(pad([15]), memory, 100 + REPEAT_DELAY_MS);
  assert.deepEqual(result.actions, [{ type: "move", dx: 1, dy: 0 }]);
  memory = result.memory as PadMemory;

  result = pollPad(pad([15]), memory, 100 + REPEAT_DELAY_MS + REPEAT_INTERVAL_MS - 1);
  assert.deepEqual(result.actions, []);
  memory = result.memory as PadMemory;
  result = pollPad(pad([15]), memory, 100 + REPEAT_DELAY_MS + REPEAT_INTERVAL_MS);
  assert.equal(result.actions.length, 1);
  memory = result.memory as PadMemory;

  result = pollPad(pad(), memory, 2000);
  assert.deepEqual(result.actions, [], "released");
  memory = result.memory as PadMemory;

  result = pollPad(pad([13]), memory, 2016);
  assert.deepEqual(result.actions, [{ type: "move", dx: 0, dy: 1 }], "a new direction fires at once");
});

test("a direction held at connect time does not move until it is released and pressed again", () => {
  const seeded = pollPad(pad([15]), null, 0).memory as PadMemory;
  assert.deepEqual(pollPad(pad([15]), seeded, 16).actions, []);
});

test("blocked polls (text field focused) emit nothing and do not fire later for buttons held through them", () => {
  let memory = pollPad(pad(), null, 0).memory as PadMemory;
  let result = pollPad(pad([0, 15]), memory, 16, true);
  assert.deepEqual(result.actions, []);
  memory = result.memory as PadMemory;
  result = pollPad(pad([0, 15]), memory, 32, false);
  assert.deepEqual(result.actions, [], "held through the block, so no late edge");
  memory = result.memory as PadMemory;
  result = pollPad(pad(), memory, 48);
  result = pollPad(pad([0]), result.memory, 64);
  assert.deepEqual(types(result.actions), ["paint"]);
});

test("pollPads uses the connected pad with the lowest index and ignores disconnected ones", () => {
  const list = [pad([0], [0, 0], 0, false), null, pad([], [0, 0], 2), pad([], [0, 0], 1)];
  assert.deepEqual(connectedPads(list).map((p) => p.index), [1, 2]);

  let polled = pollPads(list, new Map(), 0);
  assert.deepEqual([...polled.memory.keys()], [1]);
  polled = pollPads([null, pad([0], [0, 0], 1)], polled.memory, 16);
  assert.deepEqual(types(polled.actions), ["paint"]);

  const gone = pollPads([pad([], [0, 0], 1, false)], polled.memory, 32);
  assert.deepEqual(gone.actions, []);
  assert.equal(gone.memory.size, 0, "disconnect clears memory so a reconnect seeds again");
});

test("readNavigatorPads reads a mocked getGamepads and survives a missing or throwing API", () => {
  const nav = fakeNavigator([pad([0])]);
  const read = readNavigatorPads(nav);
  assert.equal(read.length, 1);
  assert.equal(read[0]?.buttons[0]?.pressed, true);
  assert.equal(nav.calls, 1);
  assert.deepEqual(readNavigatorPads({}), []);
  assert.deepEqual(readNavigatorPads({ getGamepads: () => null }), []);
  assert.deepEqual(
    readNavigatorPads({
      getGamepads: () => {
        throw new Error("blocked");
      },
    }),
    [],
  );
});

test("cursor clamping stays inside the canvas for every size, including odd input", () => {
  assert.deepEqual(clampCursor(16, { x: -3, y: 99 }), { x: 0, y: 15 });
  assert.deepEqual(clampCursor(32, { x: 31, y: 0 }), { x: 31, y: 0 });
  assert.deepEqual(clampCursor(64, { x: 64, y: 64 }), { x: 63, y: 63 });
  assert.deepEqual(clampCursor(16, { x: Number.NaN, y: Number.POSITIVE_INFINITY }), { x: 0, y: 0 }, "non-finite falls back to 0");
  assert.deepEqual(clampCursor(16, { x: 2.6, y: 3.4 }), { x: 3, y: 3 });
  assert.deepEqual(centerCursor(32), { x: 16, y: 16 });
  assert.deepEqual(moveCursor(16, { x: 0, y: 0 }, -1, -1), { x: 0, y: 0 });
  assert.deepEqual(moveCursor(16, { x: 15, y: 15 }, 1, 1), { x: 15, y: 15 });
  assert.deepEqual(moveCursor(16, { x: 5, y: 5 }, 1, -1), { x: 6, y: 4 });
  // A cursor left over from a bigger canvas is pulled back in after a resize.
  const step = stepPad(model({ cursor: { x: 50, y: 50 } }), { type: "move", dx: 0, dy: 0 });
  assert.deepEqual(step.cursor, { x: 15, y: 15 });
});

test("moving at an edge changes nothing and reports no effect", () => {
  const corner = stepPad(model({ cursor: { x: 0, y: 0 } }), { type: "move", dx: -1, dy: -1 });
  assert.equal(corner.effect, "none");
  const inside = stepPad(model(), { type: "move", dx: 1, dy: 0 });
  assert.equal(inside.effect, "cursor");
  assert.deepEqual(inside.cursor, { x: 5, y: 4 });
});

test("paint and erase act on the cursor pixel of the current frame only", () => {
  const start = model();
  const painted = stepPad(start, { type: "paint" });
  assert.equal(painted.effect, "commit");
  assert.deepEqual(pixel(painted.snapshot, 4, 4), { ...parseHex("#ff004d"), a: 255 });
  assert.equal(pixel(painted.snapshot, 5, 4).a, 0);
  assert.equal(pixel(start.snapshot, 4, 4).a, 0, "the old snapshot is not mutated");

  const again = stepPad({ ...painted }, { type: "paint" });
  assert.equal(again.effect, "none", "same color on the same pixel changes nothing");

  const erased = stepPad(painted, { type: "erase" });
  assert.equal(erased.effect, "commit");
  assert.equal(pixel(erased.snapshot, 4, 4).a, 0);
  assert.equal(stepPad(erased, { type: "erase" }).effect, "none", "erasing an empty pixel is not an undo step");

  assert.equal(paintCell(start.snapshot, { x: 1, y: 1 }, "not-a-color"), start.snapshot);
  const outside = paintCell(start.snapshot, { x: 99, y: 99 }, "#00e436");
  assert.equal(pixel(outside, 15, 15).g, 0xe4, "an out-of-range cursor is clamped, not dropped");
});

test("frame switching with L1 and R1 clamps at both ends and keeps the pixels", () => {
  const two: FrameSnapshot = {
    size: 16,
    index: 0,
    frames: [new Uint8ClampedArray(16 * 16 * 4), new Uint8ClampedArray(16 * 16 * 4)],
  };
  let current = model({ snapshot: two });
  const prevAtStart = stepPad(current, { type: "framePrev" });
  assert.equal(prevAtStart.effect, "none");
  const next = stepPad(current, { type: "frameNext" });
  assert.equal(next.effect, "select");
  assert.equal(next.snapshot.index, 1);
  assert.equal(next.snapshot.frames, two.frames, "frame data is shared, not copied");
  current = next;
  assert.equal(stepPad(current, { type: "frameNext" }).effect, "none");
  assert.equal(stepPad(current, { type: "framePrev" }).snapshot.index, 0);

  const painted = stepPad(current, { type: "paint" });
  assert.equal(pixel(painted.snapshot, 4, 4).a, 255, "paint lands on frame 2");
  assert.equal(getPixel(16, painted.snapshot.frames[0] as Uint8ClampedArray, 4, 4).a, 0, "frame 1 stays empty");
});

test("□ and △ cycle the palette color back and forward and wrap around", () => {
  const first = colors[0] as string;
  const last = colors[colors.length - 1] as string;
  assert.equal(cycleColor(colors, first, 1), colors[1]);
  assert.equal(cycleColor(colors, first, -1), last);
  assert.equal(cycleColor(colors, last, 1), first);
  assert.equal(cycleColor(colors, "#FF004D", 1), colors[colors.indexOf("#ff004d") + 1]);
  assert.equal(cycleColor(colors, "#123456", 1), first, "a custom color starts at the first swatch");
  assert.equal(cycleColor(colors, "#123456", -1), last);
  assert.equal(cycleColor([], "#123456", 1), null);

  const next = stepPad(model({ color: first }), { type: "colorNext" });
  assert.equal(next.effect, "color");
  assert.equal(next.color, colors[1]);
  assert.equal(stepPad(model({ color: first }), { type: "colorPrev" }).color, last);
  assert.equal(stepPad(model({ colors: [first], color: first }), { type: "colorNext" }).effect, "none");
});

test("undo, redo, and play are left to the editor", () => {
  for (const type of ["undo", "redo", "play"] as const) {
    const step = stepPad(model(), { type });
    assert.equal(step.effect, "none");
  }
});

test("end to end with a mocked getGamepads: move, paint, next color, new frame, erase", () => {
  const nav = fakeNavigator([pad()]);
  let memory = new Map<number, PadMemory>();
  let state = model({ snapshot: { size: 16, index: 0, frames: [new Uint8ClampedArray(16 * 16 * 4), new Uint8ClampedArray(16 * 16 * 4)] } });
  let time = 0;

  function frame(down: number[]) {
    nav.set([pad(down)]);
    time += 16;
    const polled = pollPads(readNavigatorPads(nav), memory, time);
    memory = polled.memory;
    for (const action of polled.actions) {
      const step = stepPad(state, action);
      state = { snapshot: step.snapshot, cursor: step.cursor, color: step.color, colors: step.colors };
    }
  }

  frame([]);
  frame([15]);
  frame([]);
  frame([13]);
  frame([]);
  assert.deepEqual(state.cursor, { x: 5, y: 5 });
  frame([0]);
  frame([]);
  assert.equal(pixel(state.snapshot, 5, 5).r, 255);
  frame([3]);
  frame([]);
  assert.equal(state.color, colors[colors.indexOf("#ff004d") + 1]);
  frame([5]);
  frame([]);
  assert.equal(state.snapshot.index, 1);
  frame([0]);
  frame([]);
  assert.equal(pixel(state.snapshot, 5, 5).a, 255);
  frame([4]);
  frame([]);
  assert.equal(state.snapshot.index, 0);
  frame([1]);
  assert.equal(pixel(state.snapshot, 5, 5).a, 0, "erase on frame 1");
  assert.equal(
    getPixel(16, state.snapshot.frames[1] as Uint8ClampedArray, 5, 5).a,
    255,
    "frame 2 keeps its pixel",
  );
  assert.ok(nav.calls >= 14, "getGamepads is read once per poll");
});

test("keyboard cursor on the focused canvas: arrows, Enter or Space, Delete or Backspace", () => {
  const plain = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  assert.deepEqual(cursorKeyAction({ ...plain, key: "ArrowLeft" }), { type: "move", dx: -1, dy: 0 });
  assert.deepEqual(cursorKeyAction({ ...plain, key: "ArrowRight" }), { type: "move", dx: 1, dy: 0 });
  assert.deepEqual(cursorKeyAction({ ...plain, key: "ArrowUp" }), { type: "move", dx: 0, dy: -1 });
  assert.deepEqual(cursorKeyAction({ ...plain, key: "ArrowDown" }), { type: "move", dx: 0, dy: 1 });
  assert.deepEqual(cursorKeyAction({ ...plain, key: "Enter" }), { type: "paint" });
  assert.deepEqual(cursorKeyAction({ ...plain, key: " " }), { type: "paint" });
  assert.deepEqual(cursorKeyAction({ ...plain, key: "Delete" }), { type: "erase" });
  assert.deepEqual(cursorKeyAction({ ...plain, key: "Backspace" }), { type: "erase" });
  assert.equal(cursorKeyAction({ ...plain, key: "b" }), null);
  assert.equal(cursorKeyAction({ ...plain, key: "ArrowRight", shiftKey: true }), null, "Shift+Arrow still moves the frame");
  assert.equal(cursorKeyAction({ ...plain, key: "z", ctrlKey: true }), null);
});

test("the editor polls once per animation frame, stops when hidden or without a pad, and skips text fields", () => {
  const editor = readFileSync(new URL("./editor.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(editor, /readNavigatorPads\(navigator\)/);
  assert.match(editor, /requestAnimationFrame\(loop\)/);
  assert.match(editor, /cancelAnimationFrame\(raf\)/);
  assert.match(editor, /"gamepadconnected"/);
  assert.match(editor, /"gamepaddisconnected"/);
  assert.match(editor, /"visibilitychange"/);
  assert.match(editor, /document\.hidden/);
  assert.match(editor, /connectedPads\(pads\)\.length === 0/);
  assert.match(editor, /isTypingTarget\(document\.activeElement\)/);
  assert.match(editor, /data-testid="pad-cursor"/);
  assert.match(editor, /data-testid="pad-status"/);
  assert.match(editor, /tabIndex=\{0\}/);
  assert.match(styles, /\.pad-cursor/);
});

test("gamepad copy exists in German and English, names the buttons, and announces connect", () => {
  for (const lang of ["de", "en"] as const) {
    const text = copy[lang];
    assert.match(text.gamepadHint, /×/);
    assert.match(text.gamepadHint, /○/);
    assert.match(text.gamepadHint, /□/);
    assert.match(text.gamepadHint, /△/);
    assert.match(text.gamepadHint, /L1/);
    assert.match(text.gamepadHint, /R1/);
    assert.match(text.gamepadHint, /Options/);
    assert.match(text.gamepadOn, /\{name\}/);
    assert.ok(text.announceGamepadOn.length > 0);
    assert.match(text.announcePixelPainted, /\{x\}.*\{y\}/);
  }
  assert.match(copy.de.gamepadHint, /Steuerkreuz/);
  assert.match(copy.en.gamepadHint, /D-pad/);
});
