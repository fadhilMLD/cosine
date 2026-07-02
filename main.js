import * as THREE from "https://unpkg.com/three@0.179.1/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.179.1/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "https://unpkg.com/three@0.179.1/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "https://unpkg.com/three@0.179.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.179.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.179.1/examples/jsm/postprocessing/UnrealBloomPass.js";

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Camera
const camera = new THREE.PerspectiveCamera(
    8,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(100, 25, 100);
camera.lookAt(0, 5, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({
    antialias: true
});
const canvasContainer = document.getElementById('threeCanvasContainer');
const initialWidth = Math.max(canvasContainer.clientWidth, 800);
const initialHeight = Math.max(canvasContainer.clientHeight, 600);
renderer.setSize(initialWidth, initialHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
canvasContainer.appendChild(renderer.domElement);

// Effect Composer with Bloom
const composer = new EffectComposer(renderer);
composer.setSize(initialWidth, initialHeight);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(1400, 900),
    0.8, // strength
    0.4, // radius
    0.85 // threshold
);
composer.addPass(bloomPass);


// Lights
const ambient = new THREE.AmbientLight(0x80008, 100.3);
scene.add(ambient);


// ===========================
const pointLight = new THREE.PointLight(0xffffff, 3, 1000, 0.2);
pointLight.position.set(10, 18, 5);
pointLight.castShadow = true;
scene.add(pointLight);




// Optional: Add a helper to visualize the light position
const lightHelper = new THREE.PointLightHelper(pointLight, 0.5);
scene.add(lightHelper);

// Optional: Add a small sphere to show where the light is
const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
);
sphere.position.copy(pointLight.position);
scene.add(sphere);

// ==============================



// Ground
const textureLoader = new THREE.TextureLoader();
const groundTexture = textureLoader.load('tiles.png');
groundTexture.wrapS = THREE.RepeatWrapping;
groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(3, 3);
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({
        map: groundTexture,
        roughness: 1,
        metalness: 2,
        envMapIntensity: 1.0
    })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Animation Variables
let robot = null;
let mixer = null;
let book_mixer = null;
let book = null;
let bookCurrentAction = null;  // Track current book animation
let idleAction = null;
let walkAction = null;
let currentAction = null;
let moving = false;
const targetPosition = new THREE.Vector3();
const clock = new THREE.Clock();

// Rotation variables
let isRotating = false;
let rotationStartTime = 0;
const rotationDuration = 0.3;
let startQuaternion = new THREE.Quaternion();
let targetQuaternion = new THREE.Quaternion();

// Book animation actions
let bookIdle = null;
let bookOut = null;
let bookOutStable = null;
let bookIn = null;

// Book state for K key toggle
let isBookOpen = false;  // false = closed (idle), true = open (out_stable)

// Animation Switching for Robot
function switchAnimation(newAction) {
    if (!newAction) return;
    if (currentAction === newAction) return;
    
    if (currentAction) {
        currentAction.fadeOut(0.25);
    }
    
    newAction
        .reset()
        .fadeIn(0.25)
        .play();
    currentAction = newAction;
}

// Animation Switching for Book
function switchBookAnimation(newAction) {
    if (!newAction) return;
    if (bookCurrentAction === newAction) return;
    
    if (bookCurrentAction) {
        bookCurrentAction.fadeOut(0.25);
    }
    
    newAction
        .reset()
        .fadeIn(0.25)
        .play();
    bookCurrentAction = newAction;
    console.log(`📚 Book animation switched to: ${newAction.getClip().name}`);
}

// Book Toggle Function - Press K to cycle
function toggleBookAnimation() {
    if (!bookIdle || !bookOut || !bookOutStable || !bookIn) {
        console.warn("Book animations not fully loaded yet");
        return;
    }
    
    if (!isBookOpen) {
        // CLOSED → OPEN: Play Out → OutStable
        console.log("📖 Opening book...");
        
        // First play Out animation
        switchBookAnimation(bookOut);
        isBookOpen = true;
        
        // After Out finishes (assuming ~1 second), switch to OutStable
        // We'll use a timeout, but you can adjust the delay based on your animation length
        setTimeout(() => {
            if (bookCurrentAction === bookOut) {
                switchBookAnimation(bookOutStable);
                console.log("📖 Book is now open (stable)");
            }
        }, 500); // Adjust this delay to match your "Out" animation duration
        
    } else {
        // OPEN → CLOSED: Play In → Idle
        console.log("📖 Closing book...");
        
        // First play In animation
        switchBookAnimation(bookIn);
        isBookOpen = false;
        
        // After In finishes, switch to Idle
        setTimeout(() => {
            if (bookCurrentAction === bookIn) {
                switchBookAnimation(bookIdle);
                console.log("📖 Book is now closed (idle)");
            }
        }, 500); // Adjust this delay to match your "In" animation duration
    }
}

// Helper: Make Materials More Metallic
function makeMetallic(material, metalnessValue = 0.9, roughnessValue = 0.15) {
    if (material.isMaterial) {
        material.metalness = metalnessValue;
        material.roughness = roughnessValue;
        material.envMapIntensity = 1.5;
        material.needsUpdate = true;
        return;
    }
    
    if (Array.isArray(material)) {
        material.forEach(mat => {
            if (mat.isMaterial) {
                mat.metalness = metalnessValue;
                mat.roughness = roughnessValue;
                mat.envMapIntensity = 1.5;
                mat.needsUpdate = true;
            }
        });
    }
}

// Load Robot
const video = document.createElement('video');
video.muted = true;
video.autoplay = true;
video.loop = true;
video.playsInline = true;
video.src = './animation.webm';
video.load();

let videoLoaded = false;

video.addEventListener('canplaythrough', () => {
    video.play();
    videoLoaded = true;
    console.log("✅ WebM video loaded and playing");
});

video.addEventListener('error', (e) => {
    console.error("❌ Video failed to load:", e);
});

const loader = new GLTFLoader();
loader.load(
    "./robot.glb",
    (gltf) => {
        robot = gltf.scene;
        robot.position.set(0, 0, 0);
        
        robot.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                if (child.material) {
                    if (child.name && child.name.toLowerCase() === "screen") {
                        console.log("✅ Found screen mesh! Applying WebM texture...");
                        
                        const videoTexture = new THREE.VideoTexture(video);
                        videoTexture.repeat.set(1, 1);
                        videoTexture.wrapS = THREE.RepeatWrapping;
                        videoTexture.wrapT = THREE.RepeatWrapping;
                        videoTexture.minFilter = THREE.LinearFilter;
                        videoTexture.magFilter = THREE.LinearFilter;
                        videoTexture.needsUpdate = true;
                        
                        child.material = new THREE.MeshStandardMaterial({
                            map: videoTexture,
                            emissive: new THREE.Color(0xffffff),
                            emissiveIntensity: 0,
                            roughness: 0.1,
                            metalness: 0.0
                        });
                    } else {
                        makeMetallic(child.material, 0.9, 0.25);
                    }
                }
            }
        });

        scene.add(robot);
        console.log("Robot Animations:", gltf.animations.map(a => a.name));
        mixer = new THREE.AnimationMixer(robot);
        
        if (gltf.animations.length < 2) {
            console.error("Need at least 2 animations in robot.glb");
            return;
        }
        idleAction = mixer.clipAction(gltf.animations[1]);
        walkAction = mixer.clipAction(gltf.animations[0]);
        idleAction.play();
        currentAction = idleAction;
        console.log("✅ Robot loaded with metallic materials.");
    },
    undefined,
    (error) => {
        console.error("❌ Failed to load robot:", error);
    }
);

// Load Book
loader.load(
    "./book.glb",
    (gltf) => {
        book = gltf.scene;
        book.position.set(4, 0, -6.5);  // Positioned to the left of robot
        book.scale.set(2.5, 2.5, 2.5);
        book.rotation.set(0,-1.5708,0);
        
        scene.add(book);
        console.log("📚 Book Animations:", gltf.animations.map(a => a.name));
        
        book_mixer = new THREE.AnimationMixer(book);
        
        // Store all book animations with proper names
        // Adjust indices based on your actual animation order
        if (gltf.animations.length >= 4) {
            bookIdle = book_mixer.clipAction(gltf.animations[4]);
            bookOut = book_mixer.clipAction(gltf.animations[5]);
            bookOutStable = book_mixer.clipAction(gltf.animations[2]);
            bookIn = book_mixer.clipAction(gltf.animations[3]);
            
            // Start with idle animation
            bookIdle.play();
            bookCurrentAction = bookIdle;
            isBookOpen = false;
            
            console.log("✅ Book loaded successfully!");
            console.log("  📖 Press K to toggle book open/close");
        } else {
            console.error("Book GLB needs at least 4 animations");
        }
    },
    undefined,
    (error) => {
        console.error("❌ Failed to load book:", error);
    }
);

// Load Room (static, no animation)
loader.load(
    "./room.glb",
    (gltf) => {
        const room = gltf.scene;
        room.position.set(0, 0.7, 0);
        room.scale.set(1.7, 1.7, 1.7);
        room.receiveShadow = true;
        scene.add(room);
        console.log("✅ Room loaded successfully!");
    },
    undefined,
    (error) => {
        console.error("❌ Failed to load room:", error);
    }
);

// Mouse Click Move
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("click", (event) => {
    if (!robot) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(ground);
    
    if (hits.length > 0) {
        targetPosition.copy(hits[0].point);
        
        startQuaternion.copy(robot.quaternion);
        
        const direction = new THREE.Vector3()
            .copy(targetPosition)
            .sub(robot.position);
        direction.y = 0;
        targetQuaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            direction.clone().normalize()
        );
        
        isRotating = true;
        rotationStartTime = clock.getElapsedTime();
        
        moving = true;
        switchAnimation(walkAction);
    }
});

// Main Loop
function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();
    
    // Update robot mixer
    if (mixer) {
        mixer.update(delta);
    }
    
    // Update book mixer
    if (book_mixer) {
        book_mixer.update(delta);
    }
    
    if (robot) {
        if (isRotating) {
            const progress = Math.min(
                (elapsedTime - rotationStartTime) / rotationDuration,
                1
            );
            
            const easeProgress = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            robot.quaternion.slerpQuaternions(
                startQuaternion,
                targetQuaternion,
                easeProgress
            );
            
            if (progress >= 1) {
                isRotating = false;
                robot.quaternion.copy(targetQuaternion);
            }
        }
        
        if (moving) {
            const speed = 3;
            const direction = targetPosition.clone().sub(robot.position);
            const distance = direction.length();
            
            if (distance < 0.1) {
                moving = false;
                switchAnimation(idleAction);
            } else {
                direction.normalize();
                robot.position.add(direction.multiplyScalar(speed * delta));
                
                if (!isRotating) {
                    robot.lookAt(targetPosition.x, robot.position.y, targetPosition.z);
                }
            }
        }
    }
    
    composer.render();
}
animate();

// Resize
window.addEventListener("resize", () => {
    const width = Math.max(canvasContainer.clientWidth, 800);
    const height = Math.max(canvasContainer.clientHeight, 600);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
});

// ====================
// KEYBOARD SHORTCUTS
// ====================
window.addEventListener("keydown", (e) => {
    
    // === BOOK TOGGLE (K key) ===
    if (e.key === 'k' || e.key === 'K') {
        toggleBookAnimation();
    }
});

// Display keyboard shortcuts in console
console.log("🎮 KEYBOARD SHORTCUTS:");
console.log("  📖 Book Controls:");
console.log("    K - Toggle book open/close");
console.log("  ✨ Bloom effect enabled!");