const crypto = require('crypto');

const keyString = "CwWWHliRCQdmHPVo4WQLkuwitjNQ402e";
const userCipher = "MXNINytZd05uKzhZdHNIc2FLYytGeERsS21weldxbWFJbmdLbmdqd05wV2FuVHJUUHlpN3Z3cVdxcVVPM1dEdnJUR1BrZUt2QzRxSGFBUkZxdythVk0wT3Q1VWNQVXVEMlNOVS94TTNub0RTQ2xNZTdZbVU0WCsvUnZ5R2hwWXo5ZkhoNlo5cytqRDQ4QUhBZHM2eWVydGNiSHhZSVI5dmlBdzRLOGJBTHB1QUl5aGlvbXh5alYyc2cyM3ExdEJ6Ojo6PDOHNe0KT/Tyq9ukFWoMdg==";

const decoded = Buffer.from(userCipher, 'base64').toString('binary');
const parts = decoded.split(":::");
const btoaEncrypted = parts[0];
const ivChars = parts[1];

const encryptedBuffer = Buffer.from(btoaEncrypted, 'base64');
const ivBuffer = Buffer.from(ivChars, 'binary');

const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keyString), ivBuffer);
let decrypted = decipher.update(encryptedBuffer);
decrypted = Buffer.concat([decrypted, decipher.final()]);

console.log("Decrypted payload:", decrypted.toString('utf8'));
