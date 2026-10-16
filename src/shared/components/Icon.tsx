import { createElement } from 'react'
import { isIconName, type IconName } from './iconRegistry'
import icons from './hugeicons.generated.json'
import './hugeicons-headings.generated.css'

type IconProps = {
  name: string
  className?: string
  testId?: string
}

export function Icon({ name, className = 'icon', testId }: IconProps) {
  const resolvedName:IconName=isIconName(name)?name:'folder'
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-icon={resolvedName}
      data-invalid-icon={resolvedName===name?undefined:name}
      data-testid={testId}
    >
      {icons[resolvedName].map(({ tag, attrs }, index) => createElement(tag, { ...attrs, key: index }))}
    </svg>
  )
}
