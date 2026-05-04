document.addEventListener('DOMContentLoaded', async () => {
    const isAuthPage = window.location.pathname.includes('signin') ||
                      window.location.pathname.includes('/signup');

    return true;
});