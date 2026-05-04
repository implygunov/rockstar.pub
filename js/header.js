document.addEventListener('DOMContentLoaded', async function() {
    (function setupToasts(){
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const showToast = (message, type = 'info', timeout = 3000) => {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;
            container.appendChild(toast);
            requestAnimationFrame(()=> toast.classList.add('show'));
            const hide = () => {
                toast.classList.remove('show');
                setTimeout(()=> toast.remove(), 220);
            };
            if (timeout > 0) setTimeout(hide, timeout);
            return { hide };
        };
        window.__toast = showToast;
    })();

    const header = document.querySelector('header');
    const navMenu = header ? header.querySelector('ul') : null;
    const openBtn = header ? header.querySelector('.open-ul') : null;
    const headerActions = document.querySelector('.header-actions');
    const existingButton = headerActions ? headerActions.querySelector('.button') : null;

    document.addEventListener('dragstart', (e) => {
        const target = e.target;
        if (target && target.tagName === 'IMG') {
            e.preventDefault();
        }
    });
    
    if (headerActions && existingButton) {
        try {
            const skeletonBtn = document.createElement('div');
            skeletonBtn.className = 'profile-button skeleton';
            skeletonBtn.innerHTML = `
                <div class="skeleton-avatar" style="width: 26px; height: 26px;"></div>
                <div class="skeleton-text" style="width: 80px; height: 16px;"></div>
            `;
            existingButton.replaceWith(skeletonBtn);

            const isAuthorized = await verifyToken();

            if (isAuthorized) {
                const accountData = await apiRequest('/account/details', 'GET');
                const profileBtn = document.createElement('div');
                profileBtn.className = 'profile-button';
                profileBtn.innerHTML = `
                    <img src="${accountData.avatarUrl || '/img/ava.jpg'}" alt="Avatar" class="profile-avatar">
                    <span class="profile-name">${accountData.login || 'User'}</span>
                `;
                profileBtn.onclick = () => location.href = '/profile';
                skeletonBtn.replaceWith(profileBtn);
            } else {
                const regButton = document.createElement('button');
                regButton.className = 'button';
                regButton.textContent = 'Регистрация';
                regButton.onclick = () => location.href = '/signup';
                skeletonBtn.replaceWith(regButton);
            }
        } catch (error) {
            console.error('Error checking auth:', error);
            const regButton = document.createElement('button');
            regButton.className = 'button';
            regButton.textContent = 'Регистрация';
            regButton.onclick = () => location.href = '/signup';
            if (document.querySelector('.skeleton')) {
                document.querySelector('.skeleton').replaceWith(regButton);
            }
        }
    }

    if (openBtn && navMenu && header) {
        openBtn.addEventListener('click', function() {
            navMenu.classList.toggle('mobile-open');
            header.classList.toggle('menu-open', navMenu.classList.contains('mobile-open'));
        });

        document.addEventListener('click', function(e) {
            if (!openBtn.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('mobile-open');
                header.classList.remove('menu-open');
            }
        });
    }
});