export const maxPhotoBytes = 256 * 1024;
export const photoRetentionDays = 30;
export const mapOrigin = [50.0645, 14.4205] as const;

export type ReportLocation = {
  x: number;
  z: number;
  heading: number;
  interior: string | null;
};
export type PhoneLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};
export type MapReport = {
  id: string;
  kind: 'incorrect' | 'contribution';
  description: string;
  avatar: ReportLocation;
  gps: PhoneLocation | null;
  revision: string;
  consent: true;
};

export function avatarCoordinates({ x, z }: ReportLocation) {
  return {
    latitude: mapOrigin[0] - z / 111320,
    longitude:
      mapOrigin[1] + x / (111320 * Math.cos((mapOrigin[0] * Math.PI) / 180)),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function bounded(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

export function parseReport(value: unknown): MapReport {
  if (
    !record(value) ||
    typeof value['id'] !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value['id'],
    ) ||
    (value['kind'] !== 'incorrect' && value['kind'] !== 'contribution') ||
    typeof value['description'] !== 'string' ||
    value['description'].trim().length < 10 ||
    value['description'].length > 2000 ||
    Array.from(value['description']).some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    }) ||
    typeof value['revision'] !== 'string' ||
    !/^(?:[a-f0-9]{7,40}|development)$/.test(value['revision']) ||
    value['consent'] !== true
  )
    throw new Error('Provide a description of 10–2000 characters and consent.');
  const avatar = value['avatar'];
  if (
    !record(avatar) ||
    !bounded(avatar['x'], -850, 850) ||
    !bounded(avatar['z'], -750, 750) ||
    !bounded(avatar['heading'], -Math.PI * 1000, Math.PI * 1000) ||
    !(
      avatar['interior'] === null ||
      (typeof avatar['interior'] === 'string' &&
        /^(cathedral|casemates|artillery|john|lawrence|rotunda)$/.test(
          avatar['interior'],
        ))
    )
  )
    throw new Error('The avatar location is outside the mapped area.');
  const gps = value['gps'];
  let phone: PhoneLocation | null = null;
  if (gps !== null) {
    if (
      !record(gps) ||
      !bounded(gps['latitude'], -90, 90) ||
      !bounded(gps['longitude'], -180, 180) ||
      !bounded(gps['accuracy'], 0, 100000)
    )
      throw new Error('The optional phone location is invalid.');
    phone = {
      latitude: gps['latitude'],
      longitude: gps['longitude'],
      accuracy: gps['accuracy'],
    };
  }
  return {
    id: value['id'],
    kind: value['kind'] === 'incorrect' ? 'incorrect' : 'contribution',
    description: value['description'].trim(),
    revision: value['revision'],
    consent: true,
    avatar: {
      x: avatar['x'],
      z: avatar['z'],
      heading: avatar['heading'],
      interior: avatar['interior'],
    },
    gps: phone,
  };
}
