let timer;
let startTime;
let elapsedTime = 0;
let isRunning = false;

const timerDisplay = document.getElementById('timerDisplay');
const startPauseButton = document.getElementById('startPauseButton');
const clearButton = document.getElementById('clearButton');
const saveButton = document.getElementById('saveButton');
const modal = document.getElementById('modal');
const modalTime = document.getElementById('modalTime');
const modalValue = document.getElementById('modalValue');
const saveForm = document.getElementById('saveForm');
const filterButton = document.getElementById('filterButton');
const nameCheckboxes = document.getElementById('nameCheckboxes');

startPauseButton.addEventListener('click', startPauseTimer);
clearButton.addEventListener('click', clearTimer);
saveButton.addEventListener('click', openModal);
filterButton.addEventListener('click', filterRecords);

function startPauseTimer() {
    if (isRunning) {
        clearInterval(timer);
        startPauseButton.textContent = 'Start';
    } else {
        startTime = Date.now() - elapsedTime;
        timer = setInterval(updateTimer, 1000);
        startPauseButton.textContent = 'Pause';
    }
    isRunning = !isRunning;
}

function clearTimer() {
    clearInterval(timer);
    elapsedTime = 0;
    timerDisplay.textContent = '00:00:00';
    isRunning = false;
    startPauseButton.textContent = 'Start';
}

function updateTimer() {
    elapsedTime = Date.now() - startTime;
    timerDisplay.textContent = formatTime(elapsedTime);
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

function openModal() {
    clearInterval(timer);

    const modalTime = document.getElementById('modalTime');
    const lootValue = document.getElementById('lootValue');

    // Сохраняем время с таймера в формате HH:MM:SS
    modalTime.value = timerDisplay.textContent;
    modal.style.display = 'block';
}

function filterRecords() {
    const selectedNames = Array.from(document.querySelectorAll('#nameCheckboxes input[type="checkbox"]:checked'))
                                .map(checkbox => checkbox.value);

    const selectedShips = Array.from(document.querySelectorAll('#shipCheckboxes input[type="checkbox"]:checked'))
                                .map(checkbox => checkbox.value);

    const exact = document.getElementById('exactFilter').checked;

    fetch(`/api/filter?name=${selectedNames.join(',')}&ship=${selectedShips.join(',')}&exact=${exact}`)
        .then(response => response.json())
        .then(data => {
            const tbody = document.querySelector('tbody');
            tbody.innerHTML = '';
            data.records.forEach(record => {
                const row = `<tr>
                    <td>${record.record_date || ''}</td>
                    <td>${record.time}</td>
                    <td>${record.value} kk ISK</td>
                    <td>${record.name}</td>
                    <td>${record.notes}</td>
                </tr>`;
                tbody.innerHTML += row;
            });

            // Обновляем информацию о заходах на основе отфильтрованных данных
            document.querySelector('.info-container .most-profitable-value').textContent = `Value: ${data.stats.mostProfitable.value} kk ISK`;
            document.querySelector('.info-container .most-profitable-time').textContent = `Time: ${data.stats.mostProfitable.time}`;
            document.querySelector('.info-container .fastest-run-value').textContent = `Value: ${data.stats.fastestRun.value} kk ISK`;
            document.querySelector('.info-container .fastest-run-time').textContent = `Time: ${data.stats.fastestRun.time}`;
            document.querySelector('.info-container .avg-value').textContent = `Average Value: ${data.stats.avgValue} kk ISK`;
            document.querySelector('.info-container .avg-time').textContent = `Average Time: ${data.stats.avgTime}`;
        })
        .catch(error => console.error('Ошибка:', error));
}




const closeButton = document.querySelector('.close');
closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target == modal) {
        modal.style.display = 'none';
    }
});

const nameInput = document.getElementById('nameInput');
const nameInputHidden = document.getElementById('nameInputHidden');
const selectedNames = document.getElementById('selectedNames');

// Функция для добавления имени в список выбранных
function addName(name) {
    if (name.trim() === '') return;

    const nameBlock = document.createElement('div');
    nameBlock.className = 'name-block';
    nameBlock.textContent = name.trim();
    nameBlock.style.border = '1px solid #ccc';
    nameBlock.style.display = 'inline-block';
    nameBlock.style.padding = '5px';
    nameBlock.style.marginRight = '5px';
    nameBlock.style.cursor = 'pointer';

    // Удаление имени при нажатии
    nameBlock.addEventListener('click', function () {
        selectedNames.removeChild(nameBlock);
        updateHiddenInput();
    });

    selectedNames.appendChild(nameBlock);
    updateHiddenInput();
}

// Обновление скрытого поля с именами
function updateHiddenInput() {
    const names = Array.from(selectedNames.children).map(block => block.textContent);
    nameInputHidden.value = names.join(', ');
}

// Обработка выбора из списка или нажатия Enter
nameInput.addEventListener('change', function () {
    addName(nameInput.value);
    nameInput.value = ''; // Очищаем поле ввода после добавления имени
});

nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        addName(nameInput.value);
        nameInput.value = ''; // Очищаем поле ввода после добавления имени
    }
});

// Изначальное добавление уже введенных имен при загрузке страницы
document.addEventListener('DOMContentLoaded', function () {
    const initialNames = nameInputHidden.value.split(',').map(name => name.trim());
    initialNames.forEach(name => {
        if (name) {
            addName(name);
        }
    });
});

// Обработчик отправки формы
saveForm.addEventListener('submit', function(event) {
    event.preventDefault();

    // Получение значений полей формы
    const lootValue = document.getElementById('lootValue').value.trim(); 
    const shipList = shipInput.value.trim(); // shipInput.value уже содержит список выбранных кораблей через запятую

    // Проверка значений и установка по умолчанию, если они пустые
    const formData = {
        time: modalTime.value,
        name: nameInputHidden.value, // Имена собраны в скрытом поле
        value: lootValue ? parseFloat(lootValue) : 0, // Если lootValue пустое, устанавливаем значение 0
        notes: shipList ? shipList : '' // Если shipList пустой, устанавливаем пустую строку
    };

    console.log('Сохранение данных:', formData);

    fetch('/api/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            modal.style.display = 'none';
            filterRecords(); // Обновляем список после сохранения
        } else {
            alert('Ошибка при сохранении данных');
        }
    })
    .catch(error => console.error('Ошибка:', error));
});


const shipSelection = document.getElementById('shipSelection');
const shipInput = document.getElementById('shipInput');
const selectedShips = new Set();

shipSelection.addEventListener('click', function(e) {
    if (e.target.classList.contains('ship-option')) {
        const ship = e.target.getAttribute('data-value');

        if (selectedShips.has(ship)) {
            selectedShips.delete(ship);
            e.target.classList.remove('selected');
        } else {
            selectedShips.add(ship);
            e.target.classList.add('selected');
        }

        shipInput.value = Array.from(selectedShips).join(', ');
    }
});


document.getElementById('exactFilterContainer').addEventListener('click', function() {
    const checkbox = document.getElementById('exactFilter');
    checkbox.checked = !checkbox.checked;  // Переключаем состояние чекбокса
    this.classList.toggle('selected', checkbox.checked);  // Обновляем стиль контейнера
});
