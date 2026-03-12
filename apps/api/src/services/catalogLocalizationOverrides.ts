import type { CatalogLocalizations } from "./catalogService.js";

function zh(title: string, description: string | null = null): CatalogLocalizations {
  return {
    zhHans: {
      title,
      description
    }
  };
}

export const CATALOG_LOCALIZATION_OVERRIDES: Record<string, CatalogLocalizations> = {
  "the-legend-of-zelda-tears-of-the-kingdom-switch": zh(
    "萨尔达传说 王国之泪",
    "在广阔的海拉鲁大地与天空群岛之间自由冒险，活用全新能力探索、建造与战斗，揭开王国异变背后的真相。"
  ),
  "the-legend-of-zelda-link-s-awakening-switch": zh(
    "萨尔达传说 织梦岛",
    "林克漂流到神秘的可湖霖岛，在可爱又奇幻的世界里收集八件乐器，寻找离开岛屿的方法。"
  ),
  "the-legend-of-zelda-skyward-sword-hd-switch": zh(
    "萨尔达传说 御天之剑 HD",
    "回到萨尔达传说时间轴的起点，使用全新操作方式与更流畅的游玩体验，展开天空与大地之间的冒险。"
  ),
  "the-legend-of-zelda-echoes-of-wisdom-switch": zh(
    "萨尔达传说 智慧的再现",
    "这一次由萨尔达公主踏上旅程，借助复制与组合“回响”的力量，拯救被异变吞噬的海拉鲁。"
  ),
  "hyrule-warriors-definitive-edition-switch": zh(
    "ZELDA无双 海拉鲁全明星 DX",
    "收录《萨尔达传说》系列多位角色的爽快动作作品，在海拉鲁大陆上以无双式战斗横扫大军，并串联起多个经典世界观。"
  ),
  "hyrule-warriors-age-of-calamity-switch": zh(
    "ZELDA无双 灾厄启示录",
    "回到《萨尔达传说 旷野之息》一百年前的灾厄时代，操控英杰与林克并肩作战，亲历大战爆发前后的关键时刻。"
  ),
  "cadence-of-hyrule-switch": zh(
    "凯登丝勇闯海拉鲁",
    "在节奏驱动的地牢冒险中踏入海拉鲁，跟随音乐节拍移动、战斗与探索，与林克和萨尔达一起阻止邪恶势力。"
  ),
  "super-mario-bros-wonder-switch": zh(
    "超级玛利欧兄弟 惊奇",
    "在花花王国展开横向卷轴新冒险，惊奇花会让关卡发生不可思议的变化，带来充满变化的全新游玩体验。"
  ),
  "super-mario-3d-all-stars-switch": zh(
    "超级玛利欧 3D 收藏辑",
    "一次收录《超级玛利欧64》《超级玛利欧阳光》和《超级玛利欧银河》三款 3D 名作，回顾玛利欧立体冒险的经典旅程。"
  ),
  "new-super-mario-bros-u-deluxe-switch": zh(
    "New 超级玛利欧兄弟 U 豪华版",
    "把《New 超级玛利欧兄弟 U》与《New 超级路易吉 U》合并收录，支持多人同乐，以传统横向卷轴关卡展开热闹冒险。"
  ),
  "super-mario-maker-2-switch": zh(
    "超级玛利欧创作家 2",
    "亲手设计属于自己的玛利欧关卡，并游玩来自全球玩家的创意作品，体验创作与闯关结合的高自由度玩法。"
  ),
  "paper-mario-the-origami-king-switch": zh(
    "纸片玛利欧 折纸国王",
    "和伙伴一起踏上纸片风格的冒险，解开折纸王国的谜团，在独特的回合制环形战斗中拯救世界。"
  ),
  "paper-mario-the-thousand-year-door-switch": zh(
    "纸片玛利欧 RPG",
    "在焕然一新的画面下重温千年之门的冒险，和个性十足的伙伴们一起寻找宝藏，揭开古老城市的秘密。"
  ),
  "princess-peach-showtime-switch": zh(
    "碧姬公主 表演时刻！",
    "碧姬公主在舞台剧世界中变换不同职业形态，以剑士、侦探、甜点师等姿态解决各式各样的事件。"
  ),
  "captain-toad-treasure-tracker-switch": zh(
    "前进！奇诺比奥队长",
    "操控不能跳跃的奇诺比奥队长穿梭立体箱庭关卡，旋转场景、寻找宝石与隐藏路线，破解轻巧有趣的机关谜题。"
  ),
  "super-mario-party-switch": zh("超级玛利欧派对"),
  "mario-party-superstars-switch": zh("玛利欧派对 超级巨星"),
  "mario-tennis-aces-switch": zh("玛利欧网球 王牌高手"),
  "mario-golf-super-rush-switch": zh("玛利欧高尔夫 超级冲冲冲"),
  "mario-strikers-battle-league-switch": zh("玛利欧激战前锋 战斗联赛"),
  "yoshi-s-crafted-world-switch": zh("耀西的手工世界"),
  "kirby-star-allies-switch": zh("星之卡比 新星同盟"),
  "kirby-s-return-to-dream-land-deluxe-switch": zh("星之卡比 Wii 豪华版"),
  "super-smash-bros-ultimate-switch": zh("任天堂明星大乱斗 特别版"),
  "nintendo-switch-sports-switch": zh("Nintendo Switch 运动"),
  "ring-fit-adventure-switch": zh("健身环大冒险"),
  "clubhouse-games-51-worldwide-classics-switch": zh("世界游戏大全 51"),
  "big-brain-academy-brain-vs-brain-switch": zh("脑力锻炼学院 脑力大战"),
  "pikmin-1-switch": zh("皮克敏 1"),
  "pikmin-2-switch": zh("皮克敏 2"),
  "pikmin-3-deluxe-switch": zh("皮克敏 3 豪华版"),
  "metroid-prime-remastered-switch": zh("密特罗德 Prime 复刻版"),
  "fire-emblem-three-houses-switch": zh("Fire Emblem 风花雪月"),
  "fire-emblem-engage-switch": zh("Fire Emblem Engage"),
  "xenoblade-chronicles-definitive-edition-switch": zh("异度神剑 终极版"),
  "xenoblade-chronicles-2-switch": zh("异度神剑 2"),
  "xenoblade-chronicles-2-torna-the-golden-country-switch": zh("异度神剑 2 黄金之国伊拉"),
  "xenoblade-chronicles-3-switch": zh("异度神剑 3"),
  "detective-pikachu-returns-switch": zh("名侦探皮卡丘 闪电回归"),
  "new-pokemon-snap-switch": zh("New 宝可梦随乐拍"),
  "pokemon-legends-arceus-switch": zh("宝可梦传说 阿尔宙斯"),
  "pokemon-scarlet-switch": zh("宝可梦 朱"),
  "pokemon-violet-switch": zh("宝可梦 紫"),
  "warioware-get-it-together-switch": zh("分享同乐！瓦力欧制造"),
  "warioware-move-it-switch": zh("超舞动 瓦力欧制造"),
  "bayonetta-switch": zh("猎天使魔女"),
  "bayonetta-2-switch": zh("猎天使魔女 2"),
  "bayonetta-3-switch": zh("猎天使魔女 3"),
  "astral-chain-switch": zh("异界锁链")
};
