// Ждем пока auth.js установит API_BASE_URL
(function() {
    function waitForAuth() {
        if (!window.API_BASE_URL) {
            setTimeout(waitForAuth, 50);
            return;
        }
        initProfile();
    }
    
    function initProfile() {
        const API_BASE_URL = window.API_BASE_URL;
        const TOKEN_KEY = 'jwtToken';
        let jwtToken = localStorage.getItem(TOKEN_KEY);

        function updateProfileUI(accountData) {
            console.log('Updating UI with data:', accountData);
            
            const headerAvatar = document.querySelector('.header-actions .avatar');
            const headerName = document.querySelector('.header-actions .header-name');
            if (headerAvatar) headerAvatar.src = '/img/ava.jpg';
            if (headerName) headerName.textContent = accountData.login || '';

            const profileAvatar = document.querySelector('.upper-info .avatar');
            const profileName = document.querySelector('.text .name');
            const profileId = document.querySelector('.uid .id');
            
            if (profileAvatar) profileAvatar.src = '/img/ava.jpg';
            if (profileName) {
                profileName.textContent = accountData.login || '';
                console.log('Set name to:', accountData.login);
            }
            if (profileId) {
                profileId.textContent = accountData.id || '';
                console.log('Set ID to:', accountData.id);
            }

            const roleEl = document.querySelector('.role');
            const emailEl = document.querySelector('.email');
            const creationEl = document.querySelector('.creation');
            const ramDisplay = document.getElementById('ram-display');
            const twofaStatus = document.getElementById('twofa-status');
            const twofaBtn = document.getElementById('twofa-btn');

            if (roleEl) {
                roleEl.textContent = accountData.role || 'user';
                roleEl.className = 'role ' + (accountData.role || 'user').toLowerCase();
                console.log('Set role to:', accountData.role);
            }
            if (emailEl) {
                emailEl.textContent = accountData.email || '';
                console.log('Set email to:', accountData.email);
            }
            if (creationEl) {
                creationEl.textContent = accountData.createdAt || '';
                console.log('Set creation to:', accountData.createdAt);
            }
            if (ramDisplay) {
                ramDisplay.textContent = accountData.ram || '4096';
                console.log('Set RAM to:', accountData.ram);
            }

            const isTwoFaEnabled = accountData.gauthStatus === 'true' || accountData.gauthStatus === true;
            if (twofaStatus) twofaStatus.textContent = isTwoFaEnabled ? 'Привязан' : 'Не привязан';
            if (twofaBtn) twofaBtn.textContent = isTwoFaEnabled ? 'Отвязать' : 'Привязать';
            
            // Показываем подписку если есть
            if (accountData.subuntill && accountData.subuntill.trim() !== '') {
                const creationRow = document.getElementById('creation-row');
                if (creationRow && !document.getElementById('subscription-row')) {
                    const subRow = document.createElement('div');
                    subRow.id = 'subscription-row';
                    subRow.className = 'border down';
                    subRow.innerHTML = `
                        <div class="user-sub">
                            <div class="till">Подписка до</div>
                            <div class="till"><span class="subscription-until">${accountData.subuntill}</span></div>
                        </div>
                    `;
                    creationRow.parentNode.insertBefore(subRow, creationRow.nextSibling);
                } else if (document.querySelector('.subscription-until')) {
                    document.querySelector('.subscription-until').textContent = accountData.subuntill;
                }
            }
        }

        document.addEventListener('DOMContentLoaded', async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/account/details`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${jwtToken}`
                    },
                    credentials: 'include'
                });

                if (!response.ok) {
                    throw new Error('Не авторизован');
                }

                const data = await response.json();
                console.log('Profile data loaded:', data);
                window.PROFILE_DATA = data;
                updateProfileUI(data);
                
                // Проверяем подписку и загружаем конфиги
                const role = (data.role || 'user').toLowerCase();
                if (role !== 'user' && role !== 'default') {
                    loadConfigs();
                }
            } catch (error) {
                console.error('Error loading profile:', error);
                localStorage.removeItem(TOKEN_KEY);
                window.location.href = '/signin';
                return;
            }

            const logoutBtn = document.querySelector('.quit');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    localStorage.removeItem(TOKEN_KEY);
                    window.location.href = '/signin';
                });
            }

            // Кнопка скачивания лоадера
            const downloadBtn = document.getElementById('download-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', async () => {
                    const role = (window.PROFILE_DATA.role || 'user').toLowerCase();
                    
                    if (role === 'user' || role === 'default') {
                        alert('Требуется активная подписка для скачивания лоадера');
                        return;
                    }
                    
                    try {
                        const response = await fetch(`${API_BASE_URL}/download/loader`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${jwtToken}`
                            },
                            credentials: 'include'
                        });

                        if (!response.ok) {
                            const data = await response.json();
                            throw new Error(data.error || 'Ошибка скачивания');
                        }

                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'rockstar-1.0.0.jar';
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        
                        if (window.__toast) window.__toast('Лоадер скачивается...', 'success');
                    } catch (error) {
                        alert(error.message);
                    }
                });
            }

            const ramEditBtn = document.getElementById('ram-edit-btn');
            const ramPopupOverlay = document.getElementById('ram-popup-overlay');
            const ramPopupClose = document.getElementById('ram-popup-close');
            const ramInput = document.getElementById('ram-input');
            const ramSubmitBtn = document.getElementById('ram-submit-btn');

            if (ramEditBtn) {
                ramEditBtn.addEventListener('click', () => {
                    ramInput.value = document.getElementById('ram-display').textContent;
                    ramPopupOverlay.style.display = 'flex';
                });
            }

            if (ramPopupClose) {
                ramPopupClose.addEventListener('click', () => {
                    ramPopupOverlay.style.display = 'none';
                });
            }

            if (ramSubmitBtn) {
                ramSubmitBtn.addEventListener('click', async () => {
                    const ramValue = parseInt(ramInput.value);
                    if (isNaN(ramValue) || ramValue < 512 || ramValue > 16384) {
                        alert('Введите корректное значение RAM (от 512 до 16384 МБ)');
                        return;
                    }

                    try {
                        const response = await fetch(`${API_BASE_URL}/account/update-ram`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${jwtToken}`
                            },
                            credentials: 'include',
                            body: JSON.stringify({ ram: ramValue })
                        });

                        const data = await response.json();
                        if (response.ok) {
                            document.getElementById('ram-display').textContent = ramValue;
                            ramPopupOverlay.style.display = 'none';
                            if (window.__toast) window.__toast('RAM успешно изменён', 'success');
                        } else {
                            throw new Error(data.error || 'Ошибка');
                        }
                    } catch (error) {
                        alert(error.message);
                    }
                });
            }

            const twofaBtn = document.getElementById('twofa-btn');
            const twofaPopupOverlay = document.getElementById('twofa-popup-overlay');
            const twofaPopupClose = document.getElementById('twofa-popup-close');
            const twofaUnlinkPopupOverlay = document.getElementById('twofa-unlink-popup-overlay');
            const twofaUnlinkPopupClose = document.getElementById('twofa-unlink-popup-close');
            const twofaSubmitBtn = document.getElementById('twofa-submit-btn');
            const twofaUnlinkSubmitBtn = document.getElementById('twofa-unlink-submit-btn');

            if (twofaBtn) {
                twofaBtn.addEventListener('click', async () => {
                    const isLinked = window.PROFILE_DATA.gauthStatus === 'true';

                    if (isLinked) {
                        twofaUnlinkPopupOverlay.style.display = 'flex';
                    } else {
                        try {
                            const response = await fetch(`${API_BASE_URL}/account/setup-2fa`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${jwtToken}`
                                },
                                credentials: 'include'
                            });

                            const data = await response.json();
                            if (response.ok) {
                                document.getElementById('twofa-qr-img').src = data.qrCode;
                                document.getElementById('twofa-secret').textContent = data.secret;
                                twofaPopupOverlay.style.display = 'flex';
                            } else {
                                alert(data.error);
                            }
                        } catch (error) {
                            alert('Ошибка генерации 2FA');
                        }
                    }
                });
            }

            if (twofaPopupClose) {
                twofaPopupClose.addEventListener('click', () => {
                    twofaPopupOverlay.style.display = 'none';
                });
            }

            if (twofaUnlinkPopupClose) {
                twofaUnlinkPopupClose.addEventListener('click', () => {
                    twofaUnlinkPopupOverlay.style.display = 'none';
                });
            }

            if (twofaSubmitBtn) {
                twofaSubmitBtn.addEventListener('click', async () => {
                    const code = document.getElementById('twofa-code-input').value.trim();
                    if (code.length !== 6) {
                        alert('Введите 6-значный код');
                        return;
                    }

                    try {
                        const response = await fetch(`${API_BASE_URL}/account/verify-2fa`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${jwtToken}`
                            },
                            credentials: 'include',
                            body: JSON.stringify({ code })
                        });

                        const data = await response.json();
                        if (response.ok) {
                            window.PROFILE_DATA.gauthStatus = 'true';
                            document.getElementById('twofa-status').textContent = 'Привязан';
                            twofaBtn.textContent = 'Отвязать';
                            twofaPopupOverlay.style.display = 'none';
                            if (window.__toast) window.__toast('2FA успешно привязан', 'success');
                        } else {
                            alert(data.error);
                        }
                    } catch (error) {
                        alert('Ошибка верификации');
                    }
                });
            }

            if (twofaUnlinkSubmitBtn) {
                twofaUnlinkSubmitBtn.addEventListener('click', async () => {
                    const code = document.getElementById('twofa-unlink-code-input').value.trim();
                    if (code.length !== 6) {
                        alert('Введите 6-значный код');
                        return;
                    }

                    try {
                        const response = await fetch(`${API_BASE_URL}/account/disable-2fa`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${jwtToken}`
                            },
                            credentials: 'include',
                            body: JSON.stringify({ code })
                        });

                        const data = await response.json();
                        if (response.ok) {
                            window.PROFILE_DATA.gauthStatus = 'false';
                            document.getElementById('twofa-status').textContent = 'Не привязан';
                            twofaBtn.textContent = 'Привязать';
                            twofaUnlinkPopupOverlay.style.display = 'none';
                            if (window.__toast) window.__toast('2FA успешно отвязан', 'success');
                        } else {
                            alert(data.error);
                        }
                    } catch (error) {
                        alert('Ошибка отвязки');
                    }
                });
            }

            // Обработка активации ключа
            const enterKeyBtn = document.getElementById('enter-key-btn');
            const keyPopupOverlay = document.getElementById('key-popup-overlay');
            const keyPopupClose = document.getElementById('key-popup-close');
            const keyInput = document.getElementById('key-activation-input');
            const keySubmitBtn = document.getElementById('key-submit-btn');

            if (enterKeyBtn) {
                enterKeyBtn.addEventListener('click', () => {
                    keyPopupOverlay.style.display = 'flex';
                    if (keyInput) keyInput.value = '';
                });
            }

            if (keyPopupClose) {
                keyPopupClose.addEventListener('click', () => {
                    keyPopupOverlay.style.display = 'none';
                });
            }

            if (keySubmitBtn) {
                keySubmitBtn.addEventListener('click', async () => {
                    const key = keyInput.value.trim();
                    if (!key) {
                        alert('Введите ключ');
                        return;
                    }

                    try {
                        const response = await fetch(`${API_BASE_URL}/account/activate-key`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${jwtToken}`
                            },
                            credentials: 'include',
                            body: JSON.stringify({ key })
                        });

                        const data = await response.json();
                        if (response.ok) {
                            window.PROFILE_DATA.role = data.role;
                            window.PROFILE_DATA.subuntill = data.subUntil;
                            
                            const roleEl = document.querySelector('.role');
                            roleEl.textContent = data.role;
                            roleEl.className = 'role ' + data.role.toLowerCase();
                            
                            const creationRow = document.getElementById('creation-row');
                            if (creationRow && !document.getElementById('subscription-row')) {
                                const subRow = document.createElement('div');
                                subRow.id = 'subscription-row';
                                subRow.className = 'border down';
                                subRow.innerHTML = `
                                    <div class="user-sub">
                                        <div class="till">Подписка до</div>
                                        <div class="till"><span class="subscription-until">${data.subUntil}</span></div>
                                    </div>
                                `;
                                creationRow.parentNode.insertBefore(subRow, creationRow.nextSibling);
                            } else if (document.querySelector('.subscription-until')) {
                                document.querySelector('.subscription-until').textContent = data.subUntil;
                            }
                            
                            keyPopupOverlay.style.display = 'none';
                            if (window.__toast) {
                                window.__toast(data.message, 'success', 5000);
                            } else {
                                alert(data.message);
                            }
                        } else {
                            throw new Error(data.error || 'Ошибка активации');
                        }
                    } catch (error) {
                        alert(error.message);
                    }
                });
            }

            // Функция загрузки конфигов
            async function loadConfigs() {
                try {
                    const response = await fetch(`${API_BASE_URL}/configs`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${jwtToken}`
                        },
                        credentials: 'include'
                    });

                    if (!response.ok) {
                        throw new Error('Ошибка загрузки конфигов');
                    }

                    const data = await response.json();
                    displayConfigs(data.configs);
                } catch (error) {
                    console.error('Error loading configs:', error);
                }
            }

            function displayConfigs(configs) {
                const configsBox = document.querySelector('.box.down');
                const table = configsBox.querySelector('table');
                const tbody = table.querySelector('tbody');
                const nonBlock = configsBox.querySelector('.non');
                const pagination = configsBox.querySelector('.pagination');

                if (configs && configs.length > 0) {
                    tbody.innerHTML = '';
                    configs.forEach(config => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td class="prd-name">${config.name}</td>
                            <td class="date">${config.updatedAt}</td>
                            <td class="action">
                                <a href="javascript:void(0);" onclick="toggleMenu(this)">
                                    <i class="ph-fill ph-dots-three-outline actions-trigger"></i>
                                </a>
                                <div class="dropdown-menu hide">
                                    <a href="#" onclick="renameConfig(${config.id}, '${config.name}')">
                                        <i class="ph ph-pencil"></i>
                                        Переименовать
                                    </a>
                                    <a href="#" onclick="downloadConfig(${config.id})">
                                        <i class="ph ph-download"></i>
                                        Скачать
                                    </a>
                                    <a href="#" onclick="deleteConfig(${config.id})" class="danger">
                                        <i class="ph ph-trash"></i>
                                        Удалить
                                    </a>
                                </div>
                            </td>
                        `;
                        tbody.appendChild(row);
                    });
                    
                    table.style.display = 'table';
                    pagination.style.display = 'flex';
                    nonBlock.style.display = 'none';
                } else {
                    table.style.display = 'none';
                    pagination.style.display = 'none';
                    nonBlock.style.display = 'flex';
                }
                
                configsBox.style.display = 'block';
            }

            // Глобальные функции для работы с конфигами
            window.downloadConfig = async function(configId) {
                window.location.href = `${API_BASE_URL}/configs/${configId}/download`;
            };

            window.deleteConfig = async function(configId) {
                if (!confirm('Удалить этот конфиг?')) return;

                try {
                    const response = await fetch(`${API_BASE_URL}/configs/${configId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${jwtToken}`
                        },
                        credentials: 'include'
                    });

                    if (response.ok) {
                        if (window.__toast) window.__toast('Конфиг удален', 'success');
                        loadConfigs();
                    } else {
                        throw new Error('Ошибка удаления');
                    }
                } catch (error) {
                    alert(error.message);
                }
            };

            window.renameConfig = async function(configId, currentName) {
                const newName = prompt('Новое название:', currentName);
                if (!newName || newName === currentName) return;

                try {
                    const response = await fetch(`${API_BASE_URL}/configs/${configId}/rename`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${jwtToken}`
                        },
                        credentials: 'include',
                        body: JSON.stringify({ name: newName })
                    });

                    if (response.ok) {
                        if (window.__toast) window.__toast('Конфиг переименован', 'success');
                        loadConfigs();
                    } else {
                        throw new Error('Ошибка переименования');
                    }
                } catch (error) {
                    alert(error.message);
                }
            };
        });
    }
    
    waitForAuth();
})();
