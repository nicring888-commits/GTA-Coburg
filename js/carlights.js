// Scheinwerferkegel nachts (seit v3.15.0, Grafik-Phase 10e): Für alle fahrenden Autos außer dem eigenen (das hat ein echtes
// SpotLight in js/game.js) liegt ein Lichtteppich auf der Fahrbahn vor dem Auto, dazu für alle zwei schwache Lichtkegel in
// der Luft, die bei Regen und Nebel deutlicher werden. Beides als Instanzen mit additiver Mischung, ohne echte Lichtquellen.
// Der Alphakanal des Bildes bleibt unberührt (er trägt die Spiegelstärke für js/post.js).
'use strict';

const CARLIGHT = { max: 64, poolLen: 26, poolW: 9, beamLen: 13, beamR: 1.5, near: 260 };

class CarLights {
  constructor(scene) {
    this.scene = scene;
    const add = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true, depthWrite: false, fog: false };
    const col = new THREE.Color(1.0, 0.86, 0.62);
    // Lichtteppich: Rechteck vor dem Auto (x quer, z nach vorn), Helligkeit im Shader aus Abstand und Seitenlage
    const pool = new THREE.PlaneGeometry(CARLIGHT.poolW, CARLIGHT.poolLen, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, CARLIGHT.poolLen / 2 + 1);
    this.poolMat = new THREE.ShaderMaterial(Object.assign({
      uniforms: { uI: { value: 0 }, uCol: { value: col } },
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      vertexShader: `
        varying vec2 vP;
        void main() {
          vP = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uI; uniform vec3 uCol;
        varying vec2 vP;
        void main() {
          float d = vP.y, w = 0.9 + d * 0.17;
          // zwei Scheinwerfer: Kegel je Seite, die sich vor dem Auto vereinen
          float l = max(smoothstep(w, w * 0.25, abs(vP.x - 0.65)), smoothstep(w, w * 0.25, abs(vP.x + 0.65)));
          float a = l * smoothstep(1.0, 4.0, d) * (1.0 - smoothstep(9.0, ${CARLIGHT.poolLen.toFixed(1)}, d)) * (1.0 + 2.0 / (1.0 + d * 0.4));
          gl_FragColor = vec4(uCol * a * uI, 0.0);
        }`,
    }, add));
    // Lichtkegel: zwei offene Kegel ab den Scheinwerfern, leicht nach unten geneigt, Mitte heller als der Rand
    const cone = x => new THREE.CylinderGeometry(CARLIGHT.beamR, 0.12, CARLIGHT.beamLen, 14, 1, true)
      .translate(0, CARLIGHT.beamLen / 2, 0).rotateX(Math.PI / 2 + 0.06).translate(x, 0, 0);
    const a = cone(-0.62), b = cone(0.62);
    const beam = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) {
      const A = a.toNonIndexed().attributes[k], B = b.toNonIndexed().attributes[k];
      const arr = new Float32Array(A.array.length + B.array.length); arr.set(A.array); arr.set(B.array, A.array.length);
      beam.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize));
    }
    this.beamMat = new THREE.ShaderMaterial(Object.assign({
      uniforms: { uI: { value: 0 }, uCol: { value: col } }, side: THREE.DoubleSide,
      vertexShader: `
        varying float vT, vF;
        void main() {
          vT = uv.y;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vF = abs(dot(n, normalize(cameraPosition - wp.xyz)));
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uI; uniform vec3 uCol;
        varying float vT, vF;
        void main() {
          // uv.y: 0 am Scheinwerfer, 1 am weiten Ende
          float a = pow(clamp(1.0 - vT, 0.0, 1.0), 1.6) * pow(clamp(vF, 0.0, 1.0), 1.5) * uI; // clamp: pow mit negativer Basis ergibt NaN
          gl_FragColor = vec4(uCol * a, 0.0);
        }`,
    }, add));
    // Node-Zwillinge für die WebGPU-Probe (js/tsl-materials.js)
    this.poolMat.userData.node = kit => kit.carPool(this.poolMat, CARLIGHT.poolLen);
    this.beamMat.userData.node = kit => kit.carBeam(this.beamMat);
    this.pool = new THREE.InstancedMesh(pool, this.poolMat, CARLIGHT.max);
    this.beam = new THREE.InstancedMesh(beam, this.beamMat, CARLIGHT.max);
    for (const m of [this.pool, this.beam]) { m.frustumCulled = false; m.count = 0; m.renderOrder = 5; scene.add(m); }
    this._m = new THREE.Matrix4(); this._o = new THREE.Matrix4();
    this._near = [];
  }
  // Scheinwerfer eines Autos: Mitte der Lampen in Fahrzeugkoordinaten (aus dem Scheinwerferglas, je Modell einmal)
  lampOf(car) {
    if (car._lamp) return car._lamp;
    const M = carMaterials().head, m = car.group.children.find(o => o.material === M);
    let y = 0.75, z = 2.15;
    if (m) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; y = (b.min.y + b.max.y) / 2; z = b.max.z; }
    return car._lamp = { y, z };
  }
  // cars: alle fahrenden Autos; own: das eigene (nur Kegel); n: Nacht 0..1; haze: Regen/Nebel 0..1; wet: Nässe
  update(cars, own, n, haze, wet, cam) {
    const on = n > 0.3;
    this.pool.visible = this.beam.visible = on;
    if (!on) return;
    this.poolMat.uniforms.uI.value = n * (0.2 + 0.1 * wet);
    this.beamMat.uniforms.uI.value = n * (0.02 + 0.07 * haze);
    // nächste zuerst, höchstens CARLIGHT.max
    const list = this._near; list.length = 0;
    for (const c of cars) {
      if (!c || c.wrecked || c.disposed || !c.group || !c.group.visible) continue;
      const d = Math.hypot(c.x - cam.x, c.z - cam.z);
      if (d < CARLIGHT.near) list.push([d, c]);
    }
    list.sort((a, b) => a[0] - b[0]);
    let np = 0, nb = 0;
    for (const [, c] of list) {
      if (nb >= CARLIGHT.max) break;
      c.group.updateMatrixWorld();
      const L = this.lampOf(c);
      // Kegel ab den Scheinwerfern, Teppich auf Bodenhöhe des Autos
      this._o.makeTranslation(0, L.y, L.z);
      this.beam.setMatrixAt(nb++, this._m.multiplyMatrices(c.group.matrixWorld, this._o));
      if (c !== own) {
        this._o.makeTranslation(0, 0.04, L.z - 1);
        this.pool.setMatrixAt(np++, this._m.multiplyMatrices(c.group.matrixWorld, this._o));
      }
    }
    this.pool.count = np; this.beam.count = nb;
    this.pool.instanceMatrix.needsUpdate = true; this.beam.instanceMatrix.needsUpdate = true;
  }
}
