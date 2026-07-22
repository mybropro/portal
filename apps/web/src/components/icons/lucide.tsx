import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleArrowDown,
  CircleArrowUp,
  Cpu,
  Ellipsis,
  Eye,
  Feather,
  FileDiff,
  FileText,
  Folder,
  GitPullRequest,
  Globe,
  GripVertical,
  Grid2X2Plus,
  Home,
  Info,
  KeyRound,
  LifeBuoy,
  LogOut,
  MessageCircle,
  MessageSquare,
  Minus,
  Monitor,
  Moon,
  Box,
  PanelLeft,
  Palette,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Square,
  Server,
  ServerCog,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  User,
  X,
} from "lucide-react";

export const APP_ICON_STROKE_WIDTH = 1.2;

export interface AppIconProps extends LucideProps {}

export function createAppIcon(
  Icon: LucideIcon,
  defaultSize: AppIconProps["size"] = "24px",
) {
  return function AppIcon({
    size = defaultSize,
    strokeWidth = APP_ICON_STROKE_WIDTH,
    ...props
  }: AppIconProps) {
    return (
      <Icon data-slot="icon" size={size} strokeWidth={strokeWidth} {...props} />
    );
  };
}

export const ArrowPathIcon = createAppIcon(RefreshCw);
export const ArrowRightStartOnRectangleIcon = createAppIcon(LogOut);
export const ArrowUpCircleIcon = createAppIcon(CircleArrowUp);
export const ChatBubbleLeftIcon = createAppIcon(MessageSquare);
export const CheckIcon = createAppIcon(Check);
export const ChevronDownIcon = createAppIcon(ChevronDown);
export const ChevronRightIcon = createAppIcon(ChevronRight);
export const ChevronUpDownIcon = createAppIcon(ChevronsUpDown);
export const Cog6ToothIcon = createAppIcon(Settings);
export const CpuChipIcon = createAppIcon(Cpu);
export const DocumentIcon = createAppIcon(FileText);
export const EllipsisHorizontalIcon = createAppIcon(Ellipsis);
export const FolderIcon = createAppIcon(Folder);
export const HomeIcon = createAppIcon(Home);
export const InformationCircleIcon = createAppIcon(Info);
export const LifebuoyIcon = createAppIcon(LifeBuoy);
export const MinusIcon = createAppIcon(Minus);
export const PanelLeftIcon = createAppIcon(PanelLeft);
export const PlusIcon = createAppIcon(Plus);
export const ShieldCheckIcon = createAppIcon(ShieldCheck);
export const SwatchIcon = createAppIcon(Palette);
export const TrashIcon = createAppIcon(Trash2);
export const XMarkIcon = createAppIcon(X);

export const IconBadgeSparkle = createAppIcon(Sparkles);
export const IconEye = createAppIcon(Eye);
export const IconGridPlus = createAppIcon(Grid2X2Plus, "18px");
export const IconMagnifier = createAppIcon(Search);
export const IconPen = createAppIcon(PenLine);
export const IconSquareFeather = createAppIcon(Feather);
export const IconThemeDark = createAppIcon(Moon, "18px");
export const IconThemeLight = createAppIcon(Sun, "18px");
export const IconThemeSystem = createAppIcon(Monitor, "18px");
export const IconUser = createAppIcon(User);
export const SendIcon = createAppIcon(Send);
export const StopIcon = createAppIcon(Square);
