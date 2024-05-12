const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const dotenv = require('dotenv');
dotenv.config();
const qs = require('querystring');
const fs = require('fs').promises;
const path = require('path');

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
const LOG_CHANNEL_ID = '1238987553735184454'; 
const REPORT_CHANNEL_ID= '1230611265794080848';
const MAIN_CHANNEL_ID= '1172972375688626276';

const waitList = new Map();
const messageMap = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    checkDiscordMembersAgainstGameList();
    cron.schedule('0 0 * * *', checkDiscordMembersAgainstGameList); 
    cron.schedule('0 10 * * *', () => {
        console.log('Выполняю задачу отправки уведомлений о мероприятии.');
        scheduleDailyActivity(client);
    });
});



async function scheduleDailyActivity(client) {
    console.log(`Пытаюсь получить гильдию с ID: ${GUILD_ID}`);

    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return console.log("Гильдия не найдена");

    const channel = guild.channels.cache.get(MAIN_CHANNEL_ID);
    if (!channel) return console.log("Канал не найден");
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
        console.log(`Кнопка ${interaction.customId} была нажата пользователем ${interaction.user.username}.`);
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
                    console.log(`Создан ивент: ${event.name}`);
            
                    console.log('Событие успешно создано!');
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
                    console.log("Событие не было создано, сообщение не отправлено.");
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
        console.log(`Collected ${participants.size} participants.`);
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
        console.log(`Channel with ID ${W_CHANNEL_ID} not found in guild ${member.guild.id}`);
        return;
    }

    console.log(`New member joined: ${member.user.tag} (ID: ${member.id}) in guild ${member.guild.id}`);
    if (!/^[\w\s]+ \([\w]+\)$/.test(member.displayName)) {
        console.log(`Member ${member.user.tag} (ID: ${member.id}) does not match the required nickname format.`);
        channel.send(`${member.toString()}, пожалуйста, напиши свой ник и имя через запятую, например: Ник игры, Имя.`);
        waitList.set(member.id, member.guild.id);
    } else {
        console.log(`Member ${member.user.tag} (ID: ${member.id}) matches the required nickname format.`);
    }
});

client.on('messageCreate', async message => {
    console.log(`Message from ${message.author.tag}: ${message.content}`);

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
    console.log('Обработчик messageReactionAdd запущен');
    if (user.bot || reaction.message.channel.id !== W_CHANNEL_ID) return;

    const originalUserId = messageMap.get(reaction.message.id);
    if (!originalUserId || user.id !== originalUserId) return; // Убедимся, что реакцию ставит нужный пользователь

    if (reaction.emoji.name === '1️⃣') {
        console.log(`Пользователь ${user.tag} выбрал корпорацию Cosmic Capybara Crew.`);
        try {
            const role = reaction.message.guild.roles.cache.find(role => role.name === 'Пилот CCCrew');
            const member = reaction.message.guild.members.cache.get(user.id);
            await member.roles.add(role);
            console.log(`Роль ${role.name} была успешно добавлена пользователю ${user.tag}.`);

            const welcomeChannel = reaction.message.guild.channels.cache.get(REPORT_CHANNEL_ID);
            if (welcomeChannel) {
                await welcomeChannel.send(`Добро пожаловать на сервер, ${user.toString()}! Мы рады видеть тебя в рядах Пилотов CCCrew!`);
            } else {
                console.log('Канал для приветствия не найден.');
            }
        } catch (error) {
            console.error('Ошибка при добавлении роли:', error);
        }
    } else if (reaction.emoji.name === '2️⃣') {
        const targetUser = reaction.message.guild.members.cache.get('739618523076362310'); // Подставьте реальный ID
        reaction.message.channel.send(`${user.toString()}, ты выбрал другие корпорации. ${targetUser.toString()}, пожалуйста, помоги!`);
    }
});




async function checkDiscordMembersAgainstGameList() {
    const { nonComplianceCounter, ignoreList } = await readData();
    console.log("Current Ignore List:", ignoreList); 

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
