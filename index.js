const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const { handleMusicCommands } = require('./music');

const allowedChannelId = process.env.CHANNEL_ID; // Đảm bảo biến môi trường được đặt đúng

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Lưu trữ trạng thái thông báo
const notifiedChannels = new Set();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    // Đảm bảo bot không phản hồi các tin nhắn của chính nó
    if (message.author.bot) return;
    // Kiểm tra xem kênh có phải là kênh cho phép không
    if (message.channel.id !== allowedChannelId) {
        // Nếu kênh đã thông báo, không làm gì cả
        if (notifiedChannels.has(message.channel.id)) return;

        // Gửi thông báo và lưu ID kênh vào tập hợp




        await message.channel.send('Đây **Không** phải kênh gọi BOT');
        notifiedChannels.add(message.channel.id);
        return;
    }

    // Xử lý lệnh nhạc
    await handleMusicCommands(message, client);


});

// Đặt thời gian để xóa kênh đã thông báo khỏi tập hợp sau một khoảng thời gian nhất định (tùy chọn)
setInterval(() => {
    notifiedChannels.clear();
}, 60000); // Xóa các kênh đã thông báo sau 1 phút

client.login(process.env.TOKEN_DISCORD);
