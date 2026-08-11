type IconProps = {
  name: string
  className?: string
}

function Icon({ name, className = 'icon' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`/assets/lucide-icons.svg#${name}`} />
    </svg>
  )
}

const deferredItems = [
  { label: '日程', icon: 'calendar-days' },
  { label: '收藏', icon: 'star' },
  { label: '回收站', icon: 'trash-2' },
]

export function App() {
  return (
    <>
      <header className="app-header">
        <button className="search-box" type="button" aria-label="搜索笔记" disabled>
          <Icon name="search" />
          <span className="search-placeholder">搜索笔记...</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="header-actions">
          <button className="icon-button theme-button" type="button" aria-label="切换主题">
            <Icon name="sun" />
          </button>
          <button className="new-note-button" type="button">
            <Icon name="plus" />
            <span>新建</span>
          </button>
        </div>
      </header>

      <main className="workspace" data-notes-collapsed="false">
        <aside className="sidebar" aria-label="主导航">
          <div className="sidebar-header">
            <div className="brand">
              <img src="/assets/logo.svg" width="42" height="42" alt="" />
              <span>CoolNote</span>
            </div>
          </div>
          <div className="sidebar-content">
            <nav className="primary-nav" aria-label="系统视图">
              <button className="nav-item active" type="button">
                <Icon name="file-text" />
                <span>全部笔记</span>
              </button>
              {deferredItems.map((item) => (
                <button
                  className="nav-item"
                  type="button"
                  key={item.label}
                  disabled
                  title="后续里程碑提供"
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="section-label">分类</div>
            <p className="sidebar-empty">分类将在后续里程碑提供</p>
          </div>
        </aside>

        <section className="notes-panel" aria-label="笔记列表">
          <div className="notes-header">
            <div className="notes-heading">
              <strong>全部笔记</strong>
              <span className="notes-count">0</span>
            </div>
          </div>
          <div className="notes-list notes-empty">
            <Icon name="file-text" className="empty-state-icon" />
            <strong>还没有笔记</strong>
            <span>点击“新建”开始记录</span>
          </div>
        </section>

        <section className="document-panel" aria-label="笔记正文">
          <div className="document-toolbar">
            <button className="icon-button panel-toggle" type="button" aria-label="收起笔记列表">
              <Icon name="panel-left-close" />
            </button>
            <div className="document-actions">
              <span className="save-status" aria-live="polite">已保存</span>
            </div>
          </div>
          <div className="document-empty">
            <Icon name="book-open-text" className="empty-document-icon" />
            <h1>选择或新建一篇笔记</h1>
            <p>你的内容将保存在本机笔记库中。</p>
          </div>
        </section>
      </main>
    </>
  )
}
