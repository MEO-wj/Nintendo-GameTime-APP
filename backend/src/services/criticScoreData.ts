const CRITIC_SCORES: Record<string, number> = {
  "the-legend-of-zelda-breath-of-the-wild-switch": 97,
  "the-legend-of-zelda-tears-of-the-kingdom-switch": 96,
  "the-legend-of-zelda-link-s-awakening-switch": 87,
  "the-legend-of-zelda-skyward-sword-hd-switch": 82,
  "super-mario-odyssey-switch": 97,
  "mario-kart-8-deluxe-switch": 92,
  "luigis-mansion-3-switch": 86,
  "super-mario-3d-world-plus-bowsers-fury-switch": 89,
  "animal-crossing-new-horizons-switch": 90,
  "hollow-knight-switch": 87,
  "dead-cells-switch": 89,
  "kirby-and-the-forgotten-land-switch": 85,
  "splatoon-3-switch": 83,
  "metroid-dread-switch": 88,
  "metroid-prime-remastered-switch": 94,
  "pikmin-4-switch": 87,
  "super-smash-bros-ultimate-switch": 93,
  "nintendo-switch-sports-switch": 72,
  "1-2-switch-switch": 58,
  "fire-emblem-three-houses-switch": 89,
  "pokemon-legends-arceus-switch": 83,
  "xenoblade-chronicles-3-switch": 89,
  "bayonetta-3-switch": 87
};

export function getCriticScore(externalId: string): number | null {
  return CRITIC_SCORES[externalId] ?? null;
}
