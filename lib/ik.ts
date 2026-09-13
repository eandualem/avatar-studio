import { Vector3 } from "three";

export function solveArm(
  shoulder: Vector3,
  target: Vector3,
  pole: Vector3,
  upper: number,
  lower: number,
) {
  const delta = target.clone().sub(shoulder);
  const distance = Math.max(
    Math.abs(upper - lower) + 0.0002,
    Math.min(upper + lower - 0.0002, delta.length()),
  );
  const direction =
    delta.lengthSq() > 1e-12 ? delta.normalize() : new Vector3(1, 0, 0);
  const across = pole.clone().sub(shoulder);
  across.addScaledVector(direction, -across.dot(direction));
  if (across.lengthSq() < 1e-10)
    across
      .copy(direction)
      .cross(
        Math.abs(direction.y) < 0.9
          ? new Vector3(0, 1, 0)
          : new Vector3(0, 0, 1),
      );
  const along =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const elbow = shoulder
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(
      across.normalize(),
      Math.sqrt(Math.max(0, upper * upper - along * along)),
    );
  return {
    elbow,
    wrist: shoulder.clone().addScaledVector(direction, distance),
  };
}
