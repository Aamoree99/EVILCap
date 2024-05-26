const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = 8080; // Порт, на котором будет запущен сервер
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = 'https://evil-capybara.space/callback';
const scope = 'publicData esi-skills.read_skills.v1 esi-fleets.write_fleet.v1';

// Настройка сессий
app.use(session({
    secret: process.env.SESSION_SECRET, // Замените на ваш секретный ключ
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Используйте true для HTTPS
}));

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

        // Сохраняем информацию о пользователе в сессии
        req.session.characterName = characterData.CharacterName;
        req.session.characterID = characterData.CharacterID;
        req.session.accessToken = access_token;

        // Перенаправление на страницу homefront_waitlist
        res.redirect('/hf_waitlist');
    } catch (error) {
        console.error('Ошибка при обмене кодов:', error);
        res.status(500).send('Ошибка при обмене кодов');
    }
});

app.get('/hf_waitlist', (req, res) => {
    res.sendFile(path.join(templatesPath, 'homefront_waitlist.html'));
});

app.get('/hf_guides', (req, res) => {
    res.sendFile(path.join(templatesPath, 'guides.html'));
});

app.get('/hf_skills', (req, res) => {
    res.sendFile(path.join(templatesPath, 'skills.html'));
});

app.get('/login', (req, res) => {
    const state = generateState();
    stateStore.set(state, state); // Сохраняем состояние
    const authUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    res.redirect(authUrl);
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send({ message: 'Logout failed' });
        }
        res.send({ message: 'Logged out successfully' });
    });
});

app.get('/user-info', (req, res) => {
    if (req.session.characterName) {
        res.send({
            characterName: req.session.characterName,
            characterID: req.session.characterID,
            accessToken: req.session.accessToken
        });
    } else {
        res.status(401).send({ message: 'Not authenticated' });
    }
});

app.get('/user-skills', async (req, res) => {
    if (!req.session.accessToken || !req.session.characterID) {
        return res.status(401).send({ message: 'Not authenticated' });
    }

    try {
        const skillsResponse = await axios.get(`https://esi.evetech.net/latest/characters/${req.session.characterID}/skills/`, {
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`
            }
        });

        const skillIds = skillsResponse.data.skills.map(skill => skill.skill_id);
        const namesResponse = await axios.post('https://esi.evetech.net/latest/universe/names/', skillIds, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const skillsWithNames = skillsResponse.data.skills.map(skill => {
            const skillName = namesResponse.data.find(name => name.id === skill.skill_id).name;
            return {
                name: skillName,
                level: skill.trained_skill_level
            };
        });
        console.log(skillsWithNames);
        res.send({ skills: skillsWithNames });
    } catch (error) {
        console.error('Ошибка при получении скиллов:', error);
        res.status(500).send('Ошибка при получении скиллов');
    }
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
