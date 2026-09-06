import { useEffect, useSyncExternalStore } from 'react'

import { Icon } from '../../shared/components/Icon'
import { downloadAndInstallAppUpdate, getAppUpdateState, startAppUpdater, subscribeToAppUpdater } from '../../shared/tauri/appUpdater'

type AppUpdateButtonProps={onError:(message:string)=>void}

export function AppUpdateButton({onError}:AppUpdateButtonProps){
  const update=useSyncExternalStore(subscribeToAppUpdater,getAppUpdateState,getAppUpdateState)
  useEffect(()=>startAppUpdater(),[])
  if(update.status==='hidden')return null
  const busy=update.status==='downloading'||update.status==='installing'
  const label=update.status==='installing'?'正在重启…':update.status==='downloading'?(update.progress===null?'正在下载…':`下载中 ${update.progress}%`):'下载更新'
  const description=update.version?`CoolNote ${update.version} 已发布，${busy?label:'点击下载并安装'}`:label
  return <button type="button" className={`app-update-button ${busy?'busy':''}`} disabled={busy} aria-label={description} aria-live="polite" onClick={()=>void downloadAndInstallAppUpdate().catch(cause=>onError(cause instanceof Error?`更新失败：${cause.message}`:'更新下载或安装失败'))}>
    <span className="app-update-icon"><Icon name="download"/></span><span>{label}</span>{update.status==='available'&&update.version&&<small>v{update.version}</small>}
  </button>
}
