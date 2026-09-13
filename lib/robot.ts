import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { solveArm } from "./ik";
import type { Pose, RigDriver } from "@/types/avatar";

export async function createRobot(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
): Promise<RigDriver> {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.VSMShadowMap;
  renderer.toneMapping = T.AgXToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 0.01, 20);
  camera.position.set(0.04, 0.57, 2.25);
  camera.lookAt(0, 0.51, 0);
  const pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.55;
  room.dispose();
  pmrem.dispose();
  const light = new T.DirectionalLight(0xfff3e3, 3.4);
  light.position.set(-1, 2, 2);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -1;
  light.shadow.camera.right = 1;
  light.shadow.radius = 5;
  light.shadow.blurSamples = 12;
  light.shadow.camera.top = 1.4;
  light.shadow.camera.bottom = -1;
  light.shadow.normalBias = 0.005;
  scene.add(light, new T.HemisphereLight(0xfff7ee, 0xc3b5a4, 1.4));
  const ground = new T.Mesh(
    new T.PlaneGeometry(200, 200),
    new T.ShadowMaterial({ opacity: 0.14 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.001;
  ground.receiveShadow = true;
  scene.add(ground);
  let frame = 0;
  const dispose = () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    scene.traverse((object) => {
      if (object instanceof T.Mesh) {
        object.geometry.dispose();
        for (const mat of Array.isArray(object.material)
          ? object.material
          : [object.material])
          mat.dispose();
      }
    });
    env.dispose();
    renderer.dispose();
  };
  const resize = () => {
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = Math.max(
      2.25,
      1.22 / (2 * Math.tan(T.MathUtils.degToRad(15)) * camera.aspect),
    );
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync("/avatar/robot.glb");
  } catch (error) {
    dispose();
    throw error;
  }
  const model = gltf.scene;
  model.scale.setScalar(1 / 5.56);
  scene.add(model);
  model.updateMatrixWorld(true);
  if (signal.aborted) {
    dispose();
    throw new DOMException("Aborted", "AbortError");
  }
  const bones = new Map<string, T.Bone>();
  model.traverse((object) => {
    if (object instanceof T.Bone)
      bones.set(object.name.replace("mixamorig", "").replace(":", ""), object);
    if (object instanceof T.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
    }
  });
  const bone = (name: string) => {
    const result = bones.get(name);
    if (!result) throw new Error(`Missing rig bone: ${name}`);
    return result;
  };
  const rest = new Map(
    [...bones.values()].map((b) => [
      b,
      {
        local: b.quaternion.clone(),
        world: b.getWorldQuaternion(new T.Quaternion()),
      },
    ]),
  );
  const position = (b: T.Object3D) => b.getWorldPosition(new T.Vector3());
  const worldRotation = (b: T.Bone, rotation: T.Quaternion) =>
    b.quaternion.copy(
      b
        .parent!.getWorldQuaternion(new T.Quaternion())
        .invert()
        .multiply(rotation),
    );
  const aim = (b: T.Bone, child: T.Bone, target: T.Vector3) => {
    const origin = position(b);
    const delta = new T.Quaternion().setFromUnitVectors(
      position(child).sub(origin).normalize(),
      target.clone().sub(origin).normalize(),
    );
    worldRotation(b, delta.multiply(b.getWorldQuaternion(new T.Quaternion())));
    model.updateMatrixWorld(true);
  };
  const basis = (direction: T.Vector3, normal: T.Vector3) => {
    const y = direction.clone().normalize(),
      z = normal.clone().addScaledVector(y, -normal.dot(y));
    if (z.lengthSq() < 1e-8) z.set(1, 0, 0).addScaledVector(y, -y.x);
    z.normalize();
    return new T.Matrix4().makeBasis(y.clone().cross(z).normalize(), y, z);
  };
  const arms = (["Left", "Right"] as const).map((side) => {
    const upper = bone(side + "Arm"),
      fore = bone(side + "ForeArm"),
      hand = bone(side + "Hand");
    const restDirection = position(bone(side + "HandMiddle1"))
      .sub(position(hand))
      .normalize();
    return {
      side,
      upper,
      fore,
      hand,
      a: position(upper).distanceTo(position(fore)),
      b: position(fore).distanceTo(position(hand)),
      restBasis: basis(restDirection, new T.Vector3(0, 1, 0)).invert(),
    };
  });
  const apply = (requested: Pose) => {
    const pose = structuredClone(requested);
    let constrained = false;
    for (const [b, r] of rest) b.quaternion.copy(r.local);
    model.updateMatrixWorld(true);
    for (const arm of arms) {
      const { side, upper, fore, hand, a, b, restBasis } = arm;
      const sign = side === "Left" ? 1 : -1,
        channel = pose[side === "Left" ? "left" : "right"];
      const target = new T.Vector3(...channel.position);
      const solved = solveArm(
        position(upper),
        target,
        new T.Vector3(sign * 0.324, 0.414, 0.063),
        a,
        b,
      );
      constrained ||= target.distanceTo(solved.wrist) > 0.001;
      aim(upper, fore, solved.elbow);
      aim(fore, hand, solved.wrist);
      channel.position = position(hand).toArray();
      const forward = position(hand).sub(position(fore)).normalize();
      const wanted = new T.Vector3(...channel.direction).normalize();
      const angle = forward.angleTo(wanted),
        limit = T.MathUtils.degToRad(35);
      if (angle > limit) {
        wanted
          .copy(forward)
          .applyQuaternion(
            new T.Quaternion().slerp(
              new T.Quaternion().setFromUnitVectors(
                forward,
                new T.Vector3(...channel.direction).normalize(),
              ),
              limit / angle,
            ),
          );
        constrained = true;
      }
      channel.direction = wanted.toArray();
      const rotation = new T.Quaternion().setFromRotationMatrix(
        basis(wanted, new T.Vector3(0, 0, -1)).multiply(restBasis),
      );
      worldRotation(hand, rotation.multiply(rest.get(hand)!.world));
      for (const [i, digit] of [
        "Thumb",
        "Index",
        "Middle",
        "Ring",
        "Pinky",
      ].entries())
        for (let segment = 1; segment <= 3; segment++) {
          const p = bone(side + "Hand" + digit + segment),
            r = rest.get(p)!;
          const axis = new T.Vector3(0, 0, -sign).applyQuaternion(
            r.world.clone().invert(),
          );
          p.quaternion
            .copy(r.local)
            .multiply(
              new T.Quaternion().setFromAxisAngle(
                axis,
                channel.curls[i] * T.MathUtils.degToRad(55),
              ),
            );
        }
      model.updateMatrixWorld(true);
    }
    const head = bone("Head"),
      headRest = rest.get(head)!;
    const delta = new T.Quaternion()
      .setFromAxisAngle(new T.Vector3(0, 1, 0), pose.head.yaw)
      .multiply(
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(1, 0, 0),
          pose.head.nod,
        ),
      );
    worldRotation(head, delta.multiply(headRest.world));
    model.updateMatrixWorld(true);
    return { pose, constrained };
  };
  const render = () => {
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  render();
  return { apply, dispose };
}
