const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ActivityType } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const axios = require('axios');
const cron = require('node-cron');
const dotenv = require('dotenv');
dotenv.config();
const qs = require('querystring');
const fs = require('fs').promises;
const path = require('path');
const { LOADIPHLPAPI } = require('dns');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const GUILD_ID = '1159107187407335434';
const W_CHANNEL_ID = '1159107187986157599'; 
const LOG_CHANNEL_ID = '1239085828395892796'; 
const REPORT_CHANNEL_ID= '1230611265794080848';
const MAIN_CHANNEL_ID= '1172972375688626276';

const waitList = new Map();
const messageMap = new Map();

client.once('ready', () => {
    client.user.setPresence({
        activities: [{ name: 'поклонение Дону', type: ActivityType.Playing }],
        status: 'online'
    });
    logAndSend(`<@235822777678954496>, папа я родился!`);
    logAndSend(`Logged in as ${client.user.tag}!`);
    createRoleMessage();
    cron.schedule('0 0 * * *', checkDiscordMembersAgainstGameList); 
    cron.schedule('0 10 * * *', () => {
        logAndSend('Выполняю задачу отправки уведомлений о мероприятии.');
        scheduleDailyActivity(client);
    });
    setInterval(cleanupOldMessages, 60 * 60 * 1000);
});
const clientId = '1238628917900738591'; // Убедитесь, что CLIENT_ID добавлен в переменные окружения
const token = process.env.DISCORD_TOKEN; // Токен, хранящийся в переменных окружения
const guildId = GUILD_ID; 

const commands = [
    new SlashCommandBuilder()
        .setName('addignore')
        .setDescription('Добавляет пользователя в игнор-лист')
        .addStringOption(option => option.setName('username').setDescription('Имя пользователя').setRequired(true)),
    new SlashCommandBuilder()
        .setName('removeignore')
        .setDescription('Удаляет пользователя из игнор-листа')
        .addStringOption(option => option.setName('username').setDescription('Имя пользователя').setRequired(true)),
    new SlashCommandBuilder()
        .setName('listignore')
        .setDescription('Показывает текущий игнор-лист'),
    new SlashCommandBuilder()
        .setName('reactionslist')
        .setDescription('Показывает список пользователей и количество их реакций на сообщение')
        .addStringOption(option =>
            option.setName('messageid')
                .setDescription('ID сообщения')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('channelid')
                .setDescription('ID канала')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('members')
        .setDescription('Показать участников корпы сейчас')
]
    .map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
    try {
        console.log('Начинаю обновление команд приложения.');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log('Команды приложения успешно обновлены.');
    } catch (error) {
        console.error(error);
    }
})();


client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

        // ID канала, в котором разрешены команды
    const allowedChannelId = "1239085828395892796";

    if (interaction.channelId !== allowedChannelId) {
        // Отправляем сообщение только этому пользователю, что у него нет прав использовать команду здесь
        await interaction.reply({ content: "У вас нет прав использовать эту команду в данном канале.", ephemeral: true });
        return;
    }


    const { commandName, options } = interaction;

    if (commandName === 'addignore') {
        const username = options.getString('username');
        const data = await readData();
        if (data.ignoreList.includes(username)) {
            await interaction.reply({ content: "Пользователь уже в игнор-листе.", ephemeral: true });
            return;
        }
        data.ignoreList.push(username);
        await writeData(data);
        await interaction.reply({ content: `${username} добавлен в игнор-лист.`, ephemeral: true });
    } else if (commandName === 'removeignore') {
        const username = options.getString('username');
        const data = await readData();
        const index = data.ignoreList.indexOf(username);
        if (index === -1) {
            await interaction.reply({ content: "Пользователь не найден в игнор-листе.", ephemeral: true });
            return;
        }
        data.ignoreList.splice(index, 1);
        await writeData(data);
        await interaction.reply({ content: `${username} удалён из игнор-листа.`, ephemeral: true });
    } else if (commandName === 'listignore') {
        const data = await readData();
        const message = data.ignoreList.length === 0 ? "Игнор-лист пуст." : `Игнор-лист: ${data.ignoreList.join(', ')}`;
        await interaction.reply({ content: message, ephemeral: true });
    } else if (commandName === 'reactionslist') {
        const channelId = options.getString('channelid');
        const messageId = options.getString('messageid');
        const channel = await client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);
        const userReactions = new Map();

        for (const reaction of message.reactions.cache.values()) {
            const users = await reaction.users.fetch();
            users.forEach(user => {
                if (!user.bot) {
                    if (userReactions.has(user.username)) {
                        userReactions.set(user.username, userReactions.get(user.username) + 1);
                    } else {
                        userReactions.set(user.username, 1);
                    }
                }
            });
        }

        let responseMessage = 'Список реакций на сообщение:\n';
        userReactions.forEach((count, username) => {
            responseMessage += `${username}: ${count} реакций\n`;
        });

        await interaction.reply({ content: responseMessage, ephemeral: true });
    } else if (commandName === 'members') {
            const namesSet = await fetchGameNames();
            const namesList = Array.from(namesSet);
            const message = namesList.length === 0 ? "Список имен пуст." : `Список имен: ${namesList.join(', ')}\nОбщее количество: ${namesList.length}`;
            await interaction.reply({ content: message, ephemeral: true });
    }
});


function logAndSend(message) {
    const now = new Date(); // Получение текущей даты и времени
    const timestamp = now.toISOString();
    console.log(`[${timestamp}] ${message}`); // Логирование в консоль

    // Проверяем, что клиент уже готов и имеем доступ к каналам
    if (client.isReady()) {
        const channel = client.channels.cache.get(LOG_CHANNEL_ID);
        if (channel) {
            // Проверяем, не инициировано ли сообщение ботом
            if (!message.includes(`[${client.user.tag}]`)) {
                channel.send(`[${timestamp}] ${message}`).catch(console.error);
            }
        } else {
            console.error('Channel not found!');
        }
    }
}

async function scheduleDailyActivity(client) {
    logAndSend(`Пытаюсь получить гильдию с ID: ${GUILD_ID}`);

    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return logAndSend("Гильдия не найдена");

    const channel = guild.channels.cache.get(MAIN_CHANNEL_ID);
    if (!channel) return logAndSend("Канал не найден");
    let messageDeleted = false;
    const message = await channel.send({
        content: '<@&1163379884039618641> <@&1230610682018529280>, хотите поучаствовать сегодня в тыловых? Нажмите на кнопку ниже!',
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('participate')
                    .setLabel('Участвовать')
                    .setStyle(ButtonStyle.Primary)
            )
        ]
    });

    let participants = new Set(); // Список уникальных участников
    let collector = message.createMessageComponentCollector({ componentType: 2 }); // 2 is Button

    collector.on('collect', async (interaction) => {
        logAndSend(`Кнопка ${interaction.customId} была нажата пользователем ${interaction.user.username}.`);
        if (interaction.customId === 'participate') {
            await interaction.deferUpdate();
            await interaction.followUp({ content: 'Спасибо за ваш интерес, мы вас записали!', ephemeral: true });
            participants.add(interaction.user.id);

            if (participants.size >= 5) {
                const now = new Date();
                const timezoneOffset = now.getTimezoneOffset() * 60000; // переводим в миллисекунды
                const localNow = new Date(now.getTime() - timezoneOffset);
                const startTime = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 19, 0, 0, 0);
                const endTime = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 20, 0, 0, 0);
                let event;
                try {
                    event = await guild.scheduledEvents.create({
                        name: 'Хоумфронты',
                        description: 'Заработать деняк надо!',
                        scheduledStartTime: startTime, // начало через 1 час
                        scheduledEndTime: endTime, // конец через 2 часа
                        privacyLevel: 2,
                        entityType: 3, // 3 для онлайн событий
                        entityMetadata: {
                            location: 'Dodixie' // Указываем, что местоположение онлайн
                        }
                    });
                    logAndSend(`Создан ивент: ${event.name}`);
            
                    logAndSend('Событие успешно создано!');
                } catch (error) {
                    console.error('Ошибка при создании события:', error);
                }
        
                if (event) {
                    participants.forEach(async (userId) => {
                        const user = await client.users.fetch(userId);
                        if (user && !user.bot) {
                            user.send(`Привет! Напоминаем, что сегодня в 19:00 начнется мероприятие. Вот ссылка: ${event.url}`);
                        }
                    });
                } else {
                    logAndSend("Событие не было создано, сообщение не отправлено.");
                }
                

                if (!messageDeleted) {
                    try {
                        await message.delete();
                        messageDeleted = true; // Помечаем сообщение как удаленное
                    } catch (error) {
                        console.error('Ошибка при удалении сообщения:', error);
                    }
                }
                
                collector.stop();
            }
        }
    });

    collector.on('end', async () => {
        logAndSend(`Collected ${participants.size} participants.`);
        if (participants.size < 5 && !messageDeleted) { // Проверяем, удалено ли сообщение
            try {
                await message.delete();
                messageDeleted = true; // Помечаем сообщение как удаленное
            } catch (error) {
                console.error('Ошибка при удалении сообщения:', error);
            }
        }
    });


    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset() * 60000; // переводим в миллисекунды
    const localNow = new Date(now.getTime() - timezoneOffset);

    const endTime = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 18, 55, 0, 0);
    const duration = endTime.getTime() - localNow.getTime();


    setTimeout(() => {
        if (collector) {
            collector.stop();
        }
    }, duration);
}


client.on('guildMemberAdd', async member => {
    const channel = member.guild.channels.cache.get(W_CHANNEL_ID);
    if (!channel) {
        logAndSend(`Channel with ID ${W_CHANNEL_ID} not found in guild ${member.guild.id}`);
        return;
    }

    logAndSend(`New member joined: ${member.user.tag} (ID: ${member.id}) in guild ${member.guild.id}`);
    if (!/^[\w\s]+ \([\w]+\)$/.test(member.displayName)) {
        logAndSend(`Member ${member.user.tag} (ID: ${member.id}) does not match the required nickname format.`);
        channel.send(`${member.toString()}, пожалуйста, напиши свой ник и имя через запятую, например: Ник игры, Имя.`);
        waitList.set(member.id, member.guild.id);
    } else {
        logAndSend(`Member ${member.user.tag} (ID: ${member.id}) matches the required nickname format.`);
    }
});

client.on('messageCreate', async message => {

    if (message.author.bot || message.channel.id !== W_CHANNEL_ID || !message.content.trim() || !waitList.has(message.author.id)) return;

    if (waitList.get(message.author.id) === message.guild.id) {
        const content = message.content;
        if (content.includes(',')) {
            const parts = content.split(',', 2);
            if (parts.length === 2) {
                const newNick = `${parts[0].trim()} (${parts[1].trim()})`;
                try {
                    await message.member.setNickname(newNick);
                    const responseMessage = await message.channel.send(`Спасибо! Твой никнейм был изменен на ${newNick}. Ты по поводу какой корпорации? Нажми реакцию 1 для Cosmic Capybara Crew или реакцию 2 для других.`);
                    await responseMessage.react('1️⃣');
                    await responseMessage.react('2️⃣');

                    waitList.delete(message.author.id);

                    // Запоминаем ID сообщения для обработки реакций
                    messageMap.set(responseMessage.id, message.author.id);
                } catch (error) {
                    message.channel.send("У меня недостаточно прав для изменения никнеймов.");
                    console.error("Permission denied to change nickname:", error);
                }
            }
        } else {
            message.channel.send(`${message.author.toString()}, твой ответ должен содержать ник и имя, разделенные запятой.`);
        }
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    logAndSend('Обработчик messageReactionAdd запущен');
    if (user.bot || reaction.message.channel.id !== W_CHANNEL_ID) return;

    const originalUserId = messageMap.get(reaction.message.id);
    if (!originalUserId || user.id !== originalUserId) return; // Убедимся, что реакцию ставит нужный пользователь

    if (reaction.emoji.name === '1️⃣') {
        logAndSend(`Пользователь ${user.tag} выбрал корпорацию Cosmic Capybara Crew.`);
        try {
            const role = reaction.message.guild.roles.cache.find(role => role.name === 'Пилот CCCrew');
            const member = reaction.message.guild.members.cache.get(user.id);
            await member.roles.add(role);
            logAndSend(`Роль ${role.name} была успешно добавлена пользователю ${user.tag}.`);

            const welcomeChannel = reaction.message.guild.channels.cache.get(REPORT_CHANNEL_ID);
            if (welcomeChannel) {
                await welcomeChannel.send(`Добро пожаловать на сервер, ${user.toString()}! Мы рады видеть тебя в рядах Пилотов CCCrew! Ты можешь выбрать интересующие тебя активности в канале <#1163428374493003826>.`);
            } else {
                logAndSend('Канал для приветствия не найден.');
            }
        } catch (error) {
            console.error('Ошибка при добавлении роли:', error);
        }
    } else if (reaction.emoji.name === '2️⃣') {
        const targetUser = reaction.message.guild.members.cache.get('739618523076362310'); // Подставьте реальный ID
        reaction.message.channel.send(`${user.toString()}, ты выбрал другие корпорации. ${targetUser.toString()}, пожалуйста, помоги!`);
    }
});

function generateMessageText() {
    const introText = `В этом сообщении вы можете выбрать себе роль, тыкнув на соответствующую реакцию. Роли нужны для того, чтобы дискорд мог сообщать вам отдельным уведомлением (звуком или красным квадратиком на приложении), если эту роль "пинганули". Например, если вы выбрали себе роль Лед, кто угодно, увидев спавн льда в игре, может написать в дискорде "<@&1163379553348096070> в Манатириде" и все участники с этой ролью получат оповещение, как если бы им написали в личку. Пинговать можно, поставив перед названием роли собачку @
    
    Пожалуйте, не пингуйте людей по всякой ерунде. Хороший пример пинга - заспавнился лед/газ/гравик/луна взорвана. Плохой пример пинга - "<@&1163380015191302214> ребята, а какими лопатами копать луну?", "<@&1163379553348096070> а сколько дохода с льда?"\n\n`;
    const rolesText = Object.entries(rolesMap)
        .map(([emoji, roleId]) => `${emoji} <@&${roleId}>`)
        .join('\n');
    
    return introText + rolesText;
}

async function createRoleMessage() {
    const channel = client.channels.cache.get('1163428374493003826');
    if (!channel) {
        console.log("Канал не найден");
        return;
    }

    const expectedText = generateMessageText();

    try {
        const messageId = await readMessageId();
        let messageExists = false;

        if (messageId) {
            try {
                const message = await channel.messages.fetch(messageId);
                messageExists = true;

                if (message.content !== expectedText || !allReactionsPresent(message)) {
                    logAndSend("Сообщение отличается, обновляем...");
                    await message.edit(expectedText);
                    await updateReactions(message);
                    logAndSend("Сообщение обновлено");
                } else {
                    logAndSend("Сообщение уже существует и оно корректно");
                    logAndSend(messageId);
                }
                return;
            } catch {
                logAndSend("Сообщение не найдено, создаем новое");
            }
        }

        if (!messageExists) {
            const message = await channel.send(expectedText);
            await addReactions(message);
            await saveMessageId(message.id);
            logAndSend("Новое сообщение создано и реакции добавлены");
        }
    } catch (error) {
        console.error("Произошла ошибка при создании сообщения:", error);
    }
}

function allReactionsPresent(message) {
    const expectedReactions = new Set(Object.keys(rolesMap));
    const messageReactions = new Set(message.reactions.cache.keys());
    return [...expectedReactions].every(r => messageReactions.has(r));
}

async function updateReactions(message) {
    const currentReactions = new Set(message.reactions.cache.keys());

    // Добавляем реакции, которые должны быть, но их нет
    for (const emoji of Object.keys(rolesMap)) {
        if (!currentReactions.has(emoji)) {
            try {
                await message.react(emoji);
            } catch (error) {
                console.error(`Could not react with ${emoji}:`, error);
            }            
            console.log(`Added missing reaction: ${emoji}`);
        }
    }

    // Удаляем реакции, которые больше не нужны
    for (const reaction of message.reactions.cache.values()) {
        if (!rolesMap.hasOwnProperty(reaction.emoji.name)) {
            await reaction.remove();
            console.log(`Removed outdated reaction: ${reaction.emoji.name}`);
        }
    }
}


async function addReactions(message) {
    for (const emoji of Object.keys(rolesMap)) {
        await message.react(emoji);
    }
}


const rolesMap = {
    '🌕': '1163380015191302214', 
    '💸': '1163379884039618641', 
    '💎': '1163380100520214591', 
    '☁️': '1163404742609879091', 
    '🧊': '1163379553348096070',
    '🔫': '1239331341229752432',      
    '👾': '1239331818063528058',       
    '🌀': '1239331564286902285'        
};


client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.message.partial) await reaction.message.fetch();
    if (reaction.partial) await reaction.fetch();
    if (user.bot) return;
    if (!reaction.message.guild) return; 

    const roleName = rolesMap[reaction.emoji.name];
    if (!roleName) return console.log("Реакция не связана с ролью");

    const role = reaction.message.guild.roles.cache.find(role => role.id === roleName);
    if (!role) return console.log("Роль не найдена");

    const member = reaction.message.guild.members.cache.get(user.id);
    if (!member) return;
    
    member.roles.add(role).catch(console.error);
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (reaction.message.partial) await reaction.message.fetch();
    if (reaction.partial) await reaction.fetch();
    if (user.bot) return;
    if (!reaction.message.guild) return; 

    const roleName = rolesMap[reaction.emoji.name];
    if (!roleName) return console.log("Реакция не связана с ролью");

    const role = reaction.message.guild.roles.cache.find(role => role.id === roleName);
    if (!role) return console.log("Роль не найдена");

    const member = reaction.message.guild.members.cache.get(user.id);
    if (!member) return;
    
    member.roles.remove(role).catch(console.error);
});


async function checkDiscordMembersAgainstGameList() {
    const { nonComplianceCounter, ignoreList } = await readData();
    logAndSend("Current Ignore List:", ignoreList); 

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            console.error('Guild not found.');
            return;
        }

        const members = await guild.members.fetch();
        const gameNames = await fetchGameNames();

        let reportMessage = 'Пожалуйста, проверьте этих пользователей на соответствие их игровому имени или наличию в корпорации:';

        const roleId = "1230610682018529280"; 
        members.forEach(member => {
            const name = member.displayName.split(' (')[0].trim().toLowerCase();

            if (ignoreList.includes(name) || !member.roles.cache.has(roleId)) {
                return;
            }
            
            if (!gameNames.has(name)) {
                nonComplianceCounter[name] = (nonComplianceCounter[name] || 0) + 1;
            } else {
                delete nonComplianceCounter[name];
            }
        });

        Object.entries(nonComplianceCounter).forEach(([name, count]) => {
            if (count > 3) {
                const member = members.find(m => m.displayName.split(' (')[0].trim().toLowerCase() === name);
                if (member) {
                    reportMessage += `\n- ${member.toString()}`;
                }
            }
        });

        await writeData({ nonComplianceCounter, ignoreList }); 

        const reportChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!reportChannel) {
            console.error(`Report channel with ID ${LOG_CHANNEL_ID} not found.`);
            return;
        }

        if (reportMessage.length > 140) {
            reportChannel.send(reportMessage);
        } else {
            reportChannel.send('Все пользователи соответствуют условиям или не достигли предела нарушений.');
        }
    } catch (error) {
        console.error('Error during member check:', error);
    }
}

async function getAccessTokenUsingRefreshToken() {
    try {
        const complianceData = JSON.parse(await fs.readFile('complianceData.json', 'utf8'));
        const authorizationBase64 = complianceData.Authorization[0];
        const refreshToken = complianceData.refreshToken[0];
        console.log("Token Before:", refreshToken);

        const response = await axios.post('https://login.eveonline.com/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authorizationBase64}`
            }
        });

        if (response.data.refresh_token) {
            complianceData.refreshToken[0] = response.data.refresh_token;
            console.log("Token After:", response.data.refresh_token);
            await fs.writeFile('complianceData.json', JSON.stringify(complianceData, null, 2));
        }

        return response.data.access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        return null;
    }
}


async function getCorporationMembers(accessToken) {
    try {
        const access_token = accessToken;
        const response = await axios.get('https://esi.evetech.net/latest/corporations/98769585/members/?datasource=tranquility', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching corporation members:', error);
        return [];
    }
}

async function getCharacterNames(characterIds) {
    try {
        const promises = characterIds.map(async (characterId) => {
            const response = await axios.get(`https://esi.evetech.net/latest/characters/${characterId}/?datasource=tranquility`);
            return response.data.name;
        });
        const characterNames = await Promise.all(promises);
        return characterNames;
    } catch (error) {
        console.error('Error fetching character names:', error);
        return [];
    }
}

async function fetchGameNames() {
    try {
        const accessToken = await getAccessTokenUsingRefreshToken();
        if (!accessToken) {
            console.error("Failed to obtain access token.");
            return new Set();
        }

        const corporationMembers = await getCorporationMembers(accessToken);
        if (!corporationMembers.length) {
            console.error("No members found or failed to fetch members.");
            return new Set();
        }

        const characterNames = await getCharacterNames(corporationMembers);
        if (!characterNames.length) {
            console.error("No character names found or failed to fetch names.");
            return new Set();
        }

        return new Set(characterNames.map(name => name.toLowerCase()));
    } catch (error) {
        console.error('Failed to fetch game names:', error);
        return new Set();
    }
}

const DATA_FILE = path.join(__dirname, 'complianceData.json'); 

// Универсальная функция для чтения данных из JSON-файла
async function readFromJSON(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading from JSON file:', error);
        // Возвращаем пустой объект или другие стандартные значения в случае ошибки
        return null;
    }
}

// Универсальная функция для записи данных в JSON-файл
async function writeToJSON(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log("Data successfully written to JSON file");
    } catch (error) {
        console.error('Error writing to JSON file:', error);
    }
}

async function readMessageId() {
    const jsonData = await readFromJSON(DATA_FILE);
    return jsonData && jsonData.messageId && jsonData.messageId.length > 0 ? jsonData.messageId[0] : null;
}

async function saveMessageId(messageId) {
    const jsonData = await readFromJSON(DATA_FILE) || {};
    jsonData.messageId = [messageId];
    await writeToJSON(DATA_FILE, jsonData);
}

async function readData() {
    return await readFromJSON(DATA_FILE) || { nonComplianceCounter: {}, ignoreList: [] };
}

async function writeData(newData) {
    try {
        const dataFilePath = DATA_FILE;  // Указываете путь к вашему JSON файлу
        const existingData = await readFromJSON(dataFilePath) || {};  // Чтение текущих данных или инициализация пустым объектом, если данных нет
        const updatedData = { ...existingData, ...newData };  // Объединение существующих данных с новыми данными
        await writeToJSON(dataFilePath, updatedData);  // Запись обновлённых данных обратно в файл
        console.log("Data successfully updated in JSON file");
    } catch (error) {
        console.error('Error updating data in JSON file:', error);
    }
}

async function cleanupOldMessages() {
    const channelId = 'ВАШ_ID_КАНАЛА'; // Замените на ваш ID канала
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
        console.error("Канал не найден");
        return;
    }

    try {
        const messages = await channel.messages.fetch();
        const now = Date.now();
        const twelveHours = 1000 * 60 * 60 * 12; // 12 часов в миллисекундах

        messages.each(async (message) => {
            if (now - message.createdTimestamp > twelveHours) {
                await message.delete();
            }
        });

        console.log("Старые сообщения удалены");
    } catch (error) {
        console.error("Произошла ошибка при удалении старых сообщений:", error);
    }
}



client.login(process.env.DISCORD_TOKEN); 