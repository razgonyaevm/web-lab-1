const CONFIG = {
    SERVER: {
        HOST: window.location.hostname || 'localhost',
        PORT: window.location.port || '8080',
        PATH: '/fcgi-bin/app.jar'
    }
};

// Функция для получения полного URL
function getServerURL() {
    const {HOST, PORT, PATH} = CONFIG.SERVER;
    return `http://${HOST}:${PORT}${PATH}`;
}

// Система уведомлений
class NotificationManager {
    constructor() {
        this.currentToast = null;
        this.removalTimeout = null;
    }

    showToast(options) {
        this.clearAllToasts();

        const toast = document.createElement('div');
        toast.className = 'toast-notification'
        toast.textContent = options.text;

        toast.onclick = () => this.clearAllToasts();
        document.body.appendChild(toast);

        this.currentToast = toast;
        this.removalTimeout = setTimeout(() => this.clearAllToasts(), 3000);
    }

    clearAllToasts() {
        if (this.removalTimeout) {
            clearTimeout(this.removalTimeout);
            this.removalTimeout = null;
        }

        const toasts = document.querySelectorAll('div[style*="position: fixed"][style*="top: 20px"]');
        toasts.forEach(toast => toast.remove());
        this.currentToast = null;
    }
}

class CookieManager {
    static get(name) {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [cookieName, cookieValue] = cookie.trim().split('=');
            if (cookieName === name) {
                return decodeURIComponent(cookieValue);
            }
        }
        return null;
    }

    static set(name, value, days = 365) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = "expires=" + date.toUTCString();
        document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/;SameSite=Strict";
    }

    static delete(name) {
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/";
    }
}

// Генерация безопасного sessionId
function generateSecureSessionId() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Функция для получения или создания sessionId
function getOrCreateSessionId() {
    let sessionId = CookieManager.get('sessionId');

    if (!sessionId || !isValidSessionId(sessionId)) {
        sessionId = 'sess_' + generateSecureSessionId();
        CookieManager.set('sessionId', sessionId);
        console.log('Created new session:', sessionId);
    }

    return sessionId;
}

// Функция для проверки sessionId
function isValidSessionId(sessionId) {
    return sessionId && sessionId.startsWith('sess_') && sessionId.length > 36;
}

const notificationManager = new NotificationManager();

let isSubmitting = false;
let lastSubmissionTime = 0;
let tabId = null;
let currentR = 1; // При запуске приложения R = 1
let points = []; // Массив для хранения всех точек
let previewPoint = null; // Точка для предпросмотра

document.addEventListener("DOMContentLoaded", () => {
    // Генерируем уникальный ID для этой вкладки
    tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Создаем или получаем sessionId при загрузке страницы
    getOrCreateSessionId();

    // Запускаем обновление времени
    updateDateTime();
    setInterval(updateDateTime, 1000); // обновление каждую секунду

    // Настраиваем обработчики формы
    setupFormHandlers();

    // Инициализируем график
    initGraph();

    // Обработчики для радио R
    setupRHandlers();

    // Обработчики для полей ввода (предпросмотр точек)
    setupInputHandlers();

    // Загружаем сохраненные результаты
    loadSavedResults();

    // Очищаем блокировку при закрытии вкладки
    window.addEventListener('beforeunload', function () {
        const globalSubmissionKey = 'form_submission_active';
        const activeSubmission = localStorage.getItem(globalSubmissionKey);
        if (activeSubmission === tabId) {
            localStorage.removeItem(globalSubmissionKey);
        }
    });
});

// Функция для отображения времени
function updateDateTime() {
    const now = new Date();
    const dateTimeString = now.toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const dateTimeElement = document.getElementById('current-time');
    if (dateTimeElement) {
        dateTimeElement.textContent = `Текущее время: ${dateTimeString}`;
    }
}

// Функция для настройки обработчиков полей ввода
function setupInputHandlers() {
    // Обработчики для радио X
    const xInputs = document.querySelectorAll('input[name="x"]');
    xInputs.forEach(input => {
        input.addEventListener('change', updatePreviewPoint);
    });

    // Обработчик для поля Y - замена запятых на точки, валидация ввода в реальном времени
    const yInput = document.querySelector('#y');
    if (yInput) {
        yInput.addEventListener('keydown', function (e) {
            // Разрешено: цифры, точка, запятая, минус, Backspace, Delete, стрелки
            const allowedKeys = [
                'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight',
                'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End'
            ];

            // Разрешено управляющие клавиши
            if (allowedKeys.includes(e.key)) {
                return true;
            }

            // Разрешено цифры
            if (e.key >= '0' && e.key <= '9') {
                return true;
            }

            // Разрешена точка, запятая и минус в начале
            if (e.key === '.' || e.key === ',' || e.key === '-') {
                if (e.key === '-') {
                    if (this.selectionStart !== 0 || this.value.includes('-')) {
                        e.preventDefault();
                        return false;
                    }
                }

                // Проверка, что точка/запятая только одна
                if ((e.key === '.' || e.key === ',') &&
                    (this.value.includes('.') || this.value.includes(','))) {
                    e.preventDefault();
                    return false;
                }
                return true;
            }

            // Запрещено все остальное
            e.preventDefault();
            return false;
        });


        yInput.addEventListener('input', function () {
            // Заменяем запятые на точки в реальном времени
            if (this.value.includes(',')) {
                this.value = this.value.replace(',', '.');
            }

            // Удаляем лишние минусы (оставляем только первый)
            const minusCount = (this.value.match(/-/g) || []).length;
            if (minusCount > 1) {
                this.value = this.value.replace(/-/g, '');
                if (this.value.length > 0 && this.value[0] !== '-') {
                    this.value = '-' + this.value;
                }
            }

            // Удаляем лишние точки (оставляем только первую)
            const dotCount = (this.value.match(/\./g) || []).length;
            if (dotCount > 1) {
                const parts = this.value.split('.');
                this.value = parts[0] + '.' + parts.slice(1).join('');
            }

            // Проверяем, что вход соответствует числовому формату
            if (this.value && !/^-?\d*\.?\d*$/.test(this.value)) {
                // Если ввод невалидный, очищаем предпросмотр
                previewPoint = null;
            }

            updatePreviewPoint();
        });
    }

    // Обработчики для радио R
    const rInputs = document.querySelectorAll('input[name="r"]');
    rInputs.forEach(input => {
        input.addEventListener('change', function () {
            currentR = parseFloat(this.value);
            updatePreviewPoint();
            redrawGraph();
        });
    });
}

// Функция для обновления точки предпросмотра
function updatePreviewPoint() {
    const xVal = getSelectedRadioValue('x');
    const yVal = document.querySelector('#y').value;
    const rVal = getSelectedRadioValue('r');

    if (xVal && yVal && rVal && isValidNumber(yVal)) {
        const x = parseFloat(xVal);
        const y = parseFloat(yVal.replace(',', '.'));
        const r = parseFloat(rVal);

        // Проверяем валидность значений
        if (x >= -5 && x <= 5 && y >= -5 && y <= 5 && r >= 1 && r <= 5) {
            previewPoint = {
                x: x,
                y: y,
                r: r,
                isInArea: checkPointInArea(x, y, r) // Предварительная проверка попадания
            };
        } else {
            previewPoint = null;
        }
    } else {
        previewPoint = null;
    }
    redrawGraph();
}

// Функция для проверки, является ли строка законченным числом
function isValidNumber(str) {
    if (!str) return false;

    // Заменяем запятую на точку для проверки
    const normalizedStr = str.replace(',', '.');

    // Проверяем, что строка представляет собой законченное число
    // (не заканчивается на точку/запятую и не содержит лишних символов)
    return /^-?\d*\.?\d+$/.test(normalizedStr) && !normalizedStr.endsWith('.');
}

// Функция для проверки попадания точки в область (аналогичная серверной логике)
function checkPointInArea(x, y, r) {
    // Квадрат
    const inSquare = (x <= 0 && x >= -r && y >= 0 && y <= r);

    // Треугольник
    const inTriangle = (x <= 0 && x >= -r && y <= 0 && y >= -r && y >= -x - r);

    // Круг
    const inCircle = (x >= 0 && x <= r / 2 && y >= 0 && y <= r / 2 && (x * x + y * y) <= r * r / 4);

    return inSquare || inTriangle || inCircle;
}

// Функция для настройки обработчиков радио R
function setupRHandlers() {
    const rInputs = document.querySelectorAll('input[name="r"]');
    rInputs.forEach(input => {
        input.addEventListener('change', function () {
            currentR = parseFloat(this.value);
            redrawGraph();
        });
    });
}

// Функция для настройки обработчиков формы
function setupFormHandlers() {
    const submitButton = document.querySelector('.submit-btn');
    if (submitButton) {
        submitButton.addEventListener('click', handleFormSubmit);
    }
}

// Функция для перерисовки графика
function redrawGraph() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    drawGraph(ctx, canvas.width, canvas.height, currentR);

    // Перерисовываем все точки после изменения масштаба
    redrawAllPoints();

    // Рисуем точку предпросмотра
    drawPreviewPoint();
}

// Функция для перерисовки всех точек
function redrawAllPoints() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Рисуем все сохраненные точки
    if (points && points.length > 0) {
        points.forEach(point => {
            if (point && point.x !== undefined && point.y !== undefined) {
                // Для сохраненных точек используем исходный радиус и статус
                drawPoint(ctx, point.x, point.y, point.r, point.isInArea, false);
            }
        });
    }
}

// Функция для рисования точки предпросмотра
function drawPreviewPoint() {
    if (!previewPoint) return;

    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    drawPoint(ctx, previewPoint.x, previewPoint.y, currentR, previewPoint.isInArea, true);
}

// Функция для рисования точки
function drawPoint(ctx, x, y, r, isInArea, isPreview = false) {
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const scale = 30;

    // Пересчитываем координаты с учетом масштаба
    const canvasX = centerX + x * scale;
    const canvasY = centerY - y * scale;

    // Рисуем точку
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 4, 0, 2 * Math.PI);

    // Разные цвета для предпросмотра и сохраненных точек
    if (isPreview) {
        ctx.fillStyle = isInArea ? '#00cc00' : '#cc0000'; // Более яркие цвета для предпросмотра
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
    } else {
        ctx.fillStyle = isInArea ? '#00ff00' : '#ff0000';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
    }

    ctx.fill();
    ctx.stroke();

    // Добавляем подпись с координатами только для предпросмотра
    if (isPreview) {
        ctx.font = '10px Arial';
        ctx.fillStyle = '#000';
        ctx.fillText(`(${x.toFixed(2)}, ${y.toFixed(2)})`, canvasX + 5, canvasY - 5);
    }
}

// Обработчик отправки формы
function handleFormSubmit(e) {
    e.preventDefault();

    const currentTime = Date.now();

    // Проверяем временную блокировку
    if (currentTime - lastSubmissionTime < 2000) {
        return;
    }

    // Проверяем глобальную блокировку
    const globalSubmissionKey = 'form_submission_active';
    const activeSubmission = localStorage.getItem(globalSubmissionKey);
    if (activeSubmission && activeSubmission !== tabId) {
        notificationManager.showToast({
            text: "Другая вкладка уже отправляет запрос. Подождите..."
        });
        return;
    }

    // Предотвращаем множественные отправки
    if (isSubmitting) {
        return;
    }

    // Устанавливаем глобальную блокировку
    localStorage.setItem(globalSubmissionKey, tabId);

    // Блокируем кнопку
    isSubmitting = true;
    lastSubmissionTime = currentTime;
    const submitButton = document.querySelector('.submit-btn');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Отправка...";
    }

    // Получаем значения формы
    const xVal = getSelectedRadioValue('x');
    const yVal = document.querySelector('#y').value.replace(',', '.');
    const rVal = getSelectedRadioValue('r');

    if (!xVal || !yVal || !rVal) {
        notificationManager.showToast({
            text: "Пожалуйста, заполните все поля формы"
        });
        resetFormState();
        return;
    }

    // Валидация значения
    if (!validateInputs(xVal, yVal, rVal)) {
        resetFormState();
        return;
    }

    // Обновляем текущее значение R
    currentR = parseFloat(rVal);

    // Подготавливаем данные для отправки
    const formData = new URLSearchParams();
    formData.append('xVal', xVal);
    formData.append('yVal', yVal);
    formData.append('rVal', rVal);

    // Получаем sessionId из cookies
    const sessionId = getOrCreateSessionId();
    formData.append('sessionId', sessionId);

    // Отправляем запрос
    fetch(getServerURL(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Ошибка сервера: ${response.status}`);
            }
            return response.json();
        })
        .then(jsonData => {
            localStorage.setItem("session", JSON.stringify(jsonData));
            updateResultsTable(jsonData.results);

            const lastResultMap = new Map();
            jsonData.results.forEach(result => {
                const key = `${result.x},${result.y}`;
                if (!lastResultMap.has(key)) {
                    lastResultMap.set(key, {
                        x: result.x,
                        y: result.y,
                        r: result.r,
                        isInArea: result.isInArea
                    });
                }
            });
            points = Array.from(lastResultMap.values());

            // Очищаем точку предпросмотра
            previewPoint = null;

            // Перерисовываем график
            redrawGraph();
        })
        .catch(error => {
            console.error('Ошибка:', error);
            notificationManager.showToast({
                text: `Ошибка: ${error.message}`
            });
        })
        .finally(() => {
            resetFormState();
        });
}

// Функция для получения значения выбранной радиокнопки
function getSelectedRadioValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : null;
}

// Функция для валидации входных данных
function validateInputs(xVal, yVal, rVal) {
    const x = parseFloat(xVal);
    const y = parseFloat(yVal.replace(',', '.'));
    const r = parseFloat(rVal);

    // Валидация X
    if (isNaN(x) || ![-3, -2, -1, 0, 1, 2, 3, 4].includes(x)) {
        notificationManager.showToast({
            text: "X должно быть одним из значений: -3, -2, -1, 0, 1, 2, 3, 4"
        });
        return false;
    }

    // Валидация Y
    if (isNaN(y) || y < -5 || y > 5) {
        notificationManager.showToast({
            text: "Y должно быть числом от -5 до 5"
        });
        return false;
    }

    // Валидация R
    if (isNaN(r) || ![1, 2, 3, 4, 5].includes(r)) {
        notificationManager.showToast({
            text: "R должно быть одним из значений: 1, 2, 3, 4, 5"
        });
        return false;
    }

    return true;
}

// Функция для сброса состояния формы
function resetFormState() {
    isSubmitting = false;

    const globalSubmissionKey = 'form_submission_active';
    const activeSubmission = localStorage.getItem(globalSubmissionKey);
    if (activeSubmission === tabId) {
        localStorage.removeItem(globalSubmissionKey);
    }

    const submitButton = document.querySelector('.submit-btn');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Отправить";
    }
}

// Функция для инициализации графика
function initGraph() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    drawGraph(ctx, canvas.width, canvas.height, currentR);
}

// Функция для рисования графика
function drawGraph(ctx, width, height, r) {
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 30;

    // Очищаем canvas
    ctx.clearRect(0, 0, width, height);

    // Рисуем оси
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    // Ось X
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Ось Y
    ctx.beginPath();
    ctx.moveTo(centerX, height);
    ctx.lineTo(centerX, 0);
    ctx.stroke();

    // Стрелки
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(width - 10, centerY - 5);
    ctx.lineTo(width, centerY);
    ctx.lineTo(width - 10, centerY + 5);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX - 5, 10);
    ctx.lineTo(centerX, 0);
    ctx.lineTo(centerX + 5, 10);
    ctx.fill();

    // Подписи осей
    ctx.font = '12px Arial';
    ctx.fillStyle = '#000';
    ctx.fillText('X', width - 15, centerY - 10);
    ctx.fillText('Y', centerX + 10, 15);

    // Засечки и подписи
    const values = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
    values.forEach(val => {
        const xPos = centerX + val * scale;
        const yPos = centerY - val * scale;

        // Засечки на оси X
        ctx.beginPath();
        ctx.moveTo(xPos, centerY - 5);
        ctx.lineTo(xPos, centerY + 5);
        ctx.stroke();
        ctx.fillText(val.toString(), xPos - 5, centerY + 20);

        // Засечки на оси Y
        ctx.beginPath();
        ctx.moveTo(centerX - 5, yPos);
        ctx.lineTo(centerX + 5, yPos);
        ctx.stroke();
        ctx.fillText(val.toString(), centerX - 20, yPos + 5);
    });

    // Рисуем область
    ctx.fillStyle = 'rgba(30, 144, 255, 0.3)';
    ctx.strokeStyle = '#1E90FF';
    ctx.lineWidth = 2;

    // Квадрат
    ctx.beginPath();
    ctx.rect(centerX - r * scale, centerY - r * scale, r * scale, r * scale);
    ctx.fill();
    ctx.stroke();

    // Треугольник
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX - r * scale, centerY);
    ctx.lineTo(centerX, centerY + r * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Четверть круга
    ctx.beginPath();
    ctx.arc(centerX, centerY, r * scale / 2, -Math.PI / 2, 0, false);
    ctx.lineTo(centerX, centerY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Подписи для текущего R
    ctx.font = '10px Arial';
    ctx.fillStyle = '#000';
    ctx.fillText(`R = ${r}`, centerX + 5, centerY - 5);
}

// Функция для обновления таблицы результатов
function updateResultsTable(results) {
    const tbody = document.querySelector('#resultsTable tbody');
    if (!tbody) return;

    if (!results || results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Нет результатов</td></tr>';
        return;
    }

    let html = '';
    results.forEach(result => {
        const resultText = result.isInArea ? 'Да' : 'Нет';
        const resultColor = result.isInArea ? 'green' : 'red';

        html += `
            <tr>
                <td>${result.x}</td>
                <td>${result.y}</td>
                <td>${result.r}</td>
                <td style="color: ${resultColor}">${resultText}</td>
                <td>${result.currentTime}</td>
                <td>${result.executionTime.toFixed(6)} мс</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Функция для загрузки сохраненных результатов
function loadSavedResults() {
    const sessionId = CookieManager.get('sessionId');
    if (sessionId) {
        fetch(`${getServerURL()}?sessionId=${encodeURIComponent(sessionId)}`, {
            method: 'GET'
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error(`Ошибка сервера: ${response.status}`);
            })
            .then(jsonData => {
                if (jsonData && jsonData.results && jsonData.results.length > 0) {
                    updateResultsTable(jsonData.results);

                    // Сохраняем только последние результаты для каждой уникальной координаты (x, y)
                    if (jsonData.results && Array.isArray(jsonData.results)) {
                        const lastResultMap = new Map();
                        jsonData.results.forEach(result => {
                            const key = `${result.x},${result.y}`;
                            if (!lastResultMap.has(key)) {
                                lastResultMap.set(key, {
                                    x: result.x,
                                    y: result.y,
                                    r: result.r,
                                    isInArea: result.isInArea
                                });
                            }
                        });

                        points = Array.from(lastResultMap.values())
                            .filter(point => point.x !== undefined && point.y !== undefined);
                    } else {
                        points = [];
                    }

                    // Устанавливаем текущее R из последнего результата
                    const lastResult = jsonData.results[0];
                    currentR = lastResult.r;

                    // Устанавливаем соответствующую радиокнопку R
                    const rInput = document.querySelector(`input[name="r"][value="${currentR}"]`);
                    if (rInput) {
                        rInput.checked = true;
                    }

                    // Перерисовываем график и точки
                    redrawGraph();
                }
            })
            .catch(error => {
                console.error('Ошибка загрузки результатов:', error);
            });
    }
}

// Функция для очистки сессии
function clearSession() {
    const sessionId = CookieManager.get('sessionId');
    if (!sessionId) {
        notificationManager.showToast({
            text: "Нет активной сессии для очистки"
        });
        return;
    }

    const cleanBtn = document.querySelector('.clean-btn');
    if (cleanBtn) {
        cleanBtn.disabled = true;
        cleanBtn.textContent = "Очистка...";
    }

    // Отправляем запрос на очистку сессии
    fetch(`${getServerURL()}?sessionId=${encodeURIComponent(sessionId)}&action=clear`, {
        method: 'DELETE'
    })
        .then(response => {
            if (response.ok) {
                // Очищаем cookie сессии
                CookieManager.delete('sessionId');

                // Очищаем таблицу результатов
                updateResultsTable([]);

                // Очищаем точки на графике
                points = [];
                previewPoint = null;
                redrawGraph();

                notificationManager.showToast({
                    text: "Сессия успешно очищена"
                });
            } else {
                throw new Error(`Ошибка сервера: ${response.status}`);
            }
        })
        .catch(error => {
            console.error('Ошибка очистки сессии:', error);
            notificationManager.showToast({
                text: `Ошибка очистки сессии: ${error.message}`
            });
        })
        .finally(() => {
            if (cleanBtn) {
                cleanBtn.disabled = false;
                cleanBtn.textContent = "Очистить сессию";
            }
        });
}