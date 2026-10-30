import React from 'react';
import { Image, View } from 'react-native';
import {
  Circle,
  ColorMatrix,
  DashPathEffect,
  drawAsPicture,
  Group,
  LinearGradient,
  Oval,
  Paint,
  Path,
  RadialGradient,
  RoundedRect,
  Shadow,
  vec,
} from '@shopify/react-native-skia';
import type { Rank } from '../data/ranks';
import { TIER_COLORS, type TierColors } from '../theme/ranks';
import { withAlpha } from '../board/color';
import { bakedPixels, useBakedImage } from './bakedImage';

/** Art is drawn on a REF × REF canvas and scaled. */
const REF = 100;
const CX = 50;
const CY = 45;

const GRAYSCALE = [0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0];

const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L')} Z`;

/** Star polygon with `n` points, the first pointing straight up. */
function starPath(cx: number, cy: number, outer: number, inner: number, n = 5) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
}

/** Four-point sparkle with concave sides. */
const sparklePath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`;

const metal = (c: TierColors, reverse = false) => {
  const colors = [c.light, c.mid, c.dark];
  return <LinearGradient start={vec(22, 8)} end={vec(78, 86)} colors={reverse ? colors.reverse() : colors} />;
};

function CenterStar({ c, r = 15 }: { c: TierColors; r?: number }) {
  const d = starPath(CX, CY, r, r * 0.45);
  return (
    <>
      <Path path={d}>
        <LinearGradient start={vec(CX, CY - r)} end={vec(CX, CY + r)} colors={['#FFFFFF', c.light, c.mid]} />
      </Path>
      <Path path={d} style="stroke" strokeWidth={2} strokeJoin="round" color={c.deep} />
    </>
  );
}

function Shine() {
  return (
    <Group origin={vec(38, 22)} transform={[{ rotate: -0.5 }]}>
      <Oval x={24} y={16} width={28} height={11} color="rgba(255,255,255,0.45)" />
    </Group>
  );
}

function BronzeArt({ c }: { c: TierColors }) {
  return (
    <>
      <Circle cx={CX} cy={CY} r={38}>
        {metal(c)}
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
      </Circle>
      <Circle cx={CX} cy={CY} r={38} style="stroke" strokeWidth={2.5} color={c.deep} />
      <Circle cx={CX} cy={CY} r={34} style="stroke" strokeWidth={2} color={withAlpha(c.deep, 0.4)}>
        <DashPathEffect intervals={[2.6, 2.6]} />
      </Circle>
      <Circle cx={CX} cy={CY} r={29}>{metal(c, true)}</Circle>
      <Circle cx={CX} cy={CY} r={29} style="stroke" strokeWidth={1.5} color={withAlpha(c.deep, 0.6)} />
      <CenterStar c={c} />
      <Shine />
    </>
  );
}

const SHIELD = 'M50 4 L86 14 L86 42 C86 64 71 78 50 87 C29 78 14 64 14 42 L14 14 Z';
const SHIELD_LEFT = 'M50 4 L14 14 L14 42 C14 64 29 78 50 87 Z';

function SilverArt({ c }: { c: TierColors }) {
  return (
    <>
      <Path path={SHIELD}>
        {metal(c)}
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
      </Path>
      <Path path={SHIELD_LEFT} color="rgba(255,255,255,0.28)" />
      <Path path={SHIELD} style="stroke" strokeWidth={2.5} strokeJoin="round" color={c.deep} />
      <Group origin={vec(CX, CY)} transform={[{ scale: 0.74 }]}>
        <Path path={SHIELD}>{metal(c, true)}</Path>
        <Path path={SHIELD} style="stroke" strokeWidth={2} strokeJoin="round" color={withAlpha(c.deep, 0.6)} />
      </Group>
      <CenterStar c={c} />
      <Shine />
    </>
  );
}

function GoldArt({ c }: { c: TierColors }) {
  const rosette = starPath(CX, CY, 41, 34, 16);
  return (
    <>
      <Path path={rosette}>
        {metal(c)}
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
      </Path>
      <Path path={rosette} style="stroke" strokeWidth={2.5} strokeJoin="round" color={c.deep} />
      <Circle cx={CX} cy={CY} r={29}>{metal(c, true)}</Circle>
      <Circle cx={CX} cy={CY} r={29} style="stroke" strokeWidth={2} color={withAlpha(c.deep, 0.7)} />
      <Circle cx={CX} cy={CY} r={24}>{metal(c)}</Circle>
      <CenterStar c={c} r={16} />
      <Shine />
    </>
  );
}

const GEM_TOP = 14;
const GEM_GIRDLE = 35;
const GEM_TIP = 86;
const T: [number, number][] = [
  [30, GEM_TOP],
  [50, GEM_TOP],
  [70, GEM_TOP],
];
const G: [number, number][] = [
  [12, GEM_GIRDLE],
  [38, GEM_GIRDLE],
  [62, GEM_GIRDLE],
  [88, GEM_GIRDLE],
];
const B: [number, number] = [50, GEM_TIP];

function DiamondArt({ c }: { c: TierColors }) {
  const outline = poly([T[0], T[2], G[3], B, G[0]]);
  const facets: [string, string][] = [
    [poly([G[0], T[0], G[1]]), c.mid],
    [poly([T[0], T[1], G[1]]), c.light],
    [poly([T[1], G[1], G[2]]), c.mid],
    [poly([T[1], T[2], G[2]]), c.light],
    [poly([T[2], G[2], G[3]]), c.dark],
    [poly([G[0], G[1], B]), c.dark],
    [poly([G[1], G[2], B]), c.mid],
    [poly([G[2], G[3], B]), c.deep],
  ];
  return (
    <>
      <Path path={outline} color={c.mid}>
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
      </Path>
      {facets.map(([d, color], i) => (
        <Path key={i} path={d} color={color} />
      ))}
      {facets.map(([d], i) => (
        <Path key={`e${i}`} path={d} style="stroke" strokeWidth={1} strokeJoin="round" color="rgba(255,255,255,0.55)" />
      ))}
      <Path path={outline} style="stroke" strokeWidth={2.5} strokeJoin="round" color={c.deep} />
      <Path path={sparklePath(77, 16, 8)} color="#FFFFFF" />
      <Path path={sparklePath(24, 52, 4.5)} color="rgba(255,255,255,0.85)" />
    </>
  );
}

const CROWN = 'M17 64 L10 27 L32 45 L50 16 L68 45 L90 27 L83 64 Z';

function LegendaryArt({ c, division }: { c: TierColors; division: number }) {
  const glow = 0.25 + division * 0.15;
  return (
    <>
      <Circle cx={CX} cy={CY} r={48}>
        <RadialGradient c={vec(CX, CY)} r={48} colors={[withAlpha(c.mid, glow), withAlpha(c.mid, 0)]} />
      </Circle>
      <Path path={starPath(CX, CY, 48, 18, 12)} color={withAlpha(c.light, glow * 0.8)} />
      <Path path={CROWN}>
        <LinearGradient start={vec(50, 16)} end={vec(50, 64)} colors={[c.light, c.mid, c.dark]} />
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
      </Path>
      <Path path="M50 16 L32 45 L17 64 L10 27 Z" color="rgba(255,255,255,0.22)" />
      <Path path={CROWN} style="stroke" strokeWidth={2.5} strokeJoin="round" color={c.deep} />
      {[
        [10, 27],
        [50, 16],
        [90, 27],
      ].map(([x, y]) => (
        <Group key={x}>
          <Circle cx={x} cy={y} r={6}>
            <LinearGradient start={vec(x - 4, y - 4)} end={vec(x + 4, y + 4)} colors={['#FFFFFF', c.mid]} />
          </Circle>
          <Circle cx={x} cy={y} r={6} style="stroke" strokeWidth={2} color={c.deep} />
        </Group>
      ))}
      <Circle cx={CX} cy={46} r={6.5} color="#E8264F" />
      <Circle cx={CX} cy={46} r={6.5} style="stroke" strokeWidth={1.8} color={c.deep} />
      <Circle cx={CX - 2} cy={44} r={2} color="rgba(255,255,255,0.8)" />
      <RoundedRect x={14} y={61} width={72} height={15} r={5}>
        <LinearGradient start={vec(50, 61)} end={vec(50, 76)} colors={[c.mid, c.dark]} />
      </RoundedRect>
      <RoundedRect x={14} y={61} width={72} height={15} r={5} style="stroke" strokeWidth={2.5} color={c.deep} />
      <Path path={poly([[50, 63], [55.5, 68.5], [50, 74], [44.5, 68.5]])} color="#9B3BF0" />
      <Circle cx={30} cy={68.5} r={3.6} color="#2CC5FF" />
      <Circle cx={70} cy={68.5} r={3.6} color="#2CC5FF" />
      <Path path={sparklePath(80, 12, 6)} color="#FFFFFF" />
    </>
  );
}

function PlatinumArt({ c }: { c: TierColors }) {
  const hex = (r: number) => poly(Array.from({ length: 6 }, (_, i): [number, number] => [CX + Math.cos((Math.PI / 3) * i - Math.PI / 2) * r, CY + Math.sin((Math.PI / 3) * i - Math.PI / 2) * r]));
  return (
    <>
      <Path path={hex(42)}>
        {metal(c)}
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
      </Path>
      <Path path={`M${CX} ${CY - 42} L${CX - 36.4} ${CY - 21} L${CX - 36.4} ${CY + 21} L${CX} ${CY + 42} Z`} color="rgba(255,255,255,0.25)" />
      <Path path={hex(42)} style="stroke" strokeWidth={2.5} strokeJoin="round" color={c.deep} />
      <Path path={hex(31)}>{metal(c, true)}</Path>
      <Path path={hex(31)} style="stroke" strokeWidth={2} strokeJoin="round" color={withAlpha(c.deep, 0.6)} />
      <CenterStar c={c} />
      <Shine />
    </>
  );
}

/** Octagon with corners cut by `cut`, from (x0, y0) to (x1, y1). */
function octagon(x0: number, y0: number, x1: number, y1: number, cut: number): [number, number][] {
  return [
    [x0 + cut, y0],
    [x1 - cut, y0],
    [x1, y0 + cut],
    [x1, y1 - cut],
    [x1 - cut, y1],
    [x0 + cut, y1],
    [x0, y1 - cut],
    [x0, y0 + cut],
  ];
}

function EmeraldArt({ c }: { c: TierColors }) {
  const outer = octagon(20, 8, 80, 84, 15);
  const inner = octagon(33, 24, 67, 68, 8);
  const shades = [c.light, c.mid, c.dark, c.deep, c.dark, c.mid, c.light, c.mid];
  return (
    <>
      <Path path={poly(outer)} color={c.mid}>
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
      </Path>
      {outer.map((p, i) => {
        const j = (i + 1) % outer.length;
        return <Path key={i} path={poly([p, outer[j], inner[j], inner[i]])} color={shades[i]} />;
      })}
      <Path path={poly(inner)}>
        <LinearGradient start={vec(33, 24)} end={vec(67, 68)} colors={[c.light, c.mid, c.dark]} />
      </Path>
      <Path path={poly(inner)} style="stroke" strokeWidth={1.2} strokeJoin="round" color="rgba(255,255,255,0.6)" />
      <Path path={poly(outer)} style="stroke" strokeWidth={2.5} strokeJoin="round" color={c.deep} />
      <Path path={sparklePath(72, 14, 8)} color="#FFFFFF" />
      <Path path={sparklePath(40, 36, 4)} color="rgba(255,255,255,0.85)" />
    </>
  );
}

const WING = 'M33 33 C22 25 10 26 2 33 C9 35 13 37 15 39 C8 40 4 44 2 48 C9 48 13 49 16 50 C10 53 7 57 6 62 C16 61 26 57 34 52 Z';

/** A pair of feathered wings, mirrored around the center. */
function Wings({ light, dark, deep }: { light: string; dark: string; deep: string }) {
  const wing = (
    <>
      <Path path={WING}>
        <LinearGradient start={vec(2, 30)} end={vec(34, 60)} colors={[light, dark]} />
      </Path>
      <Path path={WING} style="stroke" strokeWidth={2} strokeJoin="round" color={deep} />
    </>
  );
  return (
    <>
      {wing}
      <Group origin={vec(CX, CY)} transform={[{ scaleX: -1 }]}>
        {wing}
      </Group>
    </>
  );
}

function MasterArt({ c }: { c: TierColors }) {
  return (
    <>
      <Wings light="#FFFFFF" dark="#A9B4C4" deep="#4F5B6A" />
      <Circle cx={CX} cy={CY} r={30}>
        {metal(c)}
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
      </Circle>
      <Circle cx={CX} cy={CY} r={30} style="stroke" strokeWidth={2.5} color={c.deep} />
      <Circle cx={CX} cy={CY} r={23}>{metal(c, true)}</Circle>
      <Circle cx={CX} cy={CY} r={23} style="stroke" strokeWidth={1.5} color={withAlpha(c.deep, 0.6)} />
      <CenterStar c={c} r={14} />
      <Shine />
    </>
  );
}

function GrandmasterArt({ c }: { c: TierColors }) {
  return (
    <>
      <Wings light="#FFF4B8" dark="#E09A00" deep="#8A5A00" />
      <Group origin={vec(CX, CY)} transform={[{ scale: 0.78 }]}>
        <Path path={SHIELD}>
          {metal(c)}
          <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.28)" />
        </Path>
        <Path path={SHIELD_LEFT} color="rgba(255,255,255,0.22)" />
        <Path path={SHIELD} style="stroke" strokeWidth={3} strokeJoin="round" color={c.deep} />
        <Group origin={vec(CX, CY)} transform={[{ scale: 0.74 }]}>
          <Path path={SHIELD} style="stroke" strokeWidth={3} strokeJoin="round" color="#FFCB3D" />
        </Group>
      </Group>
      <CenterStar c={{ ...c, light: '#FFF4B8', mid: '#FFCB3D', deep: '#8A5A00' }} r={13} />
      <Shine />
    </>
  );
}

function MythicArt({ c, division }: { c: TierColors; division: number }) {
  const glow = 0.3 + division * 0.15;
  const burst = starPath(CX, CY, 44, 26, 8);
  return (
    <>
      <Circle cx={CX} cy={CY} r={48}>
        <RadialGradient c={vec(CX, CY)} r={48} colors={[withAlpha(c.mid, glow), withAlpha(c.dark, 0)]} />
      </Circle>
      <Path path={burst}>
        <LinearGradient start={vec(10, 5)} end={vec(90, 85)} colors={['#7FF3FF', c.mid, c.dark]} />
        <Shadow dx={0} dy={3} blur={3} color="rgba(0,0,0,0.3)" />
      </Path>
      <Path path={burst} style="stroke" strokeWidth={2.5} strokeJoin="round" color={c.deep} />
      <Circle cx={CX} cy={CY} r={24}>
        <RadialGradient c={vec(CX - 6, CY - 8)} r={30} colors={['#5B2BB5', c.deep]} />
      </Circle>
      <Circle cx={CX} cy={CY} r={24} style="stroke" strokeWidth={2} color="#FFCB3D" />
      <Group origin={vec(CX, CY)} transform={[{ translateY: 2 }, { scale: 0.34 }]}>
        <Path path={CROWN}>
          <LinearGradient start={vec(50, 16)} end={vec(50, 64)} colors={['#FFF4B8', '#FFCB3D', '#E09A00']} />
        </Path>
        <RoundedRect x={14} y={61} width={72} height={15} r={5} color="#E09A00" />
      </Group>
      <Path path={sparklePath(22, 18, 6)} color="#FFFFFF" />
      <Path path={sparklePath(80, 70, 4.5)} color="rgba(255,255,255,0.9)" />
      <Path path={sparklePath(CX + 9, CY - 9, 3)} color="rgba(255,255,255,0.9)" />
    </>
  );
}

function Pips({ c, count }: { c: TierColors; count: number }) {
  const gap = 14;
  const x0 = CX - ((count - 1) * gap) / 2;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const d = sparklePath(x0 + i * gap, 94, 6);
        return (
          <Group key={i}>
            <Path path={d} color={c.mid} />
            <Path path={d} style="stroke" strokeWidth={1.4} strokeJoin="round" color={c.deep} />
          </Group>
        );
      })}
    </>
  );
}

function RankArt({ rank }: { rank: Rank }) {
  const c = TIER_COLORS[rank.tier];
  return (
    <>
      {rank.tier === 'bronze' && <BronzeArt c={c} />}
      {rank.tier === 'silver' && <SilverArt c={c} />}
      {rank.tier === 'gold' && <GoldArt c={c} />}
      {rank.tier === 'platinum' && <PlatinumArt c={c} />}
      {rank.tier === 'diamond' && <DiamondArt c={c} />}
      {rank.tier === 'emerald' && <EmeraldArt c={c} />}
      {rank.tier === 'master' && <MasterArt c={c} />}
      {rank.tier === 'grandmaster' && <GrandmasterArt c={c} />}
      {rank.tier === 'legendary' && <LegendaryArt c={c} division={rank.division} />}
      {rank.tier === 'mythic' && <MythicArt c={c} division={rank.division} />}
      <Pips c={c} count={rank.division} />
    </>
  );
}

/**
 * A rank's emblem: tier shape plus one to three sparkles as the division climbs III → I. Baked once per
 * size, so a screen can show every rank at once. `muted` draws it in grayscale, for ranks
 * not reached yet.
 */
export function RankBadge({ rank, size, muted = false }: { rank: Rank; size: number; muted?: boolean }) {
  const px = bakedPixels(size);
  const uri = useBakedImage(`rank:${rank.index}:${muted ? 'muted' : 'color'}:${px}`, px, async (canvas) => {
    const art = <RankArt rank={rank} />;
    const picture = await drawAsPicture(
      <Group transform={[{ scale: px / REF }]}>
        {muted ? (
          <Group
            layer={
              <Paint>
                <ColorMatrix matrix={GRAYSCALE} />
              </Paint>
            }
          >
            {art}
          </Group>
        ) : (
          art
        )}
      </Group>,
    );
    canvas.drawPicture(picture);
    picture.dispose();
  });
  return (
    <View style={{ width: size, height: size, opacity: muted ? 0.55 : 1 }}>
      {uri && <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />}
    </View>
  );
}
