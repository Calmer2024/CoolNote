import { isIconName, type IconName } from './iconRegistry'

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
      aria-hidden="true"
      data-icon={resolvedName}
      data-invalid-icon={resolvedName===name?undefined:name}
      data-testid={testId}
    >
      <use href={`./assets/lucide-icons.svg#${resolvedName}`} />
    </svg>
  )
}
