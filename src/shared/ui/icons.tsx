import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  BookOpen,
  Brain,
  Camera,
  CaretDown,
  CaretRight,
  ChartBar,
  ChatCircleDots,
  CheckCircle,
  ClipboardText,
  Code,
  CookingPot,
  Copy,
  Crosshair,
  Database,
  Download,
  Eye,
  EyeSlash,
  FileText,
  FilmSlate,
  Flask,
  Folder,
  GameController,
  Gear,
  Globe,
  Image,
  Info,
  Lightbulb,
  Lightning,
  MagicWand,
  MagnifyingGlass,
  Microphone,
  Monitor,
  Moon,
  MusicNotes,
  Palette,
  Paperclip,
  PaperPlaneTilt,
  Pen,
  Play,
  Plus,
  Robot,
  ShareNetwork,
  Sparkle,
  Star,
  Sun,
  Trash,
  Upload,
  VideoCamera,
  Warning,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react';
import type React from 'react';

type PhosphorIcon = React.ComponentType<{
  size?: number | string;
  style?: React.CSSProperties;
  className?: string;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  color?: string;
  mirrored?: boolean;
  alt?: string;
}>;

const ICON_MAP: Record<string, PhosphorIcon> = {
  alertcircle: WarningCircle,
  alerttriangle: Warning,
  barchart3: ChartBar,
  book: BookOpen,
  bot: Robot,
  brain: Brain,
  camera: Camera,
  chart: ChartBar,
  check: CheckCircle,
  chef: CookingPot,
  chevrondown: CaretDown,
  chevronright: CaretRight,
  clapperboard: FilmSlate,
  clipboard: ClipboardText,
  code: Code,
  copy: Copy,
  database: Database,
  download: Download,
  eye: Eye,
  eyeoff: EyeSlash,
  filetext: FileText,
  flask: Flask,
  folder: Folder,
  game: GameController,
  globe: Globe,
  image: Image,
  info: Info,
  lightbulb: Lightbulb,
  message: ChatCircleDots,
  mic: Microphone,
  monitor: Monitor,
  moon: Moon,
  music: MusicNotes,
  palette: Palette,
  paperclip: Paperclip,
  pen: Pen,
  play: Play,
  plus: Plus,
  refresh: ArrowsClockwise,
  rotateccw: ArrowCounterClockwise,
  search: MagnifyingGlass,
  send: PaperPlaneTilt,
  settings: Gear,
  sparkles: Sparkle,
  star: Star,
  sun: Sun,
  target: Crosshair,
  trash: Trash,
  upload: Upload,
  video: VideoCamera,
  wand: MagicWand,
  warning: Warning,
  workflow: ShareNetwork,
  x: X,
  xcircle: XCircle,
  zap: Lightning,
};

export function Icon({
  name,
  size = 16,
  style,
  className,
  weight = 'duotone',
  color,
  mirrored,
  alt,
}: {
  name: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  color?: string;
  mirrored?: boolean;
  alt?: string;
}) {
  const Comp = ICON_MAP[name];
  if (!Comp)
    return (
      <span style={{ fontSize: size, ...style }} className={className}>
        ?
      </span>
    );
  return (
    <Comp
      size={size}
      style={style}
      className={className}
      weight={weight}
      color={color}
      mirrored={mirrored}
      alt={alt}
    />
  );
}

export const I = {
  alertcircle: 'alertcircle',
  alerttriangle: 'alerttriangle',
  barchart3: 'barchart3',
  book: 'book',
  bot: 'bot',
  brain: 'brain',
  camera: 'camera',
  chart: 'chart',
  check: 'check',
  chef: 'chef',
  chevrondown: 'chevrondown',
  chevronright: 'chevronright',
  clapperboard: 'clapperboard',
  clipboard: 'clipboard',
  code: 'code',
  copy: 'copy',
  database: 'database',
  download: 'download',
  eye: 'eye',
  eyeoff: 'eyeoff',
  filetext: 'filetext',
  flask: 'flask',
  folder: 'folder',
  game: 'game',
  globe: 'globe',
  image: 'image',
  info: 'info',
  lightbulb: 'lightbulb',
  message: 'message',
  mic: 'mic',
  monitor: 'monitor',
  moon: 'moon',
  music: 'music',
  palette: 'palette',
  paperclip: 'paperclip',
  pen: 'pen',
  play: 'play',
  plus: 'plus',
  refresh: 'refresh',
  rotateccw: 'rotateccw',
  search: 'search',
  send: 'send',
  settings: 'settings',
  sparkles: 'sparkles',
  star: 'star',
  sun: 'sun',
  target: 'target',
  trash: 'trash',
  upload: 'upload',
  video: 'video',
  wand: 'wand',
  warning: 'warning',
  workflow: 'workflow',
  x: 'x',
  xcircle: 'xcircle',
  zap: 'zap',
} as const;
