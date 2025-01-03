const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config'); 
const fs = require('fs');

const dataFilePath = './data.json';

if (!BOT_TOKEN) {
  throw new Error('Bot token is required! Set it in the config.js file.');
}

const bot = new Telegraf(BOT_TOKEN);


function readData() {
  const data = fs.readFileSync(dataFilePath);
  return JSON.parse(data);
}

function writeData(data) {
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
}

let { admins, sudoUsers, userLocks } = readData();

// Admin kontrolü için middleware
function adminOnly(ctx, next) {
  if (!admins.includes(ctx.from.id)) {
    return ctx.reply('Bu komutu kullanma yetkiniz yok.');
  }
  return next();
}

// Sudo kontrolü için middleware
function sudoOnly(ctx, next) {
  if (!sudoUsers.includes(ctx.from.id)) {
    return ctx.reply('Bu komutu kullanmak için sudo yetkiniz yok.');
  }
  return next();
}

// Sticker ve GIF gönderimini kontrol eden middleware
bot.use((ctx, next) => {
  if (ctx.message && ctx.message.from) {
    const username = ctx.message.from.username;
    const locks = userLocks[username] || {};

    if (ctx.message.sticker && locks.sticker) {
      return ctx.deleteMessage();
    }

    if (ctx.message.animation && locks.gif) {
      return ctx.deleteMessage();
    }
  }
  return next();
});

// /start komutunu dinle
bot.start((ctx) => {
  ctx.reply('Kullanıcıların sticker ve GIF gönderimini kontrol edebilirsin. Komutlar için /help yazabilirsin. MESAJ SİLME YETKİSİ GEREK!');
});

// /help komutunu dinle
bot.command('help', (ctx) => {
  ctx.reply(`Kullanabileceğiniz komutlar:
/ulock <sticker|gif|all> <username> - Kullanıcının belirli içerik göndermesini engeller.
/free <username> - Kullanıcının tüm yasaklarını kaldırır.
/list - Yasaklı kullanıcıların listesini gösterir.
/addadmin <userId> - Yeni bir admin ekler. (Sudo yetkisi gerektirir)
/removeadmin <userId> - Admini kaldırır. (Sudo yetkisi gerektirir)`);
});

// /ulock komutunu dinle
bot.command('ulock', adminOnly, (ctx) => {
  const args = ctx.message.text.split(' ');

  if (args.length < 3) {
    return ctx.reply('Hatalı kullanım! Doğru kullanım: /ulock <sticker|gif|all> <username>');
  }

  const type = args[1].toLowerCase();
  const username = args[2].replace('@', ''); // Kullanıcı adındaki @ işaretini kaldır

  if (!['sticker', 'gif', 'all'].includes(type)) {
    return ctx.reply('Hatalı tür! Sadece "sticker", "gif" veya "all" destekleniyor.');
  }

  // Kullanıcıyı kilitle
  if (!userLocks[username]) {
    userLocks[username] = { sticker: false, gif: false };
  }

  if (type === 'all') {
    userLocks[username].sticker = true;
    userLocks[username].gif = true;
  } else {
    userLocks[username][type] = true;
  }

  // Veriyi güncelle ve JSON dosyasına yaz
  writeData({ admins, sudoUsers, userLocks });

  ctx.reply(`@${username} kullanıcısının ${type === 'all' ? 'tüm' : type} gönderimi engellendi!`);
});

// /free komutunu dinle
bot.command('free', adminOnly, (ctx) => {
  const args = ctx.message.text.split(' ');

  if (args.length < 2) {
    return ctx.reply('Hatalı kullanım! Doğru kullanım: /free <username>');
  }

  const username = args[1].replace('@', ''); // Kullanıcı adındaki @ işaretini kaldır

  if (userLocks[username]) {
    userLocks[username].sticker = false;
    userLocks[username].gif = false;

    // Veriyi güncelle ve JSON dosyasına yaz
    writeData({ admins, sudoUsers, userLocks });

    ctx.reply(`@${username} kullanıcısının tüm yasakları kaldırıldı.`);
  } else {
    ctx.reply(`@${username} için herhangi bir yasak bulunamadı.`);
  }
});

// /list komutunu dinle
bot.command('list', adminOnly, (ctx) => {
  const lockedUsers = Object.entries(userLocks).filter(([, locks]) => locks.sticker || locks.gif);

  if (lockedUsers.length === 0) {
    return ctx.reply('Şu anda yasaklı kullanıcı yok.');
  }

  const list = lockedUsers.map(([username, locks]) => {
    const restrictions = [];
    if (locks.sticker) restrictions.push('Sticker');
    if (locks.gif) restrictions.push('GIF');
    return `@${username}: ${restrictions.join(', ')}`;
  }).join('\n');

  ctx.reply(`Yasaklı kullanıcılar:\n${list}`);
});

// /addadmin komutunu dinle (Sudo Yetkisi)
bot.command('addadmin', sudoOnly, (ctx) => {
  const args = ctx.message.text.split(' ');

  if (args.length < 2) {
    return ctx.reply('Hatalı kullanım! Doğru kullanım: /addadmin <userId>');
  }

  const userId = Number(args[1]);

  if (isNaN(userId)) {
    return ctx.reply('Geçersiz kullanıcı ID!');
  }

  admins.push(userId);

  // Veriyi güncelle ve JSON dosyasına yaz
  writeData({ admins, sudoUsers, userLocks });

  ctx.reply(`Kullanıcı ${userId} admin olarak eklendi.`);
});

// /removeadmin komutunu dinle (Sudo Yetkisi)
bot.command('removeadmin', sudoOnly, (ctx) => {
  const args = ctx.message.text.split(' ');

  if (args.length < 2) {
    return ctx.reply('Hatalı kullanım! Doğru kullanım: /removeadmin <userId>');
  }

  const userId = Number(args[1]);

  if (isNaN(userId)) {
    return ctx.reply('Geçersiz kullanıcı ID!');
  }

  const index = admins.indexOf(userId);
  if (index !== -1) {
    admins.splice(index, 1);

    // Veriyi güncelle ve JSON dosyasına yaz
    writeData({ admins, sudoUsers, userLocks });

    ctx.reply(`Kullanıcı ${userId} adminlikten kaldırıldı.`);
  } else {
    ctx.reply(`Kullanıcı ${userId} zaten admin değil.`);
  }
});

// Başlatıldığında botun hazır olduğunu konsola yazdır
bot.launch().then(() => {
  console.log('Bot çalışmaya başladı!');
});

// Graceful stop for termination signals
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
