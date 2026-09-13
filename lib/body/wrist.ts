import { MathUtils, Quaternion, Vector3 } from "three";

export const WRIST_SWING = MathUtils.degToRad(35);
export const WRIST_ROLL = 0.6;

// Decompose in the forearm frame so interpolation cannot escape the joint cone.
export function constrainWrist(rotation: Quaternion, axis: Vector3) {
  const projection = new Vector3(rotation.x, rotation.y, rotation.z).dot(axis);
  const twist = new Quaternion(
    ...axis.clone().multiplyScalar(projection).toArray(),
    rotation.w,
  ).normalize();
  if (twist.w < 0) twist.set(-twist.x, -twist.y, -twist.z, -twist.w);
  const roll = MathUtils.clamp(
    2 * Math.atan2(new Vector3(twist.x, twist.y, twist.z).dot(axis), twist.w),
    -WRIST_ROLL,
    WRIST_ROLL,
  );
  const swing = rotation.clone().multiply(twist.clone().invert()).normalize();
  const angle = swing.angleTo(new Quaternion());
  if (angle > WRIST_SWING)
    swing
      .identity()
      .slerp(
        rotation.clone().multiply(twist.clone().invert()),
        WRIST_SWING / angle,
      );
  rotation
    .copy(swing)
    .multiply(new Quaternion().setFromAxisAngle(axis, roll))
    .normalize();
  return { roll, swing: Math.min(angle, WRIST_SWING) };
}
