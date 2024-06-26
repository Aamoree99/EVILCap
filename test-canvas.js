const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

const canvas = createCanvas(200, 200);
const ctx = canvas.getContext('2d');

// Рисование красного прямоугольника
ctx.fillStyle = 'red';
ctx.fillRect(10, 10, 100, 100);

// Получение изображения в формате Base64
const base64Image = canvas.toDataURL();

console.log('Изображение в формате Base64:', base64Image);

const data = base64Image.replace(/^data:image\/png;base64,/, '');

// Запись файла
fs.writeFile('rectangle.png', data, 'base64', (err) => {
    if (err) {
        console.error('Ошибка при сохранении файла:', err);
    } else {
        console.log('Изображение сохранено как rectangle.png');
    }
});