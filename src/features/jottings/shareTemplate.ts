import type { LibraryDto } from '../../shared/tauri/contracts'

export type JottingGroupTemplate='emotion'|'share'|'product'
export type ShareAuthor={name:string;bio:string;avatarDataUrl:string|null}
export type ProductProfile={name:string;intro:string;url:string;brandColor:string;logoDataUrl:string|null}
export type ShareTemplateSettings={selectedTemplate:JottingGroupTemplate;authorName:string;authorBio:string;productName:string;productIntro:string;productUrl:string;productBrandColor:string}

export const DEFAULT_PRODUCT_NAME='我的开源产品'
export const DEFAULT_PRODUCT_INTRO='用一句话介绍你的产品亮点与价值。'
export const DEFAULT_PRODUCT_BRAND_COLOR='#1687e8'

export const DEFAULT_SHARE_SETTINGS:ShareTemplateSettings={
  selectedTemplate:'share',
  authorName:'CoolNote 创作者',
  authorBio:'快来填写你个人的独特简介吧~',
  productName:DEFAULT_PRODUCT_NAME,
  productIntro:DEFAULT_PRODUCT_INTRO,
  productUrl:'',
  productBrandColor:DEFAULT_PRODUCT_BRAND_COLOR,
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
  const selectedTemplate=settings.selectedTemplate==='emotion'||settings.selectedTemplate==='product'?settings.selectedTemplate:'share'
  const authorName=typeof settings.authorName==='string'&&settings.authorName.trim()?settings.authorName.trim().slice(0,20):DEFAULT_SHARE_SETTINGS.authorName
  const legacyEmptyBio=settings.version!==2&&settings.version!==3&&settings.authorBio===''
  const authorBio=typeof settings.authorBio==='string'&&!legacyEmptyBio?settings.authorBio.slice(0,40):DEFAULT_SHARE_SETTINGS.authorBio
  const productName=typeof settings.productName==='string'&&settings.productName.trim()?settings.productName.trim().slice(0,30):DEFAULT_PRODUCT_NAME
  const productIntro=typeof settings.productIntro==='string'&&settings.productIntro.trim()?settings.productIntro.trim().slice(0,120):DEFAULT_PRODUCT_INTRO
  const productUrl=typeof settings.productUrl==='string'?normalizeProductInfoStamp(settings.productUrl):''
  const productBrandColor=typeof settings.productBrandColor==='string'&&/^#[0-9a-f]{6}$/i.test(settings.productBrandColor)?settings.productBrandColor.toLowerCase():DEFAULT_PRODUCT_BRAND_COLOR
  return{selectedTemplate,authorName,authorBio,productName,productIntro,productUrl,productBrandColor}
}

export const normalizeProductInfoStamp=(raw:string)=>raw.trim().slice(0,200)

export const productIntroFitsCover=(value:string)=>Array.from(value.trim()).reduce((units,char)=>units+(/[\u0000-\u00ff]/.test(char)?.52:1),0)<=72

export const settingsWithShareTemplate=(settingsJson:string,value:ShareTemplateSettings)=>JSON.stringify({
  ...objectSettings(settingsJson),
  shareTemplate:{
    version:3,
    selectedTemplate:value.selectedTemplate,
    authorName:(value.authorName.trim()||DEFAULT_SHARE_SETTINGS.authorName).slice(0,20),
    authorBio:value.authorBio.slice(0,40),
    productName:(value.productName.trim()||DEFAULT_PRODUCT_NAME).slice(0,30),
    productIntro:(value.productIntro.trim()||DEFAULT_PRODUCT_INTRO).slice(0,120),
    productUrl:normalizeProductInfoStamp(value.productUrl),
    productBrandColor:/^#[0-9a-f]{6}$/i.test(value.productBrandColor)?value.productBrandColor.toLowerCase():DEFAULT_PRODUCT_BRAND_COLOR,
  },
})
