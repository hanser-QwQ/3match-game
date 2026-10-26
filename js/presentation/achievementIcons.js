/**
 * 成就线性图标。
 *
 * 统一 24×24 视窗、1.7px 描边、圆角端点；颜色由外层徽章的 currentColor 决定，
 * 因此同一套图标可以随铜 / 银 / 金 / 铂等级换色。
 */
const ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

const ICONS = {
  // 初出茅庐：一株刚冒头的嫩芽
  sprout: `<svg ${ATTRS}>
    <path d="M12 21v-7" />
    <path d="M12 14C8.5 14 6 11.5 6 8c3.5 0 6 2.5 6 6Z" />
    <path d="M12 12c3.5 0 6-2.2 6-5.5C14.5 6.5 12 8.8 12 12Z" />
    <path d="M5 21h14" />
  </svg>`,

  // 渐入佳境：向上走的阶梯
  steps: `<svg ${ATTRS}>
    <path d="M4 20h4v-4h4v-4h4V8h4" />
    <path d="M3 21h18" />
  </svg>`,

  // 雪境旅人：带雪线的山口
  mountain: `<svg ${ATTRS}>
    <path d="M2.5 20 9 8l4 7 2-3.5L21.5 20H2.5Z" />
    <path d="M6.8 13.5 9 8l2.2 5.5" />
  </svg>`,

  // 破格者：四角星芒
  spark: `<svg ${ATTRS}>
    <path d="M12 3c.6 4.8 2.6 6.8 7.4 7.4-4.8.6-6.8 2.6-7.4 7.4-.6-4.8-2.6-6.8-7.4-7.4C9.4 9.8 11.4 7.8 12 3Z" />
  </svg>`,

  // 升阶大师：皇冠
  crown: `<svg ${ATTRS}>
    <path d="M4 18h16l1-10-5 3.5L12 5 8 11.5 3 8l1 10Z" />
    <path d="M6 21h12" />
  </svg>`,

  // 十重试炼：宝石
  gem: `<svg ${ATTRS}>
    <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
    <path d="M3 9h18" />
    <path d="M9 3l3 6 3-6" />
    <path d="M9 9l3 12 3-12" />
  </svg>`,

  // 初见锋芒：五角星
  star: `<svg ${ATTRS}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  </svg>`,

  // 满天星斗：连成星座的星点
  constellation: `<svg ${ATTRS}>
    <path d="M5 17 10 9l5 4 5-7" />
    <circle cx="5" cy="17" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="10" cy="9" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="13" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="20" cy="6" r="1.3" fill="currentColor" stroke="none" />
  </svg>`,

  // 三星收藏家：带绶带的奖章
  medal: `<svg ${ATTRS}>
    <path d="M8 3l3 6" />
    <path d="M16 3l-3 6" />
    <circle cx="12" cy="14" r="5.5" />
    <path d="M12 11.2l.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3.9-1.8Z" fill="currentColor" stroke="none" />
  </svg>`,

  // 完美雪境：奖杯
  trophy: `<svg ${ATTRS}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
    <path d="M8 6H5v2a3 3 0 0 0 3 3" />
    <path d="M16 6h3v2a3 3 0 0 1-3 3" />
    <path d="M12 13v4" />
    <path d="M9 21h6" />
    <path d="M10 17h4v4" />
  </svg>`,

  // 高分选手：柱状图
  chart: `<svg ${ATTRS}>
    <path d="M4 4v16h16" />
    <path d="M8 20v-5" />
    <path d="M12 20v-8" />
    <path d="M16 20v-3" />
  </svg>`,

  // 连锁大师：两节锁链
  chain: `<svg ${ATTRS}>
    <path d="M10 8H8a4 4 0 0 0 0 8h2" />
    <path d="M14 8h2a4 4 0 0 1 0 8h-2" />
    <path d="M8.5 12h7" />
  </svg>`,

  // 徒手攀登：张开的手掌
  hand: `<svg ${ATTRS}>
    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>`,

  // 游刃有余：沙漏
  hourglass: `<svg ${ATTRS}>
    <path d="M7 3h10" />
    <path d="M7 21h10" />
    <path d="M8 3c0 5 4 5 4 9" />
    <path d="M16 3c0 5-4 5-4 9" />
    <path d="M8 21c0-5 4-5 4-9" />
    <path d="M16 21c0-5-4-5-4-9" />
    <path d="M10.5 18h3" />
  </svg>`,
};

export function achievementIcon(name) {
  return ICONS[name] || ICONS.spark;
}
