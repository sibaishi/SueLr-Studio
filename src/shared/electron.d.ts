interface ElectronAPI {
  focusWindow(): void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
