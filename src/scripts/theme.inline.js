(() => {
  const root = document.documentElement;
  const saved = () => {
    try {
      const theme = localStorage.getItem('theme');
      return theme === 'light' || theme === 'dark' ? theme : null;
    } catch {
      return null;
    }
  };
  const apply = () => {
    const theme = saved();
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
  };
  apply();
  root.dataset.themeSwitch = '';
})();
