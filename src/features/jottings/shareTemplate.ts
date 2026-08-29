import type { LibraryDto } from '../../shared/tauri/contracts'

export type JottingGroupTemplate='emotion'|'share'
export type ShareAuthor={name:string;bio:string;avatarDataUrl:string|null}
export type ShareTemplateSettings={selectedTemplate:JottingGroupTemplate;authorName:string;authorBio:string}

export const DEFAULT_SHARE_SETTINGS:ShareTemplateSettings={
  selectedTemplate:'share',
  authorName:'CoolNote 创作者',
  authorBio:'快来填写你个人的独特简介吧~',
}

const objectSettings=(settingsJson:string):Record<string,unknown>=>{
  try{const value=JSON.parse(settingsJson) as unknown;return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}
  catch{return{}}
}

export const shareSettingsFromLibrary=(library:Pick<LibraryDto,'settingsJson'>|null):ShareTemplateSettings=>{
  const root=objectSettings(library?.settingsJson??'{}')
  const value=root.shareTemplate
  if(!value||typeof value!=='object'||Array.isArray(value))return DEFAULT_SHARE_SETTINGS
  const settings=value as Record<string,unknown>
  const selectedTemplate=settings.selectedTemplate==='emotion'?'emotion':'share'
  const authorName=typeof settings.authorName==='string'&&settings.authorName.trim()?settings.authorName.trim().slice(0,20):DEFAULT_SHARE_SETTINGS.authorName
  const legacyEmptyBio=settings.version!==2&&settings.authorBio===''
  const authorBio=typeof settings.authorBio==='string'&&!legacyEmptyBio?settings.authorBio.slice(0,40):DEFAULT_SHARE_SETTINGS.authorBio
  return{selectedTemplate,authorName,authorBio}
}

export const settingsWithShareTemplate=(settingsJson:string,value:ShareTemplateSettings)=>JSON.stringify({
  ...objectSettings(settingsJson),
  shareTemplate:{
    version:2,
    selectedTemplate:value.selectedTemplate,
    authorName:(value.authorName.trim()||DEFAULT_SHARE_SETTINGS.authorName).slice(0,20),
    authorBio:value.authorBio.slice(0,40),
  },
})
