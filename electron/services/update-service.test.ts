import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockAutoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  on: vi.fn(),
  checkForUpdates: vi.fn().mockResolvedValue(undefined),
  quitAndInstall: vi.fn(),
};

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

describe('update-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets autoDownload and autoInstallOnAppQuit to true on initialize', async () => {
    const { initialize } = await import('./update-service.js');
    initialize();
    expect(mockAutoUpdater.autoDownload).toBe(true);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it('registers update-available, update-downloaded, and error event handlers', async () => {
    const { initialize } = await import('./update-service.js');
    initialize();
    const registeredEvents = mockAutoUpdater.on.mock.calls.map(([event]: [string]) => event);
    expect(registeredEvents).toContain('update-available');
    expect(registeredEvents).toContain('update-downloaded');
    expect(registeredEvents).toContain('error');
  });

  it('triggers an initial update check after 10 seconds', async () => {
    const { initialize } = await import('./update-service.js');
    initialize();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('triggers a periodic update check after 4 hours', async () => {
    const { initialize } = await import('./update-service.js');
    initialize();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
  });

  it('calls autoUpdater.quitAndInstall on quitAndInstall()', async () => {
    const { quitAndInstall } = await import('./update-service.js');
    quitAndInstall();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('calls autoUpdater.checkForUpdates on checkForUpdates()', async () => {
    const { checkForUpdates } = await import('./update-service.js');
    checkForUpdates();
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('sends update-error IPC when autoUpdater emits an error', async () => {
    const mockSend = vi.fn();
    const { BrowserWindow } = await import('electron');
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
      { webContents: { send: mockSend } } as never,
    ]);

    const { initialize } = await import('./update-service.js');
    initialize();

    // Grab the error handler registered with autoUpdater.on
    const errorCall = mockAutoUpdater.on.mock.calls.find(([event]) => event === 'error');
    expect(errorCall).toBeDefined();
    const errorHandler = errorCall![1] as (err: Error) => void;

    errorHandler(new Error('network failure'));

    expect(mockSend).toHaveBeenCalledWith('update-error', { message: 'network failure' });
  });
});
