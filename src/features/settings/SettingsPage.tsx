import { useCallback, useEffect, useRef, useState } from 'react'
import { McpSettings } from '../integration/McpSettings'
import { Icon } from '../../shared/components/Icon'
import { ProductSelect } from '../../shared/components/ProductSelect'
import { updateLibrarySettings, listSystemFonts } from '../../shared/tauri/commands'
import type { LibraryDto } from '../../shared/tauri/contracts'
import { settingsWithTheme, themeFromSettings, type ThemeMode } from '../theme/theme'
import { interfaceFontFromSettings, settingsWithInterfaceFont } from '../theme/interfaceFonts'
import { version } from '../../../package.json'
import './settings.css'

type Section = 'general' | 'mcp' | 'about'
type SettingsPageProps = { library: LibraryDto | null; onLibraryChange: (library: LibraryDto) => void; onBack: () => void }
const sections = [{ id: 'general', name: '通用设置', icon: 'settings' }, { id: 'mcp', name: 'MCP 集成', icon: 'code-xml' }, { id: 'about', name: '关于 CoolNote', icon: 'book-open-text' }] as const

export function SettingsPage({ library, onLibraryChange, onBack }: SettingsPageProps) {
  const [section, setSection] = useState<Section>('general')
  const [mcpVisited, setMcpVisited] = useState(false)
  const [mcpState, setMcpState] = useState({ busy: false })
  const [savingSettings, setSavingSettings] = useState(false)
  const [error, setError] = useState('')
  const [fonts, setFonts] = useState<string[]>([])
  const [fontsLoading, setFontsLoading] = useState(true)
  const [fontError, setFontError] = useState('')
  const fontRequest = useRef(0)
  const scanFonts = useCallback(async () => {
    const request = ++fontRequest.current
    setFontsLoading(true); setFontError('')
    try { const values = await listSystemFonts(); if (request === fontRequest.current) setFonts([...new Set(values)].sort((a,b) => a.localeCompare(b,'zh-CN'))) }
    catch (cause) { if (request === fontRequest.current) setFontError(cause instanceof Error ? cause.message : '无法读取本地字体，请重试。') }
    finally { if (request === fontRequest.current) setFontsLoading(false) }
  }, [])
  useEffect(() => { void scanFonts(); return () => { fontRequest.current++ } }, [scanFonts])
  const heading = useRef<HTMLHeadingElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => { heading.current?.focus(); content.current?.scrollTo?.({ top: 0 }) }, [section])
  const choose = (next: Section) => { if (next === 'mcp') setMcpVisited(true); setSection(next) }
  const changeTheme = async (theme: ThemeMode) => {
    if (!library || savingSettings) return
    setSavingSettings(true); setError('')
    try { onLibraryChange(await updateLibrarySettings({ baseSettingsRevision: library.settingsRevision, settingsJson: settingsWithTheme(library.settingsJson, theme) })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法保存主题设置，请重试。') }
    finally { setSavingSettings(false) }
  }
  const currentFont = interfaceFontFromSettings(library?.settingsJson ?? '{}')
  const fontOptions = [{ value: '', label: '默认（PingFang SC / SF Pro）' }, ...fonts.map(value => ({ value, label: value }))]
  if (currentFont && !fonts.includes(currentFont)) fontOptions.push({ value: currentFont, label: `${currentFont}${!fontsLoading && !fontError ? '（本机未检测到）' : ''}` })
  const changeFont = async (font: string) => {
    if (!library || savingSettings) return
    setSavingSettings(true); setError('')
    try { onLibraryChange(await updateLibrarySettings({ baseSettingsRevision: library.settingsRevision, settingsJson: settingsWithInterfaceFont(library.settingsJson, font) })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法保存字体设置，请重试。') }
    finally { setSavingSettings(false) }
  }
  return <main className="settings-page" aria-label="设置">
    <aside className="settings-sidebar">
      <button className="settings-back" disabled={mcpState.busy || savingSettings} onClick={onBack}><Icon name="panel-left-close" /><span>返回 CoolNote</span></button>
      <div className="settings-brand"><img src="./assets/logo-CoolNote.png" alt="" width="40" height="40" /><div><strong>CoolNote</strong><span>偏好设置</span></div></div>
      <nav aria-label="设置分类"><p className="settings-nav-label">偏好设置</p>{sections.map(item => <button key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => choose(item.id)}><Icon name={item.icon} /><span>{item.name}</span></button>)}</nav>
      <span className="settings-sidebar-version">CoolNote {version}</span>
    </aside>
    <div className="settings-content" ref={content}><div className="settings-content-inner">
      <header className="settings-page-heading"><h1 tabIndex={-1} ref={heading}>{section === 'general' ? '偏好设置' : section === 'mcp' ? 'MCP 集成' : '关于 CoolNote'}</h1><p>{section === 'general' ? '让工作区保持你习惯的样子。' : section === 'mcp' ? '管理客户端对本机内容的访问。' : '本地优先的个人知识与创作资料库。'}</p></header>
      <div hidden={section !== 'general'}>
        <section className="settings-group" aria-labelledby="settings-general"><h2 id="settings-general">通用设置</h2><div className="settings-row"><div className="settings-row-copy"><label htmlFor="settings-theme">主题</label><p>选择浅色、深色，或跟随系统外观。</p></div><div className="settings-select"><ProductSelect id="settings-theme" label="主题" value={library ? themeFromSettings(library.settingsJson) : 'system'} disabled={!library || savingSettings} options={[{value:'system',label:'跟随系统'},{value:'light',label:'浅色'},{value:'dark',label:'深色'}]} onChange={value => void changeTheme(value as ThemeMode)} /></div></div>{savingSettings && <p className="settings-description" role="status">正在保存设置…</p>}{error && <p className="settings-feedback" role="alert">{error}</p>}</section>
        <section className="settings-group" aria-labelledby="settings-type"><h2 id="settings-type">字体与排版</h2><div className="settings-row"><div className="settings-row-copy"><label htmlFor="settings-font">界面字体</label><p>选择本机已安装的字体，或恢复默认字体。</p></div><div className="settings-select settings-font-select"><ProductSelect id="settings-font" label="界面字体" value={currentFont} options={fontOptions} searchable disabled={!library || savingSettings || fontsLoading} onChange={value => void changeFont(value)} /></div></div><div className="settings-font-status"><p className="settings-description" role="status">{fontsLoading ? '正在检测本地字体…' : fontError || `已检测到 ${fonts.length} 种本地字体`}</p><button className="settings-text-button" disabled={fontsLoading} onClick={() => void scanFonts()}><Icon name="rotate-ccw" />重新检测</button></div></section>
      </div>
      {mcpVisited && <div hidden={section !== 'mcp'}><McpSettings onStateChange={setMcpState} /></div>}
      <div hidden={section !== 'about'}><section className="settings-group" aria-labelledby="settings-app"><h2 id="settings-app">应用信息</h2><div className="settings-row"><span>版本</span><span className="settings-value">{version}</span></div></section><section className="settings-group" aria-labelledby="settings-library"><h2 id="settings-library">当前资料库</h2><div className="settings-row"><span>名称</span><span className="settings-value">{library?.name ?? '正在读取…'}</span></div><div className="settings-row settings-library-path"><div className="settings-row-copy"><span>保存位置</span><p>笔记、小记、任务与画廊内容保存在本机。</p></div><code>{library?.rootPath ?? '正在读取…'}</code></div></section></div>
    </div></div>
  </main>
}
