import { cloneElement, useId, useState } from 'react'
import type { AriaAttributes, ChangeEvent, ReactElement } from 'react'
import { ApiError } from '../../services/api'
import { errorText } from '../../lib/apiErrors'

interface ControlProps extends Pick<AriaAttributes, 'aria-label' | 'aria-invalid' | 'aria-describedby'> {
  onChange?: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
}

export function FormField({ label, field, error, children, className = 'label' }: {
  label: string
  field: string
  error?: Error
  children: ReactElement<ControlProps>
  className?: string
}) {
  const id = useId()
  const [dismissed, setDismissed] = useState<Error>()
  const violations = error instanceof ApiError && error !== dismissed
    ? error.violations.filter((violation) => violation.field === field || violation.field?.endsWith(`.${field}`)) : []
  const describedBy = [children.props['aria-describedby'], violations.length ? id : undefined].filter(Boolean).join(' ') || undefined
  return <label className={className}>
    <span>{label}</span>
    {cloneElement(children, {
      'aria-label': children.props['aria-label'] ?? label,
      'aria-invalid': violations.length ? true : children.props['aria-invalid'],
      'aria-describedby': describedBy,
      onChange: (event) => { setDismissed(error); children.props.onChange?.(event) },
    })}
    {violations.length > 0 && <span id={id} className="block space-y-1 text-xs font-normal text-rose-200">{violations.map((violation, index) => <span className="block" key={index}>{errorText(violation.code, violation.params, 400)}</span>)}</span>}
  </label>
}
