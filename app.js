const express = require('express');
const path = require('path');
const app = express();
const port = 8080; // Порт, на котором будет запущен сервер

// Путь к папке со статическими файлами
const staticPath = path.join(__dirname, 'static');
app.use(express.static(staticPath));

// Путь к папке с шаблонами HTML
const templatesPath = path.join(__dirname, 'templates');

// Основной маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(templatesPath, 'index.html'));
});

app.get('/officers', (req, res) => {
    res.sendFile(path.join(templatesPath, 'officers.html'));
});

// Запускаем сервер
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
