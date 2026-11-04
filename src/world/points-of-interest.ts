import catalogue from '../data/points-of-interest.json';
import {
  features,
  monuments,
  sculptures,
  siteDetails,
  center,
  inside,
  projectRoute,
  cemeteryArcades,
  cemeteryGate,
  casemateDoor,
  slavin,
  summerTheatre,
  panoramaSites,
  riversideGallery,
  referenceSites,
  type Point,
} from './geo';

type Location = {
  points: readonly Point[];
  area?: boolean;
  note?: string;
  alternates?: readonly (readonly Point[])[];
};
export type PointOfInterest = {
  id: string;
  name: string;
  description: string;
  location: Location;
};

function mapped(id: number): Location {
  const feature = features.find((feature) => feature.id === id);
  if (feature)
    return {
      points: feature.points,
      area: !feature.tags.highway && feature.points.length > 3,
    };
  const detail = [...sculptures, ...monuments, ...siteDetails].find(
    (detail) => detail.id === id,
  );
  if (detail) return { points: [detail.point] };
  throw new Error(`Missing mapped learning location ${id}.`);
}

function vicinity(point: Point, note: string): Location {
  return { points: [point], note };
}

const cemetery = mapped(-4226790);
const graves: Location = {
  ...cemetery,
  note: 'Cemetery history. Individual grave positions are not surveyed in this model.',
};
const royal = vicinity(
  mapped(390278815).points[0],
  'History of the royal precinct. These remains are represented at area level.',
);
const underground = vicinity(
  casemateDoor.point,
  'Casemate history, presented at the accessible entrance. Individual underground chambers are not surveyed.',
);
const chapter = vicinity(
  center(mapped(49810596).points),
  'History of the chapter precinct. The individual structure is not precisely located in this model.',
);
const ramparts = vicinity(
  panoramaSites[1].at(0, 4),
  'Fortification history, presented at the rampart promenade.',
);
const southernView = vicinity(
  [-235, 169],
  'Learn from the southern viewpoint. This landmark lies beyond the detailed reconstruction.',
);

const locations = new Map<string, Location>();
const at = (location: Location, names: readonly string[]) => {
  for (const name of names) {
    if (locations.has(name))
      throw new Error(`Duplicate learning anchor: ${name}`);
    locations.set(name, location);
  }
};

at(mapped(49811189), ['Tábor Gate (Táborská brána)']);
at(mapped(49811195), [
  'Špička Gate (Špička)',
  'Gothic wall fragments near Špička',
  'Špička medieval gate remains',
  'Špička landmark area',
]);
at(mapped(51718887), [
  'Leopold Gate (Leopoldova brána)',
  'Former moat near Leopold Gate',
]);
at(mapped(51700613), [
  'Brick Gate (Cihelná brána)',
  'Vyšehrad Information Centre',
]);
at(ramparts, [
  'Vyšehrad fortress walls',
  'Baroque bastions',
  'Casemate embrasures',
  'Unfinished sixth bastion',
  'Rampart promenade',
]);
at({ points: summerTheatre.enclosure.points, area: true }, [
  'Redan',
  'Redan defensive position',
  'Summer Theatre',
]);
at(underground, [
  'Gorlice Hall',
  'Casemate tour entrance',
  'Playground near Gorlice',
]);
at(vicinity([60, 127], 'History of the eastern military passages.'), [
  'Martinské casemates',
]);
at(vicinity([-251, -171], 'History of the northwestern defensive passages.'), [
  'Casemates toward the Redan',
]);
at(vicinity([-241, 161], 'History of the southern defensive passages.'), [
  'Podolí casemate passage',
  'Fortress passages',
]);
at(mapped(27763545), ['Bastion of St. Leopold']);
at(mapped(784512324), ['Bastion of St. Ludmila']);
at(mapped(784512321), ['Bastion of St. Roch']);
at(mapped(784512320), ['Bastion of St. Agnes']);
at(
  vicinity(
    [-259, 66],
    'History of the western bastions; approximate vicinity.',
  ),
  ['Bastion of St. Paul'],
);
at(royal, [
  'Gothic Cellar (Gotický sklep)',
  'Gothic palace remains',
  'Royal Palace (Královský palác)',
  'Royal courtyard',
  'Medieval defensive wall',
]);
at(
  vicinity(
    referenceSites.hiddenChurch.point,
    'Surviving church incorporated into the rampart behind Ave Maria; exterior representation only.',
  ),
  [
    'Church of the Decollation of St. John the Baptist',
    'Memorial to the lost Church of St. John the Baptist',
  ],
);
at(mapped(-89545110), ['Chapel of Our Lady of the Ramparts']);
at(mapped(49810588), [
  'Romanesque Basilica of St. Lawrence remains',
  'Early church foundations',
  'Basilica of St. Lawrence',
]);
at(mapped(3406793339), ['Romanesque bridge remains']);
at(mapped(1185977755), ['Libuše’s Bath (Libušina lázeň)']);
at(mapped(24376643), [
  'Basilica of Sts. Peter and Paul',
  'Basilica ticket counter',
]);
at(mapped(560209917), [
  'Rotunda of St. Martin',
  'Cannonball in St. Martin’s Rotunda',
]);
at(chapter, [
  'Chapel of the Decollation of St. John',
  'St. Clement’s Chapel',
  'Memorial plaques',
]);
at(mapped(49810596), ['New Provost’s Residence']);
at(mapped(49810594), ['Old Provost’s Residence']);
at(mapped(49810587), ['Old Deanery', 'Refreshments near the archdeaconry']);
at(mapped(49810437), ['New Deanery']);
at(
  vicinity(
    [-22, 24],
    'Karlach Gardens history; approximate location within the garden.',
  ),
  ['Devil’s Column (Čertův sloup)'],
);
at(mapped(660103145), ['Plague Column']);
at(mapped(122555875), ['Old Czech Legends playground']);
at(mapped(1200812873), ['Libuše and Přemysl sculpture group']);
at(mapped(1200812876), ['Šárka sculpture', 'Ctirad and Šárka sculpture group']);
at(mapped(1200812856), ['Záboj and Slavoj sculpture group']);
at(mapped(1200812866), ['Lumír and the Song sculpture group']);
at(mapped(4553656906), ['Statue of St. Ludmila']);
at(mapped(1200790218), ['Statue of St. Sebastian']);
at(mapped(3573420655), ['Statue of St. John of Nepomuk']);
at(mapped(12229297494), ['Statue of St. Adalbert (Vojtěch)']);
at(mapped(1200790222), ['Statue of St. Wenceslas']);
at(mapped(3573420654), ['Monument to Provost Mikuláš Karlach']);
at(mapped(1751591206), ['Monument to Provost Václav Štulc']);
at(
  vicinity(
    [-253, 110],
    'Memorial history; approximate vicinity of the western rock.',
  ),
  ['Memorial to Professor Krejčí'],
);
at(cemetery, ['Vyšehrad Cemetery']);
at({ points: [slavin.point] }, ['Slavín National Pantheon', 'Slavín tomb']);
at({ points: [cemeteryGate.center] }, ['Cemetery entrance portal']);
at(
  {
    points: cemeteryArcades[0].feature.points,
    alternates: cemeteryArcades.slice(1).map((arcade) => arcade.feature.points),
  },
  ['Cemetery arcades'],
);
at(mapped(-4226800), ['Cemetery chapels and memorials']);
at(graves, [
  'Antonín Dvořák’s grave',
  'Bedřich Smetana’s grave',
  'Alfons Mucha’s grave',
  'Karel Čapek’s grave',
  'Jan Neruda’s grave',
  'Božena Němcová’s grave',
  'Mikoláš Aleš’s grave',
  'Ema Destinnová’s grave',
  'Waldemar Matuška’s grave',
  'Zdeněk Fibich’s grave',
  'Josef Václav Myslbek’s grave',
]);
at(mapped(49810585), [
  'Old Burgrave’s Residence',
  'Chamber Hall',
  'Refreshments at the Burgrave’s Residence',
]);
at(
  vicinity(
    [-239, 93],
    'Exhibition history in the former military precinct; approximate vicinity.',
  ),
  ['Gunpowder House', 'Gunpowder House exhibition'],
);
at(mapped(49810596), ['Vyšehrad Gallery']);
at(mapped(49811193), ['Popelka Biliánová’s House']);
at(mapped(246174216), ['Jedlička Institute']);
at(vicinity([-190, 62], 'The gardens of the former royal precinct.'), [
  'Vyšehrad Gardens',
  'Fortress lawns',
]);
at(mapped(380920698), ['Karlach Gardens']);
at(vicinity([-218, -137], 'The tree-lined park paths of Štulcovy Gardens.'), [
  'Vyšehrad Park',
  'Historic tree-lined paths',
]);
at(
  vicinity(
    [-268, 81],
    'History of the outer paths. The cliff itself is not a walking route.',
  ),
  ['Outer rampart paths'],
);
at(vicinity([59, 114], 'History of the former fortress grounds.'), [
  'Former military grounds',
]);
at({ points: [panoramaSites[0].at(0, 3)] }, [
  'Western ramparts viewpoint',
  'Prague Castle viewpoint',
]);
at({ points: [[-231, -179]] }, ['Northern ramparts viewpoint']);
at({ points: [[85, -38]] }, [
  'Eastern ramparts viewpoint',
  'Nusle Bridge viewpoint',
]);
at({ points: [[-236, 171]] }, [
  'Southern ramparts viewpoint',
  'Podolí cliff viewpoint',
]);
at({ points: [[-263, 79]] }, [
  'Vltava bridges viewpoint',
  'Vyšehrad rocky promontory',
  'Vyšehrad rock face',
]);
at({ points: [[-273, -93]] }, [
  'Vyšehrad Railway Bridge',
  'Vyšehrad Railway Bridge (river view)',
]);
at(
  {
    points: riversideGallery.approaches[0].polygon,
    alternates: [riversideGallery.approaches[1].polygon],
    area: true,
  },
  ['Vyšehrad Tunnel'],
);
at({ points: riversideGallery.approaches[1].polygon, area: true }, [
  'Vltava waterfront below Vyšehrad',
  'Podolí waterfront',
  'Podolí riverfront',
  'Vyšehrad Tunnel (external entrance)',
]);
at(mapped(3475173896), ['Café Citadela']);
at(
  vicinity(
    [-104, -92],
    'Visitor facilities around Brick Gate. Present-day opening and availability are not verified.',
  ),
  ['Public toilets'],
);
at(mapped(28812308), ['Church of St. Michael the Archangel']);
at(southernView, ['Podolí Waterworks']);

export const pointsOfInterest: readonly PointOfInterest[] = [
  ...new Map(catalogue.map((entry) => [entry.name, entry])).values(),
].map((entry) => {
  const location = locations.get(entry.name);
  if (!location) throw new Error(`Missing learning location: ${entry.name}`);
  return {
    id: entry.name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    name: entry.name,
    description: entry['historical description'],
    location,
  };
});

export function nearbyPointsOfInterest(position: Point): PointOfInterest[] {
  if (!position.every(Number.isFinite)) return [];
  return pointsOfInterest
    .map((poi) => {
      const { area } = poi.location;
      const distance = Math.min(
        ...[poi.location.points, ...(poi.location.alternates ?? [])].map(
          (points) =>
            area && inside(position, points)
              ? 0
              : points.length === 1
                ? Math.hypot(
                    position[0] - points[0][0],
                    position[1] - points[0][1],
                  )
                : projectRoute(position, points).distance,
        ),
      );
      return { poi, distance };
    })
    .filter(({ distance }) => distance <= 11)
    .sort(
      (a, b) =>
        Number(Boolean(a.poi.location.note)) -
          Number(Boolean(b.poi.location.note)) ||
        a.distance - b.distance ||
        a.poi.id.localeCompare(b.poi.id),
    )
    .map(({ poi }) => poi);
}
