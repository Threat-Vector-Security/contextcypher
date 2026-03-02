/** @jest-environment jsdom */
import { defaultSettings, loadSettings } from '../settings';

describe('settings recent diagram files', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns defaults when no saved settings exist', () => {
    const loaded = loadSettings();
    expect(loaded.recentDiagramFiles).toEqual(defaultSettings.recentDiagramFiles);
  });

  it('filters invalid recent file entries and normalizes timestamps', () => {
    localStorage.setItem('settings', JSON.stringify({
      theme: 'dark',
      recentDiagramFiles: [
        { id: 'file-1', name: 'first.json', lastOpenedAt: '2026-02-13T00:00:00.000Z' },
        { id: 'file-2', name: 'second.json' },
        { id: 3, name: 'invalid-id.json' },
        { id: 'file-4' }
      ]
    }));

    const loaded = loadSettings();

    expect(loaded.recentDiagramFiles).toHaveLength(2);
    expect(loaded.recentDiagramFiles?.[0]).toEqual({
      id: 'file-1',
      name: 'first.json',
      lastOpenedAt: '2026-02-13T00:00:00.000Z'
    });
    expect(loaded.recentDiagramFiles?.[1].id).toBe('file-2');
    expect(loaded.recentDiagramFiles?.[1].name).toBe('second.json');
    expect(typeof loaded.recentDiagramFiles?.[1].lastOpenedAt).toBe('string');
    expect(loaded.recentDiagramFiles?.[1].lastOpenedAt.length).toBeGreaterThan(0);
  });
});
