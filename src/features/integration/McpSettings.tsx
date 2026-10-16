import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../shared/components/Icon'
import { getIntegrationStatus, updateIntegrationSettings, getIntegrationClientConfig } from '../../shared/tauri/commands'
import type { IntegrationStatusDto } from '../../shared/tauri/contracts'
import './mcp-settings.css'

const groups = [{ name: '笔记', prefix: 'notes' }, { name: '任务', prefix: 'tasks' }, { name: '小记', prefix: 'jottings' }]
const errorText = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : '操作失败，请重试'

export function McpSettings({ onStateChange }: { onStateChange?: (state: { busy: boolean }) => void }) {
  const [saved, setSaved] = useState<IntegrationStatusDto | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [port, setPort] = useState('43127')
  const [portPending, setPortPending] = useState(false)
  const portTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)
  const [scopes, setScopes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const apply = (status: IntegrationStatusDto) => { setSaved(status); setEnabled(status.enabled); setPort(String(status.port)); setScopes(status.scopes) }
  useEffect(() => () => { if (portTimer.current) clearTimeout(portTimer.current) }, [])
  useEffect(() => {
    let active = true
    void getIntegrationStatus().then(status => { if (active) apply(status) }).catch(cause => { if (active) setError(errorText(cause)) })
    return () => { active = false }
  }, [])
  useEffect(() => { onStateChange?.({ busy: busy || portPending }) }, [busy, portPending, onStateChange])
  const persist = async (changes: Partial<Pick<IntegrationStatusDto, 'enabled' | 'port' | 'scopes'>> = {}, rotateToken = false) => {
    if (!saved || saving.current) return
    saving.current = true
    setBusy(true); setError(''); setMessage(''); setPortPending(false)
    const next = { enabled: saved.enabled, port: saved.port, scopes: saved.scopes, ...changes }
    setEnabled(next.enabled); setScopes(next.scopes)
    try {
      apply(await updateIntegrationSettings({ ...next, baseRevision: saved.revision, rotateToken }))
      setConfirmReset(false)
      setMessage(rotateToken ? '凭证已重置，请在客户端重新连接 MCP。' : '设置已生效；权限变化后请在客户端重新连接 MCP。')
    } catch (cause) { apply(saved); setError(errorText(cause)) }
    finally { saving.current = false; setBusy(false) }
  }
  const changePort = (value: string) => {
    setPort(value); setError('')
    if (portTimer.current) clearTimeout(portTimer.current)
    const number = Number(value)
    const valid = value.trim() !== '' && Number.isInteger(number) && number >= 1 && number <= 65535
    setPortPending(valid && number !== saved?.port)
    if (valid && number !== saved?.port) portTimer.current = setTimeout(() => { void persist({ port: number }) }, 450)
  }
  const copy = async (kind: string) => {
    setBusy(true); setError(''); setMessage('')
    try { await navigator.clipboard.writeText(await getIntegrationClientConfig(kind)); setMessage('连接配置已复制。无需填写令牌或环境变量。') }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  return <div className="mcp-settings">
    {error && <p className="settings-feedback mcp-error" role="alert">{error}</p>}{message && <p className="settings-feedback" role="status">{message}</p>}
    <section className="settings-group" aria-labelledby="mcp-service-title"><h2 id="mcp-service-title">本机服务</h2>
      <div className="settings-row"><div className="settings-row-copy"><label htmlFor="mcp-enabled">启用 MCP 访问</label><p>允许 Codex、DSH 等客户端访问本机内容。CoolNote 需要保持运行。</p></div><input id="mcp-enabled" className="settings-switch" type="checkbox" role="switch" aria-label="启用 MCP 访问" checked={enabled} disabled={!saved || busy || portPending} onChange={event => void persist({ enabled: event.target.checked })} /></div>
      <div className="settings-row"><div className="settings-row-copy"><label htmlFor="mcp-port">本机端口</label><p>修改端口后，请重新复制客户端配置。</p></div><input id="mcp-port" className="settings-number" aria-label="本机端口" type="number" min={1} max={65535} value={port} disabled={!saved || busy} onChange={event => changePort(event.target.value)} onBlur={() => { const value = Number(port); if (!port.trim() || !Number.isInteger(value) || value < 1 || value > 65535) { setPort(String(saved?.port ?? 43127)); setError('端口必须是 1 至 65535 的整数，已恢复原值。') } }} /></div>
      <div className="mcp-service-status" role="status" data-running={saved?.running ?? false}><span className="mcp-status-dot" />{!saved ? error ? '无法读取本机服务状态' : '正在读取设置…' : saved.running ? '本机服务运行中' : saved.enabled ? '本机服务未启动' : 'MCP 访问已关闭'}</div>{saved?.error && <p className="settings-feedback" role="alert">{saved.error}</p>}
    </section>
    <section className="settings-group" aria-labelledby="mcp-permission-title"><h2 id="mcp-permission-title">访问权限</h2><p className="settings-description">分别设置每个模块的读取与写入权限。</p>
      <fieldset className="mcp-permissions" disabled={!saved || busy || portPending}><legend className="settings-sr-only">模块访问权限</legend><div className="mcp-permission-head" aria-hidden="true"><span>内容模块</span><span>读取</span><span>写入</span></div>{groups.map(group => <div className="mcp-permission-row" key={group.prefix}><strong>{group.name}</strong>{['read', 'write'].map(action => {
        const scope = `${group.prefix}:${action}`
        return <label className="settings-checkbox" key={scope}><input aria-label={`${action === 'read' ? '读取' : '写入'}${group.name}`} type="checkbox" checked={scopes.includes(scope)} onChange={event => void persist({ scopes: event.target.checked ? [...scopes, scope] : scopes.filter(value => value !== scope) })} /><span aria-hidden="true"><Icon name="check" /></span></label>
      })}</div>)}</fieldset>
    </section>
    <section className="settings-group" aria-labelledby="mcp-clients-title"><h2 id="mcp-clients-title">连接客户端</h2><p className="settings-description">启用服务后，复制对应的连接配置。</p>{[['codex', 'Codex', '复制 Codex 配置'], ['json', '通用 MCP 客户端', '复制通用配置'], ['dsh', 'DSH', '复制 DSH 配置']].map(([kind, name, label]) => <div className="settings-row mcp-client-row" key={kind}><span>{name}</span><button className="settings-button" disabled={!saved?.running || portPending || busy} onClick={() => void copy(kind)}><Icon name="copy" />{label}</button></div>)}</section>
    <section className="settings-group" aria-labelledby="mcp-security-title"><h2 id="mcp-security-title">连接安全</h2><div className="settings-row"><div className="settings-row-copy"><span>连接凭证</span><p>凭证由 CoolNote 自动管理。重置后，客户端需要重新连接。</p></div><button className="settings-button" disabled={!saved || busy || portPending} onClick={() => confirmReset ? void persist({}, true) : setConfirmReset(true)}>{confirmReset ? '确认重置连接凭证' : '重置连接凭证'}</button></div>{confirmReset && <button className="settings-text-button" disabled={busy} onClick={() => setConfirmReset(false)}>取消重置</button>}</section>
    <p className="settings-description" role="status">{busy || portPending ? '正在应用设置…' : '更改自动生效，连接配置保存在本机。'}</p>
  </div>
}
