import type { ReactNode } from 'react'
import { AppIcon, type IconName } from '../ui/AppIcon'
import { Brand } from '../ui/PageLayout'

export function AuthLayout({ title, description, icon = 'shield', children }: { title: string; description: string; icon?: IconName; children: ReactNode }) {
  return <main className="auth-layout">
    <aside className="auth-story"><Brand /><div className="auth-story-content"><p className="page-eyebrow">SİSTEMLER ARASI GÖRÜNÜRLÜK</p><h2>Tüm entegrasyonlarınız.<br /><span>Tek bir çalışma alanı.</span></h2><p>Bağlantıları, veri yapılarını ve alan eşlemelerini aynı katalogda tanımlayın, inceleyin ve yönetin.</p>
      <div className="auth-flow" aria-hidden="true"><div><AppIcon name="server" /><span>Kaynak</span><small>Veri yapıları</small></div><span className="auth-flow-line" /><div className="auth-flow-center"><AppIcon name="layers" /><span>Akış</span><small>Alan eşleme</small></div><span className="auth-flow-line" /><div><AppIcon name="server" /><span>Hedef</span><small>Bağlantılar</small></div></div>
      <div className="auth-story-note"><AppIcon name="shield" /><div><strong>Ekibiniz için ortak bir görünüm</strong><p>Roller ve erişim izinleriyle kontrollü bir çalışma alanı.</p></div></div>
    </div><p className="auth-story-footer">Entegrasyon Kataloğu <span>Akış workspace</span></p></aside>
    <div className="auth-main"><div className="auth-mobile-brand"><Brand /></div><div className="auth-card"><span className="auth-page-icon"><AppIcon name={icon} /></span><header className="auth-heading"><p className="page-eyebrow">HESAP ERİŞİMİ</p><h1>{title}</h1><p>{description}</p></header><div className="auth-content">{children}</div></div><p className="auth-main-footer">Akış · Entegrasyon Kataloğu</p></div>
  </main>
}
