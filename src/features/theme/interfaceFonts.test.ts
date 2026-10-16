import { expect, it } from 'vitest'
import { DEFAULT_INTERFACE_FONT_STACK, interfaceFontStack, interfaceFontFromSettings, settingsWithInterfaceFont } from './interfaceFonts'

it('uses the product defaults when the preference is absent or invalid', () => {
  for (const value of ['{}','{"interfaceFont":123}','{"interfaceFont":"bad\\nfont"}','invalid']) {
    expect(interfaceFontStack(value)).toBe(DEFAULT_INTERFACE_FONT_STACK)
  }
})
it('persists an installed family while preserving theme and unrelated settings', () => {
  const saved = settingsWithInterfaceFont('{"theme":"dark","other":true}','微软雅黑')
  expect(JSON.parse(saved)).toEqual({theme:'dark',other:true,interfaceFont:'微软雅黑'})
  expect(interfaceFontFromSettings(saved)).toBe('微软雅黑')
  expect(interfaceFontStack(saved)).toBe(`"微软雅黑", ${DEFAULT_INTERFACE_FONT_STACK}`)
})
it('quotes font names as CSS strings instead of interpreting them as declarations', () => {
  expect(interfaceFontStack(JSON.stringify({interfaceFont:'A"; color: red; "'}))).toMatch(/^"A\\"; color: red; \\"", /)
})
