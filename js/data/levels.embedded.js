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
      2100,
      2775,
      3450
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
      2100,
      2775,
      3450
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
      2100,
      2775,
      3450
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
      2000,
      2680,
      3280
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
      2000,
      2680,
      3280
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
      1950,
      2590,
      3190
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
      1950,
      2590,
      3190
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
      1900,
      2500,
      3100
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
      1900,
      2500,
      3100
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
      1900,
      2500,
      3100
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
      "elementTypes": 5,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2000
    },
    "moves": 20,
    "starThresholds": [
      2500,
      3500,
      4500
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "stripeThreshold": 5,
      "rainbowThreshold": 6,
      "reduceBombStructures": true
    },
    "tutorialHint": "三连即可消除，但需要 5 连才能生成条纹，6 连才能生成彩虹"
  },
  {
    "schemaVersion": 1,
    "levelId": 102,
    "name": "EX-2 冰封",
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
      "amount": 2500
    },
    "moves": 22,
    "starThresholds": [
      3000,
      4200,
      5500
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
      "elementTypes": 5,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 2500
    },
    "moves": 20,
    "starThresholds": [
      3000,
      4200,
      5500
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
      "elementTypes": 5,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "clear_ice",
      "amount": 18
    },
    "moves": 25,
    "starThresholds": [
      3000,
      4500,
      6000
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "initialDoubleIce": 18
    },
    "tutorialHint": "开局有大量双层冰，需要消除两次相邻才能彻底敲碎"
  },
  {
    "schemaVersion": 1,
    "levelId": 105,
    "name": "EX-5 节律",
    "isEx": true,
    "hidden": true,
    "board": {
      "rows": 8,
      "cols": 8,
      "elementTypes": 6,
      "iceCells": [],
      "blockedCells": []
    },
    "goal": {
      "type": "score",
      "amount": 3000
    },
    "moves": 22,
    "starThresholds": [
      4000,
      5500,
      7000
    ],
    "disabledBoosters": [],
    "rules": {
      "moveTimeLimit": 7,
      "specialCycle": true
    },
    "tutorialHint": "某种特殊方块用过一次后，场上已有的和之后新生成的同类方块都会被冻住；炸弹、彩虹、条纹三类都用过一轮后才会统一解冻"
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
    "moves": 21,
    "starThresholds": [
      1840,
      2410,
      3010
    ],
    "disabledBoosters": [],
    "tutorialHint": "冰块与收集同时进行，注意角落里的冰"
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
      1840,
      2410,
      3010
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
        "amount": 10
      },
      "secondary": {
        "type": "score",
        "amount": 2200
      }
    },
    "moves": 22,
    "starThresholds": [
      1900,
      2500,
      3100
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
      1780,
      2320,
      2860
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
        "amount": 2400
      },
      "secondary": {
        "type": "clear_ice",
        "amount": 8
      }
    },
    "moves": 20,
    "starThresholds": [
      1780,
      2320,
      2860
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
        "amount": 8
      }
    },
    "moves": 20,
    "starThresholds": [
      1780,
      2320,
      2860
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
        "amount": 2600
      },
      "secondary": {
        "type": "collect",
        "element": 2,
        "amount": 16
      }
    },
    "moves": 20,
    "starThresholds": [
      1780,
      2320,
      2860
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
        "amount": 10
      },
      "secondary": {
        "type": "collect",
        "element": 0,
        "amount": 15
      }
    },
    "moves": 20,
    "starThresholds": [
      1780,
      2320,
      2860
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
        "amount": 2600
      },
      "secondary": {
        "type": "clear_ice",
        "amount": 12
      }
    },
    "moves": 19,
    "starThresholds": [
      1720,
      2230,
      2740
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
        "amount": 2400
      }
    },
    "moves": 18,
    "starThresholds": [
      1650,
      2140,
      2620
    ],
    "disabledBoosters": [],
    "tutorialHint": "最后一步之前，先算清剩余的冰与分数"
  }
];
