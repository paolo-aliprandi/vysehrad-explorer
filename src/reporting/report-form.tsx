import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  avatarCoordinates,
  parseReport,
  type PhoneLocation,
  type ReportLocation,
} from '../../api/reporting/src/report';
import { preparePhoto } from './photo';

type Turnstile = {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  remove(id: string): void;
  reset(id: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let loading: Promise<void> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(
        new Error(
          'The anti-spam check could not load. Reopen this form to retry.',
        ),
      );
    };
    document.head.append(script);
  });
  return loading;
}

export function ReportForm({
  location,
  revision,
  endpoint,
  siteKey,
  onDone,
}: {
  location: ReportLocation;
  revision: string;
  endpoint: string;
  siteKey: string;
  onDone: () => void;
}) {
  const [id, setId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<'incorrect' | 'contribution'>('incorrect');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [gps, setGps] = useState<PhoneLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState('');
  const [sending, setSending] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState('');
  const captcha = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const selection = useRef(0);
  const coordinates = avatarCoordinates(location);

  useEffect(() => {
    if (!photo) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    let active = true;
    void loadTurnstile()
      .then(() => {
        if (!active) return;
        if (!window.turnstile || !captcha.current)
          throw new Error('The anti-spam check is unavailable.');
        widget.current = window.turnstile.render(captcha.current, {
          sitekey: siteKey,
          action: 'report',
          callback: setToken,
          'expired-callback': () => setToken(''),
          'error-callback': () => {
            setToken('');
            setError('The anti-spam check failed. Reopen this form to retry.');
          },
        });
      })
      .catch((cause: unknown) => {
        if (active) {
          console.error('Report anti-spam initialization failed:', cause);
          setError(
            cause instanceof Error
              ? cause.message
              : 'The anti-spam check failed.',
          );
        }
      });
    return () => {
      active = false;
      if (widget.current !== null) window.turnstile?.remove(widget.current);
    };
  }, [siteKey]);

  const choosePhoto = async (file?: File) => {
    setId(crypto.randomUUID());
    const current = ++selection.current;
    setPhoto(null);
    setError('');
    if (!file) {
      setPreparing(false);
      return;
    }
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      if (current === selection.current) setPhoto(prepared);
    } catch (cause) {
      console.error('Report photo preparation failed:', cause);
      if (current === selection.current)
        setError(
          'Could not prepare this photo. Try a JPEG, PNG or WebP image smaller than 20 MB.',
        );
    } finally {
      if (current === selection.current) setPreparing(false);
    }
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setError(
        'This browser does not support phone location. You can still submit without it.',
      );
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setId(crypto.randomUUID());
        setGps({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        });
        setLocating(false);
      },
      (cause) => {
        console.warn('Report phone location unavailable:', cause.code);
        setError(
          'Phone location was not shared. You can still submit using the avatar location.',
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setError('');
    if (!photo || !token) {
      setError('Choose a photo and complete the anti-spam check.');
      return;
    }
    setSending(true);
    try {
      const report = parseReport({
        id,
        kind,
        description,
        avatar: location,
        gps,
        revision,
        consent,
      });
      const data = new FormData();
      data.set('report', JSON.stringify(report));
      data.set('photo', photo, 'map-photo.jpg');
      data.set('token', token);
      const response = await fetch(new URL('/reports', endpoint), {
        method: 'POST',
        body: data,
        credentials: 'omit',
        signal: AbortSignal.timeout(30000),
      });
      const result: { id?: string; received?: boolean; error?: string } =
        await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? 'The report could not be sent. Please retry.',
        );
      if (result.received !== true || result.id !== id)
        throw new Error('The server did not confirm receipt. Please retry.');
      setReceived(true);
    } catch (cause) {
      console.error('Report submission failed:', cause);
      setError(
        cause instanceof Error && cause.name === 'TimeoutError'
          ? 'Receipt could not be confirmed. Retry here; the same report will not be submitted twice.'
          : cause instanceof Error
            ? cause.message
            : 'The report could not be sent.',
      );
      setToken('');
      if (widget.current !== null) window.turnstile?.reset(widget.current);
    } finally {
      setSending(false);
    }
  };
  if (received)
    return (
      <div className="report-form" role="status">
        <h3>Report received. Thank you!</h3>
        <p>
          Your photo and locations have been saved for private human review.
          Nothing changes in the map automatically.
        </p>
        <small>Reference: {id}</small>
        <button className="primary-button" onClick={onDone}>
          Return to exploring
        </button>
      </div>
    );
  return (
    <form className="report-form" onSubmit={(event) => void submit(event)}>
      <p>
        Help us improve the model with a real-world photo. No account is needed.
      </p>
      <div className="report-location">
        <strong>Avatar location captured</strong>
        <span>
          x {location.x.toFixed(2)} · z {location.z.toFixed(2)}
          {location.interior ? ` · ${location.interior}` : ''}
        </span>
        <span>
          {coordinates.latitude.toFixed(6)}° N,{' '}
          {coordinates.longitude.toFixed(6)}° E (approximate)
        </span>
        <small>
          Close this form and move your avatar if this is not the place you want
          to report.
        </small>
      </div>
      <fieldset disabled={sending}>
        <label>
          What would you like to share?
          <select
            value={kind}
            onChange={(event) => {
              setId(crypto.randomUUID());
              setKind(
                event.target.value === 'incorrect'
                  ? 'incorrect'
                  : 'contribution',
              );
            }}
          >
            <option value="incorrect">Something is incorrect</option>
            <option value="contribution">Contribute a reference photo</option>
          </select>
        </label>
        <label>
          Describe the location and what should change
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={description}
            onChange={(event) => {
              setId(crypto.randomUUID());
              setDescription(event.target.value);
            }}
          />
        </label>
        <label>
          Take or choose a real-world photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            required
            onChange={(event) => void choosePhoto(event.target.files?.[0])}
          />
        </label>
        {preparing && (
          <p role="status">
            Preparing a smaller photo and removing embedded metadata…
          </p>
        )}
        {preview && (
          <img
            className="report-preview"
            src={preview}
            alt="Reference to submit for private review"
          />
        )}
        <div className="report-gps">
          {gps ? (
            <>
              <span>
                Phone GPS: {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}{' '}
                · accuracy ±{Math.round(gps.accuracy)} m
              </span>
              <button
                type="button"
                onClick={() => {
                  setId(crypto.randomUUID());
                  setGps(null);
                }}
              >
                Remove phone location
              </button>
            </>
          ) : (
            <button type="button" disabled={locating} onClick={locate}>
              {locating
                ? 'Finding your location…'
                : 'Add my phone location (optional)'}
            </button>
          )}
        </div>
        <p className="report-privacy">
          Only the locations shown here are sent. There is no background
          location tracking. Cloudflare stores the photo with 30-day access;
          GitHub holds the report in a private review queue. Do not include
          faces or personal details.
        </p>
        <label className="report-consent">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            I own this photo or have permission to share it, and agree to send
            it and the displayed locations for private map review.
          </span>
        </label>
        <div ref={captcha} className="report-captcha" />
        {error && <p role="alert">{error}</p>}
        <button
          className="primary-button"
          type="submit"
          disabled={
            !photo || !consent || !token || preparing || locating || sending
          }
        >
          {sending ? 'Sending report…' : 'Send report privately'}
        </button>
      </fieldset>
    </form>
  );
}
