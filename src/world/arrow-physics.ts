import * as THREE from 'three';

export type ArrowFlight = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
};
export type ArrowImpact = {
  point: THREE.Vector3;
  enemy?: string;
};

export function launchArrow(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  speed: number,
  gravity: number,
): ArrowFlight {
  const displacement = target.clone().sub(origin);
  const distanceSquared = displacement.lengthSq();
  const b = gravity * displacement.y - speed * speed;
  const discriminant = b * b - gravity * gravity * distanceSquared;
  const timeSquared =
    discriminant >= 0
      ? (2 * distanceSquared) / (-b + Math.sqrt(discriminant))
      : -1;
  const velocity =
    timeSquared > 0
      ? displacement
          .divideScalar(Math.sqrt(timeSquared))
          .add(new THREE.Vector3(0, (gravity * Math.sqrt(timeSquared)) / 2, 0))
      : displacement.normalize().multiplyScalar(speed);
  return { position: origin.clone(), velocity };
}

export function advanceArrow(
  flight: ArrowFlight,
  delta: number,
  gravity: number,
  collide: (from: THREE.Vector3, to: THREE.Vector3) => ArrowImpact | null,
): ArrowImpact | null {
  const steps = Math.max(1, Math.ceil(delta * 120));
  const dt = delta / steps;
  for (let step = 0; step < steps; step++) {
    const next = flight.position.clone().addScaledVector(flight.velocity, dt);
    next.y -= (gravity * dt * dt) / 2;
    const impact = collide(flight.position, next);
    flight.velocity.y -= gravity * dt;
    if (impact) {
      flight.position.copy(impact.point);
      return impact;
    }
    flight.position.copy(next);
  }
  return null;
}
