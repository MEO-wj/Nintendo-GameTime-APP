// react-native-svg versions of the custom icons, reusing SVG path data from Web icons.tsx
import Svg, { Line, Circle, Polyline, Rect, Path } from "react-native-svg";
import { theme } from "../theme";

type IconProps = { size?: number; color?: string };

export function IconGamepad({ size = 20, color = theme.colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Line x1="6" y1="11" x2="10" y2="11" />
      <Line x1="8" y1="9" x2="8" y2="13" />
      <Line x1="15" y1="12" x2="15.01" y2="12" />
      <Line x1="18" y1="10" x2="18.01" y2="10" />
      <Path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
    </Svg>
  );
}

export function IconClock({ size = 20, color = theme.colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="12,6 12,12 16,14" />
    </Svg>
  );
}

export function IconPrice({ size = 20, color = theme.colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <Line x1="3" y1="6" x2="21" y2="6" />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </Svg>
  );
}

export function IconCalendar({ size = 20, color = theme.colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <Line x1="16" y1="2" x2="16" y2="6" />
      <Line x1="8" y1="2" x2="8" y2="6" />
      <Line x1="3" y1="10" x2="21" y2="10" />
      <Path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </Svg>
  );
}

export function IconTrophy({ size = 20, color = theme.colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <Path d="M4 22h16" />
      <Path d="M10 22V8c0-1.1.9-2 2-2s2 .9 2 2v14" />
      <Path d="M6 4h12a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6H10A6 6 0 0 1 4 9V6a2 2 0 0 1 2-2z" />
    </Svg>
  );
}
