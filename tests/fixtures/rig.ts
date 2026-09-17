import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createBodyRig } from "@/lib/body/rig";
import { interpolate, motionEase, planMotion, restPose } from "@/lib/motion";
import type { Motion } from "@/types/avatar";

export async function loadRig() {
  const bytes = await readFile("public/avatar/robot.glb");
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  scene.scale.setScalar(1 / 5.56);
  scene.updateMatrixWorld(true);
  return createBodyRig(scene);
}

/**
 * Runs a plan on the shipped skeleton at 60 fps from the rest pose and reports
 * what the engine would: collisions, unsupported grounded frames, floor
 * penetration and the solver's reasons.
 */
export async function runOnRig(motion: Motion) {
  const rig = await loadRig();
  const plan = planMotion(rig.apply(restPose()).pose, motion);
  const duration = plan.at(-1)!.start + plan.at(-1)!.duration;
  const problems = new Set<string>();
  let actual = rig.apply(restPose());
  for (let frame = 1; frame <= Math.ceil((duration + 3) * 60); frame++) {
    const time = frame / 60;
    const segment = plan.find((s) => time < s.start + s.duration) ?? plan.at(-1)!;
    actual = rig.apply(
      interpolate(
        segment.from,
        segment.to,
        motionEase(
          Math.min(1, Math.max(0, (time - segment.start) / segment.duration)),
          segment.swing,
        ),
      ),
      1 / 60,
      motion.mode,
    );
    const d = rig.diagnostics();
    if (d.collision) problems.add(`collision: ${JSON.stringify(d.collision)}`);
    if (motion.mode !== "animated" && !d.supported) problems.add("unsupported");
    if (Math.min(...d.soles.flat().map((p) => p[1])) < -0.004)
      problems.add("floor");
    actual.reasons
      ?.filter((r) => /intersect|floor|solver could/.test(r))
      .forEach((r) => problems.add(r));
    if (time >= duration && actual.settled !== false) break;
  }
  return { pose: actual.pose, target: plan.at(-1)!.to, duration, problems: [...problems] };
}
