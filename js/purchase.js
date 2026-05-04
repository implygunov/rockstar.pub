// Модальное окно покупки
let currentPlanData = {};
let currentDiscount = 0;

function openModal(planName, price, period, summaryPlan, summaryPeriod, summaryTotal) {
    const modal = document.getElementById('purchaseModal');
    document.getElementById('modalPlanName').textContent = planName;
    document.getElementById('modalPrice').textContent = price;
    document.getElementById('modalPeriod').textContent = period;
    document.getElementById('summaryPlan').textContent = summaryPlan;
    document.getElementById('summaryPeriod').textContent = summaryPeriod;
    document.getElementById('summaryTotal').textContent = summaryTotal;
    
    // Сохраняем данные тарифа
    currentPlanData = {
        planName: planName,
        planType: summaryPlan,
        amount: parseFloat(price.replace(/[^\d]/g, '')),
        originalTotal: summaryTotal
    };
    
    // Сбрасываем промокод
    currentDiscount = 0;
    document.getElementById('promoInput').value = '';
    document.getElementById('promoResult').style.display = 'none';
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Проверка промокода
async function checkPromocode() {
    const promoInput = document.getElementById('promoInput');
    const promoResult = document.getElementById('promoResult');
    const code = promoInput.value.trim();

    if (!code) {
        promoResult.className = 'promo-result error';
        promoResult.textContent = 'Введите промокод';
        promoResult.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE_URL}/payment/check-promocode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (data.valid) {
            currentDiscount = data.discount;
            const newAmount = currentPlanData.amount * (1 - data.discount / 100);
            
            promoResult.className = 'promo-result success';
            promoResult.textContent = `✅ Промокод применен! Скидка ${data.discount}%`;
            promoResult.style.display = 'block';
            
            // Обновляем итоговую цену
            document.getElementById('summaryTotal').textContent = Math.round(newAmount) + '₽';
            
            if (window.__toast) {
                window.__toast(`Скидка ${data.discount}% применена!`, 'success');
            }
        } else {
            currentDiscount = 0;
            promoResult.className = 'promo-result error';
            promoResult.textContent = '❌ ' + (data.error || 'Промокод недействителен');
            promoResult.style.display = 'block';
            
            // Возвращаем оригинальную цену
            document.getElementById('summaryTotal').textContent = currentPlanData.originalTotal;
        }
    } catch (error) {
        console.error('Check promocode error:', error);
        promoResult.className = 'promo-result error';
        promoResult.textContent = '❌ Ошибка проверки промокода';
        promoResult.style.display = 'block';
    }
}

function closeModal() {
    const modal = document.getElementById('purchaseModal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

async function submitPurchase() {
    const selectedPayment = document.querySelector('input[name="payment"]:checked').value;
    
    if (selectedPayment === 'card' || selectedPayment === 'qiwi') {
        if (window.__toast) {
            window.__toast('Временно недоступно', 'error', 3000);
        } else {
            alert('Временно недоступно');
        }
    } else if (selectedPayment === 'crypto') {
        // Проверяем авторизацию
        const token = localStorage.getItem('jwtToken');
        if (!token) {
            if (window.__toast) {
                window.__toast('Необходимо авторизоваться', 'error', 3000);
            }
            setTimeout(() => {
                window.location.href = '/signin.html';
            }, 1000);
            return;
        }

        try {
            if (window.__toast) {
                window.__toast('Создание инвойса...', 'info', 2000);
            }

            const promocode = document.getElementById('promoInput').value.trim();

            const response = await fetch(`${window.API_BASE_URL}/payment/create-invoice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify({
                    planType: currentPlanData.planType,
                    amount: currentPlanData.amount,
                    promocode: promocode || null
                })
            });

            const data = await response.json();

            console.log('Server response:', data);

            if (response.ok && data.success) {
                if (window.__toast) {
                    window.__toast('Перенаправление на оплату...', 'success', 2000);
                }
                
                // Закрываем модалку
                closeModal();
                
                // Открываем страницу оплаты
                setTimeout(() => {
                    window.open(data.payUrl, '_blank');
                    
                    // Начинаем проверять статус платежа
                    checkPaymentStatus(data.invoiceId);
                }, 500);
            } else {
                throw new Error(data.error || 'Ошибка создания инвойса');
            }

        } catch (error) {
            console.error('Payment error:', error);
            if (window.__toast) {
                window.__toast(error.message, 'error', 3000);
            } else {
                alert(error.message);
            }
        }
    }
}

// Проверка статуса платежа
async function checkPaymentStatus(invoiceId) {
    const token = localStorage.getItem('jwtToken');
    let attempts = 0;
    const maxAttempts = 60; // 5 минут (каждые 5 секунд)

    const checkInterval = setInterval(async () => {
        attempts++;

        try {
            const response = await fetch(`${window.API_BASE_URL}/payment/check/${invoiceId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include'
            });

            const data = await response.json();

            if (data.paid) {
                clearInterval(checkInterval);
                if (window.__toast) {
                    window.__toast('Оплата успешна! Подписка активирована', 'success', 5000);
                }
                
                // Перезагружаем страницу через 2 секунды
                setTimeout(() => {
                    window.location.href = '/profile';
                }, 2000);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                if (window.__toast) {
                    window.__toast('Время ожидания истекло. Проверьте профиль позже', 'info', 5000);
                }
            }
        } catch (error) {
            console.error('Check payment error:', error);
        }
    }, 5000); // Проверяем каждые 5 секунд
}

// Закрытие по клику вне модального окна
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('purchaseModal');
    
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    }

    // Закрытие по ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (modal && modal.style.display === 'flex') {
                closeModal();
            }
        }
    });
});
