const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const connection = require('./db_connect');
const mysql = require('mysql2');
const moment = require('moment');
const querystring = require('querystring');
const crypto = require('crypto');
require('dotenv').config();
const { client, fleetNotify, deleteVoiceChannelByFc } = require('./bot');
const lpApp = require('./lp_app');

const app = express();
const port = 8080; 
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = 'https://evil-capybara.space/callback';
const scope = 'publicData esi-skills.read_skills.v1 esi-fleets.read_fleet.v1 esi-fleets.write_fleet.v1';

const stateStore = new Map();
const rooms = new Map();
let dailyData = {};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: process.env.SESSION_SECRET, 
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, 
        maxAge: 15 * 60 * 1000 
    }

}));

const staticPath = path.join(__dirname, 'static');
app.use(express.static(staticPath));
app.use('/static', express.static(path.join(__dirname, 'static')));


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

    stateStore.delete(state); 

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

app.get('/upload', (req, res) => {
    res.sendFile(path.join(templatesPath, 'upload.html'));
});

app.post('/upload', async (req, res) => {
    const percentage = parseFloat(req.body.percentage) / 100;
    const rawData = req.body.log_data;

    if (!rawData) {
        console.error('No data received');
        return res.status(400).send('No data received');
    }

    const data = parseRawData(rawData);
    await insertIntoMiningLogs(data);
    await processMiningData(data, percentage);

    res.redirect('/logs');
});

function parseRawData(rawData) {
    const lines = rawData.split('\n');
    return lines.map(line => {
        const [date, corporation, altName, oreType, quantity, volume] = line.split('\t');
        return { date, corporation, altName, oreType, quantity, volume };
    });
}

app.get('/logs', async (req, res) => {
    try {
        const selectedDate = req.query.date || moment().format('YYYY-MM-DD');

        // Форматирование даты в логах и суммарных данных
        const [summaryResults] = await connection.promise().query('SELECT * FROM mining_data WHERE date = ? ORDER BY pilot_name', [selectedDate]);
        const [logResults] = await connection.promise().query('SELECT * FROM mining_logs WHERE date = ? ORDER BY date DESC, corporation, miner', [selectedDate]);
        const [uniqueDatesResults] = await connection.promise().query(
            'SELECT DISTINCT date FROM mining_data UNION SELECT DISTINCT date FROM mining_logs'
        );


        const formatNumber = (num) => {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ISK', minimumFractionDigits: 2 }).format(num).replace('ISK', '') + ' ISK';
        };

        // Преобразование формата дат
        const formattedSummaryResults = summaryResults.map(row => ({
            ...row,
            date: moment(row.date).format('YYYY-MM-DD')
        }));

        const formattedLogResults = logResults.map(row => ({
            ...row,
            date: moment(row.date).format('YYYY-MM-DD')
        }));

        const highlightedDates = uniqueDatesResults.map(row => moment(row.date).format('YYYY-MM-DD'));

        res.render('logs', { 
            summaryData: formattedSummaryResults, 
            logData: formattedLogResults, 
            selectedDate, 
            highlightedDates,
            formatNumber: formatNumber
        });
    } catch (err) {
        console.error('Ошибка получения данных:', err);
        res.status(500).send('Ошибка сервера');
    }
});

async function insertIntoMiningLogs(data) {
    const query = 'INSERT INTO mining_logs (date, corporation, miner, material, quantity, volume) VALUES ?';
    const values = data.map(item => [item.date, item.corporation, item.altName, item.oreType, item.quantity, item.volume]);
    await connection.promise().query(query, [values]);
}


async function processMiningData(data, percentage) {
    const altsMap = await getAltsMap();
    const pilotsData = {};
    const allData = {};

    const date = data[0].date; 

    data.forEach(item => {
        const altName = item.altName;
        const mainName = altsMap[altName] || altName;
        const oreType = item.oreType;
        const quantity = parseInt(item.quantity, 10);

        if (!pilotsData[mainName]) pilotsData[mainName] = {};
        if (!pilotsData[mainName][oreType]) pilotsData[mainName][oreType] = 0;
        pilotsData[mainName][oreType] += quantity;

        if (!allData[oreType]) allData[oreType] = 0;
        allData[oreType] += quantity;
    });

    for (const [pilot, ores] of Object.entries(pilotsData)) {
        const requestBody = formatRequestBody(ores);
        const response = await getJaniceData(requestBody, percentage);
        const janiceLink = response.janiceLink;
        const totalBuyPrice = response.totalBuyPrice;
        const tax = totalBuyPrice * 0.1;
        const payout = totalBuyPrice - tax;

        insertIntoMiningData({
            date: date, 
            pilot_name: pilot,
            janice_link: janiceLink,
            total_amount: totalBuyPrice,
            tax,
            payout
        });
    }

    const allRequestBody = formatRequestBody(allData);
    const allResponse = await getJaniceData(allRequestBody, percentage);
    const allJaniceLink = allResponse.janiceLink;
    const allTotalBuyPrice = allResponse.totalBuyPrice;
    const allTax = allTotalBuyPrice * 0.1;
    const allPayout = allTotalBuyPrice - allTax;

    insertIntoMiningData({
        date: date, 
        pilot_name: 'ALL',
        janice_link: allJaniceLink,
        total_amount: allTotalBuyPrice,
        tax: allTax,
        payout: allPayout
    });
}

async function getAltsMap() {
    const query = 'SELECT alt_name, main_name FROM alts';
    const [results] = await connection.promise().query(query);
    return results.reduce((map, row) => {
        map[row.alt_name] = row.main_name;
        return map;
    }, {});
}

function formatRequestBody(ores) {
    return Object.entries(ores).map(([oreType, quantity]) => `${oreType}\t${quantity}`).join('\n');
}

async function getJaniceData(requestBody, percentage) {
    const apiKey = 'G9KwKq3465588VPd6747t95Zh94q3W2E';
    const apiUrl = `https://janice.e-351.com/api/rest/v2/appraisal?market=2&designation=appraisal&pricing=sell&pricingVariant=immediate&persist=true&compactize=true&pricePercentage=${percentage}`;
    const response = await axios.post(apiUrl, requestBody, {
        headers: {
            'accept': 'application/json',
            'X-ApiKey': apiKey,
            'Content-Type': 'text/plain'
        }
    });
    const data = response.data;
    return {
        janiceLink: `https://janice.e-351.com/a/${data.code}`,
        totalBuyPrice: data.effectivePrices.totalBuyPrice
    };
}


function insertIntoMiningData({ date, pilot_name, janice_link, total_amount, tax, payout }) {
    const query = 'INSERT INTO mining_data (date, pilot_name, janice_link, total_amount, tax, payout) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(query, [date, pilot_name, janice_link, total_amount, tax, payout], (err, results) => {
        if (err) {
            console.error('Ошибка вставки данных:', err);
        } 
    });
}

app.get('/moon', async (req, res) => {
    try {
        // Получение последней уникальной даты и данных по этой дате
        const [latestDateResult] = await connection.promise().query(`SELECT MAX(date) as date FROM mining_logs`);
        const latestDate = latestDateResult[0].date;
        const [latestData] = await connection.promise().query(`SELECT * FROM mining_logs WHERE date = ?`, [latestDate]);

        const currentYearMonth = new Date().toISOString().slice(0, 7); // Формат 'YYYY-MM'

        // Запрос для топа по количеству за текущий месяц
        const [topQuantity] = await connection.promise().query(`
            SELECT miner, SUM(quantity) as quantity
            FROM mining_logs
            WHERE DATE_FORMAT(date, '%Y-%m') = ?
            GROUP BY miner
            ORDER BY quantity DESC
            LIMIT 1
        `, [currentYearMonth]);
        // Запрос для топа по объему за текущий месяц
        const [topVolume] = await connection.promise().query(`
            SELECT miner, SUM(volume) as volume
            FROM mining_logs
            WHERE DATE_FORMAT(date, '%Y-%m') = ?
            GROUP BY miner
            ORDER BY volume DESC
            LIMIT 1
        `, [currentYearMonth]);
        
        // Запрос для топа по выплатам за текущий месяц
        const [topPayout] = await connection.promise().query(`
            SELECT pilot_name, SUM(payout) as payout
            FROM mining_data
            WHERE pilot_name != 'ALL' AND DATE_FORMAT(date, '%Y-%m') = ?
            GROUP BY pilot_name
            ORDER BY payout DESC
            LIMIT 1
        `, [currentYearMonth]);

        const formattedDate = moment(latestDate).format('YYYY-MM-DD');

        const formatNumber = (num) => {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ISK', minimumFractionDigits: 2 }).format(num).replace('ISK', '');
        };

        res.render('moon', {
            topQuantity: topQuantity[0],
            topVolume: topVolume[0],
            topPayout: topPayout[0],
            latestData: latestData,
            latestDate: formattedDate,
            formatNumber: formatNumber,
            dailyData: dailyData
          });          
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).send('Server error');
    }
});

app.get('/stats', async (req, res) => {
    try {
        // Получение данных из временной таблицы pilot_stats
        const [pilotStats] = await connection.promise().query(`
            SELECT 
                pilot_name,
                total_earned,
                total_quantity,
                total_volume
            FROM pilot_stats
            ORDER BY total_earned DESC
        `);

        res.render('stats', {
            pilotStats: pilotStats
        });
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).send('Server error');
    }
});

function formatNumber(number) {
    return Number(number).toLocaleString('en-US').replace(/,/g, ' ');
}


function fetchDataFromDB() {
    connection.query('SELECT SUM(volume) AS volume_sum, SUM(quantity) AS quantity_sum FROM mining_logs', (err, res1) => {
      if (err) throw err;
      const { volume_sum, quantity_sum } = res1[0];
  
      connection.query('SELECT SUM(payout) AS payout_sum, SUM(tax) AS tax_sum FROM mining_data WHERE pilot_name = "ALL"', (err, res2) => {
        if (err) throw err;
        const { payout_sum, tax_sum } = res2[0];
  
        connection.query('SELECT material FROM mining_logs', (err, res3) => {
          if (err) throw err;
          const materials = res3.map(row => row.material.replace('*', ''));
  
          const materialCount = {};
          materials.forEach(material => {
            if (materialCount[material]) {
              materialCount[material]++;
            } else {
              materialCount[material] = 1;
            }
          });
  
          const mostCommonMaterial = Object.keys(materialCount).reduce((a, b) => materialCount[a] > materialCount[b] ? a : b);
  
          dailyData = {
            volume_sum: `${formatNumber(volume_sum)} m³`,
            quantity_sum: `${formatNumber(quantity_sum)} qty.`,
            payout_sum: `${formatNumber(payout_sum)} ISK`,
            tax_sum: `${formatNumber(tax_sum)} ISK`,
            most_common_material: mostCommonMaterial
          };          
  
        });
      });
    });
  }

  async function recalculatePilotStats() {
    try {
        // Очистка таблицы pilot_stats
        await connection.promise().query('TRUNCATE TABLE pilot_stats');

        // Подсчет и агрегация данных из таблицы mining_logs
        const [miningLogsResults] = await connection.promise().query(`
            SELECT 
                miner AS pilot_name,
                SUM(quantity) AS total_quantity,
                SUM(volume) AS total_volume
            FROM mining_logs
            GROUP BY miner
        `);

        // Подсчет и агрегация данных из таблицы mining_data
        const [miningDataResults] = await connection.promise().query(`
            SELECT 
                pilot_name,
                SUM(payout) AS total_earned
            FROM mining_data
            WHERE pilot_name != 'ALL'
            GROUP BY pilot_name
        `);

        // Создание мапы для удобного обновления данных
        const pilotStatsMap = new Map();

        // Обновление мапы данными из mining_logs
        miningLogsResults.forEach(row => {
            pilotStatsMap.set(row.pilot_name, {
                pilot_name: row.pilot_name,
                total_earned: 0,
                total_quantity: row.total_quantity,
                total_volume: row.total_volume
            });
        });

        // Обновление мапы данными из mining_data
        miningDataResults.forEach(row => {
            if (pilotStatsMap.has(row.pilot_name)) {
                pilotStatsMap.get(row.pilot_name).total_earned = row.total_earned;
            } else {
                pilotStatsMap.set(row.pilot_name, {
                    pilot_name: row.pilot_name,
                    total_earned: row.total_earned,
                    total_quantity: 0,
                    total_volume: 0
                });
            }
        });

        // Вставка данных в таблицу pilot_stats
        const pilotStatsArray = Array.from(pilotStatsMap.values());
        const insertValues = pilotStatsArray.map(row => [
            row.pilot_name,
            row.total_earned,
            row.total_quantity,
            row.total_volume
        ]);

        await connection.promise().query(`
            INSERT INTO pilot_stats (pilot_name, total_earned, total_quantity, total_volume)
            VALUES ?
        `, [insertValues]);

        console.log('Перерасчет данных в таблице pilot_stats завершен.');
    } catch (error) {
        console.error('Ошибка при перерасчете данных в таблице pilot_stats:', error);
    }
}

app.get('/rules', (req, res) => {
    res.render('rules');
});

app.get('/crabs', (req, res) => {
    const query = 'SELECT * FROM time_record ORDER BY id DESC';
    connection.query(query, (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.render('crabs', { 
                records: [],
                mostProfitable: null,
                fastestRun: null,
                avgValue: null,
                avgTime: null,
                uniqueNames: [],
                uniqueShips: []
            });
        }

        const mostProfitable = results.reduce((max, record) => max.value > record.value ? max : record);
        const fastestRun = results.reduce((min, record) => {
            const minTimeInSeconds = timeStringToSeconds(min.time);
            const recordTimeInSeconds = timeStringToSeconds(record.time);
            return minTimeInSeconds < recordTimeInSeconds ? min : record;
        });

        const avgValue = results.reduce((sum, record) => sum + record.value, 0) / results.length;
        const totalSeconds = results.reduce((sum, record) => sum + timeStringToSeconds(record.time), 0);
        const avgTimeInSeconds = totalSeconds / results.length;
        const avgTimeFormatted = secondsToTimeString(avgTimeInSeconds);

        const uniqueNames = new Set();
        const uniqueShips = new Set();

        results.forEach(record => {
            if (record.name) {
                const names = record.name.split(',').map(name => name.trim());
                names.forEach(name => uniqueNames.add(name));
            }
            if (record.notes) {
                const ships = record.notes.split(',').map(ship => ship.trim());
                ships.forEach(ship => uniqueShips.add(ship));
            }
        });

        // Делаем из множества массивы для передачи на фронтенд
        res.render('crabs', { 
            records: results,
            mostProfitable: mostProfitable,
            fastestRun: fastestRun,
            avgValue: avgValue.toFixed(2),
            avgTime: avgTimeFormatted,
            uniqueNames: Array.from(uniqueNames),
            uniqueShips: Array.from(uniqueShips)
        });
    });
});


function timeStringToSeconds(time) {
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}

function secondsToTimeString(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}



app.post('/api/save', (req, res) => {
    const { time, name, value, notes } = req.body;

    const names = name.split(',').map(n => n.trim()).join(', ');
    const shipList = Array.isArray(notes) ? notes.join(', ') : notes;

    console.log('Сохранение данных:', { time, names, value, notes });

    const query = `INSERT INTO time_record (time, name, value, notes) VALUES (?, ?, ?, ?)`;
    connection.query(query, [time, names, value, shipList], (err, results) => {
        if (err) {
            console.error('Ошибка при сохранении данных:', err);
            return res.status(500).json({ error: 'Ошибка при сохранении данных' });
        }

        res.json({ success: true });
    });
});


app.get('/api/filter', (req, res) => {
    const { name, ship, exact } = req.query;
    let conditions = [];

    if (name) {
        const nameConditions = name.split(',')
                                   .map(n => exact === 'true' 
                                        ? `name = '${n.trim()}'`
                                        : `name LIKE '%${n.trim()}%'`)
                                   .join(' OR ');
        conditions.push(`(${nameConditions})`);
    }

    if (ship) {
        const shipConditions = ship.split(',')
                                   .map(s => exact === 'true' 
                                        ? `notes = '${s.trim()}'`
                                        : `notes LIKE '%${s.trim()}%'`)
                                   .join(exact === 'true' ? ' AND ' : ' OR ');
        conditions.push(`(${shipConditions})`);
    }

    const queryConditions = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
        SELECT * FROM time_record 
        ${queryConditions}
        ORDER BY id DESC`;

    connection.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка получения данных' });
        }
        
        // Рассчитываем необходимые данные только на основе отфильтрованных записей
        const mostProfitable = results.reduce((max, record) => record.value > max.value ? record : max, { value: 0 });
        const fastestRun = results.reduce((min, record) => record.time < min.time ? record : min, { time: Infinity });
        const avgValue = (results.reduce((sum, record) => sum + record.value, 0) / results.length).toFixed(2);
        const avgTime = (results.reduce((sum, record) => sum + record.time, 0) / results.length).toFixed(2);

        res.json({ 
            records: results,
            stats: {
                mostProfitable,
                fastestRun,
                avgValue,
                avgTime
            }
        });
    });
});


app.use('/lp', lpApp);

fetchDataFromDB();
recalculatePilotStats();
setInterval(recalculatePilotStats, 86400000);
setInterval(fetchDataFromDB, 86400000);

app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
