import * as THREE from 'three';
import {
  kioskSites,
  lawrenceKioskSite,
  kioskBuildingGeometry,
  kioskReply,
  makeLawrenceKiosk,
} from './kiosks';
import { makeGardenKiosk } from './reference-details';
import { makeSpickaShop } from './site-details';
import { decorateBuilding } from './architecture';
import { blocked, standingElevation } from './geo';
import { kioskActivities, nearbyActivity } from './activities';
import {
  createVisitorRoutes,
  kioskVisitorRoutes,
  visitorRouteClear,
  visitorShopStops,
  VisitorStroll,
} from './pedestrians';

it('opens real serving hatches so each attendant can be seen inside rather than behind a solid facade', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const site of kioskSites) {
    const meshes: THREE.Mesh[] = [];
    const add = (_color: string, geometry: THREE.BufferGeometry) =>
      meshes.push(new THREE.Mesh(geometry, material));
    if (site.id === 'garden') makeGardenKiosk(add);
    else if (site.id === 'okenko') makeSpickaShop(add);
    else {
      const feature = lawrenceKioskSite.building;
      add(
        '',
        kioskBuildingGeometry(feature, site.ground - 1, site.ground + 9.3)
          .rotateX(-Math.PI / 2)
          .translate(0, site.ground - 1, 0),
      );
      decorateBuilding(feature, site.ground, 9.3, add);
      makeLawrenceKiosk(add);
    }
    const point = site.at(0, 2);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], site.ground + 1.65, point[1]),
      new THREE.Vector3(-site.normal[0], 0, -site.normal[1]),
    );
    const hit = ray.intersectObjects(meshes, false)[0];
    expect(hit, site.name).toBeDefined();
    expect(hit.distance, site.name).toBeGreaterThan(2.6);
    expect(blocked(site.attendant, site.ground), site.name).toBe(true);
    meshes.forEach((mesh) => mesh.geometry.dispose());
  }
  material.dispose();
});

it('offers a reachable attendant interaction at every kiosk without targeting an NPC through its back wall', () => {
  for (const site of kioskSites) {
    const height = standingElevation(site.approach);
    expect(blocked(site.approach, height), site.name).toBe(false);
    expect(nearbyActivity(kioskActivities, site.approach, height)?.id).toBe(
      site.id,
    );
    expect(kioskReply(site.id, 0)).not.toBe(kioskReply(site.id, 1));
  }
});

it('keeps two customers circulating to each kiosk, stopping at its counter and returning on clear paths', () => {
  const routes = kioskVisitorRoutes(createVisitorRoutes(() => 0.37));
  expect(routes).toHaveLength(kioskSites.length * 2);
  for (const [index, route] of routes.entries()) {
    const site = kioskSites[Math.floor(index / 2)];
    expect(route).toContain(site.approach);
    for (let i = 1; i < route.length; i++)
      expect(visitorRouteClear(route[i - 1], route[i]), site.name).toBe(true);
    const stops = visitorShopStops(route);
    expect(stops.size, site.name).toBeGreaterThan(0);
    const customer = new VisitorStroll(route, stops, true);
    customer.update(600, 1.1);
    expect(customer.departed).toBe(false);
    expect(customer.distance).toBeGreaterThan(100);
  }
});
