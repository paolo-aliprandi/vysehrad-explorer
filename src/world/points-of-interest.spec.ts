import catalogue from '../data/points-of-interest.json';
import { features, cemeteries, referenceSites, informationCentre } from './geo';
import { nearbyPointsOfInterest, pointsOfInterest } from './points-of-interest';

it('makes every supplied history entry discoverable once, merging duplicate place names', () => {
  const names = new Set(catalogue.map((entry) => entry.name));
  expect(new Set(pointsOfInterest.map((poi) => poi.name))).toEqual(names);
  expect(pointsOfInterest).toHaveLength(names.size);
  expect(new Set(pointsOfInterest.map((poi) => poi.id)).size).toBe(names.size);
  for (const poi of pointsOfInterest)
    expect(nearbyPointsOfInterest(poi.location.points[0])).toContain(poi);
});

it('invites reading at an accessible cathedral edge, not just its inaccessible centre', () => {
  const cathedral = features.find((feature) => feature.id === 24376643);
  if (!cathedral) throw new Error('Missing cathedral fixture.');
  expect(
    nearbyPointsOfInterest(cathedral.points[0]).map((poi) => poi.name),
  ).toContain('Basilica of Sts. Peter and Paul');
  expect(nearbyPointsOfInterest([-580, -500])).toEqual([]);
});

it('places the information-centre history at the replacement pavilion, not inside Brick Gate', () => {
  const gate = features.find((feature) => feature.id === 51700613);
  if (!gate) throw new Error('Missing Brick Gate fixture.');
  expect(
    nearbyPointsOfInterest(
      informationCentre.at(0, informationCentre.depth / 2 + 1),
    ).map((poi) => poi.name),
  ).toContain('Vyšehrad Information Centre');
  const gateNames = nearbyPointsOfInterest(gate.points[0]).map(
    (poi) => poi.name,
  );
  expect(gateNames).toContain('Brick Gate (Cihelná brána)');
  expect(gateNames).not.toContain('Vyšehrad Information Centre');
});

it('offers grave histories in the cemetery without pretending their individual positions were surveyed', () => {
  const histories = nearbyPointsOfInterest(cemeteries[0].points[0]).filter(
    (poi) => poi.name.endsWith('grave'),
  );
  expect(histories.length).toBeGreaterThan(5);
  expect(
    histories.every((poi) => poi.location.note?.includes('not surveyed')),
  ).toBe(true);
});

it('locates the surviving St. John church behind Ave Maria instead of describing a lost church at the royal palace', () => {
  const entries = nearbyPointsOfInterest(
    referenceSites.hiddenChurch.point,
  ).filter((poi) => /John the Baptist/.test(poi.name));
  expect(entries).toHaveLength(2);
  for (const poi of entries) {
    expect(poi.description).toMatch(/surviv/i);
    expect(poi.location.note).toMatch(/exterior/i);
  }
});
