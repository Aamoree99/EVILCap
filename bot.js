const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
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
    logAndSend(`Logged in as ${client.user.tag}!`);
    createRoleMessage();
    checkDiscordMembersAgainstGameList();
    cron.schedule('0 0 * * *', checkDiscordMembersAgainstGameList); 
    cron.schedule('0 10 * * *', () => {
        logAndSend('Выполняю задачу отправки уведомлений о мероприятии.');
        scheduleDailyActivity(client);
    });
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
                const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0, 0);
                const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0);
                
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

    // Устанавливаем таймер до 18:55
    const endTime = new Date();
    endTime.setHours(18, 55, 0, 0);
    const duration = endTime.getTime() - Date.now();

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
                await welcomeChannel.send(`Добро пожаловать на сервер, ${user.toString()}! Мы рады видеть тебя в рядах Пилотов CCCrew!`);
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

async function createRoleMessage() {
    const channel = client.channels.cache.get('1239085828395892796');
    if (!channel) return console.log("Канал не найден");

    try {
        const messageId = await readMessageId();
        let messageExists = false;
        if (messageId) {
            try {
                await channel.messages.fetch(messageId);
                messageExists = true;
                console.log("Сообщение уже существует");
            } catch {
                console.log("Сообщение не найдено, создаем новое");
            }
        }

        if (!messageExists) {
            const messageText = `В этом сообщении вы можете выбрать себе роль, тыкнув на соответствующую реакцию. Роли нужны для того, чтобы дискорд мог сообщать вам отдельным уведомлением (звуком или красным квадратиком на приложении), если эту роль "пинганули". Например, если вы выбрали себе роль Лед, кто угодно, увидев спавн льда в игре, может написать в дискорде "<@&1163379553348096070> в Манатириде" и все участники с этой ролью получат оповещение, как если бы им написали в личку. Пинговать можно, поставив перед названием роли собачку @

            Пожалуйте, не пингуйте людей по всякой ерунде. Хороший пример пинга - заспавнился лед/газ/гравик/луна взорвана. Плохой пример пинга - "<@&1163380015191302214> ребята, а какими лопатами копать луну?", "<@&1163379553348096070> а сколько дохода с льда?".
            
            🌕 <@&1163380015191302214> луны
            💸 <@&1163379884039618641> хоумфронты
            💎 <@&1163380100520214591> гравики
            ☁️ <@&1163404742609879091> газ
            🧊 <@&1163379553348096070> лёд`;
            const message = await channel.send(messageText);
            for (const emoji of Object.keys(rolesMap)) {
                await message.react(emoji);
            }
            await saveMessageId(message.id);
            console.log("Сообщение создано и реакции добавлены");
        }
    } catch (error) {
        console.error("Ошибка при отправке сообщения или добавлении реакций:", error);
    }
}

async function readMessageId() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const jsonData = JSON.parse(data);
        return jsonData.messageId && jsonData.messageId.length > 0 ? jsonData.messageId[0] : null;
    } catch (error) {
        console.log("Error reading from the data file:", error);
        return null;
    }
}

async function saveMessageId(messageId) {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const jsonData = JSON.parse(data);

        jsonData.messageId = [messageId]; 

        await fs.writeFile(DATA_FILE, JSON.stringify(jsonData, null, 2), 'utf8');
        console.log("Message ID saved successfully");
    } catch (error) {
        console.error("Error writing to the data file:", error);
    }
}

const rolesMap = {
    '🌕': '1163380015191302214', // ID для роли "луны"
    '💸': '1163379884039618641', // ID для роли "хоумфронты"
    '💎': '1163380100520214591', // ID для роли "гравики"
    '☁️': '1163404742609879091', // ID для роли "газ"
    '🧊': '1163379553348096070'  // ID для роли "лёд"
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

        const reportChannel = guild.channels.cache.get(REPORT_CHANNEL_ID);
        if (!reportChannel) {
            console.error(`Report channel with ID ${REPORT_CHANNEL_ID} not found.`);
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


async function fetchGameNames() {
    try {
        const response = await axios.get('https://evewho.com/api/corplist/98769585');
        const characterNames = response.data.characters.map(character => character.name.toLowerCase()); 
        return new Set(characterNames); 
    } catch (error) {
        console.error('Failed to fetch game names:', error);
        return new Set();
    }
}

const DATA_FILE = path.join(__dirname, 'complianceData.json'); 

async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading data file:', error);
        return { nonComplianceCounter: {}, ignoreList: [] };
    }
}

async function writeData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing data file:', error);
    }
}


client.login(process.env.DISCORD_TOKEN); 
