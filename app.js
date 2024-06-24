const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
require('dotenv').config();
const { client, fleetNotify, deleteVoiceChannelByFc } = require('./bot');

const app = express();
const port = 8080; // Порт, на котором будет запущен сервер
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = 'https://evil-capybara.space/callback';
const scope = 'publicData esi-skills.read_skills.v1 esi-fleets.read_fleet.v1 esi-fleets.write_fleet.v1';

const stateStore = new Map();
const rooms = new Map();

app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET, // Замените на ваш секретный ключ
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Используйте true для HTTPS
        maxAge: 15 * 60 * 1000 // Установить время жизни сессии на 24 часа (в миллисекундах)
    }

}));

const staticPath = path.join(__dirname, 'static');
app.use(express.static(staticPath));

const templatesPath = path.join(__dirname, 'templates');

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

app.post('/close-fleet', async (req, res) => {
    const roomId = req.query.roomId;
    const room = rooms.get(roomId);
    if (!room) {
        return res.status(400).send({ success: false, message: 'Room not found.' });
    }

    try {
        await deleteVoiceChannelByFc(room.fc);
        rooms.delete(roomId);
        res.send({ success: true });
    } catch (error) {
        console.error('Error closing room:', error);
        res.status(500).send({ success: false, message: 'Internal server error' });
    }
});

app.post('/submit-fit', (req, res) => {
    const { roomId, fit } = req.body;
    const room = rooms.get(roomId);
    if (room) {
        const member = {
            name: req.session.characterName,
            id: req.session.characterID,
            fit: fit,
            status: 'pending'
        };

        if (isValidFit(fit, room.eventType)) {
            member.status = 'approved';
        } else {
            member.status = 'yellow';
        }

        room.waitlist.push(member);
        res.send({ success: true });
    } else {
        res.status(404).send({ success: false, message: 'Room not found' });
    }
});

function isValidFit(fit, eventType) {
    const validFits = {
        'Metaliminal Meteoroid': [
            '[Venture, HF_T2]\nMining Laser Upgrade II\n\nSmall F-S9 Regolith Compact Shield Extender\nCompact EM Shield Hardener\nMedium Shield Extender II\n\nMiner II\nMiner II\n\nSmall EM Shield Reinforcer I\nSmall Thermal Shield Reinforcer I\nSmall Thermal Shield Reinforcer I',
            '[Venture, HF_T1]\nMining Laser Upgrade I\n\nSmall Azeotropic Restrained Shield Extender\nMedium Shield Extender I\nCompact EM Shield Hardener\n\nMiner I\nMiner I\n\nSmall EM Shield Reinforcer I\nSmall Thermal Shield Reinforcer I\nSmall Thermal Shield Reinforcer I',
            '[Osprey, HF_LOGI]\nDamage Control II\nCapacitor Power Relay II\nCapacitor Power Relay II\n\nMultispectrum Shield Hardener II\nLarge Shield Booster II\nDread Guristas Thermal Shield Hardener\nCopasetic Compact Shield Boost Amplifier\nEM Shield Hardener II\n\nSmall Remote Shield Booster II\nSmall Remote Shield Booster II\nSmall Remote Shield Booster II\nSmall Remote Shield Booster II\n\nMedium EM Shield Reinforcer II\nMedium Capacitor Control Circuit II\nMedium Capacitor Control Circuit II'
        ],
        'Emergency Assistance': [
            '[Augoror, Augoror]\nDamage Control II\nCapacitor Power Relay II\nCapacitor Power Relay II\nCapacitor Power Relay II\nCompact Multispectrum Energized Membrane\n\nMedium Cap Battery II\nCap Recharger II\nCap Recharger II\n\nMedium Coaxial Compact Remote Armor Repairer\nMedium Coaxial Compact Remote Armor Repairer\nMedium Coaxial Compact Remote Armor Repairer\nMedium Coaxial Compact Remote Armor Repairer\nMedium Coaxial Compact Remote Armor Repairer\n\nMedium Capacitor Control Circuit I\nMedium Capacitor Control Circuit I\nMedium Targeting System Subcontroller I'
        ],
        'Dreadnought Attack': [
            '[Augoror, Dreadnought]\nCorpus C-Type Explosive Armor Hardener\nCorpus C-Type Explosive Armor Hardener\nReactive Armor Hardener\n\'Meditation\' Medium Armor Repairer I\n\'Meditation\' Medium Armor Repairer I\n\nRepublic Fleet Large Cap Battery\nCap Recharger II\nCap Recharger II\n\nMedium Inductive Compact Remote Capacitor Transmitter\nMedium Inductive Compact Remote Capacitor Transmitter\nMedium Inductive Compact Remote Capacitor Transmitter\n\nMedium Capacitor Control Circuit I\nMedium Semiconductor Memory Cell II\nMedium Semiconductor Memory Cell II'
        ]
    };

    if (!validFits[eventType]) return false;

    const fitLines = fit.trim().split('\n').map(line => line.trim()).filter(line => line);
    const firstLine = fitLines.shift();
    const fitShipType = firstLine.split(',')[0].trim().toLowerCase();

    return validFits[eventType].some(validFit => {
        const validFitLines = validFit.trim().split('\n').map(line => line.trim()).filter(line => line);
        const validFirstLine = validFitLines.shift();
        const validShipType = validFirstLine.split(',')[0].trim().toLowerCase();

        if (fitShipType !== validShipType) return false;

        return arraysEqualIgnoreOrder(fitLines, validFitLines);
    });
}

function arraysEqualIgnoreOrder(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = a.slice().sort();
    const sortedB = b.slice().sort();
    return sortedA.every((value, index) => value === sortedB[index]);
}

app.get('/hf_waitlist', (req, res) => {
    res.sendFile(path.join(templatesPath, 'homefront_waitlist.html'));
});

app.post('/create-room', async (req, res) => {
    const { eventType, languages, fc } = req.body;
    try {
        let fleetId;

        try {
            const fleetResponse = await axios.get(`https://esi.evetech.net/latest/characters/${req.session.characterID}/fleet/?datasource=tranquility`, {
                headers: {
                    'Authorization': `Bearer ${req.session.accessToken}`
                }
            });

            fleetId = fleetResponse.data.fleet_id;

            if (!fleetId) {
                return res.status(400).send({ success: false, message: 'You need to create a fleet first.' });
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return res.status(404).send({ success: false, message: 'You need to create a fleet first.' });
            } else {
                throw error;
            }
        }

        const motd = `<font size="14" color="#bfffffff"><br>Welcome!</font><br><br><font size="14" color="#ffffe400"><a href="http://discord.gg/mnbdwprRf9">Discord</a><br><br></font><font size="14" color="#ff6868e1"><a href="joinChannel:player_c0e784e11ca311efa2de00109bd0f828">Capybara HF</a></font>`;

        await axios.put(`https://esi.evetech.net/latest/fleets/${fleetId}/`, {
            is_free_move: true,
            motd: motd
        }, {
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`
            }
        });

        if (!eventType || !languages || !languages.length) {
            return res.status(400).send({ success: false, message: 'Event Type and Languages are required.' });
        }

        const roomId = crypto.randomBytes(16).toString('hex');
        const result = await fleetNotify(fc, eventType);

        if (result.success) {
            rooms.set(roomId, { id: roomId, eventType, languages, fc, fleetId, waitlist: [] });
            res.send({ success: true });
        } else {
            res.status(500).send({ success: false, message: 'Error notifying fleet' });
        }
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).send({ success: false, message: 'Internal server error' });
    }
});


app.get('/get-rooms', (req, res) => {
    const roomArray = Array.from(rooms.values());
    res.send({ rooms: roomArray });
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
        res.send({ skills: skillsWithNames });
    } catch (error) {
        console.error('Ошибка при получении скиллов:', error);
        res.status(500).send('Ошибка при получении скиллов');
    }
});

app.get('/get-waitlist', (req, res) => {
    const { roomId } = req.query;
    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).send({ success: false, message: 'Room not found.' });
    }
    res.send({ success: true, waitlist: room.waitlist });
});

app.post('/approve-member', (req, res) => {
    const { roomId, memberId } = req.body;
    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).send({ success: false, message: 'Room not found.' });
    }
    const member = room.waitlist.find(m => m.id === memberId);
    if (!member) {
        return res.status(404).send({ success: false, message: 'Member not found.' });
    }
    member.status = 'green';
    res.send({ success: true });
});

app.post('/reject-member', (req, res) => {
    const { roomId, memberId } = req.body;
    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).send({ success: false, message: 'Room not found.' });
    }
    const memberIndex = room.waitlist.findIndex(m => m.id === memberId);
    if (memberIndex === -1) {
        return res.status(404).send({ success: false, message: 'Member not found.' });
    }
    room.waitlist.splice(memberIndex, 1);
    res.send({ success: true });
});


app.post('/invite-to-fleet', (req, res) => {
    const { roomId, memberId } = req.body;
    const room = rooms.get(roomId);
    
    if (room && req.session.characterName === room.fc) {
        const memberIndex = room.waitlist.findIndex(m => m.id === memberId);
        if (memberIndex !== -1) {
            const member = room.waitlist[memberIndex];

            // Отправка приглашения через API
            axios.post(`https://esi.evetech.net/latest/fleets/${room.fleetId}/members/`, {
                character_id: memberId,
                role: 'squad_member'
            }, {
                headers: {
                    'Authorization': `Bearer ${req.session.accessToken}`,
                    'Content-Type': 'application/json'
                }
            })
            .then(apiResponse => {
                if (apiResponse.status === 204) {
                    res.send({ success: true });

                    // Планируем проверку через 2 минуты
                    setTimeout(() => {
                        axios.get(`https://esi.evetech.net/latest/fleets/${room.fleetId}/members/`, {
                            headers: {
                                'Authorization': `Bearer ${req.session.accessToken}`
                            }
                        })
                        .then(fleetResponse => {
                            const members = fleetResponse.data;
                            const isMemberInFleet = members.some(m => m.character_id === memberId);

                            if (isMemberInFleet) {
                                room.waitlist.splice(memberIndex, 1);
                                console.log(`Member ${memberId} removed from waitlist`);
                            } else {
                                console.log(`Member ${memberId} not found in fleet`);
                            }
                        })
                        .catch(error => {
                            console.error('Error checking fleet members:', error);
                        });
                    }, 2 * 60 * 1000); // 2 минуты в миллисекундах

                } else {
                    res.status(500).send({ success: false, message: 'API error' });
                }
            })
            .catch(error => {
                console.error('API error:', error);
                res.status(500).send({ success: false, message: 'API error' });
            });
        } else {
            res.status(404).send({ success: false, message: 'Member not found' });
        }
    } else {
        res.status(403).send({ success: false, message: 'Not authorized or room not found' });
    }
});
function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
