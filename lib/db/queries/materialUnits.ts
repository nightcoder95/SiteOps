const KNOWN_RULES: Record<string, string> = {
  cement: "Bag",
  "m sand": "CFT",
  msand: "CFT",
  "p sand": "CFT",
  psand: "CFT",
  metal: "CFT",
  steel: "KG",
  "red brick": "Numbers",
  "cement block 6in": "Numbers",
  "cement block 4in": "Numbers",
};

const DISPLAY_OVERRIDES: Record<string, string> = {
  "bag (50 kg)": "Bag",
  kilogram: "KG",
  kg: "KG",
  nos: "Numbers",
  numbers: "Numbers",
  cft: "CFT",
  tonne: "Tonne",
  litre: "Litre",
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function displayUnitName(value: string) {
  return DISPLAY_OVERRIDES[normalize(value)] ?? value;
}

export function materialUnitRuleFor(materialType: string | null | undefined) {
  const preferredName = KNOWN_RULES[normalize(String(materialType ?? ""))];
  if (preferredName) {
    return { allowedNames: [preferredName], preferredName };
  }
  return { allowedNames: ["Tonne", "Litre"], preferredName: "Tonne" };
}

export function allowedMaterialUnitNames(materialType: string | null | undefined) {
  return materialUnitRuleFor(materialType).allowedNames;
}

export function unitNameMatchesAllowed(unitName: string, allowedName: string) {
  return displayUnitName(unitName) === allowedName;
}
