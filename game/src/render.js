// Rendering: the WebGL half of the game. It builds the scene, hands the arena's geometry and
// lights to it, keeps the camera on the player's eye and draws. It never steps the simulation, so
// a slow frame stretches the picture and not the game.
import * as THREE from 'three';
import { tint } from './palette.js';

export function createRender({ arena, camera, container }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = tint('sky');
  // The air is the haze, not the night sky: distance fades into something lighter than the walls,
  // which is what gives the compound its depth without hiding what is in it.
  scene.fog = new THREE.Fog(tint('sky'), 26, 98);
  scene.add(arena.group);
  for (const light of arena.lights) scene.add(light);
  scene.add(camera);

  function sync(player) {
    camera.position.set(
      player.state.position.x,
      player.state.position.y + player.viewHeight(),
      player.state.position.z,
    );
    camera.rotation.set(player.aimPitch(), player.aimYaw(), 0, 'YXZ');
  }

  function draw() {
    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  return { scene, renderer, sync, draw, resize };
}
