import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// 1. Scene & Camera Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111116);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 0);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// 2. Audio Setup
const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();
const stepSounds = [];
const doorSound = new THREE.Audio(listener);
const switchSound = new THREE.Audio(listener);
const jumpSound = new THREE.Audio(listener);

audioLoader.load('./step1.mp3', (b) => { const s = new THREE.Audio(listener); s.setBuffer(b); s.setVolume(0.35); stepSounds.push(s); });
audioLoader.load('./step2.mp3', (b) => { const s = new THREE.Audio(listener); s.setBuffer(b); s.setVolume(0.35); stepSounds.push(s); });
audioLoader.load('./door.mp3', (b) => { doorSound.setBuffer(b); doorSound.setVolume(0.6); });
audioLoader.load('./switch.mp3', (b) => { switchSound.setBuffer(b); switchSound.setVolume(0.5); });
audioLoader.load('./huh.mp3', (b) => { jumpSound.setBuffer(b); jumpSound.setVolume(0.5); });

let stepTimer = 0;
const stepIntervalBase = 0.45;

// 3. Lighting Setup
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const roomLight = new THREE.PointLight(0xffe0b2, 5, 10);
roomLight.position.set(0, 2.3, 0);
roomLight.castShadow = true;
scene.add(roomLight);

let isLightOn = true;

// 4. Pointer Lock Controls (PC) & Touch Orbit (Mobile)
const controls = new PointerLockControls(camera, document.body);

const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

if (!isMobile) {
    document.addEventListener('click', () => {
        if (!controls.isLocked) controls.lock();
    });
} else {
    // إخفاء الأزرار لو المستخدم على الكمبيوتر
    let touchStartX = 0, touchStartY = 0;
    const lookSpeed = 0.003;

    window.addEventListener('touchstart', (e) => {
        if (e.touches[0].clientX > window.innerWidth / 2) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    });

    window.addEventListener('touchmove', (e) => {
        for (let touch of e.touches) {
            if (touch.clientX > window.innerWidth / 2) {
                const deltaX = touch.clientX - touchStartX;
                const deltaY = touch.clientY - touchStartY;

                camera.rotation.y -= deltaX * lookSpeed;
                camera.rotation.x -= deltaY * lookSpeed;
                camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));

                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
            }
        }
    });
}

// 5. Physics & Movement States
const moveState = { forward: false, backward: false, left: false, right: false, run: false, crouch: false };
let joystickVector = { x: 0, y: 0 };

const normalHeight = 1.7;
const crouchHeight = 1.0;
let targetCameraHeight = normalHeight;

let velocityY = 0;
const gravity = -20;
const jumpForce = 7;
let isGrounded = true;

const baseSpeed = 3.5;
const clock = new THREE.Clock();

// Keyboard Listeners (PC)
document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') moveState.forward = true;
    if (e.code === 'KeyS') moveState.backward = true;
    if (e.code === 'KeyA') moveState.left = true;
    if (e.code === 'KeyD') moveState.right = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') moveState.run = true;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') moveState.crouch = true;

    if (e.code === 'Space' && isGrounded && !moveState.crouch) {
        triggerJump();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') moveState.forward = false;
    if (e.code === 'KeyS') moveState.backward = false;
    if (e.code === 'KeyA') moveState.left = false;
    if (e.code === 'KeyD') moveState.right = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') moveState.run = false;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') moveState.crouch = false;
});

function triggerJump() {
    if (isGrounded && !moveState.crouch) {
        velocityY = jumpForce;
        isGrounded = false;
        if (jumpSound.buffer) {
            if (jumpSound.isPlaying) jumpSound.stop();
            jumpSound.play();
        }
    }
}

// Mobile Touch Controls & Joystick Initialization
if (typeof nipplejs !== 'undefined') {
    const joystick = nipplejs.create({
        zone: document.getElementById('joystick-zone'),
        mode: 'static',
        position: { left: '60px', bottom: '60px' },
        color: 'white'
    });

    joystick.on('move', (evt, data) => {
        if (data.vector) {
            joystickVector.x = data.vector.x;
            joystickVector.y = data.vector.y;
        }
    });

    joystick.on('end', () => {
        joystickVector.x = 0;
        joystickVector.y = 0;
    });

    document.getElementById('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); triggerJump(); });
    document.getElementById('btn-run').addEventListener('touchstart', (e) => { e.preventDefault(); moveState.run = !moveState.run; });
    document.getElementById('btn-crouch').addEventListener('touchstart', (e) => { e.preventDefault(); moveState.crouch = !moveState.crouch; });
}

// 6. Load 3D Model
let doorObject = null;
let switchObject = null;
let isDoorOpen = false;
let targetDoorRotation = 0;

const loader = new GLTFLoader();
loader.load('./room.glb', (gltf) => {
    const roomModel = gltf.scene;
    scene.add(roomModel);

    roomModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
        if (child.name === 'Door') doorObject = child;
        if (child.name === 'LightSwitch') switchObject = child;
    });
});

// 7. Raycaster for Interaction (Touch & Mouse Click)
const raycaster = new THREE.Raycaster();
const centerVector = new THREE.Vector2(0, 0);

function handleInteraction() {
    raycaster.setFromCamera(centerVector, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const hitObject = intersects[0].object;

        if (doorObject && (hitObject === doorObject || hitObject.parent === doorObject)) {
            isDoorOpen = !isDoorOpen;
            targetDoorRotation = isDoorOpen ? Math.PI / 2 : 0;
            if (doorSound.buffer) { if (doorSound.isPlaying) doorSound.stop(); doorSound.play(); }
        }

        if (switchObject && (hitObject === switchObject || hitObject.parent === switchObject)) {
            isLightOn = !isLightOn;
            roomLight.intensity = isLightOn ? 5 : 0;
            if (switchSound.buffer) { if (switchSound.isPlaying) switchSound.stop(); switchSound.play(); }
        }
    }
}

document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && (controls.isLocked || isMobile)) handleInteraction();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 8. Dynamic Boundary System
const roomBounds = { minX: -2.5, maxX: 2.5, minZ: -2.5, maxZ: 2.5 };
const doorGap = { minZ: -1.2, maxZ: 0.1 };
const outsideBounds = { minX: 2.5, maxX: 20.0, minZ: -15.0, maxZ: 15.0 };

// 9. Main Animation Loop
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (controls.isLocked || isMobile) {
        let currentSpeed = baseSpeed;
        if (moveState.run && !moveState.crouch) currentSpeed = baseSpeed * 1.8;
        else if (moveState.crouch) currentSpeed = baseSpeed * 0.5;

        const prevPos = camera.position.clone();
        
        // حساب حركة الموبايل بالأنالوج + الكيبورد
        const moveForwardVal = (moveState.forward ? 1 : 0) - (moveState.backward ? 1 : 0) + joystickVector.y;
        const moveSideVal = (moveState.right ? 1 : 0) - (moveState.left ? 1 : 0) + joystickVector.x;

        const isMoving = (moveForwardVal !== 0 || moveSideVal !== 0) && isGrounded;

        // تطبيق اتجاه الحركة بالنسبة للكاميرا
        if (moveForwardVal !== 0) controls.moveForward(moveForwardVal * currentSpeed * delta);
        if (moveSideVal !== 0) controls.moveRight(moveSideVal * currentSpeed * delta);

        // صوت الخطوات
        if (isMoving) {
            let currentInterval = stepIntervalBase;
            if (moveState.run) currentInterval = stepIntervalBase * 0.6;
            if (moveState.crouch) currentInterval = stepIntervalBase * 1.4;

            stepTimer += delta;
            if (stepTimer >= currentInterval) {
                if (stepSounds.length > 0) {
                    const randomStep = stepSounds[Math.floor(Math.random() * stepSounds.length)];
                    if (randomStep.isPlaying) randomStep.stop();
                    randomStep.play();
                }
                stepTimer = 0;
            }
        } else {
            stepTimer = stepIntervalBase;
        }

        const newPos = camera.position;

        // الحدود التصادمية
        if (prevPos.x <= roomBounds.maxX) {
            const isExitingDoor = isDoorOpen && prevPos.z >= doorGap.minZ && prevPos.z <= doorGap.maxZ && newPos.x > roomBounds.maxX;
            if (isExitingDoor) {
                newPos.x = Math.min(outsideBounds.maxX, newPos.x);
                newPos.z = Math.max(outsideBounds.minZ, Math.min(outsideBounds.maxZ, newPos.z));
            } else {
                newPos.x = Math.max(roomBounds.minX, Math.min(roomBounds.maxX, newPos.x));
                newPos.z = Math.max(roomBounds.minZ, Math.min(roomBounds.maxZ, newPos.z));
            }
        } else {
            const isEnteringDoor = isDoorOpen && newPos.z >= doorGap.minZ && newPos.z <= doorGap.maxZ && newPos.x <= roomBounds.maxX;
            if (isEnteringDoor) {
                newPos.x = Math.max(roomBounds.minX, newPos.x);
                newPos.z = Math.max(roomBounds.minZ, Math.min(roomBounds.maxZ, newPos.z));
            } else {
                newPos.x = Math.max(roomBounds.maxX, Math.min(outsideBounds.maxX, newPos.x));
                newPos.z = Math.max(outsideBounds.minZ, Math.min(outsideBounds.maxZ, newPos.z));
            }
        }

        // فيزياء القفز والارتفاع
        targetCameraHeight = moveState.crouch ? crouchHeight : normalHeight;

        if (!isGrounded) {
            velocityY += gravity * delta;
            camera.position.y += velocityY * delta;

            if (camera.position.y <= targetCameraHeight) {
                camera.position.y = targetCameraHeight;
                velocityY = 0;
                isGrounded = true;
            }
        } else {
            camera.position.y += (targetCameraHeight - camera.position.y) * 0.15;
        }
    }

    if (doorObject) {
        doorObject.rotation.y += (targetDoorRotation - doorObject.rotation.y) * 0.1;
    }

    renderer.render(scene, camera);
}

animate();