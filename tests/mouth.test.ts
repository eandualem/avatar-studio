import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Vector3 } from "three";
import { createSpeechMouth, speechOpening } from "@/lib/speech-mouth";

it("closes on silence/blocked playback and follows the exported head while opening", async () => {
  expect(speechOpening(0, true)).toBe(0);
  expect(speechOpening(0.5, false)).toBe(0);
  expect(speechOpening(NaN, true)).toBe(0);
  expect(speechOpening(0.05, true)).toBeGreaterThan(0);
  const buffer = await readFile("public/avatar/robot.glb");
  const { scene } = await new GLTFLoader().parseAsync(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
    "",
  );
  scene.scale.setScalar(1 / 5.56);
  scene.updateMatrixWorld(true);
  const mouth = createSpeechMouth(scene);
  const mesh = scene.getObjectByName("Charlie.SpeakingMouth")!;
  expect(mesh.visible).toBe(false);
  mouth.setLevel(1);
  mouth.tick(0.2);
  expect(mesh.visible).toBe(true);
  const openHeight = mesh.scale.y;
  const before = mesh.getWorldPosition(new Vector3());
  mesh.parent!.rotation.z += 0.2;
  scene.updateMatrixWorld(true);
  expect(
    mesh.getWorldPosition(new Vector3()).distanceTo(before),
  ).toBeGreaterThan(0.01);
  mouth.setLevel(0);
  mouth.tick(1);
  expect(mesh.visible).toBe(false);
  expect(mesh.scale.y).toBeLessThan(openHeight / 4);
});
