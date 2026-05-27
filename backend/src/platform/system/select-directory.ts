import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from '../../app/errors/index.ts';
import { getRuntimeCapabilities } from '../runtime/index.ts';

const execFileAsync = promisify(execFile);

async function selectDirectoryOnWindows() {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$dialog.ShowNewFolderButton = $true',
    '$result = $dialog.ShowDialog()',
    'if ($result -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::Out.Write($dialog.SelectedPath)',
    '}',
  ].join('; ');

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );

  return stdout.trim();
}

async function selectDirectoryOnMac() {
  const script = 'POSIX path of (choose folder with prompt "Select a folder for SueLr Studio")';
  const { stdout } = await execFileAsync('osascript', ['-e', script]);
  return stdout.trim().replace(/\/$/, '');
}

async function selectDirectoryOnLinux() {
  const { stdout } = await execFileAsync('zenity', [
    '--file-selection',
    '--directory',
    '--title=Select a folder for SueLr Studio',
  ]);
  return stdout.trim();
}

export async function selectDirectory() {
  if (!getRuntimeCapabilities().canSelectDirectory) {
    throw new AppError(403, 'DIRECTORY_PICKER_UNAVAILABLE', '当前运行模式不支持目录选择');
  }

  switch (process.platform) {
    case 'win32':
      return selectDirectoryOnWindows();
    case 'darwin':
      return selectDirectoryOnMac();
    case 'linux':
      return selectDirectoryOnLinux();
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
