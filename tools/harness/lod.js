// lod0.glb with its clip playing, from a few angles: is the race where it should be?
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
const q = new URLSearchParams(location.search)
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true })
renderer.setSize(innerWidth, innerHeight, false)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xdddddd)
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.5))
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500)
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(q.get('file') ?? '../../lods/lod0.glb')
scene.add(gltf.scene)
const mixer = new THREE.AnimationMixer(gltf.scene)
const clip = gltf.animations[0]
const action = mixer.clipAction(clip); action.play()
window.__setTime = (t, view) => {
  mixer.setTime(t)
  const fleet = gltf.scene.getObjectByName('Fleet')
  gltf.scene.updateMatrixWorld(true)
  const b0 = new THREE.Vector3(); fleet.skeleton.bones[0].getWorldPosition(b0)
  if (view === 'near') { camera.position.copy(b0).add(new THREE.Vector3(2.5, 1.8, 2.5)); camera.lookAt(b0) }
  else { const v = view ?? [0, 30, 45]; camera.position.set(...v); camera.lookAt(0, 8, 0) }
  renderer.render(scene, camera)
  const b = new THREE.Box3()
  const out = []
  fleet.skeleton.bones.forEach(bone => { const p = new THREE.Vector3(); bone.getWorldPosition(p); out.push(p.toArray().map(x => +x.toFixed(2))) })
  fleet.computeBoundingBox()
  const sph = fleet.boundingSphere
  const v = new THREE.Vector3(); fleet.getVertexPosition(0, v)
  return { clip: clip.name, dur: clip.duration, bones: out.slice(0, 2), box: [fleet.boundingBox.min.toArray().map(x => +x.toFixed(1)), fleet.boundingBox.max.toArray().map(x => +x.toFixed(1))], v0: v.toArray().map(x => +x.toFixed(2)), parent: fleet.parent?.name, mw: fleet.matrixWorld.elements.map(x => +x.toFixed(2)), bindMode: fleet.bindMode, sphere: [sph.center.toArray().map(x => +x.toFixed(1)), +sph.radius.toFixed(1)] }
}
// like a viewer: the culling sphere worked out once, at the first frame's pose
mixer.setTime(0); gltf.scene.updateMatrixWorld(true); gltf.scene.getObjectByName('Fleet').computeBoundingSphere()
window.__ready = true
