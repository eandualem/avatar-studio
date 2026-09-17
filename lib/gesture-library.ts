import { motionSchema, type Motion } from "@/types/avatar";
import { planMotion, restPose } from "./motion";

/**
 * Charlie's expression library: gestures and postures authored once as
 * move_avatar plans through the same solver as everything else. Jev chooses
 * among them by description; code shapes tempo and repeats from the energy
 * it reports. Entries the planner composed for a request Jev could not match
 * are learned into the browser's copy of the library.
 */
export type Gesture = {
  /** Jev's option key: lowercase, underscores. */
  name: string;
  /** What the movement is, for Jev's criteria. */
  what: string;
  /** Lines that should pick it, for Jev's criteria. */
  examples: string[];
  /** Requests this entry does not satisfy, for Jev's criteria. */
  not_for?: string;
  motion: Motion;
  /** Cycles scale with energy. */
  cyclic?: boolean;
  learned?: boolean;
};

const up: [number, number, number] = [0, 1, 0];
const open: Motion["waypoints"][number]["left"] = {
  curls: [0, 0, 0, 0, 0],
};
const rest = restPose();
const lowerHands = {
  left: rest.left,
  right: rest.right,
  shoulders: rest.shoulders,
  torso: rest.torso,
  pelvis: rest.pelvis,
  head: rest.head,
};

export const seedGestures: Gesture[] = [
  {
    name: "wave",
    what: "Raise the left hand beside the head and wave it side to side; one hand only",
    examples: ["hey Charlie!", "wave at me", "bye for now", "hello there"],
    not_for:
      "waving with both hands, with the right hand, or any other variant",
    cyclic: true,
    motion: {
      interpolation: "swing",
      prepare: [
        {
          time: 0.6,
          left: {
            position: [0.29, 0.83, 0.09],
            direction: up,
            ...open,
            roll: 0,
          },
        },
      ],
      waypoints: [
        { time: 0.25, left: { position: [0.34, 0.84, 0.09] } },
        { time: 0.5, left: { position: [0.25, 0.83, 0.09] } },
      ],
      repeat: 3,
      finish: [{ time: 0.8, left: rest.left }],
    },
  },
  {
    name: "clap",
    what: "Bring both hands together in front of the chest repeatedly",
    examples: [
      "can you clap?",
      "clap for me",
      "give yourself a round of applause",
    ],
    cyclic: true,
    motion: {
      mode: "animated",
      interpolation: "swing",
      prepare: [
        {
          time: 1,
          left: { position: [0.17, 0.6, 0.2], direction: up, ...open },
          right: { position: [-0.17, 0.6, 0.2], direction: up, ...open },
        },
      ],
      waypoints: [
        {
          time: 0.35,
          left: { position: [0.075, 0.6, 0.2] },
          right: { position: [-0.075, 0.6, 0.2] },
        },
        {
          time: 0.7,
          left: { position: [0.17, 0.6, 0.2] },
          right: { position: [-0.17, 0.6, 0.2] },
        },
      ],
      repeat: 3,
      finish: [{ time: 1, ...lowerHands }],
    },
  },
  {
    name: "nod",
    what: "Nod the head yes, twice",
    examples: ["nod if you understand", "you agree, right?", "yes that's it"],
    cyclic: true,
    motion: {
      interpolation: "swing",
      waypoints: [
        { time: 0.3, head: { yaw: 0, nod: 0.18 } },
        { time: 0.6, head: { yaw: 0, nod: 0 } },
      ],
      repeat: 2,
    },
  },
  {
    name: "shake_head",
    what: "Shake the head no",
    examples: ["shake your head", "no way", "that's not right"],
    cyclic: true,
    motion: {
      interpolation: "swing",
      prepare: [{ time: 0.25, head: { yaw: 0.3, nod: 0 } }],
      waypoints: [
        { time: 0.3, head: { yaw: -0.3, nod: 0 } },
        { time: 0.6, head: { yaw: 0.3, nod: 0 } },
      ],
      repeat: 2,
      finish: [{ time: 0.3, head: { yaw: 0, nod: 0 } }],
    },
  },
  {
    name: "shrug",
    what: "Lift both shoulders with the hands turned out, unsure",
    examples: ["I don't know either", "who knows?", "shrug"],
    motion: {
      waypoints: [
        {
          time: 0.5,
          shoulders: { left: 0.22, right: 0.22 },
          head: { yaw: 0, nod: 0, tilt: 0.15 },
          left: {
            position: [0.3, 0.5, 0.1],
            direction: [0.4, -1, 0.3],
            ...open,
          },
          right: {
            position: [-0.3, 0.5, 0.1],
            direction: [-0.4, -1, 0.3],
            ...open,
          },
        },
        { time: 1.4, ...lowerHands },
      ],
    },
  },
  {
    name: "thinking",
    what: "Right hand to the chin, head tilted, looking slightly up; a held pose",
    examples: [
      "hmm let me think",
      "what's the capital of Mongolia?",
      "that's a hard one",
    ],
    motion: {
      waypoints: [
        {
          time: 0.8,
          right: {
            position: [-0.06, 0.76, 0.14],
            direction: [0.3, 1, 0.1],
            curls: [0.3, 0.6, 0.8, 0.9, 0.9],
          },
          head: { yaw: 0.15, nod: -0.08, tilt: 0.15 },
          torso: { bend: 0.03, twist: 0.05, lean: 0 },
        },
      ],
    },
  },
  {
    name: "lean_in",
    what: "Lean the torso toward the user, attentive; a held posture",
    examples: ["I have a secret", "listen to this", "tell me more"],
    motion: {
      waypoints: [
        {
          time: 0.6,
          torso: { bend: 0.14, twist: 0, lean: 0 },
          head: { yaw: 0, nod: -0.05 },
        },
      ],
    },
  },
  {
    name: "celebrate",
    what: "Both arms straight up, bouncing with joy",
    examples: ["we won!", "hooray", "celebrate with me", "I passed the exam"],
    cyclic: true,
    motion: {
      interpolation: "swing",
      prepare: [
        {
          time: 0.7,
          left: { position: [0.24, 0.98, 0.04], direction: up, ...open },
          right: { position: [-0.24, 0.98, 0.04], direction: up, ...open },
        },
      ],
      waypoints: [
        {
          time: 0.25,
          left: { position: [0.22, 0.92, 0.06] },
          right: { position: [-0.22, 0.92, 0.06] },
          shoulders: { left: 0.05, right: 0.05 },
        },
        {
          time: 0.5,
          left: { position: [0.24, 0.98, 0.04] },
          right: { position: [-0.24, 0.98, 0.04] },
          shoulders: { left: 0.18, right: 0.18 },
        },
      ],
      repeat: 3,
      finish: [{ time: 0.9, ...lowerHands }],
    },
  },
  {
    name: "run_in_place",
    what: "Jog on the spot",
    examples: ["run!", "can you run in place?", "show me your running"],
    cyclic: true,
    motion: {
      mode: "animated",
      interpolation: "swing",
      repeat: 4,
      prepare: [
        {
          time: 0.8,
          pelvis: { offset: [0, -0.025, 0], yaw: 0 },
          torso: { bend: 0.12, twist: 0, lean: 0 },
          leftFoot: { position: [0.105, 0.25, 0.15], pitch: 0, yaw: 0 },
          rightFoot: { position: [-0.105, 0.095, -0.06], pitch: 0, yaw: 0 },
          left: {
            position: [0.2, 0.59, 0.02],
            curls: [0.7, 0.7, 0.7, 0.7, 0.7],
          },
          right: {
            position: [-0.2, 0.65, 0.23],
            curls: [0.7, 0.7, 0.7, 0.7, 0.7],
          },
        },
      ],
      waypoints: [
        {
          time: 0.45,
          leftFoot: { position: [0.105, 0.095, -0.06] },
          rightFoot: { position: [-0.105, 0.25, 0.15] },
          left: { position: [0.2, 0.65, 0.23] },
          right: { position: [-0.2, 0.59, 0.02] },
        },
        {
          time: 0.9,
          leftFoot: { position: [0.105, 0.25, 0.15] },
          rightFoot: { position: [-0.105, 0.095, -0.06] },
          left: { position: [0.2, 0.59, 0.02] },
          right: { position: [-0.2, 0.65, 0.23] },
        },
      ],
      finish: [{ time: 0.8, ...rest }],
    },
  },
  {
    name: "look_left",
    what: "Turn the head to the robot's left and hold",
    examples: ["look to your left", "what's over there on your left"],
    motion: { waypoints: [{ time: 0.35, head: { yaw: 0.45, nod: 0 } }] },
  },
  {
    name: "look_right",
    what: "Turn the head to the robot's right and hold",
    examples: ["look to your right", "look over there"],
    motion: { waypoints: [{ time: 0.35, head: { yaw: -0.45, nod: 0 } }] },
  },
  {
    name: "point_forward",
    what: "Extend the left arm and point at the user",
    examples: ["point at me", "you there!", "it's you"],
    motion: {
      waypoints: [
        {
          time: 0.5,
          left: {
            position: [0.34, 0.7, 0.36],
            direction: [0, 0, 1],
            curls: [0.65, 0, 0.85, 0.85, 0.85],
          },
        },
        { time: 1.6, left: rest.left },
      ],
    },
  },
  {
    name: "bow",
    what: "Bend the torso forward in a bow and rise again",
    examples: ["take a bow", "thank you Charlie", "bow to the audience"],
    motion: {
      waypoints: [
        {
          time: 0.8,
          torso: { bend: 0.35, twist: 0, lean: 0 },
          head: { yaw: 0, nod: 0.15 },
          pelvis: { offset: [0, -0.01, -0.04], yaw: 0 },
        },
        {
          time: 1.8,
          torso: rest.torso,
          head: rest.head,
          pelvis: rest.pelvis,
        },
      ],
    },
  },
  {
    name: "laugh",
    what: "Head back and shoulders bouncing, laughing",
    examples: [
      "hahaha that's so good",
      "why did the robot cross the road?",
      "you're funny",
    ],
    cyclic: true,
    motion: {
      interpolation: "swing",
      prepare: [
        {
          time: 0.3,
          head: { yaw: 0, nod: -0.12 },
          torso: { bend: -0.06, twist: 0, lean: 0 },
        },
      ],
      waypoints: [
        { time: 0.2, shoulders: { left: 0.16, right: 0.16 } },
        { time: 0.4, shoulders: { left: 0.04, right: 0.04 } },
      ],
      repeat: 3,
      finish: [
        {
          time: 0.5,
          head: rest.head,
          torso: rest.torso,
          shoulders: rest.shoulders,
        },
      ],
    },
  },
  {
    name: "wave_both_hands",
    what: "Raise both hands beside the head and wave them together",
    examples: [
      "wave with both hands",
      "wave both hands",
      "big wave with both arms",
    ],
    cyclic: true,
    motion: {
      interpolation: "swing",
      prepare: [
        {
          time: 0.6,
          left: {
            position: [0.29, 0.83, 0.09],
            direction: up,
            ...open,
            roll: 0,
          },
          right: {
            position: [-0.29, 0.83, 0.09],
            direction: up,
            ...open,
            roll: 0,
          },
        },
      ],
      waypoints: [
        {
          time: 0.25,
          left: { position: [0.34, 0.84, 0.09] },
          right: { position: [-0.34, 0.84, 0.09] },
        },
        {
          time: 0.5,
          left: { position: [0.25, 0.83, 0.09] },
          right: { position: [-0.25, 0.83, 0.09] },
        },
      ],
      repeat: 3,
      finish: [{ time: 0.8, ...lowerHands }],
    },
  },
  {
    name: "kick_stance",
    what: "A kicking stance: weight on the left foot, right leg lifted and extended forward, left arm out; held",
    examples: [
      "get into a kicking position",
      "show me a kick",
      "kicking stance",
      "kung fu pose",
    ],
    motion: {
      waypoints: [
        {
          time: 0.5,
          pelvis: { offset: [0.1, -0.02, -0.03], yaw: -0.35 },
          torso: { bend: -0.12, twist: 0.15, lean: 0 },
          left: { position: [0.42, 0.69, 0.07], direction: [1, 0, 0] },
          right: { position: [-0.23, 0.64, 0.16] },
        },
        {
          time: 1,
          rightFoot: { position: [-0.05, 0.26, 0.15], yaw: -0.3, pitch: -0.3 },
        },
        {
          time: 1.5,
          rightFoot: { position: [-0.28, 0.42, 0.28], yaw: -0.3, pitch: -0.4 },
        },
      ],
    },
  },
  {
    name: "crouch",
    what: "A shallow crouch with bent knees and the torso forward; held",
    examples: ["crouch down", "get low", "duck"],
    motion: {
      waypoints: [
        {
          time: 0.6,
          pelvis: { offset: [0, -0.07, -0.055], yaw: 0 },
          torso: { bend: 0.2, twist: 0, lean: 0 },
        },
      ],
    },
  },
  {
    name: "raise_hand",
    what: "Raise the left hand straight up like asking a question; held",
    examples: ["raise your hand", "hands up", "who wants to go first?"],
    motion: {
      waypoints: [
        {
          time: 0.6,
          left: {
            position: [0.24, 0.98, 0.04],
            direction: up,
            ...open,
            roll: 0,
          },
        },
      ],
    },
  },
  {
    name: "open_arms",
    what: "Both arms open wide to the sides, welcoming; held briefly then lowered",
    examples: ["welcome!", "give me a hug", "ta-da", "open your arms"],
    motion: {
      waypoints: [
        {
          time: 0.7,
          left: {
            position: [0.44, 0.6, 0.16],
            direction: [1, 0.2, 0.3],
            ...open,
          },
          right: {
            position: [-0.44, 0.6, 0.16],
            direction: [-1, 0.2, 0.3],
            ...open,
          },
          torso: { bend: -0.05, twist: 0, lean: 0 },
        },
        { time: 2.2, ...lowerHands },
      ],
    },
  },
  {
    name: "dance",
    what: "A little dance: weight swaying side to side with the arms alternating",
    examples: ["dance!", "can you dance?", "show me your moves", "party time"],
    cyclic: true,
    motion: {
      interpolation: "swing",
      prepare: [
        {
          time: 0.5,
          left: {
            position: [0.3, 0.68, 0.12],
            direction: up,
            curls: [0.3, 0.3, 0.3, 0.3, 0.3],
          },
          right: {
            position: [-0.22, 0.5, 0.12],
            direction: up,
            curls: [0.3, 0.3, 0.3, 0.3, 0.3],
          },
          pelvis: { offset: [0.04, -0.01, 0], yaw: 0.05 },
          torso: { bend: 0, twist: 0.08, lean: 0.06 },
        },
      ],
      waypoints: [
        {
          time: 0.45,
          left: { position: [0.22, 0.5, 0.12] },
          right: { position: [-0.3, 0.68, 0.12] },
          pelvis: { offset: [-0.04, -0.01, 0], yaw: -0.05 },
          torso: { bend: 0, twist: -0.08, lean: -0.06 },
        },
        {
          time: 0.9,
          left: { position: [0.3, 0.68, 0.12] },
          right: { position: [-0.22, 0.5, 0.12] },
          pelvis: { offset: [0.04, -0.01, 0], yaw: 0.05 },
          torso: { bend: 0, twist: 0.08, lean: 0.06 },
        },
      ],
      repeat: 4,
      finish: [{ time: 0.8, ...rest }],
    },
  },
  {
    name: "rest",
    what: "Return to the neutral standing pose",
    examples: [
      "relax",
      "stand normally",
      "go back to your natural position",
      "back to normal",
      "that's enough, thanks",
    ],
    motion: { waypoints: [{ time: 1, ...rest }] },
  },
];

/**
 * Small body language for the second channel: while Charlie talks or
 * listens, Jev picks one of these or none. Short, subtle, and each ends
 * where it can be followed by anything.
 */
export const microGestures: Gesture[] = [
  {
    name: "nod_small",
    what: "A small nod, listening or agreeing",
    examples: ["mm-hm", "yes exactly", "I see"],
    motion: {
      interpolation: "swing",
      waypoints: [
        { time: 0.3, head: { yaw: 0, nod: 0.1 } },
        { time: 0.6, head: { yaw: 0, nod: 0 } },
      ],
      repeat: 2,
    },
  },
  {
    name: "head_tilt",
    what: "Tilt the head, curious or puzzled, then straighten",
    examples: ["really?", "how does that work?", "hmm"],
    motion: {
      waypoints: [
        { time: 0.5, head: { yaw: 0.05, nod: 0, tilt: 0.18 } },
        { time: 1.8, head: { yaw: 0, nod: 0, tilt: 0 } },
      ],
    },
  },
  {
    name: "glance_away",
    what: "Look away briefly as if thinking, then back to the user",
    examples: ["let me think", "well…", "hmm, good question"],
    motion: {
      waypoints: [
        { time: 0.5, head: { yaw: 0.3, nod: -0.06 } },
        { time: 1.7, head: { yaw: 0, nod: 0 } },
      ],
    },
  },
  {
    name: "lean_in_small",
    what: "Lean slightly toward the user, interested",
    examples: ["tell me more", "oh, what happened?"],
    motion: {
      waypoints: [
        {
          time: 0.6,
          torso: { bend: 0.09, twist: 0, lean: 0 },
          head: { yaw: 0, nod: -0.04 },
        },
      ],
    },
  },
  {
    name: "lean_back",
    what: "Ease back to an upright, relaxed stance",
    examples: ["alright", "fair enough", "okay then"],
    motion: {
      waypoints: [
        {
          time: 0.7,
          torso: { bend: -0.04, twist: 0, lean: 0 },
          head: { yaw: 0, nod: 0 },
        },
        { time: 1.6, torso: rest.torso },
      ],
    },
  },
  {
    name: "open_hands",
    what: "Both hands turn out a little at the hips, palms forward, explaining",
    examples: ["so basically", "the thing is", "here's how it works"],
    motion: {
      waypoints: [
        {
          time: 0.5,
          left: {
            position: [0.27, 0.5, 0.14],
            direction: [0.3, -0.7, 0.6],
            ...open,
          },
          right: {
            position: [-0.27, 0.5, 0.14],
            direction: [-0.3, -0.7, 0.6],
            ...open,
          },
        },
        { time: 1.8, left: rest.left, right: rest.right },
      ],
    },
  },
  {
    name: "hand_beat",
    what: "One hand lifts a little for emphasis and drops again",
    examples: ["that's the point", "exactly this", "and then"],
    motion: {
      waypoints: [
        {
          time: 0.35,
          right: {
            position: [-0.24, 0.58, 0.16],
            direction: [-0.3, 0.2, 1],
            curls: [0.2, 0.2, 0.3, 0.4, 0.4],
          },
        },
        { time: 1.1, right: rest.right },
      ],
    },
  },
  {
    name: "shrug_small",
    what: "A small shrug, not sure",
    examples: ["I'm not sure", "maybe", "who knows"],
    motion: {
      waypoints: [
        {
          time: 0.4,
          shoulders: { left: 0.14, right: 0.14 },
          head: { yaw: 0, nod: 0, tilt: 0.08 },
        },
        { time: 1.2, shoulders: rest.shoulders, head: rest.head },
      ],
    },
  },
  {
    name: "sway",
    what: "Shift the weight from one foot to the other, idling",
    examples: ["silence", "a pause in the conversation"],
    motion: {
      waypoints: [
        {
          time: 0.9,
          pelvis: { offset: [0.03, -0.005, 0], yaw: 0.03 },
          torso: { bend: 0, twist: 0, lean: 0.03 },
        },
        {
          time: 2.2,
          pelvis: { offset: [-0.02, -0.005, 0], yaw: -0.02 },
          torso: { bend: 0, twist: 0, lean: -0.02 },
        },
        { time: 3.2, pelvis: rest.pelvis, torso: rest.torso },
      ],
    },
  },
];

/** Jev's option for a movement the library does not hold. */
export const NOT_IN_LIBRARY = "not_in_library";

export function libraryCriteria(gestures: Gesture[], withFallback = true) {
  return Object.fromEntries([
    ...gestures.map((g) => [
      g.name,
      {
        what: g.what,
        examples: g.examples,
        ...(g.not_for ? { not_for: g.not_for } : {}),
      },
    ]),
    ...(withFallback
      ? [
          [
            NOT_IN_LIBRARY,
            {
              what: "The user asked for a specific movement that none of the entries above performs",
              examples: ["do a cartwheel", "touch your toes", "moonwalk"],
            },
          ],
        ]
      : []),
  ]);
}

/** The library as Jev reads it in state, one line per entry. */
export const libraryDigest = (gestures: Gesture[]) =>
  gestures.map((g) => `${g.name}: ${g.what}`);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const scaleTimes = (points: Motion["waypoints"] | undefined, factor: number) =>
  points?.map((p) => ({ ...p, time: Math.max(0.2, p.time * factor) }));

/**
 * Tempo and cycles from Jev's scores: energy (0 still … 3 big and playful)
 * sets the tempo; sustain (0 brief … 2 extended) and energy set how many
 * cycles a rhythmic entry runs.
 */
export function shapeGesture(
  gesture: Gesture,
  energy: number,
  sustain = 1,
): Motion {
  const e = clamp(Number.isFinite(energy) ? energy : 1.5, 0, 3);
  const s = clamp(Number.isFinite(sustain) ? sustain : 1, 0, 2);
  const tempo = 1.2 - 0.13 * e;
  const motion = structuredClone(gesture.motion);
  motion.prepare = scaleTimes(motion.prepare, tempo);
  motion.waypoints = scaleTimes(motion.waypoints, tempo)!;
  motion.finish = scaleTimes(motion.finish, tempo);
  if (gesture.cyclic && motion.repeat)
    motion.repeat = clamp(
      Math.round(motion.repeat * (0.7 + 0.2 * e) * (0.5 + 0.5 * s)),
      1,
      20,
    );
  return motionSchema.parse(motion);
}

/** Whether a plan leaves the body at the standing rest pose. */
export function endsAtRest(motion: Motion) {
  const plan = planMotion(restPose(), motion);
  const end = plan.at(-1)!.to;
  const near = (a: number[], b: number[], tolerance: number) =>
    Math.hypot(...a.map((v, i) => v - b[i])) <= tolerance;
  return (
    near(end.left.position, rest.left.position, 0.05) &&
    near(end.right.position, rest.right.position, 0.05) &&
    near(end.pelvis.offset, rest.pelvis.offset, 0.03) &&
    near(end.leftFoot.position, rest.leftFoot.position, 0.03) &&
    near(end.rightFoot.position, rest.rightFoot.position, 0.03) &&
    Math.abs(end.torso.bend) < 0.08 &&
    Math.abs(end.head.yaw) < 0.12
  );
}

/** A plan the planner composed for a request: a held pose stays, a gesture returns to rest. */
export function normalizeLearned(label: string, motion: Motion): Motion {
  if (motion.finish || endsAtRest(motion)) return motion;
  if (/\b(pose|stance|position|posture|hold|stay|freeze)\b/i.test(label))
    return motion;
  return motionSchema.parse({
    ...motion,
    finish: [{ time: 1, ...rest }],
  });
}

/** Learned entries live in this browser only; the seed list never changes. */
export const LIBRARY_STORAGE_KEY = "avatar-studio.gesture-library";
export function learnedGestures(): Gesture[] {
  try {
    const raw = globalThis.localStorage?.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.flatMap((item) => {
      const motion = motionSchema.safeParse(item?.motion);
      return typeof item?.name === "string" && motion.success
        ? [{ ...item, motion: motion.data, learned: true } as Gesture]
        : [];
    });
  } catch {
    return [];
  }
}
export function gestureName(label: string) {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "learned"
  );
}
export function learnGesture(gesture: Omit<Gesture, "learned">) {
  const known = new Set(seedGestures.map((g) => g.name));
  if (known.has(gesture.name) || gesture.name === NOT_IN_LIBRARY) return false;
  const list = learnedGestures().filter((g) => g.name !== gesture.name);
  list.push({ ...gesture, learned: true });
  try {
    globalThis.localStorage?.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify(list.slice(-40)),
    );
    return true;
  } catch {
    return false;
  }
}
export function forgetLearned() {
  try {
    globalThis.localStorage?.removeItem(LIBRARY_STORAGE_KEY);
  } catch {
    /* Nothing to forget. */
  }
}
export const gestureLibrary = () => [...seedGestures, ...learnedGestures()];
