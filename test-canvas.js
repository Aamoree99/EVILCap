const { createCanvas, loadImage } = require('canvas');

const canvas = createCanvas(200, 200);
const ctx = canvas.getContext('2d');

ctx.fillStyle = 'red';
ctx.fillRect(10, 10, 100, 100);

console.log('<canvas> created');
