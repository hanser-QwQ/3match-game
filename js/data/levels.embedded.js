/**
 * 自动生成，请勿手工编辑。
 * 数据源：levels/*.json
 * 生成命令：node tools/build-levels.mjs
 * 用途：file:// 或 fetch 不可用时的内置副本，保证双击即可游玩。
 */
export const LEVELS = [
  {
    "schemaVersion": 1,
    "levelId": 1,
    "name": "初见",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 4,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 1500
    },
    "moves": 25,
    "starThresholds": [
      1500,
      2100,
      2800
    ],
    "disabledBoosters": [],
    "tutorialHint": "交换相邻的两个元素，连成三个即可消除"
  },
  {
    "schemaVersion": 1,
    "levelId": 2,
    "name": "三色小径",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 4,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 1800
    },
    "moves": 25,
    "starThresholds": [
      1700,
      2300,
      2950
    ],
    "disabledBoosters": [],
    "tutorialHint": "一次消除四个，会得到更强的条纹元素"
  },
  {
    "schemaVersion": 1,
    "levelId": 3,
    "name": "五彩初章",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 4,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2000
    },
    "moves": 25,
    "starThresholds": [
      1900,
      2450,
      3050
    ],
    "disabledBoosters": [],
    "tutorialHint": "剩余的步数会在通关时折算成额外分数"
  },
  {
    "schemaVersion": 1,
    "levelId": 4,
    "name": "玫红收集",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 5,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "collect",
      "element": 0,
      "amount": 18
    },
    "moves": 24,
    "starThresholds": [
      1800,
      2400,
      2950
    ],
    "disabledBoosters": [],
    "tutorialHint": "消除指定元素，累计到目标数量即可过关"
  },
  {
    "schemaVersion": 1,
    "levelId": 5,
    "name": "深蓝之约",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 5,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "collect",
      "element": 1,
      "amount": 20
    },
    "moves": 24,
    "starThresholds": [
      1800,
      2400,
      2950
    ],
    "disabledBoosters": [],
    "tutorialHint": "优先消除目标元素，边上留出的空位会带来连锁"
  },
  {
    "schemaVersion": 1,
    "levelId": 6,
    "name": "绿意渐浓",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 5,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "collect",
      "element": 2,
      "amount": 22
    },
    "moves": 23,
    "starThresholds": [
      1750,
      2350,
      2900
    ],
    "disabledBoosters": [],
    "tutorialHint": "连锁的倍率会一路涨到三倍，尽量制造连续消除"
  },
  {
    "schemaVersion": 1,
    "levelId": 7,
    "name": "星辉点点",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "collect",
      "element": 4,
      "amount": 20
    },
    "moves": 23,
    "starThresholds": [
      1750,
      2350,
      2900
    ],
    "disabledBoosters": [],
    "tutorialHint": "元素种类变多，找准一处能连带的位置再动手"
  },
  {
    "schemaVersion": 1,
    "levelId": 8,
    "name": "双色协奏",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 5,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "score",
        "amount": 1800
      },
      "secondary": {
        "type": "collect",
        "element": 3,
        "amount": 16
      }
    },
    "moves": 22,
    "starThresholds": [
      1700,
      2250,
      2800
    ],
    "disabledBoosters": [],
    "tutorialHint": "两个目标要同时完成，别只顾着堆分数"
  },
  {
    "schemaVersion": 1,
    "levelId": 9,
    "name": "冰封花园",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 5,
      "iceCells": [
        [
          3,
          3
        ],
        [
          3,
          4
        ],
        [
          4,
          3
        ],
        [
          4,
          4
        ],
        [
          1,
          1
        ],
        [
          1,
          6
        ]
      ],
      "blockedCells": []
    },
    "goal": {
      "type": "clear_ice",
      "amount": 6
    },
    "moves": 22,
    "starThresholds": [
      1650,
      2200,
      2750
    ],
    "disabledBoosters": [],
    "tutorialHint": "在冰块旁边消除，冰块的耐久会随之减少"
  },
  {
    "schemaVersion": 1,
    "levelId": 10,
    "name": "碎冰之路",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          1,
          2
        ],
        [
          1,
          5
        ],
        [
          2,
          3
        ],
        [
          2,
          4
        ],
        [
          5,
          3
        ],
        [
          5,
          4
        ],
        [
          6,
          2
        ],
        [
          6,
          5
        ]
      ],
      "blockedCells": []
    },
    "goal": {
      "type": "clear_ice",
      "amount": 8
    },
    "moves": 22,
    "starThresholds": [
      1650,
      2200,
      2750
    ],
    "disabledBoosters": [],
    "tutorialHint": "条纹元素可以整行或整列清除，用来破冰最有效"
  },
  {
    "schemaVersion": 1,
    "levelId": 101,
    "name": "EX-1 升阶",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2000
    },
    "moves": 20,
    "starThresholds": [
      2000,
      2800,
      3300
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "stripePairToRainbow": true
    },
    "tutorialHint": "两个条纹交换可以合成为彩虹，合成的彩虹会留在棋盘上"
  },
  {
    "schemaVersion": 1,
    "levelId": 102,
    "name": "EX-2 冰封",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2200
    },
    "moves": 22,
    "starThresholds": [
      2200,
      2700,
      3200
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "freezeEveryNMoves": 2
    },
    "tutorialHint": "每走 2 步会随机冻住 1~4 个元素，抓紧时间"
  },
  {
    "schemaVersion": 1,
    "levelId": 103,
    "name": "EX-3 雷区",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2500
    },
    "moves": 20,
    "starThresholds": [
      2500,
      3400,
      4100
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "bombChanceBoost": true,
      "bombRange": 4,
      "rainbowRandomClear": true,
      "rainbowRandomCount": 8
    },
    "tutorialHint": "炸弹更容易生成，但只会炸周围 4 格；彩虹改为随机消除同色方块"
  },
  {
    "schemaVersion": 1,
    "levelId": 104,
    "name": "EX-4 坚冰",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "clear_ice",
      "amount": 16
    },
    "moves": 25,
    "starThresholds": [
      2200,
      2700,
      3200
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "initialDoubleIce": 18
    },
    "tutorialHint": "开局棋盘上随机生成大量双层冰，需要两次相邻的消除才能彻底敲碎"
  },
  {
    "schemaVersion": 1,
    "levelId": 105,
    "name": "EX-5 限量",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2600
    },
    "moves": 22,
    "starThresholds": [
      2600,
      3100,
      3600
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "specialQuota": {
        "stripe": 4,
        "bomb": 4,
        "rainbow": 2
      }
    },
    "tutorialHint": "特殊方块限量生成：条纹 4 个、炸弹 4 个、彩虹 2 个，配额用完后不再生成"
  },
  {
    "schemaVersion": 1,
    "levelId": 106,
    "name": "EX-6 回响",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2600
    },
    "moves": 14,
    "starThresholds": [
      2600,
      3400,
      4300
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "refundMoveOnSpecial": 1
    },
    "tutorialHint": "每生成一个特殊方块返还 1 步，单次最多返还 2 步"
  },
  {
    "schemaVersion": 1,
    "levelId": 107,
    "name": "EX-7 雷暴",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 3400
    },
    "moves": 18,
    "starThresholds": [
      3400,
      4000,
      4900
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "forceBombOnMatch": true,
      "bombRadius": 3,
      "bombChainAll": true,
      "bombBonus": 100
    },
    "tutorialHint": "四连及以上只会生成炸弹，炸弹范围扩大到 7×7 菱形；任意炸弹引爆会连锁引爆全场炸弹，并额外获得分数"
  },
  {
    "schemaVersion": 1,
    "levelId": 108,
    "name": "EX-8 霜潮",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2100
    },
    "moves": 20,
    "starThresholds": [
      2100,
      3100,
      3800
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "freezeAreaEveryNMoves": 3,
      "freezeAreaSize": 2,
      "freezeAreaCells": 4,
      "freezeAreaMaxIce": 24
    },
    "tutorialHint": "每 3 步，随机 2×2 区域全部结霜；场上最多 24 格冰"
  },
  {
    "schemaVersion": 1,
    "levelId": 109,
    "name": "EX-9 禁术",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 5,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 4000
    },
    "moves": 20,
    "starThresholds": [
      4000,
      5000,
      6000
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "instantSpecials": true,
      "maxChainMultiplier": 4
    },
    "tutorialHint": "棋盘只有 5 种颜色；特殊方块不再留下，四连立刻释放条纹，五连立刻清掉一种颜色，拐角匹配立刻爆炸"
  },
  {
    "schemaVersion": 1,
    "levelId": 11,
    "name": "冰下藏金",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          0,
          0
        ],
        [
          0,
          7
        ],
        [
          1,
          3
        ],
        [
          1,
          4
        ],
        [
          6,
          3
        ],
        [
          6,
          4
        ],
        [
          7,
          0
        ],
        [
          7,
          7
        ]
      ],
      "blockedCells": []
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "clear_ice",
        "amount": 8
      },
      "secondary": {
        "type": "collect",
        "element": 5,
        "amount": 14
      }
    },
    "moves": 22,
    "starThresholds": [
      1600,
      2150,
      2700
    ],
    "disabledBoosters": [],
    "tutorialHint": "冰块与收集同时进行，注意角落里的冰"
  },
  {
    "schemaVersion": 1,
    "levelId": 110,
    "name": "EX-10 祭典",
    "isEx": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2800
    },
    "moves": 20,
    "starThresholds": [
      2800,
      3600,
      4400
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "giftSpecialEveryNMoves": 4
    },
    "tutorialHint": "每 4 步，祭典会随机赠予一个特殊方块"
  },
  {
    "schemaVersion": 1,
    "levelId": 12,
    "name": "霜寒未消",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          1,
          1
        ],
        [
          1,
          6
        ],
        [
          2,
          2
        ],
        [
          2,
          5
        ],
        [
          3,
          3
        ],
        [
          3,
          4
        ],
        [
          4,
          3
        ],
        [
          4,
          4
        ],
        [
          6,
          1
        ],
        [
          6,
          6
        ]
      ],
      "blockedCells": []
    },
    "goal": {
      "type": "clear_ice",
      "amount": 10
    },
    "moves": 21,
    "starThresholds": [
      1600,
      2150,
      2700
    ],
    "disabledBoosters": [],
    "tutorialHint": "被困住的元素不能交换，先清掉它旁边的位置"
  },
  {
    "schemaVersion": 1,
    "levelId": 13,
    "name": "冷杉林",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          0,
          3
        ],
        [
          0,
          4
        ],
        [
          2,
          1
        ],
        [
          2,
          6
        ],
        [
          3,
          2
        ],
        [
          3,
          5
        ],
        [
          4,
          2
        ],
        [
          4,
          5
        ],
        [
          7,
          3
        ],
        [
          7,
          4
        ]
      ],
      "blockedCells": []
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "clear_ice",
        "amount": 9
      },
      "secondary": {
        "type": "score",
        "amount": 1900
      }
    },
    "moves": 22,
    "starThresholds": [
      1750,
      2300,
      2900
    ],
    "disabledBoosters": [],
    "tutorialHint": "分数与破冰都要顾及，连锁能同时推进两者"
  },
  {
    "schemaVersion": 1,
    "levelId": 14,
    "name": "冰原拾贝",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          0,
          0
        ],
        [
          0,
          7
        ],
        [
          1,
          2
        ],
        [
          1,
          5
        ],
        [
          2,
          3
        ],
        [
          2,
          4
        ],
        [
          5,
          3
        ],
        [
          5,
          4
        ],
        [
          6,
          2
        ],
        [
          6,
          5
        ],
        [
          7,
          0
        ],
        [
          7,
          7
        ]
      ],
      "blockedCells": []
    },
    "goal": {
      "type": "clear_ice",
      "amount": 10
    },
    "moves": 20,
    "starThresholds": [
      1550,
      2000,
      2400
    ],
    "disabledBoosters": [],
    "tutorialHint": "边缘的冰块更难触及，必要时用锤子敲开"
  },
  {
    "schemaVersion": 1,
    "levelId": 15,
    "name": "双生目标",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          1,
          1
        ],
        [
          1,
          2
        ],
        [
          1,
          5
        ],
        [
          1,
          6
        ],
        [
          6,
          1
        ],
        [
          6,
          2
        ],
        [
          6,
          5
        ],
        [
          6,
          6
        ]
      ],
      "blockedCells": []
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "score",
        "amount": 2100
      },
      "secondary": {
        "type": "clear_ice",
        "amount": 8
      }
    },
    "moves": 20,
    "starThresholds": [
      1600,
      2100,
      2600
    ],
    "disabledBoosters": [],
    "tutorialHint": "步数只有二十步，每一步都要争取形成连锁"
  },
  {
    "schemaVersion": 1,
    "levelId": 16,
    "name": "步步为营",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          0,
          0
        ],
        [
          0,
          7
        ],
        [
          1,
          3
        ],
        [
          1,
          4
        ],
        [
          6,
          3
        ],
        [
          6,
          4
        ],
        [
          7,
          0
        ],
        [
          7,
          7
        ]
      ],
      "blockedCells": [],
      "iceDurability": 2
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "collect",
        "element": 1,
        "amount": 18
      },
      "secondary": {
        "type": "clear_ice",
        "amount": 7
      }
    },
    "moves": 21,
    "starThresholds": [
      1500,
      2000,
      2500
    ],
    "disabledBoosters": [],
    "tutorialHint": "冰块耐久翻倍，需要两次相邻消除才能敲开"
  },
  {
    "schemaVersion": 1,
    "levelId": 17,
    "name": "精算之路",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          1,
          2
        ],
        [
          1,
          5
        ],
        [
          2,
          3
        ],
        [
          2,
          4
        ],
        [
          5,
          3
        ],
        [
          5,
          4
        ],
        [
          6,
          2
        ],
        [
          6,
          5
        ]
      ],
      "blockedCells": [],
      "iceDurability": 2
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "score",
        "amount": 1900
      },
      "secondary": {
        "type": "collect",
        "element": 2,
        "amount": 16
      }
    },
    "moves": 21,
    "starThresholds": [
      1550,
      2000,
      2450
    ],
    "disabledBoosters": [],
    "tutorialHint": "彩虹元素与条纹交换，可以清掉同色的全部元素"
  },
  {
    "schemaVersion": 1,
    "levelId": 18,
    "name": "霜色黎明",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          1,
          1
        ],
        [
          1,
          6
        ],
        [
          2,
          2
        ],
        [
          2,
          5
        ],
        [
          3,
          3
        ],
        [
          3,
          4
        ],
        [
          4,
          3
        ],
        [
          4,
          4
        ],
        [
          6,
          1
        ],
        [
          6,
          6
        ]
      ],
      "blockedCells": [],
      "iceDurability": 2
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "clear_ice",
        "amount": 9
      },
      "secondary": {
        "type": "collect",
        "element": 0,
        "amount": 15
      }
    },
    "moves": 21,
    "starThresholds": [
      1500,
      1950,
      2400
    ],
    "disabledBoosters": [],
    "tutorialHint": "先破中间的冰，棋盘的通路会顺畅很多"
  },
  {
    "schemaVersion": 1,
    "levelId": 19,
    "name": "极限边缘",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          0,
          0
        ],
        [
          0,
          7
        ],
        [
          1,
          2
        ],
        [
          1,
          5
        ],
        [
          2,
          3
        ],
        [
          2,
          4
        ],
        [
          5,
          3
        ],
        [
          5,
          4
        ],
        [
          6,
          2
        ],
        [
          6,
          5
        ],
        [
          7,
          0
        ],
        [
          7,
          7
        ]
      ],
      "blockedCells": [],
      "iceDurability": 2
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "score",
        "amount": 1850
      },
      "secondary": {
        "type": "clear_ice",
        "amount": 9
      }
    },
    "moves": 20,
    "starThresholds": [
      1500,
      1950,
      2350
    ],
    "disabledBoosters": [],
    "tutorialHint": "道具不消耗步数，卡住的时候别硬撑"
  },
  {
    "schemaVersion": 1,
    "levelId": 20,
    "name": "终章·雪境",
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [
        [
          1,
          1
        ],
        [
          1,
          6
        ],
        [
          2,
          2
        ],
        [
          2,
          5
        ],
        [
          3,
          3
        ],
        [
          3,
          4
        ],
        [
          4,
          3
        ],
        [
          4,
          4
        ],
        [
          6,
          1
        ],
        [
          6,
          6
        ]
      ],
      "blockedCells": [],
      "iceDurability": 2
    },
    "goal": {
      "type": "combo",
      "primary": {
        "type": "clear_ice",
        "amount": 10
      },
      "secondary": {
        "type": "score",
        "amount": 1800
      }
    },
    "moves": 19,
    "starThresholds": [
      1450,
      1900,
      2400
    ],
    "disabledBoosters": [],
    "tutorialHint": "最后一步之前，先算清剩余的冰与分数"
  }
];
