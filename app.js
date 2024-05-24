const express = require('express');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
require('dotenv').config();
const app = express();
const port = 8080; // Порт, на котором будет запущен сервер
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = 'http://localhost:8080/callback';
const scope = 'publicData esi-skills.read_skills.v1 esi-fleets.write_fleet.v1';
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

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const storedState = stateStore.get(state);

    if (!code || !state || storedState !== state) {
        return res.status(400).send('Invalid state parameter.');
    }

    stateStore.delete(state); // Удаляем состояние после использования

    try {
        const response = await axios.post('https://login.eveonline.com/v2/oauth/token', querystring.stringify({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri
        }), {
            auth: {
                username: clientId,
                password: clientSecret
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token } = response.data;

        // Получение информации о персонаже
        const characterResponse = await axios.get('https://esi.evetech.net/verify/', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const characterData = characterResponse.data;

        // Перенаправление на страницу homefront_waitlist с параметрами
        res.redirect(`/hf_waitlist?characterName=${characterData.CharacterName}&characterID=${characterData.CharacterID}&accessToken=${access_token}`);
    } catch (error) {
        console.error('Ошибка при обмене кодов:', error);
        res.status(500).send('Ошибка при обмене кодов');
    }
});

app.get('/hf_waitlist', (req, res) => {
    res.sendFile(path.join(templatesPath, 'homefront_waitlist.html'));
});

app.get('/login', (req, res) => {
    const state = generateState();
    stateStore.set(state, state); // Сохраняем состояние
    const authUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    res.redirect(authUrl);
});

const stateStore = new Map();

// Генерация случайного состояния
function generateState() {
    return crypto.randomBytes(16).toString('hex');
}
// Запускаем сервер
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
