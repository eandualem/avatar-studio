import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Bone, SkinnedMesh, Box3 } from "three";

it("ships the approved 134 rigid meshes and 65 bones without baked clips or the upload proxy", async () => {
  const buffer = await readFile("public/avatar/robot.glb");
  const asset = await new GLTFLoader().parseAsync(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
    "",
  );
  const bones = new Set<string>(),
    meshes: SkinnedMesh[] = [];
  asset.scene.traverse((object) => {
    if (object instanceof Bone) bones.add(object.name);
    if (object instanceof SkinnedMesh) meshes.push(object);
  });
  expect(bones.size).toBe(65);
  expect(meshes).toHaveLength(134);
  expect(asset.animations).toHaveLength(0);
  for (const mesh of meshes) {
    expect(mesh.name).not.toMatch(/proxy|cube/i);
    const weights = mesh.geometry.getAttribute("skinWeight");
    for (let i = 0; i < weights.count; i++)
      expect(
        [
          weights.getX(i),
          weights.getY(i),
          weights.getZ(i),
          weights.getW(i),
        ].sort(),
      ).toEqual([0, 0, 0, 1]);
  }
  const bounds = new Box3().setFromObject(asset.scene);
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(5.56, 1);
}, 20000);
