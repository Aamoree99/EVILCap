console.log('db.js запущен');

require('dotenv').config();
const mysql = require('mysql2');
const cron = require('node-cron');
const { client, fleetNotify, deleteVoiceChannelByFc } = require('./bot');

const guildId = '1159107187407335434';
const LOG_CHANNEL_ID = '1239085828395892796'; // ID канала для приветственного сообщения
const MAIN_CHANNEL_ID = '1172972375688626276'; // ID канала для топа участников
const allowedUserId = '235822777678954496';

// Настройка подключения к базе данных
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

connection.connect((err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.stack);
        return;
    }
    console.log('Подключение к базе данных установлено, ID подключения:', connection.threadId);
});

module.exports = connection;

const userSessions = {};

// Включение бота
client.once('ready', async () => {
    const welcomeChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (welcomeChannel) {
        welcomeChannel.send('Воришка знаний запущен!');
    } else {
        console.error(`Канал с ID ${LOG_CHANNEL_ID} не найден.`);
    }

    cron.schedule('0 12 * * 1', async () => {
        calculateAndAwardMedals();
        resetWeeklyActivity();
    });

    try {
        // Получение конкретной гильдии по ID
        const guild = await client.guilds.fetch(guildId);
        console.log(`Гильдия с ID ${guild.id} найдена. Название: ${guild.name}`);

        const members = await guild.members.fetch();
        console.log(`Всего мемберов в гильдии: ${members.size}`);

        // Обработка всех членов гильдии
        members.forEach(member => {
            if (member.presence?.status === 'online') {
                userSessions[member.id] = {
                    startTime: Date.now(),
                    lastMessageTime: Date.now()
                };
            }
        });
    } catch (error) {
        console.error('Ошибка при получении гильдии или членов:', error);
    }
});

client.on('messageCreate', async (message) => {
    if (message.content === `!apocalypse` && message.author.id === allowedUserId) {
        try {
            const guild = message.guild;
            if (!guild) {
                console.log('Не удалось получить гильдию.');
                return;
            }

            const guildName = guild.name;
            const categories = [];
            const channels = [];

            guild.channels.cache.forEach(channel => {
                if (channel.type === 4) { // Проверка на тип категории (GUILD_CATEGORY)
                    categories.push({ id: channel.id, name: channel.name });
                } else {
                    channels.push({ id: channel.id, name: channel.name, parentId: channel.parentId });
                }
            });
        } catch (error) {
            console.error('Ошибка при получении данных о гильдии:', error);
        }
    }
});

// Обработка сообщений и обновление данных
client.on('messageCreate', message => {
    if (!message.guild || message.author.bot) return;

    // Логика обновления данных при получении сообщений
    updateUserActivity(message.author.id);

    // Обновление времени последнего сообщения
    const userId = message.author.id;
    const now = Date.now();
    if (!userSessions[userId]) {
        userSessions[userId] = {
            startTime: now,
            lastMessageTime: now
        };
    } else {
        userSessions[userId].lastMessageTime = now;
    }
});

client.on('presenceUpdate', (newPresence) => {
    if (!newPresence || !newPresence.userId) {
        console.warn('newPresence is null or userId is missing.');
        return;
    }

    const userId = newPresence.userId;
    const now = Date.now();

    if (newPresence.status === 'offline' || newPresence.status === 'idle') {
        // Пользователь ушел в оффлайн или стал неактивен
        if (userSessions[userId] && userSessions[userId].startTime) {
            const onlineDuration = (now - userSessions[userId].startTime) / (1000 * 60);
            updateOnlineTime(userId, onlineDuration);
            delete userSessions[userId];
        }
    } else if (newPresence.status === 'online') {
        // Пользователь стал активен
        if (!userSessions[userId]) {
            userSessions[userId] = {
                startTime: now,
                lastMessageTime: now
            };
        }
    }
});


// Обновление времени в онлайне в базе данных
function updateOnlineTime(userId, duration) {
    // Обновляем общее время в онлайне
    queryDatabase(
        'UPDATE UserActivityTotal SET online_time = online_time + ? WHERE user_id = ?',
        [duration, userId]
    ).catch(err => {
        console.error('Ошибка обновления времени в онлайне (общая):', err);
    });

    // Обновляем еженедельное время в онлайне
    queryDatabase(
        'UPDATE UserActivityWeekly SET online_time = online_time + ? WHERE user_id = ?',
        [duration, userId]
    ).catch(err => {
        console.error('Ошибка обновления времени в онлайне (недельная):', err);
    });
}

async function updateUserActivity(userId) {
    const now = new Date();
    const nowIso = now.toISOString().slice(0, 19).replace('T', ' '); // Текущая дата и время в формате ISO для TIMESTAMP
    let lastVisit = null;

    // Получаем последнюю дату посещения из общей таблицы
    try {
        const [lastVisitResult] = await queryDatabase(
            'SELECT last_visit FROM UserActivityTotal WHERE user_id = ?',
            [userId]
        );

        if (lastVisitResult && lastVisitResult.last_visit) {
            lastVisit = lastVisitResult.last_visit;
        }
    } catch (err) {
        console.error('Ошибка получения последней даты посещения:', err);
    }

    // Получаем только дату для сравнения
    const lastVisitDate = lastVisit ? new Date(lastVisit).toISOString().split('T')[0] : null;
    const nowDate = new Date(nowIso).toISOString().split('T')[0];
    const isNewVisit = !lastVisitDate || lastVisitDate !== nowDate;

    // Определяем значение для visit_count
    const visitCountIncrement = isNewVisit ? 1 : 0;

    // Обновление общей активности
    try {
        await queryDatabase(
            `INSERT INTO UserActivityTotal (user_id, last_visit, messages_count, online_time, visit_count)
            VALUES (?, ?, 1, 0, ?)
            ON DUPLICATE KEY UPDATE
                last_visit = VALUES(last_visit),
                messages_count = messages_count + 1,
                visit_count = visit_count + VALUES(visit_count)`,
            [userId, nowIso, visitCountIncrement]
        );
    } catch (err) {
        console.error('Ошибка обновления данных пользователя (общая):', err);
    }

    // Обновление еженедельной активности
    try {
        await queryDatabase(
            `INSERT INTO UserActivityWeekly (user_id, last_visit, messages_count, online_time, visit_count)
            VALUES (?, ?, 1, 0, ?)
            ON DUPLICATE KEY UPDATE
                last_visit = VALUES(last_visit),
                messages_count = messages_count + 1,
                visit_count = visit_count + VALUES(visit_count)`,
            [userId, nowIso, visitCountIncrement]
        );
    } catch (err) {
        console.error('Ошибка обновления данных пользователя (недельная):', err);
    }
}


async function calculateAndAwardMedals() {
    try {
        const results = await queryDatabase(
            `SELECT user_id, visit_count, SUM(messages_count) AS total_messages
            FROM UserActivityWeekly
            WHERE user_id NOT IN ('739618523076362310', '235822777678954496')
            GROUP BY user_id
            ORDER BY total_messages DESC
            LIMIT 10`
        );

        console.log('Результаты запроса:', results); // Диагностика

        if (!results || results.length === 0) {
            console.log('Нет данных для создания топа.');
            return;
        }

        awardMedals(results);
    } catch (err) {
        console.error('Ошибка получения данных:', err);
    }
}

async function awardMedals(users) {
    if (!users.length) return;

    const topChannel = client.channels.cache.get(MAIN_CHANNEL_ID);
    if (!topChannel) {
        console.error(`Канал с ID ${MAIN_CHANNEL_ID} не найден.`);
        return;
    }

    let announcement = 'Топ активных участников за последнюю неделю:\n';
    let awardedUser = null;
    let awardedMedal = null;
    let awardGiven = false; 
    for (const [index, user] of users.entries()) {
        const place = index + 1;
        const totalMessages = user.total_messages || 0;

        try {
            const canAward = await canUserBeAwarded(user.user_id);
            console.log(user, canAward);

            if (!awardGiven && canAward) {
                awardedMedal = await awardUser(user.user_id, true);
                awardedUser = user.user_id;
                announcement += `${place}. <@${user.user_id}> - ${totalMessages} сообщений, получает медаль ${awardedMedal}\n`;
                awardGiven = true; // Устанавливаем флаг, что медаль была присуждена
            } else {
                announcement += `${place}. <@${user.user_id}> - ${totalMessages} сообщений\n`;
            }
        } catch (err) {
            console.error('Ошибка присуждения медали:', err);
        }
    }

    if (awardedUser) {
        topChannel.send(`<@${awardedUser}> получил(а) ${awardedMedal}! За наградой 10 млн ISK обращайтесь к <@739618523076362310>.`);
    }

    topChannel.send(announcement);
}

async function canUserBeAwarded(userId) {
    try {
        const maxLevelResults = await queryDatabase(
            'SELECT MAX(level) AS maxLevel FROM MedalNames'
        );
        const maxLevel = maxLevelResults[0].maxLevel;

        const results = await queryDatabase(
            'SELECT level, awarded_at FROM Medals WHERE user_id = ? ORDER BY awarded_at DESC LIMIT 1',
            [userId]
        );

        if (results.length > 0) {
            const lastAwardedDate = new Date(results[0].awarded_at);
            const currentLevel = results[0].level;
            const threeWeeksAgo = new Date();
            threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
            threeWeeksAgo.setSeconds(threeWeeksAgo.getSeconds() - 1);

            if (currentLevel >= maxLevel) {
                return false;
            }

            return lastAwardedDate < threeWeeksAgo;
        }
        return true;
    } catch (err) {
        console.error('Ошибка проверки медали:', err);
        return false;
    }
}

async function awardUser(userId, isFirstPlace) {
    try {
        console.log(userId, isFirstPlace);
        const maxLevelResults = await queryDatabase(
            'SELECT MAX(level) AS maxLevel FROM MedalNames'
        );
        const maxLevel = maxLevelResults[0].maxLevel;

        const results = await queryDatabase(
            'SELECT level, awarded_at FROM Medals WHERE user_id = ? ORDER BY awarded_at DESC LIMIT 1',
            [userId]
        );

        let level = 1;

        if (results.length > 0) {
            const currentLevel = results[0].level;

            if (currentLevel >= maxLevel) {
                return (await queryDatabase(
                    'SELECT name FROM MedalNames WHERE level = ?',
                    [currentLevel]
                ))[0].name;
            }

            if (isFirstPlace) {
                level = currentLevel + 1;
                await queryDatabase(
                    'UPDATE Medals SET level = ?, awarded_at = NOW() WHERE user_id = ? AND awarded_at = ?',
                    [level, userId, results[0].awarded_at]
                );
            } else {
                level = currentLevel;
            }
        } else if (isFirstPlace) {
                console.log(`Inserting new medal for user ${userId}`);
                await queryDatabase(
                    'INSERT INTO Medals (user_id, level, awarded_at) VALUES (?, 1, NOW())',
                    [userId]
                );
        }

        const medalNameResults = await queryDatabase(
            'SELECT name FROM MedalNames WHERE level = ?',
            [level]
        );

        return medalNameResults[0].name;
    } catch (err) {
        console.error('Ошибка присуждения медали:', err);
        throw err;
    }
}


function resetWeeklyActivity() {
    queryDatabase('DELETE FROM UserActivityWeekly')
        .then(() => {
            console.log('Таблица еженедельной активности очищена.');
        })
        .catch(err => {
            console.error('Ошибка очистки таблицы еженедельной активности:', err);
        });
}

// Обертка для запросов к базе данных с обработкой ошибок
function queryDatabase(query, params) {
    return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}