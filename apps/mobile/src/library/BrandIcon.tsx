import { Globe, StickyNote } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import { brandOf } from "@mindspool/schema";
import type { ItemKind } from "@mindspool/schema";
import { BRAND_PATHS } from "./brandPaths";

/** Brand mark for a host, a globe for other links, a note glyph for notes. */
export function BrandIcon({
  host,
  kind,
  size = 14,
  color,
}: {
  host: string | null;
  kind: ItemKind;
  size?: number;
  color: string;
}) {
  if (kind === "note") return <StickyNote size={size} color={color} />;
  const brand = brandOf(host);
  if (!brand) return <Globe size={size} color={color} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d={BRAND_PATHS[brand]} />
    </Svg>
  );
}
