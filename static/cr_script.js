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

saveForm.addEventListener('submit', function(event) {
    event.preventDefault();

    const formData = {
        time: modalTime.value, // Время с таймера в формате HH:MM:SS
        value: lootValue.value, // Сумма лута, введенная в модальном окне
        name: saveForm.name.value,
        notes: saveForm.notes.value
    };

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


function filterRecords() {
    const selectedNames = Array.from(nameCheckboxes.querySelectorAll('input[type="checkbox"]:checked'))
                                .map(checkbox => checkbox.value);

    fetch(`/api/filter?name=${selectedNames.join(',')}`)
        .then(response => response.json())
        .then(data => {
            const tbody = document.querySelector('tbody');
            tbody.innerHTML = '';
            data.records.forEach(record => {
                const row = `<tr>
                    <td>${record.time}</td>
                    <td>${record.value}</td>
                    <td>${record.name}</td>
                    <td>${record.notes}</td>
                </tr>`;
                tbody.innerHTML += row;
            });
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
