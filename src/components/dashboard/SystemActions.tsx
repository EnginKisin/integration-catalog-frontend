import type { SystemDefinition } from '../../types/system'
import { RowActions } from '../ui/RowActions'

interface Props {
  item: SystemDefinition
  busy: boolean
  admin: boolean
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}

export function SystemActions({ item, busy, admin, onEdit, onToggleActive, onDelete }: Props) {
  return <RowActions label={`${item.name} işlemleri`} disabled={busy} items={[
    { id: 'edit', label: 'Düzenle', onSelect: onEdit },
    { id: 'active', label: item.active ? 'Pasifleştir' : 'Aktifleştir', onSelect: onToggleActive },
    ...(admin ? [{ id: 'delete', label: 'Sil', onSelect: onDelete, danger: true, separatorBefore: true, disabled: item.usageCount > 0, disabledReason: 'Kullanılan sistemler silinemez. Yeni seçimlere kapatmak için pasifleştirin.' }] : []),
  ]} />
}
