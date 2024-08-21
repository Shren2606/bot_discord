const { google } = require('googleapis'); // Nhập thư viện Google APIs
const fs = require('fs'); // Nhập thư viện hệ thống tệp
const path = require('path'); // Nhập thư viện để xử lý đường dẫn tệp

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // Nhập các lớp từ Discord.js để tạo tin nhắn và nút nhấn

// Đọc các biến môi trường từ file .env
const CLIENT_DRIVE_ID = process.env.CLIENT_DRIVE_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const folderId = process.env.FOLDER_ID;

// Tạo đối tượng OAuth2 để xác thực với Google Drive API
const oauth2client = new google.auth.OAuth2(CLIENT_DRIVE_ID, CLIENT_SECRET, REDIRECT_URI);
oauth2client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Tạo đối tượng Google Drive API với thông tin xác thực
const drive = google.drive({ version: 'v3', auth: oauth2client });

// Hàm để lấy tệp từ Google Drive dựa trên tên tệp hoặc chế độ ngẫu nhiên
async function getDriveFile(fileName, message) {
    try {
        // Nếu lệnh là !random, lấy danh sách tất cả các tệp trong thư mục
        if (message.content === '!random') {
            const response = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name)',
            });
            const files = response.data.files;

            if (!files.length) {
                message.channel.send('Đang phát nhạc chế độ **random** Không tìm thấy tệp nào trong thư mục.');
            }
            return files;

        } else { // Nếu không phải lệnh !random, tìm kiếm tệp theo tên
            const response = await drive.files.list({
                q: `'${folderId}' in parents and name contains '${fileName}' and trashed = false`,
                fields: 'files(id, name)',
            });

            const files = response.data.files;

            if (!files.length) {
                message.channel.send(`Không tìm thấy tệp có tên "${fileName}" trong thư mục.`);
                return null;
            }

            // Trả về liên kết để tải xuống tệp từ Google Drive
            return `https://drive.google.com/uc?export=download&id=${files[0].id}`;
        }
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

// Hàm để liệt kê các tệp trong thư mục Google Drive và hiển thị theo trang
async function listFilesInFolder(message) {
    try {
        let files = [];
        let pageToken = null;
        const CHUNK_SIZE = 10; // Số lượng file mỗi lần gửi
        const pages = [];

        // Lặp qua các trang để lấy tất cả các tệp
        do {
            const response = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name), nextPageToken',
                pageToken: pageToken,
            });

            files = files.concat(response.data.files); // Nối các tệp vào danh sách
            pageToken = response.data.nextPageToken; // Cập nhật pageToken cho lần yêu cầu tiếp theo
        } while (pageToken);

        if (files.length === 0) {
            await message.channel.send('No files found.');
            return;
        }

        // Chia danh sách tệp thành các nhóm nhỏ
        for (let i = 0; i < files.length; i += CHUNK_SIZE) {
            const chunk = files.slice(i, i + CHUNK_SIZE);
            let fileList = '**Files:**\n';
            chunk.forEach((file, index) => {
                fileList += `${i + index + 1}. ${file.name}\n`;
            });
            pages.push(fileList); // Thêm nhóm tệp vào danh sách các trang
        }

        // Gửi trang đầu tiên
        let currentPage = 0;

        const embed = new EmbedBuilder()
            .setTitle('File List')
            .setDescription(pages[currentPage]);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pages.length <= 1 || currentPage === pages.length - 1)
            );

        const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });

        // Tạo bộ thu thập các tương tác với các nút
        const filter = (interaction) => interaction.isButton() && interaction.user.id === message.author.id;
        const collector = sentMessage.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'previous') {
                currentPage--;
            } else if (interaction.customId === 'next') {
                currentPage++;
            }

            const newEmbed = new EmbedBuilder()
                .setTitle('File List')
                .setDescription(pages[currentPage]);

            const newRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(pages.length <= 1 || currentPage === pages.length - 1)
                );

            await interaction.update({ embeds: [newEmbed], components: [newRow] });
        });

        collector.on('end', collected => {
            // Disable buttons after the collector ends
            row.components.forEach(button => button.setDisabled(true));
            sentMessage.edit({ components: [row] });
        });

    } catch (error) {
        console.log('Error:', error.message);
        await message.channel.send(`Error: ${error.message}`);
    }
}

// Hàm để tải lên một tệp vào Google Drive
async function uploadFiles() {
    const filePath = path.join(__dirname, "music3.mp3"); // Đường dẫn đến tệp cần tải lên
    try {
        const response = await drive.files.create({
            requestBody: {
                name: 'music3.mp3',
                parents: [folderId],
                mimeType: 'audio/mpeg'
            },
            media: {
                mimeType: 'audio/mpeg',
                body: fs.createReadStream(filePath) // Đọc tệp từ hệ thống
            }
        });
        console.log(response.data, response.status); // In kết quả của yêu cầu
    } catch (error) {
        console.log(error.message); // In lỗi nếu có
    }
}

module.exports = { getDriveFile, listFilesInFolder, uploadFiles }; // Xuất các hàm để sử dụng ở nơi khác
