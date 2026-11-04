import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportForm } from './report-form';

vi.mock('./photo', () => ({
  preparePhoto: vi.fn(
    async () => new Blob(['normalized jpeg'], { type: 'image/jpeg' }),
  ),
}));
const location = { x: 68.56, z: 32.03, heading: 1.2, interior: null };
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test-image');
  URL.revokeObjectURL = vi.fn();
  window.turnstile = {
    render: vi.fn((_element, options) => {
      options.callback('verified-human');
      return 'widget';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
});
afterEach(() => {
  delete window.turnstile;
  vi.unstubAllGlobals();
});
async function fill() {
  fireEvent.change(
    screen.getByLabelText('Describe the location and what should change'),
    { target: { value: 'The bank beside the stairs is incomplete.' } },
  );
  fireEvent.change(screen.getByLabelText('Take or choose a real-world photo'), {
    target: { files: [new File(['test'], 'test.jpg', { type: 'image/jpeg' })] },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  const submit = screen.getByRole('button', { name: 'Send report privately' });
  await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
  const form = submit.closest('form');
  if (!form) throw new Error('Missing report form.');
  fireEvent.submit(form);
}
it('submits the frozen avatar position and photo without collecting GPS or requesting an account', async () => {
  const send = vi.fn(async (_url: unknown, options?: RequestInit) => {
    const form = options?.body as FormData;
    return Response.json(
      { received: true, id: JSON.parse(String(form.get('report'))).id },
      { status: 202 },
    );
  });
  vi.stubGlobal('fetch', send);
  render(
    <ReportForm
      location={location}
      revision="5b5edea"
      endpoint="https://reports.test"
      siteKey="site-key"
      onDone={() => undefined}
    />,
  );
  await fill();
  expect(await screen.findByText('Report received. Thank you!')).toBeTruthy();
  const data = send.mock.calls[0][1]?.body as FormData;
  const report = JSON.parse(String(data.get('report')));
  expect(report.avatar).toEqual(location);
  expect(report.gps).toBeNull();
  expect(report.consent).toBe(true);
  expect(data.get('photo')).toBeInstanceOf(File);
  expect(send.mock.calls[0][1]?.credentials).toBe('omit');
});
it('shows backend rejection instead of falsely confirming receipt', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { error: 'Reporting is temporarily full.' },
        { status: 429 },
      ),
    ),
  );
  render(
    <ReportForm
      location={location}
      revision="5b5edea"
      endpoint="https://reports.test"
      siteKey="site-key"
      onDone={() => undefined}
    />,
  );
  await fill();
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Reporting is temporarily full.',
  );
  expect(screen.queryByText('Report received. Thank you!')).toBeNull();
});
