import React from 'react';
import {
  Bot, Palette, Clapperboard, Settings, Moon, Sun, Monitor,
  MessageSquare, Paperclip, ClipboardList, Download, RefreshCw,
  Trash2, Search, Zap, Brain, Lightbulb, Folder, Eye, EyeOff,
  Music, FileText, Sparkles, Code2, Globe, PenTool, Camera,
  Target, BarChart3, FlaskConical, ChefHat, Gamepad2, BookOpen,
  Upload, ChevronRight, AlertTriangle, CheckCircle2, XCircle,
  Info, AlertCircle, Star, Database, ChevronDown, Plus,
  Send, Image, Video, Mic, Play, X, Copy, RotateCcw, Wand2, Workflow
} from 'lucide-react';

type LucideIcon = React.ComponentType<{ size?: number | string; style?: React.CSSProperties; className?: string; strokeWidth?: number }>;

const ICON_MAP: Record<string, LucideIcon> = {
  bot: Bot, palette: Palette, clapperboard: Clapperboard, settings: Settings,
  moon: Moon, sun: Sun, monitor: Monitor, message: MessageSquare,
  paperclip: Paperclip, clipboard: ClipboardList, download: Download,
  refresh: RefreshCw, trash: Trash2, search: Search, zap: Zap,
  brain: Brain, lightbulb: Lightbulb, folder: Folder, eye: Eye, eyeoff: EyeOff,
  music: Music, filetext: FileText, sparkles: Sparkles, code: Code2,
  globe: Globe, pen: PenTool, camera: Camera, target: Target,
  chart: BarChart3, flask: FlaskConical, chef: ChefHat, game: Gamepad2,
  book: BookOpen, upload: Upload, chevronright: ChevronRight,
  warning: AlertTriangle, check: CheckCircle2, xcircle: XCircle,
  info: Info, alertcircle: AlertCircle, star: Star, database: Database,
  chevrondown: ChevronDown, plus: Plus, send: Send, image: Image,
  video: Video, mic: Mic, play: Play, x: X, copy: Copy, rotateccw: RotateCcw,
  wand: Wand2, workflow: Workflow,
};

export function Icon({ name, size = 16, style, className, strokeWidth }: { name: string; size?: number; style?: React.CSSProperties; className?: string; strokeWidth?: number }) {
  const Comp = ICON_MAP[name];
  if (!Comp) return <span style={{ fontSize: size, ...style }} className={className}>?</span>;
  return <Comp size={size} style={style} className={className} strokeWidth={strokeWidth || 2} />;
}

// All available icon name constants
export const I = {
  bot: 'bot', palette: 'palette', clapperboard: 'clapperboard', settings: 'settings',
  moon: 'moon', sun: 'sun', monitor: 'monitor', message: 'message',
  paperclip: 'paperclip', clipboard: 'clipboard', download: 'download',
  refresh: 'refresh', trash: 'trash', search: 'search', zap: 'zap',
  brain: 'brain', lightbulb: 'lightbulb', folder: 'folder', eye: 'eye', eyeoff: 'eyeoff',
  music: 'music', filetext: 'filetext', sparkles: 'sparkles', code: 'code',
  globe: 'globe', pen: 'pen', camera: 'camera', target: 'target',
  chart: 'chart', flask: 'flask', chef: 'chef', game: 'game',
  book: 'book', upload: 'upload', chevronright: 'chevronright',
  warning: 'warning', check: 'check', xcircle: 'xcircle',
  info: 'info', alertcircle: 'alertcircle', star: 'star', database: 'database',
  chevrondown: 'chevrondown', plus: 'plus', send: 'send', image: 'image',
  video: 'video', mic: 'mic', play: 'play', x: 'x', copy: 'copy', rotateccw: 'rotateccw',
  wand: 'wand', workflow: 'workflow',
} as const;
