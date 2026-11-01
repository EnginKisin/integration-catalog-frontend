import { permissionDescriptions, permissionLabels, permissions, roleDescriptions, roleLabels, roles } from '../../lib/account'
import { AppIcon } from '../ui/AppIcon'

export function AccessGuide() {
  return <details className="access-guide rounded-lg border">
    <summary className="cursor-pointer font-medium"><AppIcon name="shield" />Rol ve erişim izni arasındaki fark nedir?</summary>
    <div className="space-y-3 border-t border-white/10 p-3">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2"><h2 className="text-sm font-semibold text-white">Rol · Uygulamada yapabilecekleri</h2><dl className="space-y-2">{roles.map((role) => <div key={role}><dt className="text-xs font-medium text-slate-200">{roleLabels[role]} <span className="font-normal text-slate-500">({role})</span></dt><dd className="mt-0.5 text-xs leading-relaxed text-slate-400">{roleDescriptions[role]}</dd></div>)}</dl></section>
        <section className="space-y-2"><h2 className="text-sm font-semibold text-white">Erişim izinleri · Kayıtlı bağlantı bilgileri</h2><p className="text-xs leading-relaxed text-slate-400">Yalnızca entegrasyonların parola ve API anahtarı gibi bilgilerini kapsar. Kullanıcının uygulamaya giriş parolasıyla ilgili değildir.</p><dl className="space-y-2">{permissions.map((permission) => <div key={permission}><dt className="text-xs font-medium text-slate-200">{permissionLabels[permission]}</dt><dd className="mt-0.5 text-xs leading-relaxed text-slate-400">{permissionDescriptions[permission]}</dd></div>)}</dl><p className="text-xs leading-relaxed text-slate-400">Değiştirme izni editör rolünde geçerlidir. Yönetici her iki yetkiye de otomatik sahiptir.</p></section>
      </div>
      <p className="rounded-md bg-violet-400/5 px-3 py-2 text-xs leading-relaxed text-slate-300"><span className="font-medium text-violet-200">Örnek:</span> Bir editör entegrasyonun URL'sini düzenleyebilir. Kayıtlı parolayı görmek veya değiştirmek için ilgili erişim iznini ayrıca vermeniz gerekir.</p>
    </div>
  </details>
}
