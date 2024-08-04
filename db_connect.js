const mysql = require('mysql2');
require('dotenv').config();

let connection;

const connect = () => {
    connection = mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        charset: 'utf8mb4'
    });

    connection.connect((err) => {
        if (err) {
            console.error('Ошибка подключения к базе данных:', err.stack);
            setTimeout(connect, 5000); // Попробовать подключиться снова через 5 секунд
            return;
        }
        console.log('Подключение к базе данных установлено, ID подключения:', connection.threadId);
    });

    connection.on('error', (err) => {
        console.error('Ошибка базы данных:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            // Соединение потеряно, пробуем переподключиться
            connect();
        } else {
            // Другие типы ошибок могут быть обработаны по-другому
            throw err;
        }
    });
};

const checkConnection = () => {
    if (connection) {
        connection.ping((err) => {
            if (err) {
                console.error('Потеряно соединение с базой данных. Пытаюсь переподключиться...', err);
                connect();
            } else {
                console.log('Соединение с базой данных активно.');
            }
        });
    } else {
        console.log('Соединение с базой данных не установлено. Пытаюсь подключиться...');
        connect();
    }
};

connect();
checkConnection();
setInterval(checkConnection, 3600000); 

module.exports = connection;
