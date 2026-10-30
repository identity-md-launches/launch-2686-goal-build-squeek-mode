import type { Move } from "../shared/types";

export type Phase =
  | "idle"
  | "checking"
  | "ready"
  | "unavailable"
  | "normal"
  | "creative"
  | "streaming"
  | "complete"
  | "cancelled"
  | "error"
  | "sleep";
export interface Scene {
  id: string;
  name: string;
  group: string;
  caption: string;
  zone: "wheel" | "nest" | "fork" | "tunnel" | "compost" | "lookout";
  prop: string;
  pose: string;
}
export const SCENES: Scene[] = [
  {
    id: "home",
    name: "Home, sweet burrow",
    group: "Idle",
    caption: "Ready when you are.",
    zone: "nest",
    prop: "( . )",
    pose: "awake",
  },
  {
    id: "sniff",
    name: "A small hello",
    group: "Idle",
    caption: "Waiting for a message.",
    zone: "fork",
    prop: "?",
    pose: "sniff",
  },
  {
    id: "snack",
    name: "Seed break",
    group: "Idle",
    caption: "No request is running.",
    zone: "compost",
    prop: "*",
    pose: "snack",
  },
  {
    id: "stretch",
    name: "Morning stretch",
    group: "Idle",
    caption: "A little room to begin.",
    zone: "wheel",
    prop: "~",
    pose: "stretch",
  },
  {
    id: "antenna",
    name: "At the lookout",
    group: "Source",
    caption: "Requesting source records.",
    zone: "lookout",
    prop: ")))",
    pose: "sniff",
  },
  {
    id: "ledger",
    name: "Check the ledger",
    group: "Source",
    caption: "Checking the source against Sepolia.",
    zone: "lookout",
    prop: "[#]",
    pose: "awake",
  },
  {
    id: "stamp",
    name: "Receipt in hand",
    group: "Source",
    caption: "An active round is verified.",
    zone: "fork",
    prop: "[+]",
    pose: "awake",
  },
  {
    id: "reused",
    name: "A familiar seed",
    group: "Source",
    caption: "Reusing a recently verified source.",
    zone: "compost",
    prop: "[=]",
    pose: "snack",
  },
  {
    id: "offline",
    name: "The quiet lookout",
    group: "Source",
    caption: "Source unavailable. Normal mode is ready.",
    zone: "lookout",
    prop: "[?]",
    pose: "sniff",
  },
  {
    id: "wheel",
    name: "The trusty wheel",
    group: "Normal route",
    caption: "Taking the straightforward approach.",
    zone: "wheel",
    prop: "->",
    pose: "run",
  },
  {
    id: "path",
    name: "The well-worn path",
    group: "Normal route",
    caption: "One request. The original goal.",
    zone: "tunnel",
    prop: "...",
    pose: "run",
  },
  {
    id: "cooldown",
    name: "Keep it steady",
    group: "Normal route",
    caption: "Cooldown keeps this turn on the normal route.",
    zone: "wheel",
    prop: "[=]",
    pose: "run",
  },
  {
    id: "fork",
    name: "A fork in the tunnel",
    group: "Creative detours",
    caption: "A creative approach was selected.",
    zone: "fork",
    prop: "< >",
    pose: "sniff",
  },
  {
    id: "invert",
    name: "Turn it around",
    group: "Creative detours",
    caption: "Selected move: invert.",
    zone: "wheel",
    prop: "<-",
    pose: "inverted",
  },
  {
    id: "subtract",
    name: "Less, but better",
    group: "Creative detours",
    caption: "Selected move: subtract.",
    zone: "compost",
    prop: "[-]",
    pose: "snack",
  },
  {
    id: "reframe",
    name: "A different lens",
    group: "Creative detours",
    caption: "Selected move: reframe.",
    zone: "lookout",
    prop: "[o]",
    pose: "sniff",
  },
  {
    id: "borrow",
    name: "A borrowed idea",
    group: "Creative detours",
    caption: "Selected move: borrow from another field.",
    zone: "tunnel",
    prop: "{+}",
    pose: "run",
  },
  {
    id: "constrain",
    name: "A smaller sandbox",
    group: "Creative detours",
    caption: "Selected move: constrain.",
    zone: "nest",
    prop: "[ ]",
    pose: "stretch",
  },
  {
    id: "challenge",
    name: "Check the premise",
    group: "Creative detours",
    caption: "Selected move: challenge an assumption.",
    zone: "fork",
    prop: "[?]",
    pose: "sniff",
  },
  {
    id: "stream",
    name: "Letters through the tunnel",
    group: "Response",
    caption: "Receiving the model’s answer.",
    zone: "tunnel",
    prop: "a b",
    pose: "run",
  },
  {
    id: "return",
    name: "Back to the burrow",
    group: "Return",
    caption: "Response received. Back to your goal.",
    zone: "nest",
    prop: "<-",
    pose: "run",
  },
  {
    id: "compost",
    name: "Room for the next idea",
    group: "Return",
    caption: "This turn is complete.",
    zone: "compost",
    prop: "* +",
    pose: "snack",
  },
  {
    id: "rest",
    name: "Feet up",
    group: "Return",
    caption: "Ready for a follow-up.",
    zone: "nest",
    prop: "~",
    pose: "stretch",
  },
  {
    id: "sleep",
    name: "Do not disturb",
    group: "Sleep",
    caption: "The habitat is resting.",
    zone: "nest",
    prop: "z Z",
    pose: "sleep",
  },
  {
    id: "moon",
    name: "Night watch",
    group: "Sleep",
    caption: "No request is running.",
    zone: "lookout",
    prop: ") .",
    pose: "sleep",
  },
  {
    id: "cancel",
    name: "A gentle stop",
    group: "Recovery",
    caption: "Request stopped. Partial text is kept.",
    zone: "fork",
    prop: "[x]",
    pose: "awake",
  },
  {
    id: "error",
    name: "A bump in the path",
    group: "Recovery",
    caption: "The request failed. Check the message in chat.",
    zone: "tunnel",
    prop: "[!]",
    pose: "sniff",
  },
  {
    id: "clear",
    name: "Fresh bedding",
    group: "Recovery",
    caption: "A new conversation is ready.",
    zone: "nest",
    prop: "+++",
    pose: "stretch",
  },
];

export function workflowScenes(
  phase: Phase,
  move: Move | null,
  reused: boolean,
  cooldown: boolean,
): string[] {
  switch (phase) {
    case "idle":
      return ["home", "sniff", "snack", "stretch"];
    case "checking":
      return ["antenna", "ledger"];
    case "ready":
      return reused ? ["reused", "home"] : ["stamp", "home"];
    case "unavailable":
      return ["offline"];
    case "normal":
      return cooldown ? ["cooldown"] : ["wheel", "path"];
    case "creative":
      return [move ?? "fork"];
    case "streaming":
      return move ? [move, "stream"] : ["stream", "wheel"];
    case "complete":
      return ["return", "compost", "rest"];
    case "cancelled":
      return ["cancel"];
    case "error":
      return ["error"];
    case "sleep":
      return ["sleep", "moon"];
  }
}

const poses: Record<string, string[]> = {
  awake: [" (\\_/)", " (o.o)", " / >o"],
  sniff: [" (\\_/)", " (o.o)>", " /|_|"],
  snack: [" (\\_/)", " (^.^)", " /o*o"],
  stretch: [" (\\_/)", "\\(o.o)/", " (_|_)"],
  run: [" (\\_/)", " (o.o)~", " _/ >"],
  inverted: [' \"|\" ', " (o.o)", " (/ \\)"],
  sleep: [" (\\_/)", " (-.-)", " (___)"],
};

/** A character canvas keeps the habitat portable and inspectable; no images or sprite sheets. */
export function habitatFrame(
  scene: Scene,
  tick: number,
  compact = false,
): string {
  const width = compact ? 44 : 68,
    height = compact ? 17 : 25;
  const canvas = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => " "),
  );
  const put = (x: number, y: number, text: string) =>
    text.split("\n").forEach((line, j) =>
      [...line].forEach((c, i) => {
        if (y + j >= 0 && y + j < height && x + i >= 0 && x + i < width)
          canvas[y + j][x + i] = c;
      }),
    );
  if (compact) {
    put(0, 0, " . . . . . . . . . . . . . . . . . . . . .");
    put(
      2,
      2,
      "   .----.                  /\\\n  /  +   \\     [detour >]  /  \\\n |  /|\\   |         |     /____\\\n  \\  +  /          |      |[]|\n   `----'       ----+----   |__|",
    );
    put(
      1,
      10,
      " ___nest___     .-----\\       {compost}\n/  ~ ~ ~  \\___/       \\_____   *  *  *\n\\_________/   \\_______/     \\__|__|__|__",
    );
    put(1, 15, " . . : . . : . . : . . : . . : . . : . .");
  } else {
    put(
      1,
      0,
      ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
    );
    put(5, 2, "         the wheel                         the lookout");
    put(
      5,
      4,
      "      .-----------.                              /\\\n    .'    \\ | /    `.           [ detour > ]      /  \\\n   /    --- + ---    \\                |         /____\\\n  |        /|\\       |       < normal |          | [] |\n  |     --( + )--    |           -----+---       |____|\n   \\       \\|/      /                |           |  |\n    `.    / | \\   .'                 |           |__|\n      `-----------'              ____|____",
    );
    put(
      4,
      17,
      "   __nest___             the tunnels        idea compost\n  /  ~ ~ ~  \\___________      _________        *   *   *\n /   ~ ~ ~   \\          \\____/         \\_______|___|___|___\n \\___________/__________/    \\_________/___________________/",
    );
    put(
      1,
      23,
      " . : . . : . . : . . : . . : . . : . . : . . : . . : . . : . . : .",
    );
  }
  const positions = compact
    ? {
        wheel: [5, 4],
        nest: [4, 8],
        fork: [20, 6],
        tunnel: [22, 10],
        compost: [34, 8],
        lookout: [34, 4],
      }
    : {
        wheel: [12, 7],
        nest: [7, 14],
        fork: [34, 13],
        tunnel: [29, 17],
        compost: [53, 14],
        lookout: [53, 8],
      };
  const [x, y] = positions[scene.zone];
  const pose = [...(poses[scene.pose] ?? poses.awake)];
  if (tick % 4 === 3 && scene.pose !== "sleep")
    pose[1] = pose[1].replaceAll("o", "-");
  if (scene.pose === "run" && tick % 2 === 1) pose[2] = " < \\_";
  put(x, y, pose.join("\n"));
  put(
    x + 6,
    y - 1,
    tick % 2 ? scene.prop : scene.prop.split("").reverse().join(""),
  );
  if (scene.zone === "wheel")
    put(compact ? 7 : 18, compact ? 3 : 5, ["|", "/", "-", "\\"][tick % 4]);
  return canvas.map((row) => row.join("").trimEnd()).join("\n");
}
