import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";

let initialization: Promise<void> | undefined;
export const initializeContacts = () => (initialization ??= RAPIER.init());
type Capsule = {
  name: string;
  shape: RAPIER.Capsule;
  position: Vector3;
  rotation: Quaternion;
};
function capsule(
  name: string,
  start: Vector3,
  end: Vector3,
  radius: number,
): Capsule {
  const delta = end.clone().sub(start);
  return {
    name,
    shape: new RAPIER.Capsule(delta.length() / 2, radius),
    position: start.clone().add(end).multiplyScalar(0.5),
    rotation: new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      delta.normalize(),
    ),
  };
}
export function bodyContacts(position: (name: string) => Vector3) {
  const body = capsule(
    "torso",
    position("Hips").add(new Vector3(0, 0.035, 0)),
    position("Spine2"),
    0.087,
  );
  const head = capsule(
    "head",
    position("Head").add(new Vector3(0, 0.06, 0)),
    position("Head").add(new Vector3(0, 0.1, 0)),
    0.084,
  );
  const limbs: Capsule[] = [];
  for (const side of ["Left", "Right"]) {
    const shoulder = position(side + "Arm"),
      elbow = position(side + "ForeArm"),
      wrist = position(side + "Hand");
    limbs.push(
      capsule(
        side + "UpperArm",
        shoulder.clone().lerp(elbow, 0.3),
        elbow,
        0.035,
      ),
    );
    limbs.push(capsule(side + "Forearm", elbow, wrist, 0.04));
    limbs.push(
      capsule(side + "Hand", wrist, position(side + "HandMiddle1"), 0.027),
    );
    limbs.push(
      capsule(
        side + "Shin",
        position(side + "Leg"),
        position(side + "Foot"),
        0.047,
      ),
    );
  }
  const overlaps = (a: Capsule, b: Capsule) => {
    const hit = a.shape.contactShape(
      a.position,
      a.rotation,
      b.shape,
      b.position,
      b.rotation,
      0,
    );
    return hit && hit.distance < -0.001;
  };
  for (const limb of limbs) {
    if (
      !limb.name.endsWith("Shin") &&
      (overlaps(limb, body) || overlaps(limb, head))
    )
      return `${limb.name} would intersect the body`;
  }
  const left = limbs.filter((l) => l.name.startsWith("Left")),
    right = limbs.filter((l) => l.name.startsWith("Right"));
  for (const a of left)
    for (const b of right)
      if (overlaps(a, b)) return `${a.name} would intersect ${b.name}`;
  return null;
}
export function supported(center: Vector3, soles: Vector3[][]) {
  const grounded = soles.filter(
    (corners) =>
      Math.min(...corners.map((p) => p.y)) < 0.012 &&
      Math.max(...corners.map((p) => p.y)) < 0.025,
  );
  if (!grounded.length) return false;
  const vertices = new Float32Array(
    grounded.flatMap((corners) =>
      corners.flatMap((p) => [p.x, -0.01, p.z, p.x, 0.01, p.z]),
    ),
  );
  const hull = new RAPIER.ConvexPolyhedron(vertices);
  return hull.projectPoint(
    new Vector3(),
    new Quaternion(),
    new Vector3(center.x, 0, center.z),
    true,
  ).isInside;
}
