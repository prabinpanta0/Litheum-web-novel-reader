import {
  Library,
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Settings,
  Type,
  Bookmark,
  Sun,
  StickyNote,
  SlidersHorizontal,
  CheckSquare,
  Square,
  History,
} from 'lucide-react';

/**
 * Central icon surface.
 *
 * All icons are lucide-react components, re-exported under stable
 * names so consuming components don't need to know the source library.
 * Swap libraries here without touching the rest of the app.
 */

export const LibraryIcon = Library;
export const SourcesIcon = Package;
export const SearchIcon = Search;
export const XIcon = X;
export const GearIcon = Settings;
export const TextIcon = Type;
export const BookmarkIcon = Bookmark;
export const SunIcon = Sun;
export const MarkIcon = StickyNote;
export const ReaderSettingsIcon = SlidersHorizontal;
export const HistoryIcon = History;
export { ChevronLeft, ChevronRight };

interface CheckboxIconProps {
  size?: number;
  filled?: boolean;
}

export function CheckboxIcon({ size = 16, filled = false }: CheckboxIconProps) {
  return filled ? <CheckSquare size={size} /> : <Square size={size} />;
}
