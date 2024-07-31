const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./db_connect'); // Подключение к базе данных
const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send(`
        <h1>Upload Mining Logs and Data</h1>
        <form id="uploadForm">
            <h2>Upload Mining Logs</h2>
            <textarea name="logs" rows="10" cols="100" placeholder="Enter logs data here..."></textarea><br>
            <h2>Upload Mining Data</h2>
            <textarea name="data" rows="10" cols="100" placeholder="Enter mining data here..."></textarea><br>
            <h2>Upload All Pilots Data</h2>
            <label for="janiceLink">Janice Link:</label><br>
            <input type="text" id="janiceLink" name="janiceLink" placeholder="Enter Janice link"><br>
            <label for="totalPayout">Total Payout:</label><br>
            <input type="number" id="totalPayout" name="totalPayout" placeholder="Enter total payout"><br><br>
            <button type="button" onclick="uploadAll()">Upload All Data</button>
        </form>
        <div id="notification" style="margin-top: 20px;"></div>

        <script>
            function displayNotification(message, isSuccess) {
                const notification = document.getElementById('notification');
                notification.innerText = message;
                notification.style.color = isSuccess ? 'green' : 'red';
                notification.style.backgroundColor = isSuccess ? '#d4edda' : '#f8d7da';
                notification.style.padding = '10px';
                notification.style.borderRadius = '5px';
            }

            function uploadAll() {
                displayNotification('', true);
                const form = document.getElementById('uploadForm');
                const formData = new FormData(form);
                fetch('/upload_all', {
                    method: 'POST',
                    body: new URLSearchParams(formData)
                }).then(response => response.text())
                .then(data => displayNotification(data, true))
                .catch(error => displayNotification('Error uploading data', false));
            }
        </script>
    `);
});

app.post('/upload_all', async (req, res) => {
    const { logs, data, janiceLink, totalPayout } = req.body;
    let dateForAllData;

    // Обработка журнала добычи
    const logsData = logs.trim().split('\n');
    const insertLogsQuery = `
        INSERT INTO mining_logs (date, corporation, miner, material, quantity, volume)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    try {
        for (const log of logsData) {
            const [date, corporation, miner, material, quantity, volume] = log.split('\t');
            dateForAllData = date.replace(/\./g, '-'); // Сохраняем дату для последующего использования
            await connection.promise().execute(insertLogsQuery, [dateForAllData, corporation, miner, material, quantity, volume]);
        }
    } catch (error) {
        console.error('Error uploading logs:', error);
        return res.status(500).send('Error uploading logs');
    }

    // Обработка данных по пилотам
    const pilotData = data.trim().split('\n');
    const insertDataQuery = `
        INSERT INTO mining_data (date, pilot_name, janice_link, total_amount, tax, payout, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        for (const line of pilotData) {
            const [pilot_name, janice_link, total_amount, taxStr] = line.split('\t');
            const total_amountNum = parseFloat(total_amount) || 0;
            const tax = taxStr === 'ОРКА' ? 0 : (parseFloat(taxStr) || 0); // Обработка налога "ОРКА" как 0
            const payout = total_amountNum - tax;
            const status = 'Paid'; // Статус по умолчанию "выплачено"
            await connection.promise().execute(insertDataQuery, [
                dateForAllData, 
                pilot_name || 'Unknown', // Если pilot_name undefined, используем 'Unknown'
                janice_link || 'No Link', // Если janice_link undefined, используем 'No Link'
                total_amountNum, 
                tax, 
                payout, 
                status
            ]);
        }
       }   catch (error) {
        console.error('Error uploading pilot data:', error);
        return res.status(500).send('Error uploading pilot data');
    }

    // Обработка данных для всех пилотов
    const totalAmount = parseFloat(totalPayout) * 10; // Общая сумма = сумма выплат + налог
    const tax = parseFloat(totalPayout); // Налог
    const payout = totalAmount - tax; // Выплата = общая сумма - налог

    const insertAllDataQuery = `
        INSERT INTO mining_data (date, pilot_name, janice_link, total_amount, tax, payout, status)
        VALUES (?, 'ALL', ?, ?, ?, ?, 'Paid')
    `;

    try {
        await connection.promise().execute(insertAllDataQuery, [dateForAllData, janiceLink, totalAmount, tax, payout]);
        res.send('All data uploaded successfully!');
    } catch (error) {
        console.error('Error uploading all pilots data:', error);
        res.status(500).send('Error uploading all pilots data');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
