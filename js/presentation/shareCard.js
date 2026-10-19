/**
 * 成绩卡片（第 7.5 节 / FR-18）
 *
 * 单张 1080 × 1440 PNG，浏览器 Canvas 离屏绘制后导出，不依赖服务端、不上传数据。
 * 卡片内必须标注"单机成绩，非全服排名"；昵称默认不写入。
 * 不支持位图导出时降级为可复制的纯文本摘要（由调用方处理）。
 */

const W = 1080;
const H = 1440;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawStar(ctx, cx, cy, outer, color) {
  const inner = outer * 0.44;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function drawShareCard(canvas, result, { nickname = null } = {}) {
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  // 背景
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#f8f3e9');
  bg.addColorStop(1, '#efe6d6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(201, 106, 34, 0.10)';
  ctx.beginPath();
  ctx.arc(70, 120, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(47, 111, 94, 0.10)';
  ctx.beginPath();
  ctx.arc(W - 60, H - 120, 230, 0, Math.PI * 2);
  ctx.fill();

  // 头部
  ctx.fillStyle = '#2a2620';
  ctx.font = '800 52px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('三消小径', 80, 150);
  ctx.fillStyle = '#8d8377';
  ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText('MATCH 3 · 轻量消除', 80, 194);

  // 主卡片
  ctx.save();
  ctx.shadowColor = 'rgba(88, 66, 44, 0.16)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#fffdf8';
  roundRect(ctx, 80, 250, W - 160, 830, 48);
  ctx.fill();
  ctx.restore();

  // 关卡
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8d8377';
  ctx.font = '500 28px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText(`第 ${String(result.levelId).padStart(2, '0')} 关`, W / 2, 340);
  ctx.fillStyle = '#2a2620';
  ctx.font = '800 56px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText(result.levelName || '', W / 2, 412);

  // 星级
  const starY = 510;
  for (let i = 0; i < 3; i += 1) {
    const cx = W / 2 + (i - 1) * 128;
    drawStar(ctx, cx, starY, 52, i < result.stars ? '#e0a020' : '#e3d9c7');
  }

  // 分数
  ctx.fillStyle = '#2a2620';
  ctx.font = '800 150px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText(String(result.finalScore), W / 2, 730);
  ctx.fillStyle = '#8d8377';
  ctx.font = '400 30px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText('分', W / 2, 778);

  // 对比最高分
  ctx.font = '400 26px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  if (result.isNewBest) {
    ctx.fillStyle = '#2f6f5e';
    ctx.fillText('刷新本关最高分', W / 2, 832);
  } else {
    ctx.fillStyle = '#8d8377';
    ctx.fillText(`历史最高 ${result.previousBest} 分`, W / 2, 832);
  }

  // 明细
  const rows = [
    ['剩余步数', `${result.movesLeft} 步`],
    ['步数奖励', `${result.bonusScore} 分`],
    ['最高连锁', `${result.chainBest} 连`],
    ['达成日期', formatDate(result.at)],
  ];
  let ry = 906;
  ctx.font = '400 28px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  for (const [label, value] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8d8377';
    ctx.fillText(label, 160, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#2a2620';
    ctx.fillText(value, W - 160, ry);
    ry += 46;
  }

  // 昵称（默认不写入，仅玩家主动开启时显示）
  if (nickname) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8d8377';
    ctx.font = '400 26px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    ctx.fillText(`玩家 ${nickname}`, W / 2, 1160);
  }

  // 必含标注
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a1937f';
  ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText('单机成绩，非全服排名', W / 2, 1270);
  ctx.fillStyle = '#b8ab97';
  ctx.font = '400 20px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText('本图在本机生成，未上传任何数据', W / 2, 1310);
}

export function shareFileName(result) {
  const d = new Date(result.at || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `match3-level${String(result.levelId).padStart(2, '0')}-${result.finalScore}-${ymd}.png`;
}

export function downloadShareCard(canvas, result) {
  return new Promise((resolve) => {
    const name = shareFileName(result);
    if (!canvas.toBlob) {
      resolve({ ok: false, reason: 'NO_BLOB' });
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve({ ok: false, reason: 'NO_BLOB' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve({ ok: true, name });
    }, 'image/png');
  });
}

export function shareText(result) {
  return [
    `三消小径 · 第 ${result.levelId} 关 ${result.levelName}`,
    `得分 ${result.finalScore}（${'★'.repeat(result.stars)}）`,
    `剩余 ${result.movesLeft} 步，最高 ${result.chainBest} 连`,
    '单机成绩，非全服排名',
  ].join('\n');
}
