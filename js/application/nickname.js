/**
 * IF-A-02 昵称处理（NFR-20 / AC-41）
 *
 * 长度上限 12 个字符、过滤控制字符、展示时转义。
 * 由于界面统一使用 textContent 渲染，不存在脚本注入路径；
 * 这里额外去掉尖括号，避免昵称被拼进 HTML 字符串时出现问题。
 */

export const NICKNAME_MAX = 12;
export const NICKNAME_DEFAULT = '玩家';

export function sanitizeNickname(raw) {
  if (typeof raw !== 'string') return { value: NICKNAME_DEFAULT, changed: true };
  let value = raw
    // 控制字符与零宽字符
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, '')
    .replace(/[<>]/g, '')
    .trim();
  // 按 Unicode 码点截断，避免把代理对切一半
  value = [...value].slice(0, NICKNAME_MAX).join('');
  if (!value) return { value: NICKNAME_DEFAULT, changed: true };
  return { value, changed: value !== raw };
}
