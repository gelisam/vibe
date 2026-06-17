import * as THREE from 'three';

// Constants
const COLORS = {
    white: 0xffffff,
    yellow: 0xffff00,
    red: 0xff0000,
    orange: 0xffa500,
    blue: 0x0000ff,
    green: 0x008000,
    black: 0x222222,
    pink: 0xff00ff
};

type Axis = 'x' | 'y' | 'z';

interface Move {
    axis: Axis;
    layer: number; // -1, 0, 1
    direction: number; // 1 or -1
}

enum AppState {
    IDLE,
    REVERSING,
    REVERSED
}

class RubiksCube {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    cubies: THREE.Mesh[] = [];
    cubeGroup: THREE.Group;
    isRotating = false;

    // Raycasting & Interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    isMouseDown = false;
    mouseDownPos = new THREE.Vector2();
    selectedCubie: THREE.Mesh | null = null;
    selectedFaceNormal: THREE.Vector3 | null = null;

    // History and State
    history: { move: Move, wasReversePress?: boolean, wasReverseMove?: boolean }[] = [];
    redoStack: { move: Move, wasReversePress?: boolean, wasReverseMove?: boolean }[] = [];
    appState: AppState = AppState.IDLE;
    movesToReverse: Move[] = [];
    reverseIndex = -1;

    // Arrows
    arrowGroup: THREE.Group;

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf8f9fa);

        this.camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(12, 12, 12);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
        directionalLight.position.set(5, 10, 7);
        this.scene.add(directionalLight);

        this.cubeGroup = new THREE.Group();
        this.scene.add(this.cubeGroup);

        this.arrowGroup = new THREE.Group();
        this.scene.add(this.arrowGroup);

        this.initCube();
        this.initUI();
        this.animate();

        window.addEventListener('resize', () => this.onWindowResize());

        this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('mouseup', () => this.onMouseUp());

        this.renderer.domElement.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                this.onMouseDown({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
            }
        }, { passive: false });
        this.renderer.domElement.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
            }
            e.preventDefault();
        }, { passive: false });
        this.renderer.domElement.addEventListener('touchend', () => this.onMouseUp());
    }

    initCube() {
        const size = 0.96;
        const geometry = new THREE.BoxGeometry(size, size, size);

        // Orientation: White Top (+Y), Red Front-Left (+Z), Blue Front-Right (+X)
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    const materials = [
                        new THREE.MeshBasicMaterial({ color: x === 1 ? COLORS.blue : COLORS.black }),   // +x (Front-Right)
                        new THREE.MeshBasicMaterial({ color: x === -1 ? COLORS.green : COLORS.black }),  // -x (Back-Left)
                        new THREE.MeshBasicMaterial({ color: y === 1 ? COLORS.white : COLORS.black }),   // +y (Top)
                        new THREE.MeshBasicMaterial({ color: y === -1 ? COLORS.yellow : COLORS.black }), // -y (Bottom)
                        new THREE.MeshBasicMaterial({ color: z === 1 ? COLORS.red : COLORS.black }),    // +z (Front-Left)
                        new THREE.MeshBasicMaterial({ color: z === -1 ? COLORS.orange : COLORS.black })   // -z (Back-Right)
                    ];

                    const cubie = new THREE.Mesh(geometry, materials);
                    cubie.position.set(x, y, z);

                    const edges = new THREE.EdgesGeometry(geometry);
                    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
                    cubie.add(line);

                    this.cubies.push(cubie);
                    this.cubeGroup.add(cubie);
                }
            }
        }
    }

    initUI() {
        document.getElementById('undo-btn')?.addEventListener('click', () => this.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => this.redo());
        document.getElementById('reverse-btn')?.addEventListener('click', () => this.onReverseBtnClick());
        this.updateUI();
    }

    updateUI() {
        const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
        const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
        const reverseBtn = document.getElementById('reverse-btn') as HTMLButtonElement;

        undoBtn.disabled = this.history.length === 0 || this.isRotating;
        redoBtn.disabled = this.redoStack.length === 0 || this.isRotating || this.appState === AppState.REVERSED;

        switch(this.appState) {
            case AppState.IDLE:
                reverseBtn.innerText = "Reverse";
                reverseBtn.disabled = this.history.length === 0;
                break;
            case AppState.REVERSING:
                reverseBtn.innerText = "Reversing...";
                reverseBtn.disabled = true;
                break;
            case AppState.REVERSED:
                reverseBtn.innerText = "Restart";
                reverseBtn.disabled = false;
                break;
        }

        this.updateArrow();
    }

    updateArrow() {
        this.arrowGroup.clear();

        if (this.appState === AppState.REVERSING && this.reverseIndex >= 0) {
            const moveToReverse = this.movesToReverse[this.reverseIndex];
            const reverseMove: Move = {
                axis: moveToReverse.axis,
                layer: moveToReverse.layer,
                direction: -moveToReverse.direction
            };
            this.showArrowForMove(reverseMove);
        }
    }

    showArrowForMove(move: Move) {
        const material = new THREE.MeshBasicMaterial({ color: COLORS.pink });
        const shaftGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8);
        const headGeom = new THREE.ConeGeometry(0.12, 0.25, 8);

        const shaft = new THREE.Mesh(shaftGeom, material);
        const head = new THREE.Mesh(headGeom, material);
        head.position.y = 0.45;

        const arrow = new THREE.Group();
        arrow.add(shaft);
        arrow.add(head);

        if (move.axis === 'y') {
            arrow.position.set(1.5, move.layer, 1.5);
            if (move.direction > 0) { // CW: +X -> +Z
                arrow.rotation.x = Math.PI / 2;
            } else { // CCW: +Z -> +X
                arrow.rotation.z = -Math.PI / 2;
            }
            if (move.layer === -1) arrow.position.y = -2.2;
        } else if (move.axis === 'x') {
            // Blue (+X)
            arrow.position.set(2.0, 1.2, 0);
            if (move.layer === -1) arrow.position.x = -2.4; // Green Indicator
            if (move.direction > 0) { // CW: +Y -> +Z
                arrow.rotation.x = Math.PI / 2;
            } else { // CCW: +Z -> +Y
                arrow.rotation.x = 0;
            }
        } else if (move.axis === 'z') {
            // Red (+Z)
            arrow.position.set(0, 1.2, 2.0);
            if (move.layer === -1) arrow.position.z = -2.4; // Orange Indicator
            if (move.direction > 0) { // CW: +Y -> -X
                arrow.rotation.z = Math.PI / 2;
            } else { // CCW: -X -> +Y
                arrow.rotation.z = 0;
            }
        }

        this.arrowGroup.add(arrow);
    }

    onReverseBtnClick() {
        if (this.appState === AppState.IDLE && this.history.length > 0) {
            this.appState = AppState.REVERSING;
            this.movesToReverse = this.history.filter(h => !h.wasReversePress).map(h => h.move);
            this.reverseIndex = this.movesToReverse.length - 1;
            this.history.push({ move: { axis: 'x', layer: 0, direction: 0 }, wasReversePress: true });
            this.redoStack = [];
        } else if (this.appState === AppState.REVERSED) {
            this.history = [];
            this.redoStack = [];
            this.movesToReverse = [];
            this.reverseIndex = -1;
            this.appState = AppState.IDLE;
        }
        this.updateUI();
    }

    onMouseDown(event: MouseEvent) {
        if (this.isRotating || this.appState === AppState.REVERSED) return;
        this.isMouseDown = true;
        this.mouseDownPos.set(event.clientX, event.clientY);

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.cubies);

        this.selectedCubie = null;
        this.selectedFaceNormal = null;

        if (intersects.length > 0) {
            this.selectedCubie = intersects[0].object as THREE.Mesh;
            const face = intersects[0].face;
            if (face) {
                this.selectedFaceNormal = face.normal.clone();
                this.selectedFaceNormal.applyQuaternion(this.selectedCubie.quaternion);
            }
        }
    }

    onMouseMove(event: MouseEvent) {
        if (!this.isMouseDown || this.isRotating) return;

        const deltaX = event.clientX - this.mouseDownPos.x;
        const deltaY = event.clientY - this.mouseDownPos.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance > 30) {
            this.handleSlide(deltaX, deltaY);
            this.isMouseDown = false;
        }
    }

    onMouseUp() {
        this.isMouseDown = false;
    }

    handleSlide(deltaX: number, deltaY: number) {
        let move: Move | null = null;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (this.selectedCubie && this.selectedFaceNormal) {
            const pos = this.selectedCubie.position;
            const normal = this.selectedFaceNormal;

            if (normal.y > 0.5) { // White (+Y)
                if (absX > absY) {
                    move = { axis: 'z', layer: Math.round(pos.z), direction: deltaX > 0 ? 1 : -1 };
                } else {
                    move = { axis: 'x', layer: Math.round(pos.x), direction: deltaY > 0 ? 1 : -1 };
                }
            } else if (normal.z > 0.5) { // Red (+Z)
                if (absX > absY) {
                    move = { axis: 'y', layer: Math.round(pos.y), direction: deltaX > 0 ? 1 : -1 };
                } else {
                    move = { axis: 'x', layer: Math.round(pos.x), direction: deltaY > 0 ? 1 : -1 };
                }
            } else if (normal.x > 0.5) { // Blue (+X)
                if (absX > absY) {
                    move = { axis: 'y', layer: Math.round(pos.y), direction: deltaX > 0 ? 1 : -1 };
                } else {
                    move = { axis: 'z', layer: Math.round(pos.z), direction: deltaY > 0 ? 1 : -1 };
                }
            }
        } else {
            const startX = (this.mouseDownPos.x / window.innerWidth) * 2 - 1;
            const startY = -(this.mouseDownPos.y / window.innerHeight) * 2 + 1;

            if (startX > 0.4 && startY > 0.4) { // Top-Right -> Green Indicator
                 move = { axis: 'z', layer: -1, direction: deltaY > 0 ? 1 : -1 };
            } else if (startX < -0.4 && startY > 0.4) { // Top-Left -> Orange Indicator
                 move = { axis: 'x', layer: -1, direction: deltaY > 0 ? 1 : -1 };
            } else if (startY < -0.4) { // Bottom Area -> Yellow Indicator
                 move = { axis: 'y', layer: -1, direction: deltaX > 0 ? 1 : -1 };
            }
        }

        if (move) {
            this.performMove(move);
        }
    }

    async performMove(move: Move, isUndoRedo = false) {
        if (this.appState === AppState.REVERSED && !isUndoRedo) return;

        let wasReverseMove = false;
        if (this.appState === AppState.REVERSING && !isUndoRedo) {
            const targetMove = this.movesToReverse[this.reverseIndex];
            const isCorrect = move.axis === targetMove.axis &&
                              move.layer === targetMove.layer &&
                              move.direction === -targetMove.direction;

            if (!isCorrect) return;
            wasReverseMove = true;
        }

        await this.rotateSlice(move);

        if (!isUndoRedo) {
            this.history.push({ move, wasReverseMove });
            this.redoStack = [];

            if (wasReverseMove) {
                this.reverseIndex--;
                if (this.reverseIndex < 0) {
                    this.appState = AppState.REVERSED;
                }
            }
        }
        this.updateUI();
    }

    async undo() {
        if (this.history.length === 0 || this.isRotating) return;
        const lastEntry = this.history.pop()!;
        this.redoStack.push(lastEntry);

        if (lastEntry.wasReversePress) {
            this.appState = AppState.IDLE;
            this.movesToReverse = [];
            this.reverseIndex = -1;
        } else {
            const undoMove = { ...lastEntry.move, direction: -lastEntry.move.direction };
            await this.rotateSlice(undoMove);

            if (lastEntry.wasReverseMove) {
                this.reverseIndex++;
                this.appState = AppState.REVERSING;
            } else if (this.appState === AppState.REVERSED) {
                 this.appState = AppState.REVERSING;
                 this.reverseIndex = 0;
            }
        }
        this.updateUI();
    }

    async redo() {
        if (this.redoStack.length === 0 || this.isRotating || this.appState === AppState.REVERSED) return;
        const nextEntry = this.redoStack.pop()!;
        this.history.push(nextEntry);

        if (nextEntry.wasReversePress) {
            this.appState = AppState.REVERSING;
            this.movesToReverse = this.history.filter(h => !h.wasReversePress).map(h => h.move);
            this.reverseIndex = this.movesToReverse.length - 1;
        } else {
            await this.rotateSlice(nextEntry.move);
            if (nextEntry.wasReverseMove) {
                this.reverseIndex--;
                if (this.reverseIndex < 0) {
                    this.appState = AppState.REVERSED;
                }
            }
        }
        this.updateUI();
    }

    async rotateSlice(move: Move) {
        if (this.isRotating) return;
        this.isRotating = true;

        const { axis, layer, direction } = move;
        const sliceGroup = new THREE.Group();
        this.scene.add(sliceGroup);

        const cubiesInSlice: THREE.Mesh[] = [];
        const epsilon = 0.1;

        for (let i = this.cubies.length - 1; i >= 0; i--) {
            const cubie = this.cubies[i];
            const pos = new THREE.Vector3();
            cubie.getWorldPosition(pos);

            let inSlice = false;
            if (axis === 'x' && Math.abs(pos.x - layer) < epsilon) inSlice = true;
            if (axis === 'y' && Math.abs(pos.y - layer) < epsilon) inSlice = true;
            if (axis === 'z' && Math.abs(pos.z - layer) < epsilon) inSlice = true;

            if (inSlice) {
                cubiesInSlice.push(cubie);
                sliceGroup.add(cubie);
            }
        }

        const duration = 300;
        const startTime = Date.now();
        const targetRotation = (Math.PI / 2) * direction;

        return new Promise<void>((resolve) => {
            const animateRotation = () => {
                const now = Date.now();
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress * (2 - progress);

                if (axis === 'x') sliceGroup.rotation.x = -ease * targetRotation;
                if (axis === 'y') sliceGroup.rotation.y = -ease * targetRotation;
                if (axis === 'z') sliceGroup.rotation.z = -ease * targetRotation;

                if (progress < 1) {
                    requestAnimationFrame(animateRotation);
                } else {
                    sliceGroup.updateMatrixWorld();
                    for (const cubie of cubiesInSlice) {
                        cubie.applyMatrix4(sliceGroup.matrixWorld);
                        this.cubeGroup.add(cubie);
                        cubie.position.x = Math.round(cubie.position.x);
                        cubie.position.y = Math.round(cubie.position.y);
                        cubie.position.z = Math.round(cubie.position.z);
                        cubie.rotation.x = Math.round(cubie.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
                        cubie.rotation.y = Math.round(cubie.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
                        cubie.rotation.z = Math.round(cubie.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
                    }
                    this.scene.remove(sliceGroup);
                    this.isRotating = false;
                    resolve();
                }
            };
            animateRotation();
        });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    }
}

(window as any).rubiksCube = new RubiksCube();
