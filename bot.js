const { Client, GatewayIntentBits } = require('discord.js');
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

const waitList = new Map();
const messageMap = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    checkDiscordMembersAgainstGameList();
    cron.schedule('0 0 * * *', checkDiscordMembersAgainstGameList); 
});

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
