import * as THREE from "https://unpkg.com/three/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three/examples/jsm/controls/OrbitControls.js";
import { clothFunction, xSegs, ySegs, MASS } from "./lib.js";
import { Cloth } from "./cloth.js";

/*
 * Cloth Simulation using a relaxed constraints solver
 */

// Suggested Readings

// Advanced Character Physics by Thomas Jakobsen Character
// http://freespace.virgin.net/hugo.elias/models/m_cloth.htm
// http://en.wikipedia.org/wiki/Cloth_modeling
// http://cg.alexandra.dk/tag/spring-mass-system/
// Real-time Cloth Animation http://www.darwin3d.com/gamedev/articles/col0599.pdf

const cloths = [];
const randoms = [];
for (let i = 0; i < 4; i++) {
  cloths.push(new Cloth(xSegs, ySegs));
  randoms.push(Math.random() * 10000);
}

const GRAVITY = 981 * 1.4;
const gravity = new THREE.Vector3(0, -GRAVITY, 0).multiplyScalar(MASS);

const TIMESTEP = 18 / 1000;
const TIMESTEP_SQ = TIMESTEP * TIMESTEP;

const windForce = new THREE.Vector3(0, 0, 0);
const tmpForce = new THREE.Vector3();
const diff = new THREE.Vector3();

function simulate(now) {
  // Aerodynamics forces
  let indx;
  const normal = new THREE.Vector3();

  clothGeometries.forEach((clothGeometry, idx) => {
    const rand = now + randoms[idx];
    const windStrength = Math.cos(rand / 7000) * 10 + 5;

    windForce.set(
      Math.sin(rand / 2000),
      Math.cos(rand / 3000),
      Math.sin(rand / 1000)
    );
    windForce.normalize();
    windForce.multiplyScalar(windStrength);

    const particles = cloths[idx].particles;
    const indices = clothGeometry.index;
    const normals = clothGeometry.attributes.normal;

    for (let i = 0, il = indices.count; i < il; i += 3) {
      for (let j = 0; j < 3; j++) {
        indx = indices.getX(i + j);
        normal.fromBufferAttribute(normals, indx);
        tmpForce.copy(normal).normalize().multiplyScalar(normal.dot(windForce));
        particles[indx].addForce(tmpForce);
      }
    }

    for (let i = 0, il = particles.length; i < il; i++) {
      const particle = particles[i];
      particle.addForce(gravity);

      particle.integrate(TIMESTEP_SQ);
    }

    // Start Constraints
    const constraints = cloths[idx].constraints;
    const il = constraints.length;

    const satisfyConstraints = function (p1, p2, distance) {
      diff.subVectors(p2.position, p1.position);
      const currentDist = diff.length();
      if (currentDist === 0) return; // prevents division by 0
      const correction = diff.multiplyScalar(1 - distance / currentDist);
      const correctionHalf = correction.multiplyScalar(0.5);
      p1.position.add(correctionHalf);
      p2.position.sub(correctionHalf);
    };

    for (let i = 0; i < il; i++) {
      const constraint = constraints[i];
      satisfyConstraints(constraint[0], constraint[1], constraint[2]);
    }

    // Floor Constraints
    for (let i = 0, il = particles.length; i < il; i++) {
      const particle = particles[i];
      const pos = particle.position;
      if (pos.y < -250) {
        pos.y = -250;
      }
    }

    // Pin Constraints
    for (let i = 0; i <= cloths[0].w; i++) {
      const p = particles[i + particles.length - 1 - cloths[0].w];
      p.position.copy(p.original);
      p.previous.copy(p.original);
    }
  });
}

/* testing cloth simulation */

let stats;
let camera, scene, renderer;

const clothGeometries = [];

init();
animate(0);

function init() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  // scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x341602);
  scene.fog = new THREE.Fog(0x341602, 500, 10000);

  // camera
  camera = new THREE.PerspectiveCamera(
    20,
    window.innerWidth / window.innerHeight,
    1,
    10000
  );
  camera.position.set(1000, -50, 1500);

  // lights
  scene.add(new THREE.AmbientLight(0x666666));

  const light = new THREE.DirectionalLight(0xdfebff, 1);
  light.position.set(50, 200, 100);
  light.position.multiplyScalar(1.3);

  light.castShadow = true;

  light.shadow.mapSize.width = 1024;
  light.shadow.mapSize.height = 1024;

  const d = 300;

  light.shadow.camera.left = -d;
  light.shadow.camera.right = d;
  light.shadow.camera.top = d;
  light.shadow.camera.bottom = -d;

  light.shadow.camera.far = 1000;

  scene.add(light);

  // cloth material
  const loader = new THREE.TextureLoader();

  // cloth geometry
  cloths.forEach((cloth, i) => {
    const clothTexture = loader.load(`textures/patterns/shop-curtain-${i}.png`);
    clothTexture.anisotropy = 16;
    clothTexture.encoding = THREE.sRGBEncoding;

    const clothMaterial = new THREE.MeshLambertMaterial({
      map: clothTexture,
      side: THREE.DoubleSide,
      alphaTest: 1,
    });

    const clothGeometry = new THREE.ParametricBufferGeometry(
      clothFunction,
      cloth.w,
      cloth.h
    );
    clothGeometries.push(clothGeometry);

    // cloth mesh
    const object = new THREE.Mesh(clothGeometry, clothMaterial);
    object.position.set(i * 100 - 150, -125, 0);
    object.castShadow = true;
    scene.add(object);

    object.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: clothTexture,
      alphaTest: 0.5,
    });
  });

  // ground
  const groundTexture = loader.load("textures/terrain/ground.jpg");
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(200, 200);
  groundTexture.anisotropy = 16;
  groundTexture.encoding = THREE.sRGBEncoding;

  const groundMaterial = new THREE.MeshLambertMaterial({ map: groundTexture });
  let mesh = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(20000, 20000),
    groundMaterial
  );
  mesh.position.y = -200;
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // pole
  mesh = new THREE.Mesh(
    new THREE.CylinderBufferGeometry(5, 5, 500, 20),
    new THREE.MeshStandardMaterial({ color: 0x8b4315 })
  );
  mesh.position.y = 60;
  mesh.position.x = 0;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);
  mesh.rotation.set(Math.PI / 2, 0, Math.PI / 2);

  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  container.appendChild(renderer.domElement);

  renderer.outputEncoding = THREE.sRGBEncoding;

  renderer.shadowMap.enabled = true;

  // controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI * 0.5;
  controls.minDistance = 1000;
  controls.maxDistance = 5000;

  window.addEventListener("resize", onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(now) {
  requestAnimationFrame(animate);
  simulate(now);
  render();
}

function render() {
  cloths.forEach((cloth, idx) => {
    const p = cloth.particles;

    for (let i = 0, il = p.length; i < il; i++) {
      const v = p[i].position;

      clothGeometries[idx].attributes.position.setXYZ(i, v.x, v.y, v.z);
    }

    clothGeometries[idx].attributes.position.needsUpdate = true;

    clothGeometries[idx].computeVertexNormals();
  });

  renderer.render(scene, camera);
}
