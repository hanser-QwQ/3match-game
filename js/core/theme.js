/**
 * 主题解析（核心层，纯函数）。
 *
 * mode: 'auto' | 'light' | 'dark'
 * prefersDark: 系统当前是否偏好深色
 */
export function resolveTheme(mode, prefersDark) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}
