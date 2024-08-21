const { createAudioPlayer, createAudioResource, joinVoiceChannel } = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { Readable } = require('stream');
const fetch = require('node-fetch');
const { listFilesInFolder, uploadFiles } = require('./drive');
const { getDriveFile } = require('./drive');

let queue = [];
let isPlaying = false;
let connection = null;
let listName = [];
let currentSong = null;

async function handleMusicCommands(message, client) {
    // Xử lý các lệnh nhạc hiện có
    if (message.content.startsWith('!play') || message.content.startsWith('!p')) {
        await playMusic(message);
    } else if (message.content.startsWith('!leave') || message.content.startsWith('!lve')) {
        leaveChannel(message);
    } else if (message.content.startsWith('!queue') || message.content.startsWith('!q')) {
        displayQueue(message);
    } else if (message.content.startsWith('!random') || message.content.startsWith('!r')) {
        await playRandomSongs(message);
    } else if (message.content === '!list' || message.content.startsWith('!l')) {
        listFilesInFolder(message);
    } else if (message.content === '!add') {
        uploadFiles();
        message.channel.send('Đã thêm music3 vào Google Drive');
    } else if (message.content.startsWith('!help') || message.content.startsWith('!commands')) {
        await showHelp(message);
    }
}

// Hàm hiển thị danh sách lệnh
async function showHelp(message) {
    const helpMessage = `
**Danh sách lệnh:**
- **!play** hoặc **!p**: Phát nhạc trong list
- **!leave** hoặc **!lve**: Rời khỏi kênh thoại
- **!queue** hoặc **!q**: Hiển thị danh sách hàng đợi nhạc
- **!random** hoặc **!r**: Phát nhạc ngẫu nhiên
- **!list** hoặc **!l**: Hiển thị danh sách các file từ Google Drive
- **!add**: Thêm file vào Google Drive
- **!help** hoặc **!commands**: Hiển thị danh sách lệnh
    `;

    await message.channel.send(helpMessage);
}

async function playMusic(message) {
    const fileName = message.content.split(' ').slice(1).join(' ');
    if (!fileName) return message.channel.send('Vui lòng cung cấp tên tệp!');

    const directLink = await getDriveFile(fileName, message);
    console.log(directLink)
    if (directLink) {
        queue.push(directLink);
        listName.push(fileName);

        if (!isPlaying) {
            await playNext(message);
        } else {
            message.channel.send('Đã thêm vào hàng đợi phát nhạc!');
        }
    } else {
        message.channel.send(`Không tìm thấy tệp có tên "${fileName}" trong thư mục.`);
    }
}

async function playNext(message) {
    if (queue.length === 0) {
        isPlaying = false;
        currentSong = null;
        return;
    }

    isPlaying = true;
    const url = queue.shift();
    currentSong = listName.shift();

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.channel.send('Bạn cần vào một kênh thoại trước!');

    connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    try {
        const response = await fetch(url);
        const stream = Readable.from(response.body);
        const resource = createAudioResource(stream);

        player.play(resource);

        player.on('error', error => console.error(`Player error: ${error.message}`));
        player.on('idle', () => playNext(message));

        message.channel.send(`Đang phát: **${currentSong}** từ Google Drive!`);
    } catch (error) {
        console.error(error);
        message.channel.send('Không thể phát nhạc từ URL này!');
        playNext(message);
    }
}

function leaveChannel(message) {
    if (connection) {
        connection.destroy();
        connection = null;
        queue = [];
        listName = [];
        isPlaying = false;
        message.channel.send('Bot đã rời khỏi kênh!');
    } else {
        message.channel.send('Bot không ở trong kênh thoại nào!');
    }
}

async function displayQueue(message, page = 0) {
    if (listName.length === 0 && !currentSong) {
        return message.channel.send('Hàng đợi nhạc hiện tại đang trống.');
    }

    const itemsPerPage = 10;
    const totalPages = Math.ceil(listName.length / itemsPerPage);

    // Kiểm tra trang hợp lệ
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;

    const startIndex = page * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, listName.length);

    // Tạo embed
    const embed = new EmbedBuilder()
        .setTitle('Hàng Đợi Nhạc')
        .setColor('#0099ff');

    // Thêm thông tin về bài hát hiện tại
    if (currentSong) {
        embed.addFields(
            { name: 'Bài Đang Phát', value: currentSong, inline: false }
        );
    }

    // Thêm danh sách nhạc chờ cho trang hiện tại
    const queueList = listName.slice(startIndex, endIndex)
        .map((item, index) => `${startIndex + index + 1}. ${item}`)
        .join('\n');
    embed.addFields(
        { name: `Danh Sách Nhạc Đang Chờ - Trang ${page + 1} / ${totalPages}`, value: queueList, inline: false }
    );

    // Tạo các nút bấm cho điều hướng trang
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('previous')
                .setLabel('Trang Trước')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Trang Tiếp Theo')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages - 1)
        );

    // Gửi embed và các nút bấm tới kênh
    const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });

    // Khởi tạo collector để xử lý các nút bấm
    const filter = (interaction) => interaction.isButton() && interaction.user.id === message.author.id;
    const collector = sentMessage.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (interaction) => {
        if (interaction.customId === 'previous') {
            page--;
        } else if (interaction.customId === 'next') {
            page++;
        }

        const newEmbed = new EmbedBuilder()
            .setTitle('Hàng Đợi Nhạc')
            .setColor('#0099ff');

        if (currentSong) {
            newEmbed.addFields(
                { name: 'Bài Đang Phát', value: currentSong, inline: false }
            );
        }

        const newQueueList = listName.slice(page * itemsPerPage, (page + 1) * itemsPerPage)
            .map((item, index) => `${(page * itemsPerPage) + index + 1}. ${item}`)
            .join('\n');
        newEmbed.addFields(
            { name: `Danh Sách Nhạc Đang Chờ - Trang ${page + 1} / ${totalPages}`, value: newQueueList, inline: false }
        );

        const newRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('Trang Trước')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Trang Tiếp Theo')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1)
            );

        await interaction.update({ embeds: [newEmbed], components: [newRow] });
    });

    collector.on('end', () => {
        // Vô hiệu hóa các nút bấm sau khi collector kết thúc
        row.components.forEach(button => button.setDisabled(true));
        sentMessage.edit({ components: [row] });
    });
}

async function playRandomSongs(message) {
    const files = await getDriveFile('randomsada', message);

    if (files === null) {
        return; // Stop further execution if no URL is returned
    }

    if (files.length === 0) {
        return message.channel.send('No files found.');
    }

    const shuffledFiles = files.sort(() => 0.5 - Math.random()).slice(0, 20);
    shuffledFiles.forEach(file => {
        const directLink = `https://drive.google.com/uc?export=download&id=${file.id}`;
        queue.push(directLink);
        listName.push(file.name);
    });

    if (!isPlaying) {
        await playNext(message);
    } else {
        message.channel.send('Random songs added to the queue!');
    }
}

module.exports = { handleMusicCommands };
