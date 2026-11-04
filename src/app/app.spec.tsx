import { fireEvent, render, screen } from '@testing-library/react';
import App from './app';

vi.mock('../world/engine', () => ({
  World: class {
    setDiscoveries = vi.fn();
    setCasemateNotes = vi.fn();
    setActive = vi.fn();
    setSound = vi.fn(async (enabled: boolean) => enabled);
    setMode = vi.fn();
    setControllerInput = vi.fn();
    setPaused = vi.fn();
    dispose = vi.fn();
  },
}));

describe('exploration entry', () => {
  beforeEach(() => {
    localStorage.clear();
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
    });
  });
  it('starts exploration and restores only valid saved discoveries', async () => {
    localStorage.setItem(
      'vysehrad-discoveries-v1',
      '["gate","gate","unknown"]',
    );
    render(<App />);
    const enter = await screen.findByRole('button', { name: 'Enter Vyšehrad' });
    fireEvent.click(enter);
    expect(screen.getByText('1 / 4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Walking' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Mute sounds' }));
    expect(
      await screen.findByRole('button', { name: 'Enable sounds' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Open exploration map' }),
    ).toBeTruthy();
  });

  it('starts Adventure with a gray map independently of Chill discoveries and disables flight', async () => {
    localStorage.setItem('vysehrad-discoveries-v1', '["gate","rotunda"]');
    render(<App />);
    const enter = await screen.findByRole('button', { name: 'Enter Vyšehrad' });
    fireEvent.click(screen.getByRole('button', { name: /Adventure Mode/ }));
    fireEvent.click(enter);
    await screen.findByRole('button', { name: 'Mute sounds' });
    expect(screen.getByText('0 / 4')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Walking' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Attack with weapon' }),
    ).toBeTruthy();
    const map = screen.getByRole('img', {
      name: 'Checkpoint-revealed adventure map',
    });

    expect(map.querySelectorAll('defs rect')).toHaveLength(0);
    expect(localStorage.getItem('vysehrad-discoveries-v1')).toBe(
      '["gate","rotunda"]',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Open exploration map' }),
    );
    expect(
      screen
        .getByRole('button', { name: /Travel here/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('restores only the Adventure regions when starting a saved knight quest', async () => {
    localStorage.setItem('vysehrad-discoveries-v1', '["basilica","river"]');
    localStorage.setItem(
      'vysehrad-adventure-v1',
      '{"explored":["gate"],"weapon":"sword","defeated":["gate-sprite"]}',
    );
    render(<App />);
    const enter = await screen.findByRole('button', {
      name: 'Enter Vyšehrad',
    });
    fireEvent.click(screen.getByRole('button', { name: /Adventure Mode/ }));
    fireEvent.click(enter);
    await screen.findByRole('button', { name: 'Mute sounds' });
    expect(screen.getByText('1 / 4')).toBeTruthy();
    expect(
      screen
        .getByRole('img', { name: 'Checkpoint-revealed adventure map' })
        .querySelectorAll('defs rect'),
    ).toHaveLength(1);
  });
});
