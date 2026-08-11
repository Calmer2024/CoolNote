type IconProps = {
  name: string
  className?: string
  testId?: string
}

export function Icon({ name, className = 'icon', testId }: IconProps) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      data-icon={name}
      data-testid={testId}
    >
      <use href={`/assets/lucide-icons.svg#${name}`} />
    </svg>
  )
}
