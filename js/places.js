// Orte zum Hineinfahren: Lackiererei (Auto reparieren, neu lackieren, Fahndung loswerden) und
// Autohändler (geklaute Autos zu Geld machen).
'use strict';

const PLACES = [
  { type: 'spray', name: 'Lackiererei Nord', x: -377, z: -847 },
  { type: 'spray', name: 'Lackiererei Süd', x: 51, z: 759 },
  { type: 'spray', name: 'Lackiererei Ost', x: 699, z: -295 },
  { type: 'dealer', name: 'Autohändler', x: -650, z: -1064 },
  { type: 'dealer', name: 'Autohändler', x: 112, z: 1129 },
  // Landkreis (nur mit data/region.js): [Breite, Länge]
  { type: 'spray', name: 'Lackiererei Rödental', geo: [50.2935, 11.0380] },
  { type: 'spray', name: 'Lackiererei Neustadt', geo: [50.3240, 11.1150] },
  { type: 'spray', name: 'Lackiererei Bad Rodach', geo: [50.3395, 10.7850] },
  { type: 'spray', name: 'Lackiererei Ebersdorf', geo: [50.2195, 11.0620] },
  { type: 'spray', name: 'Lackiererei Seßlach', geo: [50.1890, 10.8460] },
  { type: 'dealer', name: 'Autohändler Neustadt', geo: [50.3215, 11.1080] },
  { type: 'dealer', name: 'Autohändler Ebersdorf', geo: [50.2235, 11.0700] },
  { type: 'dealer', name: 'Autohändler Untersiemau', geo: [50.1990, 10.9640] },
];
const SPRAY_COST = { repair: 100, wanted: 250 };

class Places {
  // ctx: { world, scene, ui }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.list = [];
    const O = this.world.data.meta.origin, mLat = 110540, mLon = 111320 * Math.cos(O.lat * Math.PI / 180);
    for (const def of PLACES) {
      const p = { ...def };
      if (def.geo) {
        if (!this.world.region) continue;
        p.x = (def.geo[1] - O.lon) * mLon; p.z = -(def.geo[0] - O.lat) * mLat;
      }
      // an den rechten Straßenrand der nächsten Fahrbahn legen (im Umland über das Straßennetz, die Kachel ist noch nicht gebaut)
      const r = this.world.nearestRoad(p.x, p.z, 250, s => s.k === 'road' && s.h !== 'motorway' && s.h !== 'motorway_link') || this.onNet(p.x, p.z);
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
      if (this.world.region) this.world.region.anchor(b, x, z, -0.5);
      const lab = makeLabel(p.name, color, spray ? `Reparatur € ${SPRAY_COST.repair} · Fahndung weg € ${SPRAY_COST.wanted}` : 'Wir kaufen dein Auto');
      lab.position.set(x, y + 7, z);
      lab.userData.range = 600;
      if (this.world.region) this.world.region.anchor(lab, x, z, 7);
      this.ui.addLabel(lab, this.scene);
      this.list.push({ ...p, x, z, cool: 0 });
    }
  }

  // nächster Punkt auf dem Straßennetz (ohne Autobahn), im Format von World.nearestRoad
  onNet(x, z) {
    if (!this.nav) return null;
    const G = this.world.data.graph;
    const list = this.nav.segGrid.query(x, z, 250, []);
    let best = null, bd = 250;
    for (const code of list) {
      const ei = Math.floor(code / 4096), k = (code % 4096) * 2, e = this.nav.edges[ei], g = G.edges[ei];
      if (/motorway/.test(g.h || '')) continue;
      const c = U.closestOnSeg(x, z, e.p[k], e.p[k + 1], e.p[k + 2], e.p[k + 3]), d = Math.hypot(c[0] - x, c[1] - z);
      if (d < bd) { bd = d; best = { x: c[0], z: c[1], d, seg: { ax: e.p[k], az: e.p[k + 1], bx: e.p[k + 2], bz: e.p[k + 3], w: g.w || 6 } }; }
    }
    return best;
  }

  at(x, z, r = 5.5) { return this.list.find(p => Math.hypot(p.x - x, p.z - z) < r) || null; }

  update(dt) { for (const p of this.list) p.cool = Math.max(0, p.cool - dt); }
}
