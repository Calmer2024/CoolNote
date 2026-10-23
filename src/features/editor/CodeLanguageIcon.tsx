import { phycatLanguageIcon } from './phycatCode'
import '../../app/typora-file-icons.css'

/** Language logos are content identities, using the bundled multi-color font. */
export function CodeLanguageIcon({ language }: { language: string }) {
  const icon = phycatLanguageIcon(language)
  return icon ? <span className={`code-language-icon ty-file-icon ty-fi-${icon.name}`} aria-hidden="true">{Array.from({ length: icon.layers }, (_, index) => <span className={`path${index + 1}`} key={index} />)}</span> : null
}
