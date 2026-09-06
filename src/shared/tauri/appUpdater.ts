import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'

export type AppUpdateState = {
  status: 'hidden' | 'available' | 'downloading' | 'installing'
  version: string | null
  progress: number | null
}

const INITIAL_CHECK_DELAY_MS = 8_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000
const CHECK_TIMEOUT_MS = 15_000
const DOWNLOAD_TIMEOUT_MS = 120_000
const hiddenState:AppUpdateState={status:'hidden',version:null,progress:null}

let state = hiddenState
let pendingUpdate:Update|null = null
let started = false
let checking = false
const listeners = new Set<() => void>()

const publish=(next:AppUpdateState)=>{state=next;listeners.forEach(listener=>listener())}
const canUseUpdater=()=>{
  const environment=(import.meta as ImportMeta&{env?:{PROD?:boolean}}).env
  return !!environment?.PROD&&typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window
}

export const getAppUpdateState=()=>state
export const subscribeToAppUpdater=(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)}

export async function checkForAppUpdate(){
  if(!canUseUpdater()||checking||state.status==='downloading'||state.status==='installing')return
  checking=true
  try{
    const {check}=await import('@tauri-apps/plugin-updater')
    const update=await check({timeout:CHECK_TIMEOUT_MS})
    if(pendingUpdate&&pendingUpdate!==update)void pendingUpdate.close().catch(()=>undefined)
    pendingUpdate=update
    publish(update?{status:'available',version:update.version,progress:null}:hiddenState)
  }catch(cause){
    console.warn('[app-updater] update check failed',cause)
  }finally{checking=false}
}

export function startAppUpdater(){
  if(started||!canUseUpdater())return
  started=true
  window.setTimeout(()=>void checkForAppUpdate(),INITIAL_CHECK_DELAY_MS)
  window.setInterval(()=>void checkForAppUpdate(),CHECK_INTERVAL_MS)
}

export async function downloadAndInstallAppUpdate(){
  const update=pendingUpdate
  if(!update||state.status!=='available')return
  let downloaded=0
  let total:number|undefined
  const onDownload=(event:DownloadEvent)=>{
    if(event.event==='Started')total=event.data.contentLength
    if(event.event==='Progress')downloaded+=event.data.chunkLength
    if(event.event==='Finished'){publish({status:'installing',version:update.version,progress:100});return}
    const progress=total?Math.min(99,Math.round(downloaded/total*100)):null
    publish({status:'downloading',version:update.version,progress})
  }
  publish({status:'downloading',version:update.version,progress:null})
  try{
    await update.downloadAndInstall(onDownload,{timeout:DOWNLOAD_TIMEOUT_MS})
    publish({status:'installing',version:update.version,progress:100})
    const {relaunch}=await import('@tauri-apps/plugin-process')
    await relaunch()
  }catch(cause){
    publish({status:'available',version:update.version,progress:null})
    throw cause
  }
}
