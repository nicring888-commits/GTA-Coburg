// Orte zum Hineinfahren: Lackiererei (Auto reparieren, neu lackieren, Fahndung loswerden) und
// Autohändler (geklaute Autos zu Geld machen).
'use strict';

const PLACES = [
  { type: 'spray', name: 'Lackiererei Nord', x: -377, z: -847 },
  { type: 'spray', name: 'Lackiererei Süd', x: 51, z: 759 },
  { type: 'spray', name: 'Lackiererei Ost', x: 699, z: -295 },
  { type: 'dealer', name: 'Autohändler', x: -650, z: -1064 },
  { type: 'dealer', name: 'Autohändler', x: 112, z: 1129 },
];
const SPRAY_COST = { repair: 100, wanted: 250 };

class Places {
  // ctx: { world, scene, ui }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.list = [];
    for (const p of PLACES) {
      // an den rechten Straßenrand der nächsten Fahrbahn legen
      const r = this.world.nearestRoad(p.x, p.z, 250, s => s.k === 'road' && s.h !== 'motorway' && s.h !== 'motorway_link');
      if (!r) continue;
      const s = r.seg;
      let dx = s.bx - s.ax, dz = s.bz - s.az;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const off = Math.max(0, s.w / 2 - 1.5);
      let x = r.x - dz * off, z = r.z + dx * off;
      if (this.world.insideBuilding(x, z, 1)) { x = r.x; z = r.z; }
      const spray = p.type === 'spray';
      const color = spray ? '#38d97a' : '#ff9a2e';
      const b = makeBeacon(color, 4.5, 14);
      const y = this.world.heightAt(x, z);
      b.position.set(x, y - 0.5, z);
      this.scene.add(b);
      const lab = makeLabel(p.name, color, spray ? `Reparatur € ${SPRAY_COST.repair} · Fahndung weg € ${SPRAY_COST.wanted}` : 'Wir kaufen dein Auto');
      lab.position.set(x, y + 7, z);
      lab.userData.range = 600;
      this.ui.addLabel(lab, this.scene);
      this.list.push({ ...p, x, z, cool: 0 });
    }
  }

  at(x, z, r = 5.5) { return this.list.find(p => Math.hypot(p.x - x, p.z - z) < r) || null; }

  update(dt) { for (const p of this.list) p.cool = Math.max(0, p.cool - dt); }
}
