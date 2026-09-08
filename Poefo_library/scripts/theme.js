(function initTheme(window, document) {
    const STORAGE_KEY = 'poefo-theme';
    const DARK_THEME = 'dark';

    function getTheme() {
        return localStorage.getItem(STORAGE_KEY) || 'light';
    }

    function applyTheme(theme) {
        const isDark = theme === DARK_THEME;
        document.documentElement.classList.toggle('dark-theme', isDark);
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
        localStorage.setItem(STORAGE_KEY, isDark ? DARK_THEME : 'light');

        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.setAttribute('aria-pressed', String(isDark));
            toggle.setAttribute('aria-label', isDark ? 'Ativar tema claro' : 'Ativar tema escuro');
            toggle.title = isDark ? 'Ativar tema claro' : 'Ativar tema escuro';
            toggle.classList.toggle('is-dark', isDark);
        }
    }

    applyTheme(getTheme());

    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(getTheme());
        const toggle = document.getElementById('theme-toggle');
        toggle?.addEventListener('click', () => applyTheme(getTheme() === DARK_THEME ? 'light' : DARK_THEME));
    });

    window.PoefoTheme = { applyTheme, getTheme };
})(window, document);
