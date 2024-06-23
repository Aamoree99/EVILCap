console.log('db.js запущен');

require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const mysql = require('mysql2');
const cron = require('node-cron');

// Переменные окружения
const guildId = '1159107187407335434';
const welcomeChannelId = '1239085828395892796'; // ID канала для приветственного сообщения
const topChannelId = '1172972375688626276'; // ID канала для топа участников

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

// Создание нового клиента Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildPresences] });

// Переменная для отслеживания последнего времени активности
const userSessions = {};

// Включение бота
client.once('ready', () => {
    console.log('Воришка знаний запущен во имя <@290893335244177419>');

    // Отправка приветственного сообщения
    const welcomeChannel = client.channels.cache.get(welcomeChannelId);
    if (welcomeChannel) {
        welcomeChannel.send('Воришка знаний запущен во имя <@290893335244177419>!');
    } else {
        console.error(`Канал с ID ${welcomeChannelId} не найден.`);
    }

    // Очистка еженедельной таблицы каждую неделю в воскресенье в 12:00
    cron.schedule('0 12 * * 0', async () => {
        calculateAndAwardMedals();
        resetWeeklyActivity();
    });
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

// Обработка Slash-команд
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'userinfo') {
        const userId = interaction.options.getString('id');

        // Запрос к базе данных
        try {
            const [results] = await queryDatabase(
                'SELECT * FROM UserActivityTotal WHERE user_id = ?',
                [userId]
            );

            console.log(results);

            if (!results || results.length === 0) {
                await interaction.reply(`Пользователь с ID ${userId} не найден.`);
                return;
            }

            const userInfo = results || {};
            const lastVisit = userInfo.last_visit ?? 'null';
            const messagesCount = userInfo.messages_count ?? 'null';
            const onlineTime = userInfo.online_time ?? 'null';

            await interaction.reply(
                `Информация о пользователе <@${userId}>:\n` +
                `- Последнее посещение: ${lastVisit}\n` +
                `- Количество сообщений: ${messagesCount}\n` +
                `- Общее время в онлайне: ${onlineTime} часов`
            );
        } catch (err) {
            console.error('Ошибка выполнения запроса:', err);
            await interaction.reply('Ошибка выполнения запроса к базе данных. Попробуйте позже.');
        }
    }
});

// Обработка обновления присутствия
client.on('presenceUpdate', (oldPresence, newPresence) => {
    const userId = newPresence.userId;
    const now = Date.now();

    if (newPresence.status === 'offline' || newPresence.status === 'idle') {
        // Пользователь ушел в оффлайн или стал неактивен
        if (userSessions[userId] && userSessions[userId].startTime) {
            const onlineDuration = (now - userSessions[userId].startTime) / (1000 * 60); // в часах
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


// Вычисление топа участников и присуждение медалей
async function calculateAndAwardMedals() {
    try {
        // Получение данных о пользователях, которые были активны за последнюю неделю
        const results = await queryDatabase(
            `SELECT user_id, visit_count, SUM(messages_count) AS total_messages
            FROM UserActivityWeekly
            GROUP BY user_id
            HAVING visit_count >= 4
            ORDER BY total_messages DESC
            LIMIT 10`
        );

        console.log('Результаты запроса:', results); // Диагностика

        if (!results || results.length === 0) {
            console.log('Нет данных для создания топа.');
            return;
        }

        // Присуждение медалей
        awardMedals(results);
    } catch (err) {
        console.error('Ошибка получения данных:', err);
    }
}

async function awardMedals(users) {
    if (!users.length) return;

    const topChannel = client.channels.cache.get(topChannelId);
    if (!topChannel) {
        console.error(`Канал с ID ${topChannelId} не найден.`);
        return;
    }

    let announcement = 'Топ активных участников за последнюю неделю:\n';
    let awardedUser = null;
    let awardedMedal = null;

    for (const [index, user] of users.entries()) {
        const place = index + 1;
        const totalMessages = user.total_messages || 0;

        try {
            if (!awardedUser) {
                // Проверяем, не получал ли пользователь медаль за последний месяц
                const canAward = await canUserBeAwarded(user.user_id);
                if (canAward) {
                    // Присуждаем награду и медаль
                    awardedMedal = await awardUser(user.user_id, true);
                    awardedUser = user.user_id;
                    announcement += `${place}. <@${user.user_id}> - ${totalMessages} сообщений, получает ${awardedMedal}\n`;
                } else {
                    announcement += `${place}. <@${user.user_id}> - ${totalMessages} сообщений\n`;
                }
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

// Проверка, может ли пользователь получить медаль (не получал за последний месяц)
async function canUserBeAwarded(userId) {
    try {
        // Получаем максимальный уровень медали из таблицы MedalNames
        const maxLevelResults = await queryDatabase(
            'SELECT MAX(level) AS maxLevel FROM MedalNames'
        );
        const maxLevel = maxLevelResults[0].maxLevel;

        // Получаем последнюю медаль пользователя
        const results = await queryDatabase(
            'SELECT level, awarded_at FROM Medals WHERE user_id = ? ORDER BY awarded_at DESC LIMIT 1',
            [userId]
        );

        if (results.length > 0) {
            const lastAwardedDate = new Date(results[0].awarded_at);
            const currentLevel = results[0].level;
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            // Проверка на максимальный уровень
            if (currentLevel >= maxLevel) {
                return false;
            }

            return lastAwardedDate < oneMonthAgo;
        }
        return true;
    } catch (err) {
        console.error('Ошибка проверки медали:', err);
        return false;
    }
}

async function awardUser(userId, isFirstPlace) {
    try {
        // Получаем максимальный уровень медали из таблицы MedalNames
        const maxLevelResults = await queryDatabase(
            'SELECT MAX(level) AS maxLevel FROM MedalNames'
        );
        const maxLevel = maxLevelResults[0].maxLevel;

        // Получаем последнюю медаль пользователя
        const results = await queryDatabase(
            'SELECT level, awarded_at FROM Medals WHERE user_id = ? ORDER BY awarded_at DESC LIMIT 1',
            [userId]
        );

        let level = 1;

        if (results.length > 0) {
            const currentLevel = results[0].level;

            if (currentLevel >= maxLevel) {
                // Пользователь уже имеет максимальный уровень медали
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
            // Присуждение новой медали
            await queryDatabase(
                'INSERT INTO Medals (user_id, level, awarded_at) VALUES (?, ?, 1, NOW())',
                [userId]
            );
            level = 1;
        }

        // Получаем название медали из таблицы MedalNames
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

// Сброс еженедельной таблицы активности
function resetWeeklyActivity() {
    queryDatabase('DELETE FROM UserActivityWeekly')
        .then(() => {
            console.log('Таблица еженедельной активности очищена.');
        })
        .catch(err => {
            console.error('Ошибка очистки таблицы еженедельной активности:', err);
        });
}

// Логин бота
client.login(process.env.DISCORD_TOKEN);

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