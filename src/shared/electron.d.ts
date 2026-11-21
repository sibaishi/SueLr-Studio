interface ElectronAPI {
  focusWindow(): void;
  setIconTheme?(theme: 'light' | 'dark'): void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
