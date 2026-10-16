import { parseLibrarySettings } from './theme'

export const DEFAULT_INTERFACE_FONT_STACK = '"SF Pro", "SF Pro Text", "SF Pro Display", "PingFang SC", "Noto Sans SC Variable", "Microsoft YaHei UI", system-ui, sans-serif'
export function interfaceFontFromSettings(json: string): string {
  const font = parseLibrarySettings(json).interfaceFont
  return typeof font === 'string' && font.length <= 128 && !/[\u0000-\u001f\u007f]/.test(font) ? font : ''
}
export function settingsWithInterfaceFont(json: string, interfaceFont: string): string {
  return JSON.stringify({ ...parseLibrarySettings(json), interfaceFont })
}
export function interfaceFontStack(json: string): string {
  const font = interfaceFontFromSettings(json)
  return font ? `"${font.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${DEFAULT_INTERFACE_FONT_STACK}` : DEFAULT_INTERFACE_FONT_STACK
}
