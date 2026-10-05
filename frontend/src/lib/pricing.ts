/**
 * Location-aware price guidance (Rs per kg). A starting point only: the farmer sets the final price.
 * Well-known growing regions earn a premium, e.g. Darjeeling tea costs more than ordinary tea.
 */
const BY_NAME: [RegExp, number][] = [
  [/tea/i, 400],
  [/saffron|kesar/i, 2500],
  [/cardamom|elaichi/i, 1500],
  [/pepper/i, 600],
  [/basmati/i, 85],
  [/rice|paddy/i, 45],
  [/wheat/i, 28],
  [/dal|lentil|moong|toor|urad|chana/i, 110],
  [/onion/i, 25],
  [/potato/i, 20],
  [/tomato/i, 25],
  [/mango|alphonso/i, 90],
  [/apple/i, 120],
  [/grape/i, 70],
  [/orange/i, 50],
  [/banana/i, 35],
  [/sugar ?cane/i, 4],
  [/cotton/i, 70],
];
const BY_TYPE: Record<string, number> = {
  rabi: 30,
  kharif: 35,
  zaid: 30,
  vegetable: 30,
  fruit: 80,
  other: 40,
};

const PREMIUMS: { crop: RegExp; place: RegExp; mult: number; label: string }[] = [
  { crop: /tea/i, place: /darjeeling/i, mult: 1.9, label: "Darjeeling tea" },
  { crop: /tea/i, place: /assam|dibrugarh|jorhat/i, mult: 1.3, label: "Assam tea" },
  { crop: /tea/i, place: /nilgiri|ooty|coonoor/i, mult: 1.4, label: "Nilgiri tea" },
  {
    crop: /rice|basmati/i,
    place: /dehradun|punjab|haryana|karnal/i,
    mult: 1.35,
    label: "Basmati belt",
  },
  {
    crop: /mango|alphonso/i,
    place: /ratnagiri|devgad|sindhudurg/i,
    mult: 1.7,
    label: "Alphonso region",
  },
  { crop: /grape/i, place: /nashik|sangli/i, mult: 1.15, label: "Grape region" },
  { crop: /saffron|kesar/i, place: /kashmir|pampore/i, mult: 1.3, label: "Kashmir saffron" },
  { crop: /apple/i, place: /kashmir|shimla|himachal|kullu/i, mult: 1.4, label: "Hill apples" },
  {
    crop: /cardamom|pepper|spice/i,
    place: /kerala|idukki|wayanad|kodagu/i,
    mult: 1.3,
    label: "Western Ghats spice",
  },
  { crop: /orange/i, place: /nagpur/i, mult: 1.2, label: "Nagpur oranges" },
  { crop: /./, place: /organic/i, mult: 1.15, label: "Organic" },
];

export function suggestPrice(
  cropName: string,
  cropType: string,
  location: string,
): { price: number; reason: string } | null {
  if (!cropName.trim() && !location.trim()) return null;
  const base =
    BY_NAME.find(([re]) => re.test(cropName))?.[1] ?? BY_TYPE[cropType.toLowerCase()] ?? 40;
  const hit = PREMIUMS.find(
    (p) => p.crop.test(`${cropName} ${cropType}`) && p.place.test(location),
  );
  const mult = hit?.mult ?? 1;
  return {
    price: Math.max(1, Math.round(base * mult)),
    reason: hit ? `${hit.label} premium (x${mult})` : "Standard market range",
  };
}
