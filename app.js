(() => {
  const workspace = document.querySelector('.workspace');
  const readingLayout = document.querySelector('.reading-layout');

  const panels = {
    notes: {
      root: workspace,
      attribute: 'data-notes-collapsed',
      expandedLabel: '收起笔记列表',
      collapsedLabel: '展开笔记列表'
    },
    outline: {
      root: readingLayout,
      attribute: 'data-outline-collapsed',
      expandedLabel: '收起大纲',
      collapsedLabel: '展开大纲'
    }
  };

  const buttonsFor = (target) =>
    document.querySelectorAll(`[data-collapse-target="${target}"]`);

  const syncPanelControls = (target) => {
    const config = panels[target];
    const collapsed = config.root.getAttribute(config.attribute) === 'true';

    buttonsFor(target).forEach((button) => {
      const iconName = collapsed
        ? button.dataset.collapsedIcon
        : button.dataset.expandedIcon;
      const iconUse = button.querySelector('use');

      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute(
        'aria-label',
        collapsed ? config.collapsedLabel : config.expandedLabel
      );

      if (iconUse && iconName) {
        iconUse.setAttribute('href', `assets/lucide-icons.svg#${iconName}`);
      }
    });
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-collapse-target]');
    if (!button) return;

    const target = button.dataset.collapseTarget;
    const config = panels[target];
    if (!config) return;

    const collapsed = config.root.getAttribute(config.attribute) === 'true';
    config.root.setAttribute(config.attribute, String(!collapsed));
    syncPanelControls(target);
  });

  Object.keys(panels).forEach(syncPanelControls);
})();
