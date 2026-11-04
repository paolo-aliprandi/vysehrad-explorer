import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  buildings,
  discoveredNear,
  landmarks,
  metadata,
  features,
  terrainMetadata,
  initialHeading,
  readProgress,
  spawn,
  type Point,
} from '../world/geo';
import { explorationPaths as paths } from '../world/landscape';
import type { Snapshot, TimeOfDay, World } from '../world/engine';
import { casemateNotes, readCasemateNotes } from '../world/casemates';
import {
  ControllerReader,
  idleController,
  type ControllerInput,
} from '../world/gamepad';
import {
  adventureRegions,
  adventureStorageKey,
  enemySpawns,
  raidHouses,
  readAdventure,
  type GameMode,
} from '../world/adventure';
import './app.css';
import {
  nearbyPointsOfInterest,
  pointsOfInterest,
} from '../world/points-of-interest';

const baseUrl = import.meta.env.BASE_URL;
const welcomeAerials = ['fortress', 'cathedral', 'gates'];

type IconName =
  | 'castle'
  | 'arrow'
  | 'map'
  | 'fly'
  | 'walk'
  | 'sun'
  | 'moon'
  | 'help'
  | 'close'
  | 'check'
  | 'camera'
  | 'sound'
  | 'muted'
  | 'expand';
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const artwork: Record<IconName, string> = {
    castle: 'M4 21V8h4V4l2-3 2 3v4h3V4l2-3 2 3v4h2v13H4Zm6 0v-7h5v7',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
    fly: 'm3 16 7-4-5-8 5 2 5 5 6-1 1 2-7 3-2 6-2-1v-5l-5 3-3-2Z',
    walk: 'm10 8 4 2 3 4m-7-6-3 5-4 1m9-4-2 6 5 5m-5-5-4 5M13 3h.01',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
    moon: 'M20 15a8 8 0 0 1-11-11A9 9 0 1 0 20 15Z',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01',
    close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6',
    camera: 'M3 7h5l2-3h4l2 3h5v13H3V7Zm9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
    sound: 'M3 9h4l5-4v14l-5-4H3V9Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    muted: 'M3 9h4l5-4v14l-5-4H3V9Zm13 0 6 6m0-6-6 6',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={artwork[name]} />
    </svg>
  );
}

const MapBase = memo(function MapBase() {
  return (
    <g>
      <rect x="-380" y="-220" width="760" height="600" fill="#e3e3c9" />
      {features
        .filter(
          (f) =>
            f.tags.leisure === 'park' ||
            f.tags.landuse === 'grass' ||
            f.tags.landuse === 'cemetery',
        )
        .map((f) => (
          <polygon
            key={f.id}
            points={f.points.map((p) => p.join(',')).join(' ')}
            fill="#b3c58e"
          />
        ))}
      {features
        .filter((f) => f.tags.water === 'river')
        .map((f) => (
          <polygon
            key={f.id}
            points={f.points.map((p) => p.join(',')).join(' ')}
            fill="#83b5b3"
          />
        ))}
      {paths.map((f, index) => (
        <polyline
          key={`${f.id}-${index}`}
          points={f.points.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="#f5f1df"
          strokeWidth={
            ['footway', 'path', 'steps'].includes(f.tags.highway ?? '') ? 2 : 6
          }
        />
      ))}
      {buildings.map((f) => (
        <polygon
          key={f.id}
          points={f.points.map((p) => p.join(',')).join(' ')}
          fill="#99a18a"
          stroke="#e8e7d5"
          strokeWidth="0.7"
        />
      ))}
      <text x="-237" y="-34" fill="#4b6150" fontSize="10" letterSpacing="1">
        CEMETERY
      </text>
      <text
        x="-327"
        y="65"
        fill="#477c80"
        fontSize="13"
        transform="rotate(-90 -327 65)"
        letterSpacing="4"
      >
        VLTAVA
      </text>
    </g>
  );
});

function MapView({
  position,
  heading,
  visited,
  large = false,
  onSelect,
  adventure = false,
}: {
  position: Point;
  heading: number;
  visited: string[];
  large?: boolean;
  onSelect?: (id: string) => void;
  adventure?: boolean;
}) {
  const clip = useId();
  return (
    <svg
      className={large ? 'world-map large' : 'world-map'}
      viewBox="-380 -220 760 600"
      role="img"
      aria-label={
        adventure
          ? 'Checkpoint-revealed adventure map'
          : 'Vyšehrad map with your location and four landmarks'
      }
    >
      {adventure ? (
        <>
          <rect x="-380" y="-220" width="760" height="600" fill="#727779" />
          <defs>
            <clipPath id={clip}>
              {adventureRegions
                .filter((region) => visited.includes(region.id))
                .map((region) => (
                  <rect
                    key={region.id}
                    x={region.x}
                    y={region.z}
                    width={region.width}
                    height={region.depth}
                  />
                ))}
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            <MapBase />
          </g>
        </>
      ) : (
        <MapBase />
      )}
      {landmarks
        .filter((l) => !adventure || visited.includes(l.id))
        .map((l) => {
          const i = landmarks.indexOf(l);
          return (
            <g key={l.id}>
              <circle
                cx={l.view[0]}
                cy={l.view[1]}
                r={large ? 12 : 9}
                fill={visited.includes(l.id) ? '#3b6d53' : '#b18246'}
                stroke="#f9f5e8"
                strokeWidth="3"
              />
              <text
                x={l.view[0]}
                y={l.view[1] + 4}
                textAnchor="middle"
                fill="white"
                fontSize={large ? 12 : 10}
                fontWeight="600"
              >
                {i + 1}
              </text>
              {large && (
                <text
                  x={l.view[0] + 19}
                  y={l.view[1] + 5}
                  fill="#263c32"
                  fontSize="12"
                >
                  {l.short}
                </text>
              )}
              {onSelect && (
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${l.short}`}
                  onClick={() => onSelect(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(l.id);
                    }
                  }}
                >
                  <circle
                    cx={l.view[0]}
                    cy={l.view[1]}
                    r="21"
                    fill="transparent"
                  />
                </g>
              )}
            </g>
          );
        })}
      <g
        transform={`translate(${position[0]} ${position[1]}) rotate(${(heading * 180) / Math.PI})`}
      >
        <circle r="12" fill="#ffffff" opacity=".8" />
        <path d="m0-11 7 17-7-4-7 4Z" fill="#254c43" />
      </g>
    </svg>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button dark"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

const initialSnapshot: Snapshot = {
  position: spawn,
  heading: initialHeading,
  distance: 0,
  fps: 0,
  altitude: 0,
  interaction: null,
  seated: false,
  indoors: false,
  interior: null,
  wood: 0,
  hour: 16,
  controller: null,
  controllerSupported: false,
  adventure: null,
};
export function App() {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [flying, setFlying] = useState(false);
  const [time, setTime] = useState<TimeOfDay>('cycle');
  const [sound, setSound] = useState(false);
  const [mode, setMode] = useState<GameMode>('chill');
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [visited, setVisited] = useState<string[]>([]);
  const [undergroundNotes, setUndergroundNotes] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [modal, setModal] = useState<'map' | 'help' | 'about' | 'npc' | null>(
    null,
  );
  const [npcTopic, setNpcTopic] = useState<
    'welcome' | 'places' | 'fire' | 'trees'
  >('welcome');
  const [selected, setSelected] = useState(landmarks[0].id);
  const [photo, setPhoto] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const readingPanel = useRef<HTMLElement>(null);
  const nearbyPOIs = useMemo(
    () =>
      started && !flying && !snapshot.interior
        ? nearbyPointsOfInterest(snapshot.position)
        : [],
    [started, flying, snapshot.interior, snapshot.position],
  );
  const shownPOI = nearbyPOIs.find((poi) => poi.id === reading);
  const readPOI = useCallback(() => {
    setInfo(null);
    setReading((current) => {
      const index = nearbyPOIs.findIndex((poi) => poi.id === current);
      return nearbyPOIs[(index + 1) % nearbyPOIs.length]?.id ?? null;
    });
    readingPanel.current?.scrollTo({ top: 0 });
  }, [nearbyPOIs]);
  useEffect(() => {
    if (reading && !shownPOI) setReading(null);
  }, [reading, shownPOI]);
  const progressLoaded = useRef(false);
  const controllerHandler = useRef<((input: ControllerInput) => void) | null>(
    null,
  );
  const selectedLandmark =
    landmarks.find((l) => l.id === selected) ?? landmarks[0];
  const near = discoveredNear(snapshot.position)[0];
  const shownLandmark = landmarks.find((l) => l.id === info);
  const interact = useCallback(() => {
    try {
      const result = world.current?.interact();
      if (!result) return;
      if (result.kind === 'npc') {
        setNpcTopic('welcome');
        setModal('npc');
      } else {
        setToast(result.text);
        if (result.kind === 'rest') {
          world.current?.setTime('golden');
          setTime('golden');
        }
      }
    } catch (cause) {
      console.error('World interaction failed:', cause);
      setToast(
        'That interaction could not finish. Move to a clear path and try again.',
      );
    }
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  }, []);
  const throwStone = useCallback(() => {
    const message = world.current?.throwStone();
    if (message) setToast(message);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  }, []);

  const onDiscover = useCallback((id: string) => {
    setVisited((current) =>
      current.includes(id) ? current : [...current, id],
    );
    setToast(`Discovered: ${landmarks.find((l) => l.id === id)?.short}`);
    setInfo(id);
  }, []);
  const onCasemateNote = useCallback((id: string) => {
    setUndergroundNotes((current) =>
      current.includes(id) ? current : [...current, id],
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let instance: World | undefined;
    import('../world/engine')
      .then(({ World }) => {
        if (cancelled || !host.current) return;
        try {
          instance = new World(host.current, {
            onUpdate: setSnapshot,
            onDiscover,
            onCasemateNote,
            onError: setError,
            onMessage: setToast,
          });
          world.current = instance;
          setReady(true);
          try {
            const saved = readProgress(localStorage);
            setVisited(saved);
            instance.setDiscoveries(saved);
            const notes = readCasemateNotes(localStorage);
            setUndergroundNotes(notes);
            instance.setCasemateNotes(notes);
          } catch (cause) {
            console.warn('Could not read discovery progress:', cause);
            setStorageWarning(
              'Saved progress could not be read. Discoveries will work for this visit.',
            );
          }
          progressLoaded.current = true;
        } catch (cause) {
          console.error('3D world initialization failed:', cause);
          setError(
            'Could not open the 3D world. Use an up-to-date browser with WebGL2 and hardware acceleration enabled.',
          );
        }
      })
      .catch((cause: unknown) => {
        console.error('3D engine could not load:', cause);
        if (!cancelled)
          setError(
            'The 3D engine could not load. Reload the page to try again.',
          );
      });
    return () => {
      cancelled = true;
      instance?.dispose();
      world.current = null;
    };
  }, [onDiscover, onCasemateNote]);

  useEffect(() => {
    if (!progressLoaded.current || !started || mode !== 'chill') return;
    try {
      localStorage.setItem('vysehrad-discoveries-v1', JSON.stringify(visited));
    } catch (cause) {
      console.warn('Could not save discovery progress:', cause);
      setStorageWarning(
        'Browser storage is unavailable. Discoveries will not persist after this visit.',
      );
    }
    world.current?.setDiscoveries(visited);
  }, [visited, started, mode]);
  const adventureSave = snapshot.adventure
    ? JSON.stringify({
        explored: snapshot.adventure.explored,
        weapon: snapshot.adventure.weapon,
        defeated: snapshot.adventure.defeated,
        coins: snapshot.adventure.coins,
        health: snapshot.adventure.health,
        hasBow: snapshot.adventure.hasBow,
        melee: snapshot.adventure.melee,
        arrows: snapshot.adventure.arrows,
        collectedArrows: snapshot.adventure.collectedArrows,
        landedArrows: snapshot.adventure.landedArrows,
      })
    : null;
  useEffect(() => {
    if (!started || mode !== 'adventure' || !adventureSave) return;
    try {
      localStorage.setItem(adventureStorageKey, adventureSave);
    } catch (cause) {
      console.warn('Could not save adventure progress:', cause);
      setStorageWarning('Adventure progress cannot be saved in this browser.');
    }
  }, [started, mode, adventureSave]);
  useEffect(() => {
    if (!progressLoaded.current) return;
    try {
      localStorage.setItem(
        'vysehrad-casemates-v1',
        JSON.stringify(undergroundNotes),
      );
    } catch (cause) {
      console.warn('Could not save underground field notes:', cause);
      setStorageWarning(
        'Browser storage is unavailable. Underground notes will not persist after this visit.',
      );
    }
    world.current?.setCasemateNotes(undergroundNotes);
  }, [undergroundNotes]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    world.current?.setPaused(Boolean(modal));
  }, [modal]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        !started ||
        (event.target instanceof HTMLElement &&
          (event.target.matches('input, textarea, select') ||
            event.target.isContentEditable))
      )
        return;
      if (event.code === 'Escape') {
        setPhoto(false);
        setInfo(null);
        setReading(null);
        if (!modal) world.current?.stand();
      }
      if (!modal && !event.repeat && event.code === 'KeyF') {
        event.preventDefault();
        interact();
      }
      if (!modal && !photo && !event.repeat && event.code === 'KeyI') {
        event.preventDefault();
        readPOI();
      }
      if (!modal && !event.repeat && event.code === 'KeyR') {
        event.preventDefault();
        throwStone();
      }
      if (
        !modal &&
        !event.repeat &&
        event.code === 'KeyC' &&
        mode === 'adventure'
      )
        setToast(world.current?.switchWeapon() ?? '');
      if (event.code === 'KeyM' && !modal) setModal('map');
      if (event.code === 'KeyP' && !modal) setPhoto((current) => !current);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [started, modal, photo, interact, throwStone, mode, readPOI]);

  const start = () => {
    let progress;
    if (mode === 'adventure') {
      try {
        progress = readAdventure(localStorage);
      } catch (cause) {
        console.warn('Could not read adventure progress:', cause);
        setStorageWarning(
          'Saved adventure progress could not be read. Starting a fresh adventure.',
        );
        progress = { explored: [], weapon: null, defeated: [] };
      }
      setVisited(progress.explored);
    }
    world.current?.setMode(mode, progress);
    world.current?.setActive(true);
    void world.current?.setSound(true).then(setSound);
    setStarted(true);
    setToast(
      mode === 'adventure'
        ? 'You are the knight of Vyšehrad. Pick up the glowing stick; raise banners to reveal your map. F / A interacts; R / Y attacks.'
        : 'F / A to interact · R / Y to toss a stone · M / − for the map.',
    );
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  };
  const toggleFlight = () => {
    if (mode === 'adventure') {
      setToast(
        'Adventure is on foot. Flight is only available in Chill Exploration.',
      );
      return;
    }
    try {
      world.current?.setFlying(!flying);
      setFlying(!flying);
      setToast(
        flying
          ? 'Back on foot. Follow the paths.'
          : 'Bird’s-eye mode. E / Space to rise, Q to descend.',
      );
    } catch (cause) {
      console.error('Could not change exploration mode:', cause);
      setToast(
        'No safe landing spot here. Fly closer to a path and try again.',
      );
    }
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  };
  const changeTime = () => {
    const next =
      time === 'cycle'
        ? 'golden'
        : time === 'golden'
          ? 'day'
          : time === 'day'
            ? 'night'
            : 'cycle';
    world.current?.setTime(next);
    setTime(next);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  };
  const travel = () => {
    try {
      world.current?.travel(selected);
      setModal(null);
      setInfo(selected);
    } catch (cause) {
      console.error('Travel failed:', cause);
      setToast('Could not find a safe destination. Try another landmark.');
    }
  };
  const travelActivity = (id: string) => {
    try {
      world.current?.travelActivity(id);
      setFlying(false);
      setModal(null);
      setInfo(null);
      setToast('Walk closer and press F to interact.');
    } catch (cause) {
      console.error('Activity travel failed:', cause);
      setToast('Could not find a safe activity spot. Try another destination.');
    }
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (cause) {
      console.warn('Fullscreen unavailable:', cause);
      setToast('Fullscreen is unavailable in this browser.');
    }
  };

  useEffect(() => {
    controllerHandler.current = (input) => {
      const focused =
        document.hasFocus() && document.visibilityState === 'visible';
      world.current?.setControllerInput(
        focused && started && !modal
          ? shownPOI
            ? {
                ...input,
                pressed: new Set(
                  [...input.pressed].filter((action) => action !== 'jump'),
                ),
              }
            : input
          : { ...idleController, name: input.name, supported: input.supported },
      );
      if (!focused || !input.supported) return;
      const pressed = input.pressed;
      if (pressed.has('menu')) {
        setModal(modal ? null : 'help');
        return;
      }
      if (modal) {
        if (pressed.has('jump') || pressed.has('map')) {
          setModal(null);
          return;
        }
        const dialog = document.querySelector('dialog[open]');
        const controls = [
          ...(dialog?.querySelectorAll<HTMLElement | SVGElement>(
            'button:not(:disabled), [tabindex="0"]',
          ) ?? []),
        ].filter((element) => element.getClientRects().length > 0);
        if (pressed.has('previous') || pressed.has('next')) {
          const current = controls.findIndex(
            (element) => element === document.activeElement,
          );
          const next =
            controls[
              (current + (pressed.has('previous') ? -1 : 1) + controls.length) %
                controls.length
            ];
          next?.focus();
          next?.scrollIntoView({ block: 'nearest' });
        }
        if (pressed.has('interact')) {
          const active = document.activeElement;
          if (
            (active instanceof HTMLElement || active instanceof SVGElement) &&
            dialog?.contains(active)
          ) {
            if (active instanceof HTMLElement) active.click();
            else
              active.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          } else controls[0]?.focus();
        }
        return;
      }
      if (!started) {
        if (pressed.has('previous') || pressed.has('next'))
          setMode((current) => (current === 'chill' ? 'adventure' : 'chill'));
        if (pressed.has('interact') && ready) start();
        return;
      }
      if (!photo && pressed.has('read')) readPOI();
      if (shownPOI && pressed.has('readScroll'))
        readingPanel.current?.scrollBy({ top: 120, behavior: 'smooth' });
      if (shownPOI && pressed.has('jump')) {
        setReading(null);
        return;
      }
      if (pressed.has('photo')) {
        setPhoto(!photo);
        return;
      }
      if (pressed.has('map')) setModal('map');
      if (pressed.has('interact')) interact();
      if (pressed.has('throw')) throwStone();
      if (pressed.has('flight')) toggleFlight();
      if (mode === 'adventure' && pressed.has('equip'))
        setToast(world.current?.switchWeapon() ?? '');
      if (
        mode === 'adventure' &&
        snapshot.adventure?.weapon === 'bow' &&
        pressed.has('shoot')
      )
        setToast(world.current?.shoot() ?? '');
    };
  });
  useEffect(() => {
    if (!ready || !navigator.getGamepads) return;
    const reader = new ControllerReader();
    let frame = 0;
    const poll = (now: number) => {
      try {
        controllerHandler.current?.(reader.read(navigator.getGamepads(), now));
      } catch (cause) {
        console.warn('Controller input unavailable:', cause);
        world.current?.setControllerInput(idleController);
        setToast(
          'Controller access is unavailable. Try Chrome or Edge in a regular browser tab.',
        );
        return;
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  return (
    <main
      className={`app ${started ? 'playing' : 'welcome'} ${photo ? 'photo-mode' : ''}`}
    >
      <div className="scene" ref={host} />
      {!started && (
        <div className="welcome-aerials" aria-hidden="true">
          {welcomeAerials.map((view, index) => (
            <img
              key={view}
              src={`${baseUrl}images/welcome-${view}.jpg`}
              srcSet={`${baseUrl}images/welcome-${view}.jpg 1200w, ${baseUrl}images/welcome-${view}-large.jpg 3840w`}
              sizes="100vw"
              alt=""
              width="1200"
              height="750"
              fetchPriority={index === 0 ? 'high' : 'low'}
            />
          ))}
        </div>
      )}
      <div className="vignette" />
      {started && mode === 'adventure' && (
        <div
          className={`health-panel${snapshot.adventure?.hurt ? ' hurt' : ''}${snapshot.adventure?.eating ? ' healing' : ''}`}
          role="status"
          aria-label="Knight health"
        >
          <div>
            <span>HEALTH {snapshot.adventure?.health ?? 5} / 5</span>
            <span>{snapshot.adventure?.coins ?? 12} coins</span>
          </div>
          <progress
            aria-label="Health"
            max={5}
            value={snapshot.adventure?.health ?? 5}
          />
        </div>
      )}
      {started && mode === 'adventure' && snapshot.adventure?.aiming && (
        <div className="bow-crosshair" aria-label="Bow aiming reticle">
          <span>+</span>
          <small>{snapshot.adventure.arrows} arrows · ZR / R</small>
        </div>
      )}
      {started && mode === 'adventure' && snapshot.adventure?.hurt && (
        <div className="damage-vignette" aria-hidden="true" />
      )}
      {!photo && (
        <header className="topbar">
          <a className="brand" href={baseUrl} aria-label="Vyšehrad home">
            <span className="brand-symbol">
              <Icon name="castle" size={27} />
            </span>
            <span>
              VYŠEHRAD<small>A LITTLE WORLD ABOVE PRAGUE</small>
            </span>
          </a>
          <div className="top-actions">
            <span className="world-badge">
              <span />
              {started
                ? mode === 'adventure'
                  ? 'KNIGHT ADVENTURE'
                  : 'SOLO EXPLORATION'
                : 'OPEN-DATA PLAYGROUND'}
              <b>MVP 02</b>
            </span>
            {started && (
              <>
                {mode === 'chill' && (
                  <button
                    className={`pill ${flying ? 'selected' : ''}`}
                    onClick={toggleFlight}
                    aria-pressed={flying}
                    disabled={snapshot.indoors}
                  >
                    <Icon name={flying ? 'fly' : 'walk'} />
                    {flying ? 'Flying' : 'Walking'}
                  </button>
                )}
                <button
                  className="pill"
                  onClick={throwStone}
                  disabled={flying || snapshot.seated || snapshot.indoors}
                  aria-label={
                    mode === 'adventure' ? 'Attack with weapon' : 'Toss a stone'
                  }
                  title={
                    mode === 'adventure'
                      ? 'Attack · R / Y'
                      : 'Toss a stone · R / Y'
                  }
                >
                  {mode === 'adventure' ? 'Attack' : 'Toss stone'}{' '}
                  <kbd>{snapshot.controllerSupported ? 'Y' : 'R'}</kbd>
                </button>
                <button
                  className="icon-button"
                  onClick={() =>
                    void world.current?.setSound(!sound).then(setSound)
                  }
                  aria-label={sound ? 'Mute sounds' : 'Enable sounds'}
                  aria-pressed={sound}
                  title="Quiet footsteps and nearby conversation"
                >
                  <Icon name={sound ? 'sound' : 'muted'} />
                </button>
                <button
                  className="icon-button"
                  onClick={changeTime}
                  aria-label={`Change time of day, currently ${time}`}
                  title="24-minute day–night cycle → fixed golden hour → daylight → night"
                >
                  <Icon
                    name={
                      time === 'night' ||
                      (time === 'cycle' &&
                        (snapshot.hour < 6 || snapshot.hour >= 20))
                        ? 'moon'
                        : 'sun'
                    }
                  />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setPhoto(true)}
                  aria-label="Photo mode"
                  title="Photo mode · P"
                >
                  <Icon name="camera" />
                </button>
                <button
                  className="icon-button"
                  onClick={fullscreen}
                  aria-label="Toggle fullscreen"
                  title="Fullscreen"
                >
                  <Icon name="expand" />
                </button>
              </>
            )}
            <button
              className="icon-button"
              onClick={() => setModal('help')}
              aria-label="Controls and help"
            >
              <Icon name="help" />
            </button>
          </div>
        </header>
      )}

      {!started && !error && (
        <section className="welcome-content">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-line" />
              50.0645° N · 14.4205° E
            </span>
            <h1>
              Above the city.
              <br />
              <em>Outside the ordinary.</em>
            </h1>
            <p>
              A hill, a fortress, a thousand little stories.
              <br />
              Make a little time for Vyšehrad.
            </p>
            <div className="hero-tags">
              <span>REAL MAP. LITTLE WORLD.</span>
              <span>NO DOWNLOAD. JUST WANDER.</span>
            </div>
          </div>
          <div className="entry-card">
            <span className="eyebrow">
              {mode === 'adventure'
                ? 'YOUR KNIGHT’S TALE'
                : 'YOUR AFTERNOON, REIMAGINED'}
            </span>
            <h2>
              {mode === 'adventure'
                ? 'Answer the fortress.'
                : 'Take the scenic route.'}
            </h2>
            <p>
              {mode === 'adventure'
                ? 'Defend civilians and village houses from raiding moss sprites. Take up a weapon, raise four banners and reclaim the fortress. An adventure on foot, with its own progress.'
                : 'Explore historic places, chapels and underground galleries. Collect four landmark stamps, or take to the sky and see Prague from a different angle.'}
            </p>
            <div className="entry-stats">
              <div>
                <strong>{buildings.length}</strong>
                <span>mapped buildings</span>
              </div>
              <div>
                <strong>{pointsOfInterest.length}</strong>
                <span>places to discover</span>
              </div>
              <div>
                <strong>∞</strong>
                <span>reasons to linger</span>
              </div>
            </div>
            <div
              className="mode-picker"
              role="group"
              aria-label="Choose game mode"
            >
              <button
                aria-pressed={mode === 'chill'}
                onClick={() => setMode('chill')}
              >
                <strong>Chill Exploration</strong>
                <small>Wander, fly and relax. Full map.</small>
              </button>
              <button
                aria-pressed={mode === 'adventure'}
                onClick={() => setMode('adventure')}
              >
                <strong>Adventure Mode</strong>
                <small>Become a knight. Defend the village.</small>
              </button>
            </div>
            <button
              className="primary-button"
              disabled={!ready}
              onClick={start}
            >
              {ready ? 'Enter Vyšehrad' : 'Assembling your little world…'}
              <Icon name="arrow" />
            </button>
            <span className="entry-footnote">
              {snapshot.controllerSupported
                ? 'Controller connected · D-pad selects mode · A enters'
                : 'Keyboard + mouse or Switch Pro controller · Press any controller button'}
            </span>
            <div className="honesty-note">
              <span className="small-dot" />
              Real OSM layout & elevation. Refined, simplified architecture.
              <button onClick={() => setModal('about')}>
                About the model <span>↗</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {started && !photo && !error && (
        <>
          <div className="location-pill">
            <span className="small-dot" />
            {snapshot.indoors
              ? snapshot.interior === 'casemates'
                ? 'Vyšehrad casemates · underground interpretation'
                : snapshot.interior === 'artillery'
                  ? 'Artillery gallery · underground interpretation'
                  : snapshot.interior === 'john'
                    ? 'St. John the Baptist · hidden church interpretation'
                    : snapshot.interior === 'rotunda'
                      ? 'St. Martin’s Rotunda · interior interpretation'
                      : snapshot.interior === 'lawrence'
                        ? 'St. Lawrence · archaeological remains'
                        : 'Saints Peter & Paul · interior sketch'
              : snapshot.seated
                ? 'Taking a moment'
                : near
                  ? near.short
                  : flying
                    ? 'Somewhere above Vyšehrad'
                    : 'Vyšehrad fortress grounds'}
            <span className="location-divider" />
            {time === 'cycle'
              ? `${String(Math.floor(snapshot.hour)).padStart(2, '0')}:${String(Math.floor((snapshot.hour % 1) * 60)).padStart(2, '0')} · DAY–NIGHT CYCLE`
              : time === 'golden'
                ? 'GOLDEN HOUR'
                : time === 'day'
                  ? 'DAYLIGHT'
                  : 'BLUE NIGHT'}
          </div>
          <aside
            className={`expedition-card${mode === 'adventure' ? ' adventure-card' : ''}${shownLandmark ? ' with-discovery' : ''}`}
          >
            {mode === 'adventure' && (
              <div
                className="adventure-status"
                role="status"
                aria-label="Knight status"
              >
                <span>Equipped: {snapshot.adventure?.weapon ?? 'unarmed'}</span>
                <span>
                  Arrows: {snapshot.adventure?.arrows ?? 0} · L / C switches
                  weapons
                </span>
                <span>
                  Moss sprites: {snapshot.adventure?.defeated.length ?? 0} /{' '}
                  {enemySpawns.length}
                  {' · '}
                  {enemySpawns.length -
                    (snapshot.adventure?.defeated.length ?? 0)}{' '}
                  remaining
                </span>
                {snapshot.adventure?.defeated.length === enemySpawns.length && (
                  <button
                    className="raid-restart"
                    onClick={() =>
                      setToast(world.current?.restartRaids() ?? '')
                    }
                  >
                    Start another raid
                  </button>
                )}
                <span>
                  House raids cleared: {snapshot.adventure?.housesDefended ?? 0}{' '}
                  / {raidHouses.length}
                </span>
                <span>
                  Civilians in danger:{' '}
                  {snapshot.adventure?.civiliansInDanger ?? 0}
                  {' · '}Houses under attack:{' '}
                  {snapshot.adventure?.housesUnderAttack ?? 0}
                </span>
                {(snapshot.adventure?.breachedHouses ?? 0) > 0 && (
                  <span>
                    Breached doors: {snapshot.adventure?.breachedHouses}
                  </span>
                )}
              </div>
            )}
            {snapshot.interior === 'casemates' ? (
              <>
                <div className="expedition-heading">
                  <span className="eyebrow">BENEATH THE RAMPARTS</span>
                  <span className="progress-count">
                    {undergroundNotes.length} / {casemateNotes.length}
                  </span>
                </div>
                <h2>
                  {undergroundNotes.length === casemateNotes.length
                    ? 'The underground, discovered.'
                    : 'Follow the lanterns.'}
                </h2>
                <p>
                  Find Gorlice and record three field notes with F. Take the
                  uphill passage to Na Hradbách, or retrace your steps. Notes
                  are saved on this browser.
                </p>
                <div className="landmark-list">
                  {casemateNotes.map((note, i) => (
                    <div
                      key={note.id}
                      className={
                        undergroundNotes.includes(note.id) ? 'discovered' : ''
                      }
                    >
                      <span className="stamp">
                        {undergroundNotes.includes(note.id) ? '✓' : `0${i + 1}`}
                      </span>{' '}
                      {note.title}
                    </div>
                  ))}
                </div>
                <p>
                  <small>
                    Illustrative, shortened layout, not a surveyed plan. The
                    real visitor entrance is at the Brick Gate.
                  </small>
                </p>
              </>
            ) : (
              <>
                <div className="expedition-heading">
                  <span className="eyebrow">
                    {mode === 'adventure'
                      ? 'THE KNIGHT’S CHART'
                      : 'THE VYŠEHRAD FIELD NOTES'}
                  </span>
                  <span className="progress-count">{visited.length} / 4</span>
                </div>
                <h2>
                  {mode === 'adventure'
                    ? visited.length === 4 &&
                      snapshot.adventure?.defeated.length === enemySpawns.length
                      ? 'Vyšehrad reclaimed.'
                      : 'Raise four banners.'
                    : visited.length === 4
                      ? 'A little world, discovered.'
                      : 'Good things are found on foot.'}
                </h2>
                <p>
                  {mode === 'adventure'
                    ? 'Defend civilians and seven house entrances from raiding moss sprites. Find a stick, sword or bow; dodge their wind-ups and collect finite arrow bundles. Buy food at Na hradbách, Okénko or U Vratislava. Raise four banners to chart the map and restore health.'
                    : visited.length === 4
                      ? 'Your four discoveries are saved on this browser. Stay a while, or take to the sky.'
                      : 'Visit the glowing markers. Collect a memory from each corner of the fortress.'}
                </p>
                <div className="landmark-list">
                  {landmarks.map((l, i) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        setSelected(l.id);
                        setModal('map');
                      }}
                      className={visited.includes(l.id) ? 'discovered' : ''}
                    >
                      <span className="stamp">
                        {visited.includes(l.id) ? (
                          <Icon name="check" size={14} />
                        ) : (
                          `0${i + 1}`
                        )}
                      </span>
                      <span>
                        {mode === 'adventure' && !visited.includes(l.id)
                          ? 'Uncharted region'
                          : l.short}
                      </span>
                      <span className="landmark-state">
                        {visited.includes(l.id) ? 'FOUND' : 'EXPLORE'}
                        <Icon name="arrow" size={13} />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="expedition-footer">
                  <span>{Math.round(snapshot.distance)} m wandered</span>
                  {snapshot.wood > 0 && <span>Wood: {snapshot.wood}</span>}
                  <span>
                    {snapshot.fps} FPS
                    {flying ? ` · ${snapshot.altitude} m up` : ''}
                  </span>
                </div>
              </>
            )}
          </aside>
          <aside className="minimap-card">
            <div className="minimap-heading">
              <span>YOUR LITTLE CORNER OF PRAGUE</span>
              <span>N ↑</span>
            </div>
            <button
              className="minimap-button"
              onClick={() => setModal('map')}
              aria-label="Open exploration map"
            >
              {snapshot.indoors ? (
                <p className="interior-map-note">
                  {snapshot.interior === 'casemates'
                    ? 'Entrance → vaulted passages → Gorlice'
                    : snapshot.interior === 'artillery'
                      ? 'A separate vaulted gallery with interpretive cannons and military trophy displays.'
                      : snapshot.interior === 'john'
                        ? 'A sheltered chapel within the rampart, reached through the gap behind Ave Maria. An illustrative interior.'
                        : snapshot.interior === 'rotunda'
                          ? 'Romanesque nave, domed ceiling and altar apse. An illustrative interior.'
                          : snapshot.interior === 'lawrence'
                            ? 'Sheltered archaeological foundations and interpretive hexagonal floor tiles beneath a flat roof; not a rebuilt basilica.'
                            : 'An illustrative cathedral nave.'}
                  <br />
                  {snapshot.interior === 'casemates'
                    ? 'Green doors: return entrance, or uphill branch toward Na Hradbách. F to leave.'
                    : 'Return to the doors and press F to leave.'}
                </p>
              ) : (
                <MapView
                  position={snapshot.position}
                  heading={snapshot.heading}
                  visited={visited}
                  adventure={mode === 'adventure'}
                />
              )}
              <span className="map-open">
                <Icon name="map" size={14} />
                Open map <kbd>M</kbd>
              </span>
            </button>
          </aside>
          <div className="controls-bar">
            {snapshot.controllerSupported ? (
              <>
                <span>Left stick: move · Right stick: look</span>
                <span>
                  A interact · B jump · Y{' '}
                  {mode === 'adventure' ? 'attack' : 'toss'}
                </span>
                <span>
                  {mode === 'adventure'
                    ? 'L-stick click: sprint · ZL aim · ZR shoot · L swap · − map · + help'
                    : 'L-stick click: sprint · ZL / ZR: zoom · − map · + help'}
                </span>
              </>
            ) : (
              <>
                <span>
                  <kbd>F</kbd>Interact
                </span>
                <span>
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd>Move
                </span>
                <span>
                  <kbd>SHIFT</kbd>Faster
                </span>
                <span>
                  <kbd>{flying ? 'E / Q' : 'SPACE'}</kbd>
                  {flying ? 'Rise / descend' : 'Jump'}
                </span>
                <span>Drag to look · Scroll to zoom</span>
              </>
            )}
            {snapshot.controller && !snapshot.controllerSupported && (
              <span>
                Unmapped controller: use Chrome / Edge standard mapping
              </span>
            )}
          </div>
          {snapshot.interaction && !modal && (
            <button
              className="interaction-prompt"
              onClick={interact}
              aria-label={snapshot.interaction.label}
            >
              <kbd>{snapshot.controllerSupported ? 'A' : 'F'}</kbd>
              <span>
                {snapshot.interaction.label}
                <small>
                  {snapshot.seated ? 'Or move to stand' : 'Nearby interaction'}
                </small>
              </span>
            </button>
          )}
          {!modal && !shownPOI && nearbyPOIs.length > 0 && (
            <button className="poi-hint" onClick={readPOI}>
              <kbd>{snapshot.controllerSupported ? 'D-pad ↑' : 'I'}</kbd>
              <span>Read about {nearbyPOIs[0].name}</span>
            </button>
          )}
          {!modal && shownPOI && (
            <aside
              className="poi-reading"
              aria-labelledby="poi-title"
              ref={readingPanel}
            >
              <button
                className="icon-button dark"
                aria-label="Close point of interest"
                onClick={() => setReading(null)}
              >
                <Icon name="close" size={17} />
              </button>
              <span className="eyebrow">A little history · Nearby</span>
              <h2 id="poi-title">{shownPOI.name}</h2>
              <p>{shownPOI.description}</p>
              {shownPOI.location.note && (
                <small className="poi-location-note">
                  {shownPOI.location.note}
                </small>
              )}
              <div className="poi-reading-actions">
                {nearbyPOIs.length > 1 && (
                  <button onClick={readPOI}>
                    Next nearby story
                    <span>
                      {nearbyPOIs.findIndex((poi) => poi.id === reading) + 1} /{' '}
                      {nearbyPOIs.length}
                    </span>
                  </button>
                )}
                <small>
                  {snapshot.controllerSupported
                    ? '↑ Read / next · ↓ Scroll · B Close'
                    : 'I Read / next · Esc Close'}
                </small>
              </div>
            </aside>
          )}
          {shownLandmark && !shownPOI && (
            <div className="discovery-card">
              <button
                className="icon-button dark"
                aria-label="Close landmark details"
                onClick={() => setInfo(null)}
              >
                <Icon name="close" size={17} />
              </button>
              <span className="eyebrow">{shownLandmark.subtitle}</span>
              <h3>{shownLandmark.title}</h3>
              <p>{shownLandmark.description}</p>
            </div>
          )}
        </>
      )}

      {photo && (
        <button className="photo-return pill" onClick={() => setPhoto(false)}>
          <Icon name="camera" />
          Return to exploring <kbd>P</kbd>
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
      {storageWarning && (
        <div className="storage-warning" role="status">
          {storageWarning}
        </div>
      )}
      {error && (
        <div className="error-card" role="alert">
          <span className="eyebrow">A SMALL DETOUR</span>
          <h2>The world couldn’t open.</h2>
          <p>{error}</p>
          <button
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            Try again
            <Icon name="arrow" />
          </button>
        </div>
      )}
      <footer className="attribution">
        <span>
          Map data{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>{' '}
          ·{' '}
          <a href={`${import.meta.env.BASE_URL}data/vysehrad.osm.xml`} download>
            OSM snapshot · ODbL
          </a>{' '}
          ·{' '}
          <a href={terrainMetadata.termsUrl} target="_blank" rel="noreferrer">
            Terrain © ČÚZK · CC BY 4.0
          </a>
        </span>
        {!photo && (
          <button onClick={() => setModal('about')}>
            Elevation-backed MVP · simplified architecture ↗
          </button>
        )}
      </footer>

      {modal === 'map' && (
        <Dialog
          title="Choose your next little adventure."
          onClose={() => setModal(null)}
        >
          <div className="map-dialog-content">
            <MapView
              position={snapshot.position}
              heading={snapshot.heading}
              visited={visited}
              adventure={mode === 'adventure'}
              large
              onSelect={setSelected}
            />
            <div className="map-sidebar">
              <span className="eyebrow">FOUR PLACES. YOUR OWN PACE.</span>
              <div className="destination-list">
                {landmarks.map((l, i) => (
                  <button
                    key={l.id}
                    className={selected === l.id ? 'active' : ''}
                    onClick={() => setSelected(l.id)}
                    disabled={mode === 'adventure' && !visited.includes(l.id)}
                  >
                    <span>0{i + 1}</span>
                    {mode === 'adventure' && !visited.includes(l.id)
                      ? 'Uncharted region'
                      : l.short}
                    {visited.includes(l.id) && <Icon name="check" size={16} />}
                  </button>
                ))}
              </div>
              {mode === 'chill' && (
                <div className="activity-destinations">
                  <span className="eyebrow">LITTLE THINGS TO DO</span>
                  <button onClick={() => travelActivity('groundskeeper')}>
                    Meet the groundskeeper
                  </button>
                  <button onClick={() => travelActivity('fire')}>
                    Visit the fireplace
                  </button>
                  <button onClick={() => travelActivity('bench')}>
                    Find a bench
                  </button>
                  <button onClick={() => travelActivity('grove')}>
                    Explore the tree grove
                  </button>
                  <button onClick={() => travelActivity('casemates')}>
                    Explore the casemates
                  </button>
                  <button onClick={() => travelActivity('casemates-uphill')}>
                    Find the uphill casemate exit
                  </button>
                </div>
              )}
              <h3>
                {mode === 'adventure' && !visited.includes(selected)
                  ? 'Beyond the chart'
                  : selectedLandmark.title}
              </h3>
              <p>
                {mode === 'adventure' && !visited.includes(selected)
                  ? 'Explore on foot and raise a banner at a landmark. Its region will appear here, and its checkpoint will unlock fast travel.'
                  : selectedLandmark.description}
              </p>
              <button
                className="primary-button"
                onClick={travel}
                disabled={mode === 'adventure' && !visited.includes(selected)}
              >
                Travel here
                <Icon name="arrow" />
              </button>
              <small>
                {mode === 'adventure'
                  ? 'Only raised banners unlock fast travel. Your adventure and Chill Exploration saves are separate.'
                  : 'Fast travel is available in this solo MVP. Walk to a marker to discover it.'}
              </small>
            </div>
          </div>
        </Dialog>
      )}
      {modal === 'help' && (
        <Dialog
          title="A little help for your wander."
          onClose={() => setModal(null)}
        >
          <p className="dialog-intro">
            An original, solo browser playground inspired by real-city
            exploration games. No accounts, no installation, no hurry.
          </p>
          <div className="help-grid">
            <div>
              <kbd>SWITCH PRO</kbd>
              <h3>Explore with a controller</h3>
              <p>
                Pair a Switch Pro controller by Bluetooth or USB, open Chrome or
                Edge, and press a button. Left stick moves; right stick looks. B
                jumps, A interacts, Y tosses a stone or attacks, X toggles photo
                mode. Click left stick to sprint; ZL / ZR zoom in Chill. With a
                bow in Adventure, hold ZL to aim and press ZR to fire; L swaps
                your bow and melee weapon. − opens the map, + opens help. Use
                D-pad and A in menus; B closes them. In Chill Exploration, click
                right stick to fly, then R / L to rise / descend. Near a point
                of interest, press D-pad Up to read or switch nearby stories;
                D-pad Down scrolls and B closes the panel without jumping.
              </p>
              <p>
                Requires browser-standard mapping. Individual Joy-Con and
                driver-specific raw layouts are not supported.
              </p>
            </div>
            <div>
              <kbd>I</kbd>
              <h3>Stories on your doorstep</h3>
              <p>
                Approach a landmark and press I, or click its subtle prompt, to
                read its history in a translucent side panel. Press I again for
                another nearby story; Escape closes it. You can keep exploring
                while reading. Approximate historical locations are labelled,
                and the panel closes when you leave the area.
              </p>
            </div>
            <div>
              <Icon name="sun" />
              <h3>A living day</h3>
              <p>
                A full day takes 24 minutes, with changing sun, twilight, stars,
                moonlight and lit windows. Time pauses in menus and hidden tabs.
                The sun button cycles between automatic time and fixed golden
                hour, daylight and night.
              </p>
            </div>
            <div>
              <kbd>ADVENTURE</kbd>
              <h3>The knight’s quest</h3>
              <p>
                Choose Adventure on the home page. Pick up the glowing stick
                near the entrance, then seek a sword and bow near the rotunda.
                Raise four checkpoint banners with F / A to reveal the gray map
                and restore health. R / Y swings toward the camera direction.
                Enemies take several hits: dodge their raised-arm wind-ups. Hold
                ZL / Z to aim a bow, then ZR / R to shoot. L / C swaps weapons;
                glowing arrow bundles contain eight arrows and do not respawn.
                You start with 12 coins and earn two per defeated sprite. Buy
                and eat food with F / A at Na hradbách, Okénko or U Vratislava:
                three coins restores up to three health. The health bar stays
                visible even when X / P hides the UI. Moss sprites raid seven
                house entrances and chase civilians, who flee along the paths or
                recover if overwhelmed. Defend doors before their integrity runs
                out; clear each raiding party to secure its house. Sprites
                disappear without gore when defeated. If your health runs out,
                return to your last banner without losing equipment or
                discoveries. No flight; fast travel only to raised banners.
              </p>
            </div>
            <div>
              <kbd>F · R</kbd>
              <h3>A world to touch</h3>
              <p>
                F interacts with nearby benches, trees, the fireplace, the
                groundskeeper, cathedral and casemate entrances. Underground, F
                records field notes and uses the exit doors. R tosses a stone
                outdoors. Three chops cut a tree; resting regrows the grove.
                Move or press F to stand. These playful changes last for this
                visit.
              </p>
            </div>
            <div>
              <kbd>W A S D</kbd>
              <h3>Find your own way</h3>
              <p>
                Move with the keyboard or arrow keys. Hold Shift to move faster.
                Space jumps when walking.
              </p>
            </div>
            <div>
              <Icon name="camera" />
              <h3>Change your perspective</h3>
              <p>
                Drag the world to turn the camera. Scroll to zoom. P hides the
                interface for a screenshot; P or Escape brings it back.
              </p>
            </div>
            <div>
              <Icon name="fly" />
              <h3>A bird’s-eye view</h3>
              <p>
                Switch Walking to Flying. E or Space rises; Q descends. Switch
                back to land safely near your current position.
              </p>
            </div>
            <div>
              <Icon name="map" />
              <h3>Collect four memories</h3>
              <p>
                Find glowing markers near the landmarks. M opens the map for
                fast travel. Discoveries are saved on this browser.
              </p>
            </div>
          </div>
          <p className="model-notice">
            Desktop-first · WebGL2 required · Single-player only · Real
            elevation, simplified architectural detail
          </p>
        </Dialog>
      )}
      {modal === 'npc' && (
        <Dialog title="The groundskeeper" onClose={() => setModal(null)}>
          <span className="eyebrow">A SCRIPTED LITTLE CONVERSATION</span>
          <p className="dialog-intro" aria-live="polite">
            {npcTopic === 'welcome'
              ? 'Welcome to the hill. No hurry here. Try a bench, warm yourself at the terrace fire, or step into our little cathedral sketch. What would you like to know?'
              : npcTopic === 'places'
                ? 'Follow the basilica marker to Saints Peter & Paul. Press F nearby to step into an illustrative nave with columns, pews and an altar. The interior is an original sketch, not a surveyed reconstruction.'
                : npcTopic === 'fire'
                  ? 'There is a fire bowl on the cafe terrace. Rest on the log beside it to return to golden hour and regrow any trees you have cut. Your discoveries and collected wood stay with you during this visit.'
                  : 'Three chops leave a stump and give you three pieces of wood. Rest at the fire to regrow the grove. This is a playful, session-only version of the park; nothing changes in the map data.'}
          </p>
          <div className="conversation-options">
            <button onClick={() => setNpcTopic('places')}>
              Can I go inside the cathedral?
            </button>
            <button onClick={() => setNpcTopic('fire')}>
              Where can I rest?
            </button>
            <button onClick={() => setNpcTopic('trees')}>
              How does tree cutting work?
            </button>
            <button onClick={() => travelActivity('fire')}>
              Show me the fireplace
            </button>
            <button onClick={() => setModal(null)}>Back to wandering</button>
          </div>
        </Dialog>
      )}
      {modal === 'about' && (
        <Dialog
          title="Real coordinates. An imagined little world."
          onClose={() => setModal(null)}
        >
          <p className="dialog-intro">
            The streets, paths, footprints, mapped trees and building parts come
            from a bundled OpenStreetMap export around Vyšehrad. The basilica’s
            two 60 m tower tags are present in this snapshot. The hill now uses
            320 × 182 samples from ČÚZK DMR 5G rather than a procedural mound.
            Facades, paving and gate details are informed by locally inspected
            reference footage; the videos are not bundled or uploaded.
          </p>
          <div className="about-stats">
            <div>
              <strong>{buildings.length}</strong>building footprints
            </div>
            <div>
              <strong>{paths.length}</strong>mapped path / road ways
            </div>
            <div>
              <strong>{metadata.timestamp.slice(0, 10)}</strong>snapshot
              retrieved
            </div>
          </div>
          <h3>What is approximate?</h3>
          <p>
            Terrain is resampled from DMR 5G onto a 5 m rendering grid, with
            local grading around building foundations. Missing heights use
            illustrative defaults. Roofs, gate ornament, windows and materials
            are simplified, not photogrammetry. Building courtyard holes,
            interiors and underground routes are not reconstructed. Trees and
            street furniture supplement the mapped data procedurally.
          </p>
          <h3>What is in this MVP?</h3>
          <p>
            Walking with building and wall collision, free flight, four
            discoveries, local progress, fast travel, three lighting presets and
            photo mode. No multiplayer, historical reconstruction or live city
            streaming.
          </p>
          <p className="model-notice">
            Map data{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
            , licensed under ODbL.{' '}
            <a
              href={`${import.meta.env.BASE_URL}data/vysehrad.osm.xml`}
              download
            >
              Download the source geometry snapshot
            </a>
            . All interface and procedural art are original; no Helsinki Online
            assets are used. Terrain © ČÚZK,{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>
            .{' '}
            <a
              href={`${import.meta.env.BASE_URL}data/vysehrad-terrain.tif`}
              download
            >
              Download the resampled elevation raster
            </a>
            .
          </p>
        </Dialog>
      )}
    </main>
  );
}

export default App;
