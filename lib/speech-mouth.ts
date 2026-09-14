import {
  Bone,
  Box3,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";

// Outgoing audio only. Silence and blocked/paused playback close the mouth.
export function speechOpening(rms: number, audible: boolean) {
  return audible && Number.isFinite(rms)
    ? Math.sqrt(Math.max(0, Math.min(1, (rms - 0.012) * 8)))
    : 0;
}

export function createSpeechMouth(model: Object3D) {
  let head: Bone | undefined, smile: Mesh | undefined;
  model.traverse((object) => {
    if (
      object instanceof Bone &&
      object.name.replace(/mixamorig:?/, "") === "Head"
    )
      head = object;
    if (object instanceof Mesh && /Faint.?smile/i.test(object.name))
      smile = object;
  });
  if (!head || !smile)
    throw new Error(
      "Charlie is missing the head or smile for speech animation.",
    );
  const bounds = new Box3().setFromObject(smile);
  const center = bounds.getCenter(new Vector3());
  const width = bounds.max.x - bounds.min.x;
  const mouth = new Mesh(
    new SphereGeometry(1, 24, 12),
    new MeshBasicMaterial({ color: 0xfff9ed }),
  );
  mouth.name = "Charlie.SpeakingMouth";
  // A small illuminated opening over the existing etched smile, following Head.
  mouth.position.copy(center).add(new Vector3(0, 0, 0.002));
  mouth.scale.set(width * 0.46, width * 0.17, 0.002);
  mouth.updateMatrixWorld(true);
  head.attach(mouth);
  const openScale = mouth.scale.clone();
  mouth.visible = false;
  const originalSmile = smile;
  let target = 0,
    level = 0;
  return {
    setLevel(value: number) {
      target = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    },
    tick(dt: number) {
      level +=
        (target - level) *
        (1 - Math.exp(-Math.max(0, dt) / (target > level ? 0.035 : 0.075)));
      mouth.visible = level > 0.015;
      originalSmile.visible = !mouth.visible;
      mouth.scale.copy(openScale);
      mouth.scale.y *= Math.max(0.08, level);
    },
  };
}
