import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createBodyRig } from "./body/rig";
import { initializeContacts } from "./body/collision";
import type { RigDriver } from "@/types/avatar";

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
  model.traverse((object) => {
    if (object instanceof T.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
    }
  });
  let body;
  try {
    await initializeContacts();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    body = createBodyRig(model);
  } catch (error) {
    dispose();
    throw error;
  }
  const render = () => {
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  render();
  return { apply: body.apply, halt: body.halt, dispose };
}
