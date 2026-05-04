document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll('.animate-on-scroll');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });

    animatedElements.forEach(el => {
        observer.observe(el);
    });

    const keyPopupOverlay = document.getElementById('key-popup-overlay');
    const keyPopupClose = document.getElementById('key-popup-close');
    const keySubmitBtn = document.getElementById('key-submit-btn');
    const keyInput = document.getElementById('key-activation-input');
    
    const keyButton = Array.from(document.querySelectorAll('.highlight')).find(btn => 
        btn.textContent.trim().includes('Ввести ключ')
    );

    function openKeyPopup() {
        keyPopupOverlay.style.display = 'flex';
        keyPopupOverlay.classList.remove('closing');
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => {
            keyInput.focus();
        }, 200);
    }

    function closeKeyPopup() {
        keyPopupOverlay.classList.add('closing');
        document.body.style.overflow = '';
        
        setTimeout(() => {
            keyPopupOverlay.style.display = 'none';
            keyPopupOverlay.classList.remove('closing');
            keyInput.value = '';
        }, 300);
    }

    if (keyButton) {
        keyButton.addEventListener('click', (e) => {
            e.preventDefault();
            openKeyPopup();
        });
    }

    keyPopupClose.addEventListener('click', closeKeyPopup);

    keySubmitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const keyValue = keyInput.value.trim();
        
        if (keyValue) {
            closeKeyPopup();
        } else {
            keyInput.style.borderColor = '#ff4444';
            keyInput.placeholder = 'Пожалуйста, введите ключ';
            
            setTimeout(() => {
                keyInput.style.borderColor = '';
                keyInput.placeholder = 'Введите ключ активации';
            }, 2000);
        }
    });

    keyPopupOverlay.addEventListener('click', (e) => {
        if (e.target === keyPopupOverlay) {
            closeKeyPopup();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && keyPopupOverlay.style.display === 'flex') {
            closeKeyPopup();
        }
    });

    keyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            keySubmitBtn.click();
        }
    });
});
