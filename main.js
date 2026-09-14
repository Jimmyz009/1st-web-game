import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import nipplejs from 'nipplejs';

// 1. Scene & Camera Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// ارتفاع عين الإنسان الطبيعي (1.7 متر)
camera.position.set(0, 1.7, 0); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// 2. Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

// 3. Audio Setup (مضبوط للعمل فوراً عند اللمس)
const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();
const soundStep1 = new THREE.Audio(listener);
const soundStep2 = new THREE.Audio(listener);

// تفعيل الـ Audio Context عند أول ضغطة/لمسة لشاشة الموبايل
function unlockAudio() {
    if (listener.context.state === 'suspended') {
        listener.context.resume();
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
}
window.addEventListener('click', unlockAudio);
window.addEventListener('touchstart', unlockAudio);

audioLoader.load('./step1.mp3', (b) => soundStep1.setBuffer(b));
audioLoader.load('./step2.mp3', (b) => soundStep2.setBuffer(b));

// 4. Load Compressed 3D Model
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

loader.load(
    './room.glb',
    (gltf) => {
        const model = gltf.scene;
        
        // الحجم الطبيعي 100% بدون تكبير مبالغ فيه
        model.scale.set(1, 1, 1); 
        model.position.set(0, 0, 0); 

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = child.receiveShadow = true;
            }
        });
        scene.add(model);
        console.log('Room loaded with realistic scale!');
    },
    undefined,
    (error) => {
        console.error('Error loading 3D model:', error);
    }
);

// 5. Controls Logic
const controls = new PointerLockControls(camera, document.body);

document.addEventListener('click', () => {
    if (!isMobile() && !controls.isLocked) {
        controls.lock();
    }
});

const moveState = { forward: 0, right: 0 };
let isRunning = false;
let isCrouching = false;
let velocityY = 0;
let isGrounded = true;
const gravity = -18;
const normalHeight = 1.7; // ارتفاع الوقوف
const crouchHeight = 0.95; // ارتفاع الانحناء

// Keyboard Controls (PC)
document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = 1; break;
        case 'KeyS': moveState.forward = -1; break;
        case 'KeyA': moveState.right = -1; break;
        case 'KeyD': moveState.right = 1; break;
        case 'ShiftLeft': isRunning = true; break;
        case 'KeyC': toggleCrouch(); break;
        case 'Space': jump(); break;
    }
});

document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': case 'KeyS': moveState.forward = 0; break;
        case 'KeyA': case 'KeyD': moveState.right = 0; break;
        case 'ShiftLeft': isRunning = false; break;
    }
});

// Mobile Controls Setup
function isMobile() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
}

if (isMobile()) {
    // Joystick
    const joystickZone = document.createElement('div');
    joystickZone.id = 'joystick-zone';
    joystickZone.style.cssText = 'position: absolute; bottom: 30px; left: 30px; width: 120px; height: 120px; z-index: 10;';
    document.body.appendChild(joystickZone);

    const manager = nipplejs.create({
        zone: joystickZone,
        mode: 'static',
        position: { left: '60px', bottom: '60px' },
        color: 'white'
    });

    manager.on('move', (evt, data) => {
        if (data.vector) {
            moveState.forward = data.vector.y;
            moveState.right = data.vector.x;
        }
    });

    manager.on('end', () => {
        moveState.forward = 0;
        moveState.right = 0;
    });

    // Touch Look
    let touchStartX = 0, touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
        if (e.touches[0].clientX > window.innerWidth / 2) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (e.touches[0].clientX > window.innerWidth / 2) {
            const deltaX = e.touches[0].clientX - touchStartX;
            const deltaY = e.touches[0].clientY - touchStartY;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;

            camera.rotation.y -= deltaX * 0.003;
            camera.rotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, camera.rotation.x - deltaY * 0.003));
        }
    });
}

function jump() {
    if (isGrounded) {
        velocityY = 6;
        isGrounded = false;
    }
}

function toggleCrouch() {
    isCrouching = !isCrouching;
    camera.position.y = isCrouching ? crouchHeight : normalHeight;
}

// 6. Animation & Sound Loop
const clock = new THREE.Clock();
let stepTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    const speed = (isRunning ? 4.5 : 2.5) * (isCrouching ? 0.5 : 1);
    const moveVector = new THREE.Vector3();
    
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    moveVector.addScaledVector(forward, moveState.forward * speed * delta);
    moveVector.addScaledVector(right, moveState.right * speed * delta);
    camera.position.add(moveVector);

    // Footstep audio logic
    const isMoving = Math.abs(moveState.forward) > 0.1 || Math.abs(moveState.right) > 0.1;
    if (isMoving && isGrounded) {
        stepTimer += delta;
        const interval = isRunning ? 0.3 : 0.5;
        if (stepTimer >= interval) {
            if (soundStep1.buffer && !soundStep1.isPlaying) soundStep1.play();
            stepTimer = 0;
        }
    }

    // Gravity
    velocityY += gravity * delta;
    camera.position.y += velocityY * delta;

    const currentBaseHeight = isCrouching ? crouchHeight : normalHeight;
    if (camera.position.y <= currentBaseHeight) {
        camera.position.y = currentBaseHeight;
        velocityY = 0;
        isGrounded = true;
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
