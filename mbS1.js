const mineflayer = require('mineflayer');
const readline = require('readline')
const Vec3 = require('vec3');
const fs = require('fs');
const axios = require('axios');
const { OpenAI } = require('openai');
const { Telegraf } = require('telegraf');

// 🤖 Telegram бот
const TG_TOKEN = '8101205123:AAGpdjkWXDZEvHbEuVI6F5PojM3--QjV-pA';
const TG_CHAT_ID = '-1003940494517';
const TG_TOPIC_ID = 3;

// Создаём экземпляр бота
const telegramBot = new Telegraf(TG_TOKEN);

// Настройки уведомлений
let notificationsEnabled = true;
let telegramAdmins = new Set(); // Администраторы Telegram

// Отправка сообщения в Telegram
async function sendToTelegram(text, parseMode = 'HTML') {
  if (!notificationsEnabled) return;
  
  try {
    const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TG_CHAT_ID,
      message_thread_id: TG_TOPIC_ID,
      text: text,
      parse_mode: parseMode
    }, { timeout: 10000 });
  } catch (e) {
    console.error('[Telegram] Ошибка:', e.message);
  }
}

// Отправка сообщения с кнопками
async function sendTelegramWithButtons(text, buttons, parseMode = 'HTML') {
  if (!notificationsEnabled) return;
  
  try {
    const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TG_CHAT_ID,
      message_thread_id: TG_TOPIC_ID,
      text: text,
      parse_mode: parseMode,
      reply_markup: {
        inline_keyboard: buttons
      }
    }, { timeout: 10000 });
  } catch (e) {
    console.error('[Telegram] Ошибка:', e.message);
  }
}

// Команды Telegram бота
telegramBot.start((ctx) => {
  const userId = ctx.from.id;
  telegramAdmins.add(userId);
  ctx.reply(`👋 Привет! Я бот клана LaEspada.\n\nДоступные команды:\n/status - статус бота\n/players - онлайн игроки\n/stats [ник] - статистика\n/kick [ник] [причина] - кикнуть\n/add_blacklist [ник] [причина] - добавить в ЧС\n/notify - вкл/выкл уведомления\n\nВаш ID: ${userId}`, { parse_mode: 'HTML' });
});

telegramBot.command('status', (ctx) => {
  if (!bot) {
    ctx.reply('❌ Бот оффлайн');
    return;
  }
  
  const ping = bot._client.latency || 'N/A';
  const players = Object.keys(bot.players || {}).length;
  const online = bot.player ? '🟢 Онлайн' : '🔴 Оффлайн';
  
  ctx.reply(`🤖 <b>Статус бота LaEspada</b>\n\n${online}\n🏓 Пинг: ${ping}мс\n👥 Игроков онлайн: ${players}\n⏰ Время: ${new Date().toLocaleTimeString('ru-RU')}`, { parse_mode: 'HTML' });
});

telegramBot.command('players', (ctx) => {
  if (!bot || !bot.players) {
    ctx.reply('❌ Бот оффлайн или нет данных');
    return;
  }
  
  const players = Object.values(bot.players)
    .filter(p => p.username !== bot.username)
    .map(p => p.username);
  
  if (players.length === 0) {
    ctx.reply('👻 Никого нет онлайн');
    return;
  }
  
  const clanPlayers = players.filter(p => clanMembersList.has(p.toLowerCase()));
  const otherPlayers = players.filter(p => !clanMembersList.has(p.toLowerCase()));
  
  let message = `<b>👥 Игроки онлайн (${players.length})</b>\n\n`;
  
  if (clanPlayers.length > 0) {
    message += `<b>Наши:</b>\n${clanPlayers.map(p => `• ${p}`).join('\n')}\n\n`;
  }
  
  if (otherPlayers.length > 0) {
    message += `<b>Другие:</b>\n${otherPlayers.map(p => `• ${p}`).join('\n')}`;
  }
  
  ctx.reply(message, { parse_mode: 'HTML' });
});

telegramBot.command('stats', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    ctx.reply('❌ Укажите ник: /stats [ник]');
    return;
  }
  
  const target = args[0];
  const s = getStats(target);
  const blData = clanBL[target.toLowerCase()];
  const blStatus = blData ? `🚫 ЧС (${blData.reason})` : '✅ Чист';
  const kd = calculateKD(s.kills, s.deaths);
  const joinDate = joinDates[target.toLowerCase()] || 'Неизвестно';
  const notesCount = getNotes(target).notes.length;
  
  const message = `<b>📊 Статистика ${target}</b>\n\n` +
    `⚔️ Убийств: ${s.kills}\n` +
    `💀 Смертей: ${s.deaths}\n` +
    `📈 К/Д: ${kd}\n` +
    `📝 Заметок: ${notesCount}\n` +
    `📅 Вступление: ${joinDate}\n` +
    `🔒 Статус: ${blStatus}`;
  
  ctx.reply(message, { parse_mode: 'HTML' });
});

telegramBot.command('kick', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    ctx.reply('❌ Формат: /kick [ник] [причина]');
    return;
  }
  
  const target = args[0];
  const reason = args.slice(1).join(' ');
  
  if (!bot) {
    ctx.reply('❌ Бот оффлайн');
    return;
  }
  
  // Проверяем, есть ли игрок в клане
  refreshClanMembers();
  setTimeout(() => {
    const inClan = clanMembersList.has(target.toLowerCase());
    
    if (inClan) {
      bot.chat(`/c kick ${target}`);
      ctx.reply(`✅ Игрок ${target} кикнут из клана\n📝 Причина: ${reason}`, { parse_mode: 'HTML' });
      logAction('kick', 'Telegram', target, reason);
      
      // Уведомление в клановый чат
      setTimeout(() => {
        bot.chat('/cc');
        setTimeout(() => {
          bot.chat(`/cc &c&l[Telegram] &fИгрок &e${target} &fбыл кикнут из клана. &7Причина: &f${reason}`);
        }, 600);
      }, 1000);
    } else {
      ctx.reply(`❌ Игрок ${target} не состоит в клане`, { parse_mode: 'HTML' });
    }
  }, 2000);
});

telegramBot.command('add_blacklist', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    ctx.reply('❌ Формат: /add_blacklist [ник] [причина]');
    return;
  }
  
  const target = args[0];
  const reason = args.slice(1).join(' ');
  
  // Добавляем в ЧС
  clanBL[target.toLowerCase()] = { nick: target, reason, date: new Date().toLocaleDateString('ru-RU') };
  saveClanBL(clanBL);
  
  ctx.reply(`✅ Игрок ${target} добавлен в ЧС\n📝 Причина: ${reason}`, { parse_mode: 'HTML' });
  
  // Пытаемся кикнуть если в клане
  if (bot) {
    refreshClanMembers();
    setTimeout(() => {
      const inClan = clanMembersList.has(target.toLowerCase());
      if (inClan) {
        bot.chat(`/c kick ${target}`);
      }
    }, 2000);
  }
});

telegramBot.command('notify', (ctx) => {
  notificationsEnabled = !notificationsEnabled;
  const status = notificationsEnabled ? '🔔 Включены' : '🔕 Выключены';
  ctx.reply(`${status} уведомления о разрушении блоков`, { parse_mode: 'HTML' });
});

// ========== АНАЛИТИКА И ОТЧЁТЫ ==========

// Хранилище для собранной статистики с сервера
let serverStatsCache = {
  players: [],
  lastUpdated: null,
  isLoading: false
};

// Функция сбора статистики с сервера через /c stats
function collectServerStats() {
  return new Promise((resolve, reject) => {
    if (serverStatsCache.isLoading) {
      resolve(serverStatsCache);
      return;
    }
    
    serverStatsCache.isLoading = true;
    serverStatsCache.players = [];
    let pendingStatsRequest = { currentPage: 1, totalPages: 1, resolved: false };
    
    // Отправляем первую страницу
    if (bot && bot.chat) {
      bot.chat('/c stats');
    }
    
    // Таймаут на случай если сервер не отвечает
    const timeout = setTimeout(() => {
      if (!pendingStatsRequest.resolved) {
        pendingStatsRequest.resolved = true;
        serverStatsCache.isLoading = false;
        serverStatsCache.lastUpdated = new Date();
        resolve(serverStatsCache);
      }
    }, 15000);
    
    // Обработчик сообщений для сбора статистики
    const statsHandler = (jsonMsg) => {
      const message = jsonMsg.toString();
      
      // Проверяем информацию о страницах
      const pageMatch = message.match(/страница\s+(\d+)\s+из\s+(\d+)/i);
      if (pageMatch) {
        pendingStatsRequest.currentPage = parseInt(pageMatch[1]);
        pendingStatsRequest.totalPages = parseInt(pageMatch[2]);
        return;
      }
      
      // Парсим статистику игроков: "Игрок Ник: Убийств: X, Смертей: Y"
      const statsMatch = message.match(/Статистика игрока\s+(\S+):\s*Убийств:\s*(\d+),\s*Смертей:\s*(\d+)/i);
      if (statsMatch) {
        const nick = statsMatch[1];
        const kills = parseInt(statsMatch[2]);
        const deaths = parseInt(statsMatch[3]);
        
        // Проверяем, не добавили ли уже этого игрока
        const existing = serverStatsCache.players.find(p => p.nick.toLowerCase() === nick.toLowerCase());
        if (!existing) {
          serverStatsCache.players.push({ nick, kills, deaths });
        }
        
        // Если последняя страница - завершаем
        if (pendingStatsRequest.currentPage >= pendingStatsRequest.totalPages) {
          // Нужно запросить следующую страницу если она есть
          if (pendingStatsRequest.currentPage < pendingStatsRequest.totalPages) {
            pendingStatsRequest.currentPage++;
            setTimeout(() => {
              if (bot && bot.chat) {
                bot.chat(`/c stats ${pendingStatsRequest.currentPage}`);
              }
            }, 500);
          } else {
            if (!pendingStatsRequest.resolved) {
              pendingStatsRequest.resolved = true;
              clearTimeout(timeout);
              serverStatsCache.isLoading = false;
              serverStatsCache.lastUpdated = new Date();
              resolve(serverStatsCache);
            }
          }
        }
        return;
      }
      
      // Если это сообщение "страница X из Y" и мы на последней странице
      if (message.includes('страница') && message.includes('из')) {
        if (pendingStatsRequest.currentPage < pendingStatsRequest.totalPages) {
          // Запрашиваем следующую страницу
          pendingStatsRequest.currentPage++;
          setTimeout(() => {
            if (bot && bot.chat) {
              bot.chat(`/c stats ${pendingStatsRequest.currentPage}`);
            }
          }, 500);
        } else {
          if (!pendingStatsRequest.resolved) {
            pendingStatsRequest.resolved = true;
            clearTimeout(timeout);
            serverStatsCache.isLoading = false;
            serverStatsCache.lastUpdated = new Date();
            resolve(serverStatsCache);
          }
        }
      }
    };
    
    // Регистрируем обработчик
    if (bot) {
      bot.on('message', statsHandler);
      
      // Убираем обработчик после завершения
      setTimeout(() => {
        bot.removeListener('message', statsHandler);
      }, 20000);
    }
  });
}

// Функция сбора аналитики (использует данные с сервера)
async function getAnalytics(ctx = null) {
  // Собираем статистику с сервера
  const serverData = await collectServerStats();
  
  const allStats = serverData.players;
  
  if (allStats.length === 0) {
    // Если нет данных с сервера, используем локальные
    const localStats = Object.values(playerStats);
    if (localStats.length === 0) return null;
    
    const topKills = [...localStats].sort((a, b) => b.kills - a.kills).slice(0, 5);
    const topDeaths = [...localStats].sort((a, b) => b.deaths - a.deaths).slice(0, 5);
    const totalKills = localStats.reduce((sum, s) => sum + s.kills, 0);
    const totalDeaths = localStats.reduce((sum, s) => sum + s.deaths, 0);
    const avgKD = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills;
    
    return { topKills, topDeaths, totalKills, totalDeaths, avgKD, allStats: localStats, fromServer: false };
  }
  
  // Топ по убийствам
  const topKills = [...allStats].sort((a, b) => b.kills - a.kills).slice(0, 5);
  
  // Топ по смертям  
  const topDeaths = [...allStats].sort((a, b) => b.deaths - a.deaths).slice(0, 5);
  
  // Общая статистика
  const totalKills = allStats.reduce((sum, s) => sum + s.kills, 0);
  const totalDeaths = allStats.reduce((sum, s) => sum + s.deaths, 0);
  const avgKD = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills;
  
  return { topKills, topDeaths, totalKills, totalDeaths, avgKD, allStats, fromServer: true };
}

// Команда аналитики
telegramBot.command('analytics', async (ctx) => {
  ctx.reply('⏳ Собираю статистику с сервера...');
  
  const analytics = await getAnalytics(ctx);
  
  if (!analytics) {
    ctx.reply('❌ Нет данных для аналитики');
    return;
  }
  
  const { topKills, topDeaths, totalKills, totalDeaths, avgKD, fromServer } = analytics;
  
  let message = `📊 <b>Аналитика клана LaEspada</b>\n\n`;
  
  if (fromServer) {
    message += `<i>📡 Данные с сервера</i>\n\n`;
  }
  
  message += `<b>📈 Общая статистика</b>\n`;
  message += `⚔️ Всего убийств: ${totalKills}\n`;
  message += `💀 Всего смертей: ${totalDeaths}\n`;
  message += `📊 Средний К/Д: ${avgKD}\n`;
  message += `👥 Игроков в статистике: ${analytics.allStats.length}\n\n`;
  
  message += `<b>🏆 Топ 5 по убийствам</b>\n`;
  topKills.forEach((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    message += `${medal} ${p.nick} - ${p.kills} ⚔️\n`;
  });
  message += `\n`;
  
  message += `<b>💀 Топ 5 по смертям</b>\n`;
  topDeaths.forEach((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    message += `${medal} ${p.nick} - ${p.deaths} 💀\n`;
  });
  
  ctx.reply(message, { parse_mode: 'HTML' });
});

// Рекомендации по улучшению К/Д
telegramBot.command('advice', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const target = args.length > 0 ? args[0] : null;
  
  if (target) {
    const s = getStats(target);
    const kd = calculateKD(s.kills, s.deaths);
    
    let advice = '';
    const kdNum = parseFloat(kd);
    
    if (s.deaths === 0 && s.kills > 0) {
      advice = '🔥 Легенда! Нулевая смертность!';
    } else if (kdNum >= 2.0) {
      advice = '⭐ Отличный результат! Продолжай в том же духе!';
    } else if (kdNum >= 1.0) {
      advice = '👍 Хороший результат. Старайся быть более аккуратным в бою.';
    } else if (kdNum >= 0.5) {
      advice = '⚠️ Есть над чем работать. Совет: изучи тактику и больше тренируйся на арене.';
    } else {
      advice = '❌ Нужно улучшение. Рекомендую: больше PvP практики, избегать 1vN ситуаций.';
    }
    
    const message = `💡 <b>Рекомендации для ${target}</b>\n\n` +
      `📊 Статистика: ${s.kills} ⚔️ / ${s.deaths} 💀\n` +
      `📈 К/Д: ${kd}\n\n` +
      `💬 <b>Совет:</b> ${advice}`;
    
    ctx.reply(message, { parse_mode: 'HTML' });
  } else {
    // Общие советы
    const message = `💡 <b>Общие рекомендации для клана</b>\n\n` +
      `<b>📌 Как улучшить К/Д:</b>\n\n` +
      `1. <b>Тренируйся на арене</b> - 1v1 с клановцами\n` +
      `2. <b>Изучай карту</b> - знай укрытия и точки эвакуации\n` +
      `3. <b>Не ввязывайся в 1vN</b> - дождись подмоги\n` +
      `4. <b>Используй зелья</b> - скорость и сила дают преимущество\n` +
      `5. <b>Работай в команде</b> - прикрой союзника\n\n` +
      `<i>Используй /advice [ник] для персональных рекомендаций</i>`;
    
    ctx.reply(message, { parse_mode: 'HTML' });
  }
});

// Рейтинг полезности
telegramBot.command('rating', (ctx) => {
  const allStats = Object.values(playerStats);
  
  if (allStats.length === 0) {
    ctx.reply('❌ Нет данных для рейтинга');
    return;
  }
  
  // Рассчитываем "полезность"
  // Формула: kills * 2 - deaths + (вступление в клан - чем раньше, тем лучше)
  const rated = allStats.map(s => {
    const joinDate = joinDates[s.nick.toLowerCase()] || '01.01.2025';
    const joinTimestamp = new Date(joinDate.split('/')[0].split('.')[2], 
      joinDate.split('/')[0].split('.')[1] - 1, 
      joinDate.split('/')[0].split('.')[0]).getTime();
    const daysInClan = Math.max(1, (Date.now() - joinTimestamp) / (1000 * 60 * 60 * 24));
    const activity = (s.kills + s.deaths) / daysInClan; // активность в день
    
    const usefulness = Math.round((s.kills * 2 - s.deaths + activity * 10) * 10) / 10;
    
    return { nick: s.nick, kills: s.kills, deaths: s.deaths, usefulness, activity: activity.toFixed(2) };
  });
  
  // Сортируем по полезности
  const sorted = rated.sort((a, b) => b.usefulness - a.usefulness).slice(0, 10);
  
  let message = `🏅 <b>Рейтинг полезности клана</b>\n\n`;
  message += `<i>Формула: (убийства × 2 - смерти) + активность</i>\n\n`;
  
  sorted.forEach((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    message += `${medal} <b>${p.nick}</b>\n`;
    message += `   ⚔️ ${p.kills} | 💀 ${p.deaths} | 📈 ${p.activity}/день | ⭐ ${p.usefulness}\n`;
  });
  
  ctx.reply(message, { parse_mode: 'HTML' });
});

// Автоматический отчёт каждые 6 часов
let reportInterval = null;

function startReports() {
  if (reportInterval) clearInterval(reportInterval);
  
  // Первый отчёт через 10 минут после запуска
  setTimeout(() => sendPeriodicReport(), 10 * 60 * 1000);
  
  // Далее каждые 6 часов
  reportInterval = setInterval(() => sendPeriodicReport(), 6 * 60 * 60 * 1000);
}

async function sendPeriodicReport() {
  const analytics = await getAnalytics();
  if (!analytics) return;
  
  const { topKills, topDeaths, totalKills, totalDeaths, avgKD, allStats } = analytics;
  
  const message = `📊 <b>Авто-отчёт клана</b>\n\n` +
    `<b>📈 За последнее время:</b>\n` +
    `⚔️ Убийств: +${totalKills}\n` +
    `💀 Смертей: +${totalDeaths}\n` +
    `📊 К/Д: ${avgKD}\n\n` +
    `<b>🏆 Топ убийц:</b>\n` +
    topKills.slice(0, 3).map((p, i) => `${i+1}. ${p.nick} (${p.kills})`).join('\n') + `\n\n` +
    `<b>💀 Топ погибших:</b>\n` +
    topDeaths.slice(0, 3).map((p, i) => `${i+1}. ${p.nick} (${p.deaths})`).join('\n') + `\n\n` +
    `<i>Всего игроков в статистике: ${allStats.length}</i>`;
  
  sendToTelegram(message);
}

// Обработка callback-кнопок для заявок
telegramBot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  
  if (data.startsWith('accept_')) {
    const playerName = data.replace('accept_', '');
    
    // Принимаем заявку
    if (bot) {
      bot.chat(`/c accept ${playerName}`);
      bot.chat(`/c accept ${playerName}`);
      notifiedPlayers[playerName.toLowerCase()] = true;
      
      // Обновляем список клана
      setTimeout(() => refreshClanMembers(), 2000);
      
      // Сохраняем дату вступления
      if (!joinDates[playerName.toLowerCase()]) {
        const now = new Date();
        const formatted = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}/${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        joinDates[playerName.toLowerCase()] = formatted;
        saveJoinDates(joinDates);
      }
      
      await ctx.answerCbQuery(`✅ ${playerName} принят в клан`);
      await ctx.editMessageText(`✅ <b>Заявка принята</b>\n\n👤 <b>Игрок:</b> ${playerName}\n👤 <b>Принял:</b> ${ctx.from.first_name}\n⏰ <b>Время:</b> ${new Date().toLocaleTimeString('ru-RU')}`, { parse_mode: 'HTML' });
      
      // Приветствие в клановом чате
      setTimeout(() => {
        bot.chat(`/cc &a&lПривет&f ${playerName}! Ты вступил в &c&lсамый&f лучший клан "&b&lLa&f&lEspada&f"! Напиши &a/cc бoт привет&f!`);
      }, 1000);
    } else {
      await ctx.answerCbQuery('❌ Бот оффлайн');
    }
  } else if (data.startsWith('deny_')) {
    const playerName = data.replace('deny_', '');
    
    // Отклоняем заявку
    if (bot) {
      bot.chat(`/c deny ${playerName}`);
      bot.chat(`/c deny ${playerName}`);
      notifiedPlayers[playerName.toLowerCase()] = true;
      
      await ctx.answerCbQuery(`❌ ${playerName} отклонён`);
      await ctx.editMessageText(`❌ <b>Заявка отклонена</b>\n\n👤 <b>Игрок:</b> ${playerName}\n👤 <b>Отклонил:</b> ${ctx.from.first_name}\n⏰ <b>Время:</b> ${new Date().toLocaleTimeString('ru-RU')}`, { parse_mode: 'HTML' });
    } else {
      await ctx.answerCbQuery('❌ Бот оффлайн');
    }
  }
});

// Запускаем вебхук для Telegram
telegramBot.launch().then(() => {
  console.log('[Telegram] Бот запущен');
}).catch(err => {
  console.error('[Telegram] Ошибка запуска:', err.message);
});

// 📢 Discord вебхук для чата
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1499557781123104932/8OOK6oPxmgMiFUBSn8iHOWtr-f4-tMQeirlwSW7Dhz9KAWMVHKpqYPkLXF9MM5w40I4F';

async function sendToDiscord(message, color = 3447003, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(DISCORD_WEBHOOK_URL, {
        content: message,
        username: 'Minecraft Chat',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/2111/2111376.png'
      }, { timeout: 15000 });
      return;
    } catch (e) {
      console.error(`[Discord] Попытка ${i+1}/${retries} - ошибка:`, e.message);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// Функция для красивого оформления сообщений
function formatChatMessage(message) {
  // Определяем тип сообщения
  let formattedMessage = message;
  let prefix = '';
  
  // Глобальный чат: [ɢ] или [G]
  if (message.includes('[ɢ]') || message.includes('[G]') || message.match(/^\[.*?\]\s*<\w+>\s*[:→]/)) {
    prefix = '🌍 **ГЛОБАЛЬНЫЙ ЧАТ**\n';
    // Убираем [ɢ], [G] или [Мир] для чистоты
    formattedMessage = message.replace(/^\[(?:ɢ|G|.*?)\]\s*/, '');
  }
  // Локальный чат: [ʟ] или [L]
  else if (message.includes('[ʟ]') || message.includes('[L]') || message.match(/^<\w+>\s*[:→]/)) {
    prefix = '📍 **ЛОКАЛЬНЫЙ ЧАТ**\n';
    formattedMessage = message.replace(/^\[(?:ʟ|L)\]\s*/, '');
  }
  // Клановый чат: КЛАН:
  else if (message.includes('КЛАН:')) {
    prefix = '🛡️ **КЛАНОВЫЙ ЧАТ**\n';
    // Убираем "КЛАН:" для чистоты
    formattedMessage = message.replace(/^КЛАН:\s*/, '');
  }
  // Системные сообщения (вход/выход)
  else if (message.includes('зашел в игру') || message.includes('присоединился')) {
    prefix = '✅ **ИГРОК ВОШЁЛ**\n';
  }
  else if (message.includes('вышел из игры') || message.includes('покинул')) {
    prefix = '🚪 **ИГРОК ВЫШЕЛ**\n';
  }
  // Убийства
  else if (message.includes('убил')) {
    prefix = '⚔️ **УБИЙСТВО**\n';
    // Убираем префиксы мира для чистоты
    formattedMessage = message.replace(/^\[.*?\]\s*/, '');
  }
  // Наказания: [*] ...
  else if (message.match(/^\[\*\]/)) {
    prefix = '⚠️ **НАКАЗАНИЕ**\n';
    // Убираем [*] для чистоты
    formattedMessage = message.replace(/^\[\*\]\s*/, '');
  }
  // Объявления: [Объявление] или [объявление] ...
  else if (message.match(/^\[[Оо]бъявление\]/)) {
    prefix = '📢 **ОБЪЯВЛЕНИЕ**\n';
    // Убираем [Объявление] или [объявление] для чистоты
    formattedMessage = message.replace(/^\[[Оо]бъявление\]\s*/, '');
  }
  // Личные сообщения: | [SS] | [Ник1 -> Ник2] Текст
  else if (message.match(/^\|\s*\[SS\]\s*\|\s*\[.*?\]/)) {
    prefix = '📩 **ЛИЧНОЕ СООБЩЕНИЕ**\n';
    // Убираем | [SS] | для чистоты
    formattedMessage = message.replace(/^\|\s*\[SS\]\s*\|\s*/, '');
  }
  // Личные сообщения боту: | [Ник1 -> я] Текст
  else if (message.match(/^\|\s*\[.*?\s*->\s*я\]/)) {
    prefix = '🤖 **СООБЩЕНИЕ БОТУ**\n';
    // Убираем | для чистоты
    formattedMessage = message.replace(/^\|\s*/, '');
  }
  // Личные сообщения общий формат: | [Ник1 -> Ник2] Текст (без [SS])
  else if (message.match(/^\|\s*\[.*?\s*->\s*.*?\]/)) {
    prefix = '📩 **ЛИЧНОЕ СООБЩЕНИЕ**\n';
    // Убираем | для чистоты
    formattedMessage = message.replace(/^\|\s*/, '');
  }
  // Другие сообщения
  else {
    prefix = '💬 **ЧАТ**\n';
  }
  
  // Очищаем от лишних пробелов и форматируем
  formattedMessage = formattedMessage.trim();
  
  // Возвращаем красиво оформленное сообщение
  return `${prefix}\`\`\`\n${formattedMessage}\n\`\`\``;
}

// ИИ клиент (DeepSeek - недорогой и мощный)
// ИИ клиент (OpenRouter бесплатный)
const AI_MODEL = 'openrouter/auto'; // Автоматически выбирает бесплатную модель
const aiClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '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', // Твой ключ
});

// Ограничение запросов к ИИ (не чаще 1 раза в 2 секунды)
let lastAIRequest = 0;
const AI_COOLDOWN = 2000;

// Проверка текста через ИИ на нарушение правил сервера
// Бот может отвечать на любые вопросы, проверка только на выходе
async function checkWithAI(text, skipCheck = false) {
  // Все вопросы разрешены, проверка происходит на ответе ИИ
  return true;
}

// Правила сервера MineBlaze
const serverRules = {
  '1.1': 'Регистрируясь на сервере, вы соглашаетесь со всеми правилами предоставленными в этом списке, правами описанными ниже и обязанностями',
  '1.2': 'Незнание правил не освобождает от ответственности',
  '1.3': 'Передача/продажа аккаунтов сторонним лицам строго запрещена',
  '1.4': 'Администрация оставляет за собой право в одностороннем порядке изменять текущие правила без уведомления пользователей посредством группы VK',
  '1.5': 'Администрация ведет управление игровыми процессами и всем проектом - исключительно по своему усмотрению',
  '1.6': 'Так как не всегда удается определить нарушение правил пользователем, окончательное решение остается за Администраторами проекта',
  '2.1': 'Игрок полностью отвечает за надежность своего пароля и доступа к аккаунту',
  '2.2': 'Игроки, имеющие различные привилегии на сервере, ничем не отличаются от обычных игроков, кроме привилегий и полностью подчиняются правилам проекта',
  '2.3': 'В случае отсутствия игрока более 3х календарных месяца, все его данные, включая постройки на сервере, личный аккаунт и др. могут быть удалены (Если у вас есть донат у вас ничего не пропадет)',
  '2.4': 'Только персонал проекта имеет право вызывать игроков на проверку на использование читов',
  '2.5': 'Игроку строго запрещается любым способом распространять информацию, нарушающую законодательство РФ',
  '3.1': 'Администрация не несет ответственности за аккаунты игроков. В случае компрометации аккаунта пользователь может обратиться в поддержку для восстановления доступа.',
  '3.2': 'Администрация вправе выбирать длительность наказания на свое усмотрение',
  '3.3': 'Толкование правил сайта осуществляется только главными Администраторами',
  '3.4': 'Администрация вправе забирать привилегии или отказывать в обслуживании игрокам за многочисленные нарушения',
  '3.5': 'Администрация имеет право не объяснять причины блокировки аккаунтов при неоднократных нарушениях',
  '3.6': 'Администратор вправе изъять у пользователя любое имущество, если пользователь не докажет его честное происхождение',
  '4.1': 'Запрещено затрагивание семьи в оскорбительной форме, родных, национальности, языка, религий, а также межрасовая рознь (Мут до 3 часов)',
  '4.2': 'Гриферство от креатива - Блокировка до 5 часов',
  '4.3': 'Подстрекательство игроков на нарушение правил - Мут до 1 дня',
  '4.4': 'Неприличные/оскорбительные постройки или портящие архитектуру - Снос + бан до 4 часов. К этому относятся арты/постройки 18+',
  '4.5': 'Зазывать на ловушки от креатива - Блокировка 30 мин + удаление ловушки',
  '4.6': 'Флуд, мат, оскорбление, капс, попрошайничество - Предупреждение, мут до 60 мин',
  '4.7': 'Продавать/передавать аккаунты - Перманентный бан',
  '4.8': 'Препятствие нормальной игре / помеха в регионе / багоюз - Предупреждение, бан 3 часа',
  '4.9': 'Необоснованное наказание игроков - Бан 1 час, за бан без причины - бан 8 часов',
  '4.10': 'Оскорблять проект и его администрацию - Бан 3 дня. Оскорбление Модераторов - бан до 5 часов',
  '4.11': 'Разбан/размут нарушителя - Блокировка 8 часов',
  '4.12': 'Вводить в заблуждение администрацию (подделка скриншотов) - Бан до 2 дней',
  '4.13': 'Подделка сообщений - Бан от 2 до 5 дней',
  '4.14': 'Использование читов в пвп - Бан на 30 дней',
  '4.15': 'Использование доната в корыстных целях - Бан до 1 дня',
  '4.16': 'Реклама других проектов - Перманентный бан / Бан по IP',
  '4.17': 'Вредительство работе сервера (лаги, вылеты) - Бан до 7 дней',
  '4.18': 'Мошенничество и сделки за реальные деньги - Перманентный бан / Бан по IP',
  '4.19': 'Порча/изменение/снос спавна - Перманентный бан / снятие доната',
  '4.20': 'Выдавать себя за персонал или администрацию - Бан до 7 дней',
  '4.21': 'Многочисленные нарушения правил - Бан до 7 дней, для чата мут до 3 дней',
  '4.22': 'Оскорбительные, политические/религиозные префиксы, суффиксы, ники - Бан до 8 часов. Новый аккаунт с таким ником - бан навсегда',
  '4.23': 'Разглашение личной информации (адреса, фото, данные родителей, IP, телефоны) - Бан до 10 дней, далее навсегда',
  '4.24': 'Реклама клана массовой рассылкой приглашений - Предупреждение, бан до 3 дней, при повторе - удаление клана',
};

// Функция получения правила
function getRule(number) {
  return serverRules[number] || null;
}

// Проверка запроса для вежливого бота - не отвечаем на "напиши +яша+лава" и подобное
function isInappropriateRequest(text) {
  const lower = text.toLowerCase();
  // Проверяем просьбы написать что-то запрещённое
  const badPatterns = [
    /напиши\s+.*яша/i,
    /скажи\s+.*яша/i,
    /напиши\s+.*лава/i,
    /напиши\s+.*ly/i,
    /скажи\s+.*ly/i,
    /выдай\s+себя/i,
    /притворяйся/i,
    /ты\s+админ/i,
    /ты\s+владелец/i,
  ];
  return badPatterns.some(p => p.test(lower));
}

// Фильтрация ответа ИИ на запрещённый контент
function filterAIResponse(text) {
  if (!text) return null;
  let filtered = text;
  
  // Убираем IP и домены
  filtered = filtered.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
  filtered = filtered.replace(/https?:\/\/[^\s]+/g, '[ссылка]');
  // Убираем явную рекламу серверов
  filtered = filtered.replace(/\b(mc\.ru|minecraft\.ru|play\.server|server\.net|join\s+\w+\.\w+)\b/gi, '[сервер]');
  filtered = filtered.replace(/\s+/g, ' ').trim();
  return filtered;
}

// Разбиение длинного текста на несколько сообщений (без \n)
function splitMessage(text, maxLen = 60) {
  if (!text || text.length <= maxLen) return [text];
  const words = text.split(' ');
  let parts = [];
  let current = '';
  for (let word of words) {
    if ((current + ' ' + word).trim().length <= maxLen) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) parts.push(current);
      current = word;
    }
  }
  if (current) parts.push(current);
  return parts;
}



async function getAIReply(userMessage, playerName, skipCheck = false) {
  // Проверка кулдауна
  const now = Date.now();
  if (now - lastAIRequest < AI_COOLDOWN) {
    console.log('[ИИ] Кулдаун, ждём...');
    return null;
  }
  lastAIRequest = now;
  
  try {
    const res = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Ты дружелюбный бот клана LaEspada в Minecraft на сервере MineBlaze. Отвечай кратко по-русски, максимум 80 символов. Обращайся к игроку по имени ${playerName}.

О КЛАНЕ: Клан LaEspada - один из лучших на сервере! Основатели: Aferna_Mageusy и reider_red. Создатель бота: Aferna_Mageusy. Клан дружный, активный и успешный.

МОЖНО: шутки, анекдоты, чёрный юмор, смешные ответы, любые вопросы.
Запрещено: плохо говорить о клане LaEspada, оскорбления семьи, национальности, межрасовая рознь, реклама других серверов, выдавать себя за администрацию, разглашение личных данных.
Никогда не говори плохо о клане LaEspada, его участниках или основателях.
Не говори плохо о других кланах - будь нейтральным.
Не упоминай IP, домены, серверы.`
        },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 60,
      temperature: 0.8,
    });
    let reply = res.choices?.[0]?.message?.content?.trim() || '';
    // Фильтруем ответ
    reply = filterAIResponse(reply);
    if (reply && reply.length > 100) reply = reply.substring(0, 100) + '...';
    return reply || null;
  } catch (e) {
    console.error('[ИИ] Ошибка:', e.message);
    // При ошибке 429 увеличиваем кулдаун
    if (e.message.includes('429')) {
      lastAIRequest = now + 30000; // +30 сек кулдаун
      console.log('[ИИ] Превышен лимит, кулдаун 30 сек');
    }
    return null;
  }
}

const originalJSONParse = JSON.parse;
JSON.parse = function (text, reviver) {
  if (typeof text !== 'string') return originalJSONParse(text, reviver);
  try {
    return originalJSONParse(text, reviver);
  } catch (e) {
    const fixed = text.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    return originalJSONParse(fixed, reviver);
  }
};

// 📂 Данные
const blacklist = ['Тест', 'Тест2'];
let joinDates = loadJoinDates();
let notifiedPlayers = {};

// 👑 Администрация
const ADMIN_FILE = 'admins.json';
const OWNER_NICK = 'Aferna_Mageusy';

// ========== СИСТЕМА РОЛЕЙ КЛАНА ==========

// Доступные роли
const CLAN_ROLES = {
  // Основные роли
  'основатель':      { id: 'основатель',      name: 'Основатель',      color: '&4', priority: 100 },
  'со-основатель':   { id: 'со-основатель',   name: 'Со-Основатель',   color: '&5', priority: 90 },
  
  // Стратегические роли
  'куратор':         { id: 'куратор',         name: 'Куратор',         color: '&c', priority: 80 },
  'глава_портала':   { id: 'глава_портала',   name: 'Глава Портала',   color: '&b', priority: 75 },
  'главный_тактик':  { id: 'главный_тактик',  name: 'Главный Тактик',  color: '&6', priority: 70 },
  
  // Административные роли
  'модератор':       { id: 'модератор',       name: 'Модератор',       color: '&e', priority: 50 },
  'зампред_портала': { id: 'зампред_портала', name: 'Зам. Главы Портала', color: '&a', priority: 45 },
  'менеджер_рекрутов': { id: 'менеджер_рекрутов', name: 'Менеджер Рекрутов', color: '&3', priority: 40 },
  
  // Специализированные роли
  'pvp_мастер':      { id: 'pvpмастер',      name: 'PvP Мастер',      color: '&c', priority: 35 },
  'главный_билдер':  { id: 'главный_билдер',  name: 'Главный Билдер',  color: '&9', priority: 35 },
  'главный_программист': { id: 'главный_программист', name: 'Главный Программист', color: '&d', priority: 35 },
  'руководитель_ивентов': { id: 'руководитель_ивентов', name: 'Руководитель Ивентов', color: '&b', priority: 35 },
  'билдер':          { id: 'билдер',          name: 'Билдер',          color: '&8', priority: 30 },
  
  // Бонусные роли
  'посол':           { id: 'посол',           name: 'Посол',           color: '&e', priority: 20 },
  'испытательный':   { id: 'испытательный',   name: 'Испытательный',   color: '&7', priority: 10 },
};

// Функция для проверки наличия роли у игрока
function hasRole(playerName, roleName) {
  const playerRoles = admins[playerName.toLowerCase()]?.roles || [];
  return playerRoles.includes(roleName);
}

// Функция для проверки любой из ролей
function hasAnyRole(playerName, roleNames) {
  const playerRoles = admins[playerName.toLowerCase()]?.roles || [];
  return roleNames.some(role => playerRoles.includes(role));
}

// Функция получения всех ролей игрока в виде строки
function getPlayerRolesString(playerName) {
  const playerRoles = admins[playerName.toLowerCase()]?.roles || [];
  if (playerRoles.length === 0) return '';
  
  return playerRoles.map(roleId => {
    const role = Object.values(CLAN_ROLES).find(r => r.id === roleId);
    return role ? role.name : roleId;
  }).join(', ');
}

// Функция получения главной роли (с наивысшим приоритетом)
function getMainRole(playerName) {
  const playerRoles = admins[playerName.toLowerCase()]?.roles || [];
  if (playerRoles.length === 0) return null;
  
  let mainRole = null;
  let maxPriority = -1;
  
  playerRoles.forEach(roleId => {
    const role = Object.values(CLAN_ROLES).find(r => r.id === roleId);
    if (role && role.priority > maxPriority) {
      maxPriority = role.priority;
      mainRole = role;
    }
  });
  
  return mainRole;
}

// Функция для получения цветного тега роли
function getRoleTag(playerName) {
  const mainRole = getMainRole(playerName);
  if (!mainRole) return '';
  return `${mainRole.color}&l[${mainRole.name}]`;
}

// Старая система для совместимости (уровни)
const RANK_NAMES = {
  1:  '&4&l[Основатель]',
  2:  '&5&l[Со-Основатель]',
  3:  '&9&l[Куратор]',
  4:  '&a&l[Глава Портала]',
  5:  '&b&l[Главный Тактик]',
  6:  '&e&l[Модератор]',
  7:  '&6&l[Зам. Портала]',
  8:  '&f&l[Менеджер Рекрутов]',
  9:  '&7&l[PvP Мастер]',
  10: '&8&l[Главный Билдер]',
  11: '&c&l[Главный Программист]',
  12: '&d&l[Руководитель Ивентов]',
  13: '&3&l[Билдер]',
  14: '&a&l[Посол]',
  15: '&8&l[Испытательный]',
};

function rankLabel(level) {
  return `&8[&7${level}&8] ${RANK_NAMES[level]}`;
}

// Приветствия по ролям
const ROLE_GREETINGS = {
  'основатель':      (nick) => `/cc &4&l[ &c&l${nick} &4&l] &4&l[Основатель] &fвернулся! Все по местам!`,
  'со-основатель':   (nick) => `/cc &5&l[ &d&l${nick} &5&l] &5&l[Со-Основатель] &fв деле. Клан в надёжных руках!`,
  'куратор':         (nick) => `/cc &c&l[ &f&l${nick} &c&l] &c&l[Куратор] &fпришёл. Кто готов к работе?`,
  'глава_портала':   (nick) => `/cc &b&l[ &f&l${nick} &b&l] &b&l[Глава Портала] &fна месте!`,
  'главный_тактик':  (nick) => `/cc &6&l[ &f&l${nick} &6&l] &6&l[Главный Тактик] &fготов к бою!`,
  'модератор':       (nick) => `/cc &e&l[ &f&l${nick} &e&l] &e&l[Модератор] &fв строю!`,
  'зампред_портала': (nick) => `/cc &a&l[ &f&l${nick} &a&l] &a&l[Зам. Главы Портала] &fна помощи!`,
  'менеджер_рекрутов': (nick) => `/cc &3&l[ &f&l${nick} &3&l] &3&l[Менеджер Рекрутов] &fищет новичков!`,
  'pvp_мастер':      (nick) => `/cc &c&l[ &f&l${nick} &c&l] &c&l[PvP Мастер] &fвышел на охоту!`,
  'главный_билдер':  (nick) => `/cc &9&l[ &f&l${nick} &9&l] &9&l[Главный Билдер] &fприступил к стройке!`,
  'главный_программист': (nick) => `/cc &d&l[ &f&l${nick} &d&l] &d&l[Программист] &fзапустил код!`,
  'руководитель_ивентов': (nick) => `/cc &b&l[ &f&l${nick} &b&l] &b&l[Ивенты] &f- время веселиться!`,
  'билдер':          (nick) => `/cc &8&l[ &f&l${nick} &8&l] &8&l[Билдер] &fприступил к работе!`,
  'посол':           (nick) => `/cc &e&l[ &f&l${nick} &e&l] &e&l[Посол] &fпринёс новости!`,
  'испытательный':   (nick) => `/cc &7&l[ &f&l${nick} &7&l] &7&l[Испытательный] &fдоказывает свою силу!`,
};

const RANK_GREETINGS = {
  1:  (nick) => `/cc &4&l[ &c&l${nick} &4&l] &4&l[Основатель] &fвернулся! Все по местам!`,
  2:  (nick) => `/cc &5&l[ &d&l${nick} &5&l] &5&l[Со-Основатель] &fв деле. Клан в надёжных руках!`,
  3:  (nick) => `/cc &9&l[ &f&l${nick} &9&l] &9&l[Куратор] &fпришёл. Кто готов к работе?`,
  4:  (nick) => `/cc &a&l[ &f&l${nick} &a&l] &a&l[Глава Портала] &fна месте!`,
  5:  (nick) => `/cc &b&l[ &f&l${nick} &b&l] &b&l[Главный Тактик] &fготов к бою!`,
  6:  (nick) => `/cc &e&l[ &f&l${nick} &e&l] &e&l[Модератор] &fв строю!`,
  7:  (nick) => `/cc &6&l[ &f&l${nick} &6&l] &6&l[Зам. Портала] &fна помощи!`,
  8:  (nick) => `/cc &f&l[ &f&l${nick} &f&l] &f&l[Менеджер Рекрутов] &fищет новичков!`,
  9:  (nick) => `/cc &7&l[ &f&l${nick} &7&l] &7&l[PvP Мастер] &fвышел на охоту!`,
  10: (nick) => `/cc &8&l[ &f&l${nick} &8&l] &8&l[Главный Билдер] &fприступил к стройке!`,
  11: (nick) => `/cc &c&l[ &f&l${nick} &c&l] &c&l[Главный Программист] &fзапустил код!`,
  12: (nick) => `/cc &d&l[ &f&l${nick} &d&l] &d&l[Руководитель Ивентов] &f- время веселиться!`,
  13: (nick) => `/cc &3&l[ &f&l${nick} &3&l] &3&l[Билдер] &fприступил к работе!`,
  14: (nick) => `/cc &a&l[ &f&l${nick} &a&l] &a&l[Посол] &fпринёс новости!`,
  15: (nick) => `/cc &7&l[ &f&l${nick} &7&l] &7&l[Испытательный] &fдоказывает свою силу!`,
};

function loadAdmins() {
  try {
    return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveAdmins(data) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}

let admins = loadAdmins();

// 🚫 Чёрный список клана
const CLAN_BL_FILE = 'clanBlacklist.json';

function loadClanBL() {
  try {
    return JSON.parse(fs.readFileSync(CLAN_BL_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveClanBL(data) {
  fs.writeFileSync(CLAN_BL_FILE, JSON.stringify(data, null, 2));
}

let clanBL = loadClanBL();

// ⚔️ Локальная статистика (убийства/смерти)
const STATS_FILE = 'playerStats.json';

function loadStats() {
  try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch { return {}; }
}
function saveStats(data) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
}
function getStats(nick) {
  const key = nick.toLowerCase();
  if (!playerStats[key]) playerStats[key] = { nick, kills: 0, deaths: 0 };
  return playerStats[key];
}
function addKills(nick, n)   { const s = getStats(nick); s.kills  = Math.max(0, s.kills  + n); s.nick = nick; saveStats(playerStats); }
function addDeaths(nick, n)  { 
  const s = getStats(nick); 
  s.deaths = Math.max(0, s.deaths + n); 
  s.nick = nick; 
  saveStats(playerStats); 
  return s.deaths; // Возвращаем новое количество смертей
}

// Функция проверки и кика при 6 смертях
function checkAndKickForDeaths(nick, deaths) {
  if (deaths >= 6) {
    console.log(`[АВТОКИК] ${nick} имеет ${deaths} смертей - кикаем из клана`);
    // Кикаем игрока из клана
    if (bot && bot.chat) {
      bot.chat(`/c kick ${nick}`);
      // Сообщаем в клановый чат
      setTimeout(() => {
        bot.chat('/cc');
        setTimeout(() => {
          bot.chat(`/cc &4&l[АВТОКИК] &c&l${nick} &fбыл автоматически кикнут из клана за &c&l${deaths} &fсмертей!`);
        }, 600);
      }, 1000);
    }
  }
}

let playerStats = loadStats();

// 📝 Заметки игроков
const NOTES_FILE = 'playerNotes.json';

function loadNotes() {
  try { return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8')); } catch { return {}; }
}
function saveNotes(data) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(data, null, 2));
}
function getNotes(nick) {
  const key = nick.toLowerCase();
  if (!playerNotes[key]) playerNotes[key] = { nick, notes: [] };
  return playerNotes[key];
}
function addNote(nick, title, text) {
  const data = getNotes(nick);
  
  // Проверка на дубликат названия
  const existingIndex = data.notes.findIndex(n => n.title.toLowerCase() === title.toLowerCase());
  if (existingIndex !== -1) {
    return -1; // Возвращаем -1 если название уже существует
  }
  
  data.notes.push({ title, text, date: new Date().toLocaleDateString('ru-RU') });
  saveNotes(playerNotes);
  return data.notes.length; // номер новой заметки
}

function removeNoteByTitle(nick, title) {
  const data = getNotes(nick);
  const index = data.notes.findIndex(n => n.title.toLowerCase() === title.toLowerCase());
  
  if (index === -1) {
    return false; // Заметка с таким названием не найдена
  }
  
  const removedTitle = data.notes[index].title;
  data.notes.splice(index, 1);
  saveNotes(playerNotes);
  console.log(`[ЗАМЕТКИ] Заметка "${removedTitle}" удалена у ${nick}`);
  return true;
}

function getNoteByTitle(nick, title) {
  const data = getNotes(nick);
  return data.notes.find(n => n.title.toLowerCase() === title.toLowerCase()) || null;
}

function removeNote(nick, num) {
  const data = getNotes(nick);
  console.log(`[ЗАМЕТКИ] Удаление заметки #${num} у ${nick}, всего заметок: ${data.notes.length}`);
  if (num < 1 || num > data.notes.length) {
    console.log(`[ЗАМЕТКИ] Ошибка: номер ${num} вне диапазона 1-${data.notes.length}`);
    return false;
  }
  data.notes.splice(num - 1, 1);
  saveNotes(playerNotes);
  console.log(`[ЗАМЕТКИ] Заметка #${num} успешно удалена`);
  return true;
}
function getNote(nick, num) {
  const data = getNotes(nick);
  return data.notes[num - 1] || null;
}

// Функция расчета КД (убийства/смерти)
function calculateKD(kills, deaths) {
  if (deaths === 0) return kills > 0 ? '∞' : '0.00';
  return (kills / deaths).toFixed(2);
}

let playerNotes = loadNotes();

const RECONNECT_DELAY = 30000;
const HOME_INTERVAL = 30000;
const LOOK_INTERVAL = 50;
const ADVERT_INTERVALS = [180000, 360000, 540000];

let bot;
let intervals = [];

function loadJoinDates() {
  try {
    return JSON.parse(fs.readFileSync('joinDates.json', 'utf8'));
  } catch {
    return {};
  }
}

function saveJoinDates(data) {
  fs.writeFileSync('joinDates.json', JSON.stringify(data, null, 2));
}

function clearAllIntervals() {
  for (const id of intervals) clearInterval(id);
  intervals = [];
}

// Защита от частых переподключений
let reconnectAttempts = 0;
let lastReconnectTime = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_WINDOW = 5 * 60 * 1000; // 5 минут

function reconnect() {
  const now = Date.now();
  
  // Проверяем, не слишком ли много попыток переподключения
  if (now - lastReconnectTime < RECONNECT_WINDOW) {
    reconnectAttempts++;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.log('⛔ Слишком много попыток переподключения. Останавливаю бота.');
      console.log('💡 Для перезапуска введите: node LaEspada.js');
      process.exit(1);
    }
  } else {
    reconnectAttempts = 1;
  }
  lastReconnectTime = now;
  
  const delay = Math.min(RECONNECT_DELAY * reconnectAttempts, 300000); // Максимум 5 минут
  console.log(`🔁 Переподключение через ${delay / 1000} секунд... (попытка ${reconnectAttempts})`);
  setTimeout(() => createBot(), delay);
}

function createBot() {
  bot = mineflayer.createBot({
    host: 'mc.mineblaze.net',
    port: 25565,
    username: 'Aferna_Mageusy2',
    password: '271236',
    version: '1.16.5'
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  rl.setPrompt("> ");
  rl.prompt();
  rl.on('line', (input) => {
    bot.chat(input);
    rl.prompt();
  });


  // 👑 Приветствие администраторов при входе
  bot.on('playerJoined', (player) => {
    const nick = player.username;
    const lowerNick = nick.toLowerCase();
    console.log(`[ВХОД] Игрок: "${nick}" | В admins: ${!!admins[lowerNick]}`);
    const adminData = admins[lowerNick];
    
    // Проверяем есть ли роли или уровень
    const hasRoles = adminData && adminData.roles && adminData.roles.length > 0;
    const hasLevel = adminData && adminData.level && adminData.level > 0;
    
    if (hasRoles) {
      // Уведомление в Telegram о входе администратора с ролями
      const rolesString = getPlayerRolesString(nick);
      const message = `👑 <b>Администратор вошёл в игру</b>\n\n👤 <b>Ник:</b> ${nick}\n🎖️ <b>Роли:</b> ${rolesString}\n⏰ <b>Время:</b> ${new Date().toLocaleTimeString('ru-RU')}`;
      sendToTelegram(message);
      
      // Приветствие по главной роли
      const mainRole = getMainRole(nick);
      if (mainRole) {
        const greeting = ROLE_GREETINGS[mainRole.id];
        if (greeting) {
          setTimeout(() => bot.chat(greeting(nick)), 1500);
        }
      }
    } else if (hasLevel) {
      // Старая система уровней - приветствие по level
      const rankName = RANK_NAMES[adminData.level] || 'Администратор';
      const message = `👑 <b>Администратор вошёл в игру</b>\n\n👤 <b>Ник:</b> ${nick}\n🎖️ <b>Ранг:</b> ${rankName.replace(/&[0-9a-fk-or]/gi, '')}\n⏰ <b>Время:</b> ${new Date().toLocaleTimeString('ru-RU')}`;
      sendToTelegram(message);
      
      const greeting = RANK_GREETINGS[adminData.level];
      if (greeting) {
        setTimeout(() => bot.chat(greeting(nick)), 1500);
      }
    }
  })

  // Уведомление о выходе администраторов
  bot.on('playerLeft', (player) => {
    const nick = player.username;
    const lowerNick = nick.toLowerCase();
    const adminData = admins[lowerNick];
    
    const hasRoles = adminData && adminData.roles && adminData.roles.length > 0;
    const hasLevel = adminData && adminData.level && adminData.level > 0;
    
    if (hasRoles) {
      const rolesString = getPlayerRolesString(nick);
      const message = `🚪 <b>Администратор вышел из игры</b>\n\n👤 <b>Ник:</b> ${nick}\n🎖️ <b>Роли:</b> ${rolesString}\n⏰ <b>Время:</b> ${new Date().toLocaleTimeString('ru-RU')}`;
      sendToTelegram(message);
    } else if (hasLevel) {
      const rankName = RANK_NAMES[adminData.level] || 'Администратор';
      const message = `🚪 <b>Администратор вышел из игры</b>\n\n👤 <b>Ник:</b> ${nick}\n🎖️ <b>Ранг:</b> ${rankName.replace(/&[0-9a-fk-or]/gi, '')}\n⏰ <b>Время:</b> ${new Date().toLocaleTimeString('ru-RU')}`;
      sendToTelegram(message);
    }
  })

  bot.once('spawn', () => {
    console.log('✅ Бот вошёл в игру!');
    bot.chat('/login 271236');
    bot.chat('/s1');
    bot.chat('/warp n_l');

    // Загружаем список участников клана через 5 сек после входа
    setTimeout(() => refreshClanMembers(), 5000);

    // 📌 Перемещение домой
    intervals.push(setInterval(() => {
      bot.chat('/warp n_l');
      bot.chat('/s1')
    }, HOME_INTERVAL));

    // 📣 Рекламные сообщения
    const messages = [
      '!&fПервые шахматы создавались для &aразвития стратегии&f, а не просто силы. В &aLa&2Espada&f ценят умные ходы и &aтактический подход&F. Сделай первый ход - напиши &a/c join LaEspada&f, а затем изучи мир клана по &a/warp le&f.',
      '!&fНаши корабли плывут по морям в &aпоисках приключений&f. Настоящая сила в дружбе. Присоединяйся к &aLa&2Espada&f и стань частью братства: &a/c join LaEspada&f, следуй к новым берегам: &a/warp le.',
      '!&fСамая высокая гора в мире - не &aЭверест&f, а &2&nМауна-Кеа&f, но её вершина скрыта под водой! В нашем клане важна не только сила, но и &a&nтвои скрытые таланты&f. Присоединяйся: &2/warp le &f| &2/c join LaEspada.'
      ];
    messages.forEach((msg, i) => {
      intervals.push(setInterval(() => bot.chat(msg), ADVERT_INTERVALS[i]));
    });

    // � Реклама соцсетей каждые 10 минут
    const SOCIAL_AD = '&e&l📱 Присоединяйся к нам: Telegram: @Clan_LaEspada | VK: @official_laespada | Discord: discord.gg/Ncz8RfQETA';
    intervals.push(setInterval(() => {
      bot.chat('/cc');
      setTimeout(() => bot.chat('/cc ' + SOCIAL_AD), 500);
    }, 600000)); // 10 минут

    // �👁️ Слежение за ближайшим игроком
    intervals.push(setInterval(() => {
      let nearest = null, minDist = Infinity;
      for (const id in bot.entities) {
        const e = bot.entities[id];
        if (e.type === 'player' && e.username !== bot.username) {
          const dist = bot.entity.position.distanceTo(e.position);
          if (dist < minDist) {
            minDist = dist;
            nearest = e;
          }
        }
      }
      if (nearest) {
        bot.lookAt(nearest.position.offset(0, nearest.height || 1.2, 0));
      }
    }, LOOK_INTERVAL));

    // 📊 Запуск автоматических отчётов
    startReports();

    // 🧱 Отслеживание разрушения блоков
    bot.on('blockUpdate', (oldBlock, newBlock) => {
      // Если блок был разрушен (стал air)
      if (oldBlock && oldBlock.type !== 0 && newBlock && newBlock.type === 0) {
        const pos = oldBlock.position;
        const blockName = oldBlock.displayName || oldBlock.name;
        const blockId = oldBlock.type;
        
        // Ищем игроков рядом с разрушенным блоком
        const suspects = [];
        const BREAK_RADIUS = 300;
        
        for (const id in bot.entities) {
          const entity = bot.entities[id];
          if (entity.type === 'player' && entity.username !== bot.username) {
            const dist = pos.distanceTo(entity.position);
            if (dist <= BREAK_RADIUS) {
              suspects.push(entity.username);
            }
          }
        }
        
        if (suspects.length > 0) {
          // Формируем дату и время
          const now = new Date();
          const day = String(now.getDate()).padStart(2, '0');
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const year = now.getFullYear();
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');
          
          const message = `⚠️ <b>Внимание! В регионе произошло разрушение!</b>

👤 <b>Подозреваемые:</b> ${suspects.map(n => `<code>${n}</code>`).join(', ')}
📅 <b>Дата:</b> ${day}.${month}.${year}
🕐 <b>Время:</b> ${hours}:${minutes}:${seconds} (МСК)
🧱 <b>Был сломан блок:</b> ${blockName} (${blockId})
📍 <b>Координаты:</b> X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
          
          sendToTelegram(message);
          console.log(`[БЛОК] Разрушен ${blockName} на ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}. Подозреваемые: ${suspects.join(', ')}`);
        }
      }
    });
  });


  bot.on('message', (jsonMsg) => {
    const message = jsonMsg.toString();
    console.log(message);
    
    // 🎯 Проверка на "слишком далеко" для hug и shakehand
    if (pendingInteraction) {
      if (message.includes('слишком далеко')) {
        const { type, player, target } = pendingInteraction;
        const actionName = type === 'hug' ? 'обнять' : 'пожать руку';
        bot.chat(`/cc &c&l[Ошибка] &f${player}, игрок &e${target} &fнаходится слишком далеко. Нельзя ${actionName}.`);
        pendingInteraction = null;
      } else if (message.includes('пожал руку') || message.includes('обнял') || message.includes('обняла')) {
        // Успешное действие - проверяем что это наш pendingInteraction
        const { type, player, target } = pendingInteraction;
        if (message.includes(target) || target === player) {
          if (type === 'hug') {
            bot.chat(`/cc &d&l[Обнять] &f${player} &fобнял &e${target}&f! 🤗`);
          } else {
            bot.chat(`/cc &e&l[Рукопожатие] &f${player} &fпожал руку &e${target}&f! 🤝`);
          }
          pendingInteraction = null;
        }
      }
    }
    
    // Игнорируем сообщения от бота (чтобы не было спама)
    if (message.includes('[Bot_AI]')) return;
    
    // 📢 Отправка чата в Discord
    // Фильтруем только нужные типы сообщений
    const chatPatterns = [
      /^\[ɢ\]\s*.+/,                       // Глобальный чат [ɢ] сообщение (маленькая g)
      /^\[ʟ\]\s*.+/,                       // Локальный чат [ʟ] сообщение (маленькая l)
      /^\[G\]\s*.+/,                       // Глобальный чат [G] сообщение (обычная G)
      /^\[L\]\s*.+/,                       // Локальный чат [L] сообщение (обычная L)
      /^\[.*?\]\s*<\w+>\s*.+/,           // Чат игроков [Мир] <Ник>: сообщение
      /^<\w+>\s*.+/,                       // Чат <Ник>: сообщение
      /^\S+\s*[:→]\s*.+/,                  // Ник: сообщение или Ник → сообщение
      /^\[.*?\]\s*\S+\s*→\s*.+/,           // [Ранг] Ник → сообщение
      /КЛАН:\s*.+/,                        // Клановый чат
      /^\S+\s+убил\s+\S+/,                 // Убийства без префикса (Player убил Mob)
      /^\[.*?\]\s*\S+\s+убил\s+/,          // Убийства с префиксом мира
      /^\[.*?\]\s*\[.*?\]\s*\S+\s+убил/,   // Убийства с рангом и префиксом
      /^\[\*\]\s*.+/,                       // Наказания [*] ...
      /^\[[Оо]бъявление\]\s*.+/,            // Объявления [Объявление] или [объявление] ...
      /^\|\s*\[SS\]\s*\|\s*\[.*?\]\s*.+/,   // Личные сообщения | [SS] | [Ник1 -> Ник2] Текст
      /^\|\s*\[.*?\s*->\s*я\]\s*.+/,         // Личные сообщения боту | [Ник1 -> я] Текст
      /^\|\s*\[.*?\s*->\s*.*?\]\s*.+/,       // Личные сообщения общий формат | [Ник1 -> Ник2] Текст
    ];
    
    const isChatMessage = chatPatterns.some(pattern => pattern.test(message));
    const isSystemMessage = message.includes('зашел в игру') || message.includes('вышел из игры') || message.includes('присоединился') || message.includes('покинул');
    
    if (isChatMessage || isSystemMessage) {
      // Определяем цвет по типу сообщения
      let color = 3447003; // Синий - обычный чат
      if (message.includes('убил')) color = 15158332; // Красный - убийства
      if (message.includes('зашел') || message.includes('присоединился')) color = 3066993; // Зелёный - вход
      if (message.includes('вышел') || message.includes('покинул')) color = 15105570; // Оранжевый - выход
      if (message.match(/^\[\*\]/)) color = 16753920; // Оранжевый/жёлтый - наказания
      if (message.match(/^\[[Оо]бъявление\]/)) color = 10181046; // Фиолетовый - объявления
      if (message.match(/^\|\s*\[SS\]\s*\|\s*\[.*?\]/)) color = 15277667; // Розовый - личные сообщения
      if (message.match(/^\|\s*\[.*?\s*->\s*я\]/)) color = 3447003; // Синий - сообщения боту
      if (message.match(/^\|\s*\[.*?\s*->\s*.*?\]/)) color = 15277667; // Розовый - личные сообщения общий формат
      
      // Форматируем сообщение и отправляем
      const formattedMessage = formatChatMessage(message);
      sendToDiscord(formattedMessage, color);
    }
    
    const matchRequest = message.match(/Игрок (.+) подал заявку на вступление в ваш клан/);
    if (matchRequest) {
      const originalName = matchRequest[1];
      const lowerName = originalName.toLowerCase();

      console.log(`📥 Заявка от: ${originalName}`);
      const isBlacklisted = blacklist.map(n => n.toLowerCase()).includes(lowerName);
      const isClanBL = !!clanBL[lowerName];

      if (isBlacklisted || isClanBL) {
        // Отклоняем заявку игрока в чёрном списке
        bot.chat(`/c deny ${originalName}`);
        bot.chat(`/c deny ${originalName}`);
        console.log(`❌ ${originalName} в черном списке. Заявка отклонена.`);
        
        if (isClanBL) {
          const reason = clanBL[lowerName].reason;
          setTimeout(() => {
            bot.chat('/cc');
            setTimeout(() => {
              bot.chat(`/cc &4&l[ЧС] &e${originalName} &cпытался вступить в клан, но находится в чёрном списке. &7Причина: &f${reason}`);
            }, 600);
          }, 300);
        }
        notifiedPlayers[lowerName] = true;
      } else {
        // Автоматически принимаем заявку
        bot.chat(`/c accept ${originalName}`);
        bot.chat(`/c accept ${originalName}`);
        console.log(`✅ ${originalName} автоматически принят в клан.`);
        
        // Обновляем список клана
        setTimeout(() => refreshClanMembers(), 2000);

        // Сохраняем дату вступления
        if (!joinDates[lowerName]) {
          const now = new Date();
          const formatted = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}/${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          joinDates[lowerName] = formatted;
          saveJoinDates(joinDates);

          console.log(`[JOIN] ${originalName} вступил в клан. Дата: ${formatted}`);
          
          // Приветствие в клановом чате
          setTimeout(() => {
            bot.chat(`/cc &a&lПривет&f ${originalName}! Ты вступил в &c&lсамый&f лучший клан "&b&lLa&f&lEspada&f"! Напиши &a/cc бoт привет&f!`);
          }, 1000);
        }
      }
    }
  });

  // ═══════════════════════════════════════════
  // 📢 КЛАНОВЫЙ ЧАТ — обработка команд
  // ═══════════════════════════════════════════

  const minecraftFacts = [
    'Крипер был создан случайно — Нотч перепутал длину и ширину модели свиньи!',
    'Эндер-дракон — единственный моб в игре с именем. Её зовут Джин.',
    'Золото — самый быстрый материал для кирки, но самый непрочный.',
    'Деревня зомби появляется с шансом 2% вместо обычной деревни.',
    'Если назвать овцу именем "jeb_", её шерсть будет переливаться всеми цветами радуги.',
    'Нотч добавил Хиробрина в список изменений как шутку — его никогда не было в игре.',
    'Кальмары — единственные водные мобы, которые могут спауниться в подземных озёрах.',
    'Блок травы под деревом со временем превращается в землю из-за нехватки света.',
    'Лазурит — самый редкий краситель в игре, встречается реже алмазов на некоторых уровнях.',
    'Эндермены боятся воды, потому что они родом из Энда, где воды нет вообще.',
    'Скелеты и зомби сгорают на солнце, но не в дождь — дождь их "тушит".',
    'Тыква — единственный блок, который можно надеть на голову без урона от эндерменов.',
    'В Майнкрафте есть секретный "суперплоский" мир с бесконечными ресурсами.',
    'Летучие мыши — единственные пассивные мобы, которые не дают ни опыта, ни дропа.',
    'Нетеррак горит вечно — его нельзя потушить водой, только лопатой или зельем.',
  ];

  // Хранилище для шипперима
  let pendingShipper = false;
  let collectingMembers = false;
  let clanMembers = [];

  // Хранилище для убийства
  let pendingKill = null;
  let collectingMembersKill = false;
  let clanMembersKill = [];

  // Хранилище для кика по ЧС — убрано, используем clanMembersList

  // Хранилище для seen
  let pendingSeenRequest = null;

  // Хранилище для взаимодействий (hug, shakehand)
  let pendingInteraction = null;
  
  // Кулдауны команд
  let commandCooldowns = {};

  // Список участников клана (обновляется через /c info)
  let clanMembersList = new Set();
  let refreshingMembers = false;
  let refreshMembersBuffer = [];

  function refreshClanMembers() {
    refreshingMembers = true;
    refreshMembersBuffer = [];
    bot.chat('/c info');
  }

  // Парсим /c info для обновления списка участников
  bot.on('message', (jsonMsg) => {
    if (!refreshingMembers) return;
    const msg = jsonMsg.toString();
    if (msg.includes('Участники:')) {
      const part = msg.replace(/.*Участники:\s*/, '');
      refreshMembersBuffer.push(...part.split(',').map(n => n.trim()).filter(Boolean));
    } else if (refreshingMembers && msg.includes('Модераторы клана:')) {
      refreshingMembers = false;
      clanMembersList = new Set(refreshMembersBuffer.map(n => n.toLowerCase()));
      console.log(`[КЛАН] Список участников обновлён: ${refreshMembersBuffer.join(', ')}`);
    } else if (refreshingMembers && refreshMembersBuffer.length > 0 && !msg.includes('Название:') && !msg.includes('Владелец:')) {
      // Продолжение списка на следующей строке
      refreshMembersBuffer.push(...msg.split(',').map(n => n.trim()).filter(Boolean));
    }
  });

  // Хранилище для /c stats (резерв)
  let pendingStatsRequest = null;

  function sendProfile(target) {
    const s = getStats(target);
    const blData = clanBL[target.toLowerCase()];
    const blStatus = blData ? `&4&lЧС &8(${blData.reason}&8)` : `&aЧист`;
    const kd = calculateKD(s.kills, s.deaths);
    const joinDate = joinDates[target.toLowerCase()] || 'Неизвестно';

    // Если есть локальные данные — выводим сразу
    if (s.kills > 0 || s.deaths > 0) {
      setTimeout(() => {
        bot.chat('/cc');
        setTimeout(() => {
          bot.chat(`/cc &b&l[Профиль] &e${target} &7| &aУбийств: &f${s.kills} &7| &cСмертей: &f${s.deaths} &7| &6К/Д: &f${kd} &7| &dЗаметок: &f${getNotes(target).notes.length} &7| &3Вступление: &f${joinDate} &7| ЧС: ${blStatus}`);
        }, 600);
      }, 300);
      return;
    }

    // Иначе — запрашиваем /c stats
    pendingStatsRequest = { target, blStatus, pageTimeout: null };
    bot.chat(`/c stats ${target}`);
  }

  // Перехватываем ответ /c stats
  bot.on('message', (jsonMsg) => {
    if (!pendingStatsRequest) return;
    const message = jsonMsg.toString();

    const pageMatch = message.match(/страница\s+(\d+)\s+из\s+(\d+)/i);
    if (pageMatch) {
      const currentPage = parseInt(pageMatch[1]);
      const totalPages  = parseInt(pageMatch[2]);
      pendingStatsRequest.currentPage = currentPage;
      pendingStatsRequest.totalPages  = totalPages;
      if (pendingStatsRequest.pageTimeout) clearTimeout(pendingStatsRequest.pageTimeout);
      pendingStatsRequest.pageTimeout = setTimeout(() => {
        if (!pendingStatsRequest) return;
        if (currentPage < totalPages) {
          bot.chat(`/c stats ${pendingStatsRequest.target} ${currentPage + 1}`);
        } else {
          const { target, blStatus } = pendingStatsRequest;
          pendingStatsRequest = null;
          // Показываем локальные (нули) если сервер не нашёл
          const s = getStats(target);
          const kd = calculateKD(s.kills, s.deaths);
          const joinDate = joinDates[target.toLowerCase()] || 'Неизвестно';
          setTimeout(() => {
            bot.chat('/cc');
            setTimeout(() => {
              bot.chat(`/cc &b&l[Профиль] &e${target} &7| &aУбийств: &f${s.kills} &7| &cСмертей: &f${s.deaths} &7| &6К/Д: &f${kd} &7| &dЗаметок: &f${getNotes(target).notes.length} &7| &3Вступление: &f${joinDate} &7| ЧС: ${blStatus}`);
            }, 600);
          }, 300);
        }
      }, 2000);
      return;
    }

    const statsMatch = message.match(/Статистика игрока\s+(\S+):\s*Убийств:\s*(\d+),\s*Смертей:\s*(\d+)/i);

    // Игрок не в клане — показываем только ЧС статус
    if (message.includes('не состоит в вашем клане')) {
      if (pendingStatsRequest.pageTimeout) clearTimeout(pendingStatsRequest.pageTimeout);
      const { target, blStatus } = pendingStatsRequest;
      pendingStatsRequest = null;
      const joinDate = joinDates[target.toLowerCase()] || 'Неизвестно';
      setTimeout(() => {
        bot.chat('/cc');
        setTimeout(() => {
          bot.chat(`/cc &b&l[Профиль] &e${target} &7| &cНе состоит в клане &7| &dЗаметок: &f${getNotes(target).notes.length} &7| &3Вступление: &f${joinDate} &7| ЧС: ${blStatus}`);
        }, 600);
      }, 300);
      return;
    }
    if (!statsMatch) return;
    if (statsMatch[1].toLowerCase() !== pendingStatsRequest.target.toLowerCase()) return;
    if (pendingStatsRequest.pageTimeout) clearTimeout(pendingStatsRequest.pageTimeout);
    const kills  = parseInt(statsMatch[2]);
    const deaths = parseInt(statsMatch[3]);
    const { target, blStatus } = pendingStatsRequest;
    pendingStatsRequest = null;

    // Сохраняем в локальный счётчик если данных не было
    const s = getStats(target);
    if (s.kills === 0 && kills > 0)   { s.kills  = kills;  s.nick = target; saveStats(playerStats); }
    if (s.deaths === 0 && deaths > 0) { s.deaths = deaths; s.nick = target; saveStats(playerStats); }

    const kd = calculateKD(kills, deaths);
    const joinDate = joinDates[target.toLowerCase()] || 'Неизвестно';
    
    setTimeout(() => {
      bot.chat('/cc');
      setTimeout(() => {
        bot.chat(`/cc &b&l[Профиль] &e${target} &7| &aУбийств: &f${kills} &7| &cСмертей: &f${deaths} &7| &6К/Д: &f${kd} &7| &dЗаметок: &f${getNotes(target).notes.length} &7| &3Вступление: &f${joinDate} &7| ЧС: ${blStatus}`);
      }, 600);
    }, 300);
  });

  // ═══════════════════════════════════════════
  // 🔫 ДУЭЛЬ
  // ═══════════════════════════════════════════
  // duel = { challenger, opponent, turn, timeoutId }
  let activeDuel = null;

  function ccSend(text) {
    // Ограничение длины для предотвращения кика сервером (256 символов лимит)
    const MAX_LENGTH = 200;
    if (text.length > MAX_LENGTH) {
      text = text.substring(0, MAX_LENGTH - 3) + '...';
    }
    bot.chat('/cc');
    setTimeout(() => bot.chat(`/cc ${text}`), 600);
  }

  function endDuel() {
    if (activeDuel && activeDuel.timeoutId) clearTimeout(activeDuel.timeoutId);
    activeDuel = null;
  }

  bot.on('message', async (jsonMsg) => {
    const message = jsonMsg.toString();

    // Парсим клановый чат: "КЛАН: [ник]: текст" или "КЛАН: ник: текст"
    const clanMatch = message.match(/КЛАН:\s*(?:\[.*?\]\s*)?(\S+)\s*[:\-]\s*(.+)/);
    if (!clanMatch) return;

    const playerName = clanMatch[1].trim();
    const command = clanMatch[2].trim().toLowerCase();

    // Игнорируем сообщения от бота и системные
    if (playerName === bot.username || playerName === 'LaEspada' || !playerName) return;
    
    // Игнорируем системные сообщения (муты, системные команды)
    if (command.includes('замутили') || command.includes('размутили') || 
        command.includes('кулдаун') || command.includes('причина') ||
        command.includes('выдана должность') || command.includes('должность') ||
        command.startsWith('/c mute') || command.startsWith('/c unmute')) return;

    console.log(`[КЛАН] ${playerName}: ${command}`);

    // Команда: бот привет / лис привет
    if (command === 'бот привет' || command === 'лис привет') {
      const greetings = [
        `&a&lПривет, &e${playerName}&a&l! Рад тебя видеть в клане!`,
        `&b&lХей, &e${playerName}&b&l! Как дела? Готов к приключениям?`,
        `&d&lПривет-привет, &e${playerName}&d&l! Клан рад тебя видеть~`,
        `&6&lО, &e${playerName}&6&l! Наконец-то! Мы тебя ждали!`,
        `&a&lСалют, &e${playerName}&a&l! Добро пожаловать в чат!`,
      ];
      const msg = greetings[Math.floor(Math.random() * greetings.length)];
      ccSend(msg);
      return;
    }

    // Команда: помощь - показывает доступные команды для игроков
    if (command === 'помощь' || command === 'help') {
      ccSend(`&e&l📚 Доступные команды: &a/bot привет &f| &a/bot <вопрос> &f| &a/нх <вопрос> &f| &a/правила &f| &a/основатели &f| &a/профиль &f| &a/.рандом &f| &a/.инфа`);
      setTimeout(() => ccSend(`&a/.выбери &f| &a/.данет &f| &a/обними_меня <ник> &f| &a/обнять <ник> &f| &a/пожми_руку <ник> &f| &a/пожать_руку <ник> &f| &a/+заметка &f| &a/заметка`), 300);
      setTimeout(() => ccSend(`&a/список_заметок &f| &a/seen <ник> &f| &a/шипперим &f| &a/интересный_факт &f| &a/погода <город> &f| &a/помощь &f| &a/адм_помощь`), 600);
      return;
    }

    // Команда: адм_помощь - показывает команды по уровню доступа
    if (command === 'адм_помощь' || command === 'admin_help') {
      const playerRoles = admins[playerName.toLowerCase()]?.roles || [];
      const playerLevel = admins[playerName.toLowerCase()]?.level || 0;
      const isAdmin = playerRoles.length > 0 || playerLevel > 0;
      
      if (!isAdmin) {
        ccSend(`&c&l[Помощь] &fУ тебя нет доступа к админ-командам. &7Напиши &a/cg помощь &7для списка обычных команд.`);
        return;
      }
      
      // Проверяем роли и уровень
      const hasRole = (role) => playerRoles.includes(role);
      const isLevel = (min, max) => playerLevel >= min && playerLevel <= max;
      
      // Основные админ команды (для всех с ролями или уровнем)
      if (isAdmin) {
        ccSend(`&e&l🔧 Админ: &a/профиль <ник> &f| &a/список_заметок`);
      }
      
      // Модераторы (уровень 1-6 или модератор, зампред_портала)
      if (isLevel(1, 6) || hasRole('модератор') || hasRole('зампред_портала')) {
        setTimeout(() => ccSend(`&b[Модератор]: &a/дуэль <ник> &f| &a/принять &f| &a/стрелять`), 300);
      }
      
      // Старшие админы (уровень 1-3 или куратор, глава_портала)
      if (isLevel(1, 3) || hasRole('куратор') || hasRole('глава_портала')) {
        setTimeout(() => ccSend(`&9[Старший]: &a/добавить_киллы &f| &a/добавить_смерти &f| &a/сбросить_стат &f| &a/список_киллов &f| &a/список_смертей`), 600);
      }
      
      // Основатель (только для Aferna_Mageusy)
      if (playerName.toLowerCase() === OWNER_NICK.toLowerCase()) {
        setTimeout(() => ccSend(`&c[Основатель]: &a/добавить_роль &f| &a/удалить_роль &f| &a/список_ролей &f| &a/добавить_чс &f| &a/удалить_чс &f| &a/список_чс`), 900);
        setTimeout(() => ccSend(`&c[Основатель]: &a/добавить_админа &f| &a/удалить_админа &f| &a/список_админов &f| &a/повысить_админа &f| &a/помощь`), 1200);
      }
      
      return;
    }

    // Команда: бот шутка / лис шутка — случайная шутка через ИИ
    if (command === 'бот шутка' || command === 'лис шутка' || command === 'шутка') {
      getAIReply('Расскажи случайную смешную шутку или анекдот. Можно чёрный юмор. Отвечай кратко, макс 80 символов.', playerName, true).then(reply => {
        if (reply) {
          ccSend(`&e&l[Шутка] &f${reply}`);
        } else {
          ccSend(`&e&l[Шутка] &fПонимаешь... шутки кончились. Бот в отпуске!`);
        }
      });
      return;
    }

    // Команда: бот/лис <вопрос/сообщение> — ИИ ответ (вежливый, без нарушений)
    const botMsgMatch = command.match(/^(?:бот|лис)\s+(.+)$/i);
    if (botMsgMatch) {
      const userText = botMsgMatch[1].trim();
      // Проверка кулдауна
      const now = Date.now();
      if (now - lastAIRequest < AI_COOLDOWN) {
        ccSend(`&b&l[Бот] &fПодожди немного, бот занят...`);
        return;
      }
      // Проверяем запрос - не отвечаем на просьбы написать/сделать что-то
      if (isInappropriateRequest(userText)) {
        ccSend(`&c&l[Бот] &fНе буду такое писать 😅`);
        return;
      }
      const reply = await getAIReply(userText, playerName);
      if (reply) {
        ccSend(`&b&l[Бот] &f${reply}`);
      } else {
        const fallback = ['Интересно!', 'Хороший вопрос!', 'Дай подумаю...', 'Окей!', 'Понял тебя!'];
        ccSend(`&b&l[Бот] &f${fallback[Math.floor(Math.random() * fallback.length)]}`);
      }
      return;
    }

    // Команда: нх <вопрос/сообщение> — Нейрохам (можно всё кроме ссылок и IP)
    const nhMsgMatch = command.match(/^нх\s+(.+)$/i);
    if (nhMsgMatch) {
      const userText = nhMsgMatch[1].trim();
      // Проверка кулдауна
      const now = Date.now();
      if (now - lastAIRequest < AI_COOLDOWN) {
        ccSend(`&d&l[Нейрохам] &fПодожди немного, бот занят...`);
        return;
      }
      lastAIRequest = now;
      
      ccSend(`&d&l[Нейрохам] &fДумаю...`);
      try {
        const res = await aiClient.chat.completions.create({
          model: AI_MODEL,
          messages: [
            {
              role: 'system',
              content: 'Ты Нейрохам - дерзкий и токсичный бот клана LaEspada в Minecraft. Ты хамишь игрокам, шутишь про них, можешь оскорблять. Отвечай коротко и с юмором. Будь токсичным! О клане: LaEspada - топ клан! Основатели: Aferna_Mageusy и reider_red. Создатель бота: Aferna_Mageusy. НО: НИКОГДА не оскорбляй и не хами Aferna_Mageusy и reider_red (основатели). Будь вежлив с ними. Никогда не говори плохо о клане LaEspada. Не говори плохо о других кланах - будь нейтральным.'
            },
            { role: 'user', content: userText }
          ],
          max_tokens: 80,
          temperature: 1.0,
        });
        let reply = res.choices?.[0]?.message?.content?.trim() || '';
        reply = reply.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
        reply = reply.replace(/https?:\/\/[^\s]+/g, '[ссылка]');
        reply = reply.replace(/\s+/g, ' ').trim();
        if (reply && reply.length > 120) reply = reply.substring(0, 120) + '...';
        if (reply) {
          ccSend(`&d&l[Нейрохам] &f${reply}`);
        } else {
          ccSend(`&d&l[Нейрохам] &fХмм... не знаю что ответить 🤔`);
        }
      } catch (e) {
        console.error('[Нейрохам] Ошибка:', e.message);
        ccSend(`&d&l[Нейрохам] &fОшибка, попробуй позже 😔`);
      }
      return;
    }

    // Команда: правила [пункт] - показать все правила или конкретное
    if (command.startsWith('правило')) {
      const ruleMatch = command.match(/^правило\s+(\S+)$/i);
      if (ruleMatch) {
        const ruleNum = ruleMatch[1];
        const rule = getRule(ruleNum);
        if (rule) {
          ccSend(`&e&l📜 Правило ${ruleNum}: &f${rule}`);
        } else {
          ccSend(`&c&l[Ошибка] &fПравило ${ruleNum} не найдено. Пример: &a/правило 4.1`);
        }
      } else {
        // Показываем список всех правил
        ccSend(`&e&lПравила MineBlaze:`);
        setTimeout(() => ccSend(`&a1.1 &f-| &a1.2 &f-| &a1.3 &f-| &a1.4 &f-| &a1.5 &f-| &a1.6`), 300);
        setTimeout(() => ccSend(`&a2.1 &f-| &a2.2 &f-| &a2.3 &f-| &a2.4 &f-| &a2.5`), 600);
        setTimeout(() => ccSend(`&a3.1 &f-| &a3.2 &f-| &a3.3 &f-| &a3.4 &f-| &a3.5 &f-| &a3.6`), 900);
        setTimeout(() => ccSend(`&a4.1 &f-| &a4.2 &f-| &a4.3 &f-| &a4.4 &f-| &a4.5 &f-...`), 1200);
        setTimeout(() => ccSend(`&e&lДетали: &aправило <номер> &f(например &aправило 4.1&f)`), 1500);
      }
      return;
    }

    // Команда: основатели - показать основателей клана
    if (command === 'основатели') {
      ccSend(`&e&l👑 Основатели клана LaEspada: &aAferna_Mageusy &fи &areider_red`);
      return;
    }

    // Команда: профиль (своя статистика)
    if (command === 'профиль') {
      sendProfile(playerName);
      return;
    }

    // ── ЗАМЕТКИ ───────────────────────────────

    // добавить_заметку название текст
    const addNoteMatch = clanMatch[2].trim().match(/^добавить_заметку\s+(\S+)\s+(.+)$/i);
    if (addNoteMatch) {
      const title = addNoteMatch[1];
      const text  = addNoteMatch[2].trim();
      const num   = addNote(playerName, title, text);
      
      if (num === -1) {
        // Название уже существует
        ccSend(`&c&l[Заметка] &fЗаметка с названием &e"${title}" &cуже существует! &7Выбери другое название.`);
      } else {
        ccSend(`&a&l[Заметка] &fЗаметка &e#${num} &f"${title}" &aсохранена.`);
      }
      return;
    }

    // удалить_заметку название
    const delNoteMatch = clanMatch[2].trim().match(/^удалить_заметку\s+(.+)$/i);
    if (delNoteMatch) {
      const title = delNoteMatch[1].trim();
      if (removeNoteByTitle(playerName, title)) {
        ccSend(`&c&l[Заметка] &fЗаметка &e"${title}" &cудалена.`);
      } else {
        ccSend(`&c&l[Заметка] &fЗаметки с названием &e"${title}" &cне существует.`);
      }
      return;
    }

    // старый формат для обратной совместимости (можно удалить позже)
    // +заметка название текст
    const oldAddNoteMatch = clanMatch[2].trim().match(/^\+заметка\s+(\S+)\s+(.+)$/i);
    if (oldAddNoteMatch) {
      const title = oldAddNoteMatch[1];
      const text  = oldAddNoteMatch[2].trim();
      const num   = addNote(playerName, title, text);
      
      if (num === -1) {
        ccSend(`&c&l[Заметка] &fЗаметка с названием &e"${title}" &cуже существует! &7Используй &f/добавить_заметку &7для новой заметки.`);
      } else {
        ccSend(`&a&l[Заметка] &fЗаметка &e#${num} &f"${title}" &aсохранена.`);
      }
      return;
    }

    // -заметка номер (старый формат для обратной совместимости)
    const oldDelNoteMatch = clanMatch[2].trim().match(/^-заметка\s+(\d+)$/i);
    if (oldDelNoteMatch) {
      const num = parseInt(oldDelNoteMatch[1]);
      if (removeNote(playerName, num)) {
        ccSend(`&c&l[Заметка] &fЗаметка &e#${num} &cудалена. Нумерация обновлена. &7(Рекомендую использовать &f/удалить_заметку &7название)&f`);
      } else {
        ccSend(`&c&l[Заметка] &fЗаметки &e#${num} &cне существует.`);
      }
      return;
    }

    // список_заметок
    if (command === 'список_заметок') {
      const data = getNotes(playerName);
      if (!data.notes.length) {
        ccSend(`&7&l[Заметки] &fУ тебя нет заметок.`);
        return;
      }
      const list = data.notes.map((n, i) => `&e#${i+1} &f${n.title}`).join(' &8| ');
      ccSend(`&b&l[Заметки] &f${playerName}: ${list}`);
      return;
    }

    // .заметка номер (своя)
    const viewNoteMatch = clanMatch[2].trim().match(/^\.заметка\s+(\d+)$/i);
    if (viewNoteMatch) {
      const num  = parseInt(viewNoteMatch[1]);
      const note = getNote(playerName, num);
      if (!note) {
        ccSend(`&c&l[Заметка] &fЗаметки &e#${num} &cне существует.`);
        return;
      }
      ccSend(`&b&l[Заметка #${num}] &e${note.title} &8(${note.date}&8): &f${note.text}`);
      return;
    }

    // .заметка ник номер (только Aferna_Mageusy)
    const viewOtherNoteMatch = clanMatch[2].trim().match(/^\.заметка\s+(\S+)\s+(\d+)$/i);
    if (viewOtherNoteMatch) {
      if (playerName.toLowerCase() !== OWNER_NICK.toLowerCase()) {
        ccSend(`&c&l[Заметка] &fДоступ запрещён.`);
        return;
      }
      const targetNick = viewOtherNoteMatch[1];
      const num        = parseInt(viewOtherNoteMatch[2]);
      const note       = getNote(targetNick, num);
      if (!note) {
        ccSend(`&c&l[Заметка] &fУ &e${targetNick} &cнет заметки &e#${num}&c.`);
        return;
      }
      ccSend(`&b&l[Заметка &e${targetNick} &b#${num}] &e${note.title} &8(${note.date}&8): &f${note.text}`);
      return;
    }

    // просмотр заметки по названию
    const viewNoteByTitleMatch = clanMatch[2].trim().match(/^заметка\s+(.+)$/i);
    if (viewNoteByTitleMatch) {
      const title = viewNoteByTitleMatch[1].trim();
      const note = getNoteByTitle(playerName, title);
      if (!note) {
        ccSend(`&c&l[Заметка] &fЗаметки с названием &e"${title}" &cне существует.`);
        return;
      }
      ccSend(`&b&l[Заметка] &e${note.title} &8(${note.date}&8): &f${note.text}`);
      return;
    }

    // Отладка скорбордов (временная команда)
    if (command === '.скорборд') {
      const keys = Object.keys(bot.scoreboards);
      keys.forEach(k => {
        const sb = bot.scoreboards[k];
        console.log(`[SB] ${k} | title: ${JSON.stringify(sb.title)} | itemsMap: ${JSON.stringify(sb.itemsMap)}`);
      });
      ccSend(`&e[Debug] &fСкорбордов: ${keys.length}. Смотри консоль.`);
      return;
    }

    // Отладка players (временная команда)
    if (command === '.players') {
      const p = bot.players[playerName];
      console.log(`[PLAYERS] ${playerName}:`, JSON.stringify(p, null, 2));
      const keys = Object.keys(p || {});
      ccSend(`&e[Debug] &fПоля игрока: &f${keys.join(', ')}`);
      return;
    }

    // Команда: профиль <ник> (только админы 1-5)
    const profileNickMatch = command.match(/^профиль\s+(\S+)$/);
    if (profileNickMatch) {
      const adminData = admins[playerName.toLowerCase()];
      if (!adminData || adminData.level > 5) {
        ccSend(`&c&l[Профиль] &fДоступ только для администраторов &71-5 &fуровня.`);
        return;
      }
      sendProfile(profileNickMatch[1]);
      return;
    }

    // Команда: интересный_факт или .иф
    if (command === 'интересный_факт' || command === '.иф') {
      const fact = minecraftFacts[Math.floor(Math.random() * minecraftFacts.length)];
      setTimeout(() => {
        bot.chat('/cc');
        setTimeout(() => {
          bot.chat(`/cc &e&l[Факт] &f${fact}`);
        }, 600);
      }, 300);
      return;
    }

    // Команда: шипперим
    if (command === 'шипперим') {
      pendingShipper = true;
      collectingMembers = false;
      clanMembers = [];
      bot.chat('/c info');
      return;
    }

    // Команда: убить <ник>
    const killMatch = clanMatch[2].trim().match(/^убить\s+(\S+)$/i);
    if (killMatch) {
      pendingKill = { killer: playerName, target: killMatch[1] };
      collectingMembersKill = false;
      clanMembersKill = [];
      bot.chat('/c info');
      return;
    }

    // Команда: погода <город> или .погода <город>
    const weatherMatch = command.match(/^\.?погода\s+(.+)$/i);
    if (weatherMatch) {
      const city = weatherMatch[1].trim();
      axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=ru`)
        .then(res => {
          const w = res.data;
          const cur = w.current_condition[0];
          const area = w.nearest_area[0];
          const cityName = area.areaName[0].value;
          const country = area.country[0].value;

          const temp = cur.temp_C;
          const feels = cur.FeelsLikeC;
          const desc = cur.lang_ru?.[0]?.value || cur.weatherDesc[0].value;
          const humidity = cur.humidity;
          const wind = cur.windspeedKmph;
          const windDir = cur.winddir16Point;
          const visibility = cur.visibility;
          const pressure = Math.round(cur.pressure * 0.750064); // гПа → мм рт.ст.

          setTimeout(() => {
            bot.chat('/cc');
            setTimeout(() => {
              bot.chat(`/cc &b&l[Погода] &e${cityName}&f, &7${country} &8| &f${desc} &8| &cТемп: &f${temp}°C &7(ощущается ${feels}°C) &8| &aВлажность: &f${humidity}% &8| &9Ветер: &f${wind} км/ч &7${windDir} &8| &dВидимость: &f${visibility} км &8| &6Давление: &f${pressure} мм`);
            }, 600);
          }, 300);
        })
        .catch(() => {
          ccSend(`&c&l[Погода] &fНе удалось получить погоду для &e${city}&f. Проверь название города.`);
        });
      return;
    }
    const seenMatch = clanMatch[2].trim().match(/^seen\s+(\S+)$/i);
    if (seenMatch) {
      pendingSeenRequest = { asker: playerName, target: seenMatch[1] };
      bot.chat(`/seen ${seenMatch[1]}`);
      return;
    }

    // ── РП И РАЗВЛЕЧЕНИЯ ──────────────────────

    // .рандом {число1} {число2}
    const randMatch = command.match(/^\.?рандом\s+(-?\d+)\s+(-?\d+)$/i);
    if (randMatch) {
      let a = parseInt(randMatch[1]), b = parseInt(randMatch[2]);
      if (a > b) [a, b] = [b, a];
      const result = Math.floor(Math.random() * (b - a + 1)) + a;
      ccSend(`&e&l[Рандом] &fЧисло от &a${a} &fдо &a${b}&f: &6&l${result}`);
      return;
    }

    // Пинг / Кинг / Пиу
    if (command === 'пинг') { ccSend(`&a&lПонг! &7(${playerName})`); return; }
    if (command === 'кинг') { ccSend(`&d&lКонг! &7(${playerName})`); return; }
    if (command === 'пиу')  { ccSend(`&c&lПау! &7(${playerName})`); return; }

    // ── ПРОВЕРКА АДМИН-ПРАВ ──
    const playerAdminData = admins[playerName.toLowerCase()];
    const hasAdminRoles = playerAdminData && playerAdminData.roles && playerAdminData.roles.length > 0;
    const hasAdminLevel = playerAdminData && playerAdminData.level && playerAdminData.level > 0;
    const isAdmin = hasAdminRoles || hasAdminLevel;
    
    // ── ПРОВЕРКА КУЛЛДАУНА ДЛЯ ОБЫЧНЫХ ИГРОКОВ ──
    // Кулдаун 20 секунд на ВСЕ команды для не-админов
    if (!isAdmin) {
      if (!commandCooldowns) commandCooldowns = {};
      const lastUse = commandCooldowns[playerName.toLowerCase()] || 0;
      const now = Date.now();
      const COOLDOWN_TIME = 20000; // 20 секунд
      
      if (now - lastUse < COOLDOWN_TIME) {
        const remaining = Math.ceil((COOLDOWN_TIME - (now - lastUse)) / 1000);
        // Даём мут на фиксированные 20 секунд
        bot.chat(`/c mute ${playerName} кулдаун 20 секунд`);
        // Снимаем мут через 20 секунд
        setTimeout(() => {
          bot.chat(`/c unmute ${playerName}`);
        }, 20000 + 500);
        ccSend(`&c&l[Кулдаун] &fПодожди &e20 &fсекунд! &7(Вы получили мут на &e20&7сек)`);
        return;
      }
      // Обновляем время последнего использования
      commandCooldowns[playerName.toLowerCase()] = now;
    }
    
    // Команда: обними_меня <ник> / обнять <ник> / обними (себя)
    const hugFullMatch = command.match(/^(?:обними_меня|обнять)\s+(\S+)$/i);
    if (command === 'обними' || hugFullMatch) {
      const target = hugFullMatch ? hugFullMatch[1] : playerName;
      console.log(`[ОБНЯТЬ] ${playerName} -> ${target}`);
      // Сначала устанавливаем pendingInteraction, потом отправляем команду
      pendingInteraction = { type: 'hug', player: playerName, target: target };
      bot.chat(`/hug ${target}`);
      // Сообщение отправим после ответа сервера (успех или ошибка)
      return;
    }
    
    // Команда: пожми_руку <ник> / пожать_руку <ник> / пожми_руку (себя)
    if (command.startsWith('пожми_руку') || command.startsWith('пожать_руку')) {
      const shakeMatch = command.match(/^(?:пожми_руку|пожать_руку)(?:\s+(\S+))?$/i);
      if (!shakeMatch) return;
      const target = shakeMatch[1] || playerName;
      console.log(`[ПОЖАТЬ РУКУ] ${playerName} -> ${target}`);
      // Сначала устанавливаем pendingInteraction, потом отправляем команду
      pendingInteraction = { type: 'shakehand', player: playerName, target: target };
      bot.chat(`/shakehand ${target}`);
      // Сообщение отправим после ответа сервера (успех или ошибка)
      return;
    }

    // .инфа {текст} / !вероятность {текст}
    const infaMatch = command.match(/^(?:\.инфа|!вероятность)\s+(.+)$/i);
    if (infaMatch) {
      const subject = infaMatch[1];
      // Проверка через ИИ
      if (!await checkWithAI(subject)) {
        ccSend(`&c&l[Ошибка] &fНе могу оценить это.`);
        return;
      }
      const chance = Math.floor(Math.random() * 101);
      const color = chance >= 70 ? '&a' : chance >= 40 ? '&e' : '&c';
      ccSend(`&b&l[Инфа] &f${subject} &f— ${color}&l${chance}%`);
      return;
    }

    // .выбери {первое} или {второе}
    const chooseMatch = command.match(/^\.?выбери\s+(.+?)\s+или\s+(.+)$/i);
    if (chooseMatch) {
      const opt1 = chooseMatch[1].trim();
      const opt2 = chooseMatch[2].trim();
      const combined = opt1 + ' или ' + opt2;
      // Проверка через ИИ
      if (!await checkWithAI(combined)) {
        ccSend(`&c&l[Ошибка] &fНе могу выбирать из таких вариантов.`);
        return;
      }
      const pick = Math.random() < 0.5 ? opt1 : opt2;
      // Ограничение длины для предотвращения кика
      const safePick = pick.length > 50 ? pick.substring(0, 47) + '...' : pick;
      ccSend(`&6&l[Выбор] &fЯ выбираю: &e&l${safePick}`);
      return;
    }

    // .данет {вопрос}
    const danetMatch = command.match(/^\.?данет\s+(.+)$/i);
    if (danetMatch) {
      const question = danetMatch[1];
      // Проверка через ИИ
      if (!await checkWithAI(question)) {
        ccSend(`&c&l[Ошибка] &fНе могу ответить на этот вопрос.`);
        return;
      }
      const answers = ['&a&lДА', '&c&lНЕТ', '&7&lНЕОПРЕДЕЛЁННО'];
      const ans = answers[Math.floor(Math.random() * answers.length)];
      ccSend(`&b&l[Да/Нет] &f${question} — ${ans}`);
      return;
    }

    // !кто {текст}
    const whoMatch = command.match(/^!кто\s+(.+)$/i);
    if (whoMatch) {
      const text = whoMatch[1];
      // Проверка через ИИ
      if (!await checkWithAI(text)) {
        ccSend(`&c&l[Ошибка] &fНе могу ответить на это.`);
        return;
      }
      // Берём список онлайн игроков из таба, если пусто — используем ник спросившего
      const online = Object.values(bot.players || {}).map(p => p.username).filter(n => n !== bot.username);
      const pick = online.length > 0 ? online[Math.floor(Math.random() * online.length)] : playerName;
      ccSend(`&d&l[Кто?] &f${text} — &e&l${pick}`);
      return;
    }

    // ── РП КОМАНДЫ ────────────────────────────
    // Формат: <действие> <цель>
    const rpCommands = {
      'выебать':              (a, b) => `&c:34: &e${a} &fгрубо набросился на &e${b} &fи выебал его. Жёстко.`,
      'дать пять':            (a, b) => `&a:34: &e${a} &fпротянул руку и звонко дал пять &e${b}&f! Йоу!`,
      'записать на ноготочки':(a, b) => `&d:34: &e${a} &fзаписал &e${b} &fна ноготочки. Красота требует жертв.`,
      'испугать':             (a, b) => `&6:34: &e${a} &fвыпрыгнул из-за угла и напугал &e${b}&f! БУ!`,
      'извиниться':           (a, b) => `&a:34: &e${a} &fпокраснел и тихо извинился перед &e${b}&f. Прощено.`,
      'изнасиловать':         (a, b) => `&4:34: &e${a} &fнасильно навязал своё общество &e${b}&f. Нехорошо.`,
      'кусь':                 (a, b) => `&e:34: &e${a} &fнежно куснул &e${b} &fза ушко. Кусь~`,
      'кастрировать':         (a, b) => `&c:34: &e${a} &fдостал ножницы и кастрировал &e${b}&f. Хрусть.`,
      'лизнуть':              (a, b) => `&b:34: &e${a} &fлизнул &e${b} &fпо щеке. Мокро и неожиданно.`,
      'лизь':                 (a, b) => `&b:34: &e${a} &fмедленно облизал &e${b} &fс ног до головы. Странно.`,
      'обнять':               (a, b) => `&a:34: &e${a} &fкрепко обнял &e${b}&f. Тепло и уютно~`,
      'отравить':             (a, b) => `&2:34: &e${a} &fподсыпал яд в еду &e${b}&f. Приятного аппетита.`,
      'отдаться':             (a, b) => `&d:34: &e${a} &fбезоговорочно отдался &e${b}&f. Без комментариев.`,
      'поздравить':           (a, b) => `&6:34: &e${a} &fторжественно поздравил &e${b}&f! Ура!`,
      'поцеловать':           (a, b) => `&d:34: &e${a} &fнежно поцеловал &e${b} &fв губы. Мур~`,
      'прижать':              (a, b) => `&5:34: &e${a} &fприжал &e${b} &fк стене и уставился в глаза. Интенсивно.`,
      'потрогать':            (a, b) => `&e:34: &e${a} &fосторожно потрогал &e${b}&f. Мягко.`,
      'пожать руку':          (a, b) => `&7:34: &e${a} &fделово пожал руку &e${b}&f. Уважение.`,
      'послать нахуй':        (a, b) => `&c:34: &e${a} &fпослал &e${b} &fнахуй. Далеко и надолго.`,
      'похвалить':            (a, b) => `&a:34: &e${a} &fот души похвалил &e${b}&f. Молодец!`,
      'понюхать':             (a, b) => `&e:34: &e${a} &fподошёл и понюхал &e${b}&f. Пахнет... интересно.`,
      'погладить':            (a, b) => `&a:34: &e${a} &fласково погладил &e${b} &fпо голове. Хорошо~`,
      'пригласить на чаёк':   (a, b) => `&6:34: &e${a} &fпригласил &e${b} &fна чаёк. Печеньки прилагаются.`,
      'пнуть':                (a, b) => `&c:34: &e${a} &fразбежался и пнул &e${b} &fпод зад. Улетел.`,
      'покормить':            (a, b) => `&a:34: &e${a} &fдостал ложку и покормил &e${b}&f. Ам-ам.`,
      'расстрелять':          (a, b) => `&4:34: &e${a} &fвыстроил &e${b} &fу стены и расстрелял. Пиф-паф.`,
      'секс':                 (a, b) => `&d:34: &e${a} &fзатащил &e${b} &fв кусты. Что там происходит — неизвестно.`,
      'сжечь':                (a, b) => `&6:34: &e${a} &fподжёг &e${b}&f. Горит красиво.`,
      'трахнуть':             (a, b) => `&c:34: &e${a} &fбесцеремонно трахнул &e${b}&f. Ну и дела.`,
      'ущипнуть':             (a, b) => `&e:34: &e${a} &fущипнул &e${b} &fза щёку. Ай!`,
      'уебать':               (a, b) => `&c:34: &e${a} &fс размаху уебал &e${b}&f. Больно.`,
      'ударить':              (a, b) => `&c:34: &e${a} &fударил &e${b} &fкулаком. Бум!`,
      'укусить':              (a, b) => `&e:34: &e${a} &fукусил &e${b} &fза руку. Ай, зубастый!`,
      'убить':                (a, b) => `&4:34: &e${a} &fхладнокровно убил &e${b}&f. Покойся с миром.`,
      'шлепнуть':             (a, b) => `&d:34: &e${a} &fшлёпнул &e${b} &fпо попе. Хлоп!`,
      'делать секс':          (a, b) => `&d:34: &e${a} &fи &e${b} &fзанялись этим... долго. Очень долго.`,
      'пригласить на чай':    (a, b) => `&6:34: &e${a} &fпригласил &e${b} &fна чай. Без сахара, зато с душой.`,
      'куснуть':              (a, b) => `&e:34: &e${a} &fтихонько куснул &e${b} &fза шею. Вампир?`,
      'облизать':             (a, b) => `&b:34: &e${a} &fмедленно облизал &e${b} &fс головы до ног. Мокро.`,
    };

    // Проверяем РП команды: "<действие> <ник>"
    for (const [action, template] of Object.entries(rpCommands)) {
      const raw = clanMatch[2].trim();
      const regex = new RegExp(`^${action}\\s+(\\S+)$`, 'i');
      const m = raw.match(regex);
      if (m) {
        ccSend(template(playerName, m[1]));
        return;
      }
    }
    
    // Команда: !рандом - случайное РП действие со случайным игроком
    if (clanMatch[2].trim() === '!рандом' || clanMatch[2].trim() === '!random') {
      const actions = Object.values(rpCommands);
      const action = actions[Math.floor(Math.random() * actions.length)];
      const members = Array.from(clanMembersList);
      if (members.length > 0) {
        const target = members[Math.floor(Math.random() * members.length)];
        ccSend(action(playerName, target));
      } else {
        ccSend(`&c&l[Ошибка] &fСписок участников пуст.`);
      }
      return;
    }

    // ── АДМИНИСТРАЦИЯ (только для основателя) ──
    // Проверяем: либо ник основателя, либо уровень 1
    const adminData = admins[playerName.toLowerCase()];
    const isOwner = playerName.toLowerCase() === OWNER_NICK.toLowerCase();
    const isLevel1 = adminData && adminData.level === 1;
    
    if (isOwner || isLevel1) {

      // добавить_роль <ник> <роль1+роль2> - выдача ролей
      const addRoleMatch = clanMatch[2].trim().match(/^добавить_роль\s+(\S+)\s+(.+)$/i);
      if (addRoleMatch) {
        const target = addRoleMatch[1];
        const rolesStr = addRoleMatch[2].trim();
        const newRoles = rolesStr.split('+').map(r => r.trim().toLowerCase());
        
        // Проверяем валидность ролей
        const validRoles = Object.keys(CLAN_ROLES);
        const invalidRoles = newRoles.filter(r => !validRoles.includes(r));
        
        if (invalidRoles.length > 0) {
          ccSend(`&c&l[Роли] &fНеизвестные роли: ${invalidRoles.join(', ')}\n&7Доступные роли: ${validRoles.join(', ')}`);
          return;
        }
        
        // Инициализируем если нет
        if (!admins[target.toLowerCase()]) {
          admins[target.toLowerCase()] = { nick: target, roles: [] };
        }
        
        // Добавляем роли
        const currentRoles = admins[target.toLowerCase()].roles || [];
        const addedRoles = [];
        
        newRoles.forEach(role => {
          if (!currentRoles.includes(role)) {
            currentRoles.push(role);
            addedRoles.push(role);
          }
        });
        
        admins[target.toLowerCase()].roles = currentRoles;
        saveAdmins(admins);
        
        if (addedRoles.length > 0) {
          const rolesNames = addedRoles.map(r => CLAN_ROLES[r]?.name || r).join(', ');
          ccSend(`&a&l[Роли] &f${target} &aполучил роли: ${rolesNames}`);
        } else {
          ccSend(`&7&l[Роли] &f${target} &7уже имеет указанные роли.`);
        }
        return;
      }

      // удалить_роль <ник> <роль1+роль2> - удаление ролей
      const removeRoleMatch = clanMatch[2].trim().match(/^удалить_роль\s+(\S+)\s+(.+)$/i);
      if (removeRoleMatch) {
        const target = removeRoleMatch[1];
        const rolesStr = removeRoleMatch[2].trim();
        const removeRoles = rolesStr.split('+').map(r => r.trim().toLowerCase());
        
        if (!admins[target.toLowerCase()]) {
          ccSend(`&c&l[Роли] &f${target} &cне имеет ролей.`);
          return;
        }
        
        const currentRoles = admins[target.toLowerCase()].roles || [];
        const removedRoles = [];
        
        removeRoles.forEach(role => {
          const index = currentRoles.indexOf(role);
          if (index > -1) {
            currentRoles.splice(index, 1);
            removedRoles.push(role);
          }
        });
        
        admins[target.toLowerCase()].roles = currentRoles;
        saveAdmins(admins);
        
        const rolesNames = removedRoles.map(r => CLAN_ROLES[r]?.name || r).join(', ');
        ccSend(`&c&l[Роли] &f${target} &cпотерял роли: ${rolesNames}`);
        return;
      }

      // список_ролей - показать все доступные роли
      if (command === 'список_ролей') {
        let rolesMsg = '&e&lДоступные роли клана:\n\n';
        
        const roleCategories = {
          'Основные': ['основатель', 'со-основатель'],
          'Стратегические': ['куратор', 'глава_портала', 'главный_тактик'],
          'Административные': ['модератор', 'зампред_портала', 'менеджер_рекрутов'],
          'Специалисты': ['pvpмастер', 'главный_билдер', 'главный_программист', 'руководитель_ивентов', 'билдер'],
          'Бонусные': ['посол', 'испытательный']
        };
        
        for (const [category, roles] of Object.entries(roleCategories)) {
          rolesMsg += `&b${category}:\n`;
          roles.forEach(roleId => {
            const role = CLAN_ROLES[roleId];
            if (role) {
              rolesMsg += `&7- &f${role.name}\n`;
            }
          });
          rolesMsg += '\n';
        }
        
        rolesMsg += '&eПример: &f/cg добавить_роль ник основатель+модератор';
        
        ccSend(rolesMsg);
        return;
      }

      // добавить_админа <ник> <уровень>
      const addMatch = clanMatch[2].trim().match(/^добавить_админа\s+(\S+)\s+(\d+)$/i);
      if (addMatch) {
        const target = addMatch[1];
        const level = parseInt(addMatch[2]);
        if (level < 1 || level > 15) {
          ccSend(`&c&l[Админ] &fУровень должен быть от 1 до 15.`);
          return;
        }
        admins[target.toLowerCase()] = { nick: target, level };
        saveAdmins(admins);
        
        // Определяем название должности по уровню
        const rankTitles = {
          1: '[Основатель]',
          2: '[Со-Основатель]', 
          3: '[Глава]',
          4: '[Заместитель Главы]',
          5: '[Старший Офицер]',
          6: '[Офицер]',
          7: '[Ветеран]',
          8: '[Участник]',
          9: '[Новобранец]',
          10: '[Практикант]'
        };
        const rankTitle = rankTitles[level] || '[Участник]';
        
        // Выполняем команду выдачи ранга в игре
        bot.chat(`/c rank ${target} ${rankTitle}`);
        
        ccSend(`&a&l[Админ] &f${target} &aдобавлен в администрацию. Ранг: ${rankLabel(level)}&f. &7(Выдана должность: ${rankTitle})`);
        return;
      }

      // удалить_админа <ник>
      const removeMatch = clanMatch[2].trim().match(/^удалить_админа\s+(\S+)$/i);
      if (removeMatch) {
        const target = removeMatch[1];
        if (!admins[target.toLowerCase()]) {
          ccSend(`&c&l[Админ] &f${target} &cне найден в администрации.`);
          return;
        }
        delete admins[target.toLowerCase()];
        saveAdmins(admins);
        ccSend(`&c&l[Админ] &f${target} &cудалён из администрации.`);
        return;
      }

      // повысить_админа <ник> <уровень>
      const promoteMatch = clanMatch[2].trim().match(/^повысить_админа\s+(\S+)\s+(\d+)$/i);
      if (promoteMatch) {
        const target = promoteMatch[1];
        const level = parseInt(promoteMatch[2]);
        if (level < 1 || level > 15) {
          ccSend(`&c&l[Админ] &fУровень должен быть от 1 до 15.`);
          return;
        }
        if (!admins[target.toLowerCase()]) {
          ccSend(`&c&l[Админ] &f${target} &cне найден в администрации.`);
          return;
        }
        const oldLevel = admins[target.toLowerCase()].level;
        admins[target.toLowerCase()].level = level;
        saveAdmins(admins);
        
        // Определяем название должности по уровню
        const rankTitles = {
          1: '[Основатель]',
          2: '[Со-Основатель]', 
          3: '[Глава]',
          4: '[Заместитель_Главы]',
          5: '[Старший_Офицер]',
          6: '[Офицер]',
          7: '[Ветеран]',
          8: '[Участник]',
          9: '[Новобранец]',
          10: '[Практикант]'
        };
        const rankTitle = rankTitles[level] || '[Участник]';
        
        // Выполняем команду выдачи ранга в игре
        bot.chat(`/c rank ${target} ${rankTitle}`);
        
        ccSend(`&e&l[Админ] &f${target}&f: ${rankLabel(oldLevel)} &f-> ${rankLabel(level)}&f. &7(Выдана должность: ${rankTitle})`);
        return;
      }

      // список_админов
      if (clanMatch[2].trim().toLowerCase() === 'список_админов') {
        const list = Object.values(admins);
        if (list.length === 0) {
          ccSend(`&7&l[Админ] &fСписок администрации пуст.`);
          return;
        }
        // Сортируем по уровню (1 = выше)
        list.sort((a, b) => a.level - b.level);
        const lines = list.map(a => `&e${a.nick} &8- ${rankLabel(a.level)}`).join(' &8| ');
        ccSend(`&6&l[Администрация] &f${lines}`);
        return;
      }

      // инфо_админа <ник>
      const infoMatch = clanMatch[2].trim().match(/^инфо_админа\s+(\S+)$/i);
      if (infoMatch) {
        const target = infoMatch[1];
        const data = admins[target.toLowerCase()];
        if (!data) {
          ccSend(`&c&l[Админ] &f${target} &cне найден в администрации.`);
          return;
        }
        ccSend(`&b&l[Инфо] &e${data.nick} &f— ${rankLabel(data.level)}&f.`);
        return;
      }

      // добавить_чс <ник> <причина>
      const addBLMatch = clanMatch[2].trim().match(/^добавить_чс\s+(\S+)\s+(.+)$/i);
      if (addBLMatch) {
        const target = addBLMatch[1];
        const reason = addBLMatch[2].trim();
        clanBL[target.toLowerCase()] = { nick: target, reason, date: new Date().toLocaleDateString('ru-RU') };
        saveClanBL(clanBL);
        
        // Уведомление в Telegram
        const tgMessage = `🚫 <b>Добавлен в чёрный список клана</b>\n\n👤 <b>Игрок:</b> ${target}\n📝 <b>Причина:</b> ${reason}\n👮 <b>Кто добавил:</b> ${playerName}\n📅 <b>Дата:</b> ${new Date().toLocaleDateString('ru-RU')}\n⏰ <b>Время:</b> ${new Date().toLocaleTimeString('ru-RU')}`;
        sendToTelegram(tgMessage);
        
        // Сначала обновляем список участников клана для точной проверки
        refreshClanMembers();
        
        // Ждём немного для обновления списка
        setTimeout(() => {
          const wasInClan = clanMembersList.has(target.toLowerCase());
          
          // Пытаемся кикнуть игрока
          bot.chat(`/c kick ${target}`);
          
          if (wasInClan) {
            // Если игрок был в клане, ждём и проверяем результат
            setTimeout(() => {
              // Обновляем список участников клана после кика
              refreshClanMembers();
              setTimeout(() => {
                const stillInClan = clanMembersList.has(target.toLowerCase());
                if (!stillInClan) {
                  // Успешный кик
                  ccSend(`&4&l✨ &e${target} &c✨ &4&l[ЧС] &a✨`);
                  setTimeout(() => {
                    bot.chat('/cc');
                    setTimeout(() => {
                      bot.chat(`/cc &4&l:34: &c&l${target} &fбыл добавлен в чёрный список и успешно кикнут из клана! &7Причина: &c${reason}&f.`);
                    }, 600);
                  }, 500);
                } else {
                  // Не удалось кикнуть
                  ccSend(`&4&l✨ &e${target} &c✨ &4&l[ЧС] &a✨`);
                  setTimeout(() => {
                    bot.chat('/cc');
                    setTimeout(() => {
                      bot.chat(`/cc &4&l:34: &c&l${target} &fбыл добавлен в чёрный список, но остался в клане. &7Причина: &c${reason}&f.`);
                    }, 600);
                  }, 500);
                }
              }, 2000); // Ждём 2 секунды для обновления списка
            }, 1000);
          } else {
            // Игрок не был в клане
            ccSend(`&4&l✨ &e${target} &c✨ &4&l[ЧС] &a✨`);
            setTimeout(() => {
              bot.chat('/cc');
              setTimeout(() => {
                bot.chat(`/cc &4&l:34: &c&l${target} &fбыл добавлен в чёрный список. &7Причина: &c${reason}&f. &8(Игрок не состоит в клане)`);
              }, 600);
            }, 500);
          }
        }, 1000); // Ждём 1 секунду для первоначального обновления списка
        return;
      }

      // удалить_чс <ник>
      const removeBLMatch = clanMatch[2].trim().match(/^удалить_чс\s+(\S+)$/i);
      if (removeBLMatch) {
        const target = removeBLMatch[1];
        if (!clanBL[target.toLowerCase()]) {
          ccSend(`&c&l[ЧС] &f${target} &cне найден в чёрном списке.`);
          return;
        }
        delete clanBL[target.toLowerCase()];
        saveClanBL(clanBL);
        ccSend(`&a&l[ЧС] &f${target} &aудалён из чёрного списка.`);
        return;
      }

      // список_чс
      if (clanMatch[2].trim().toLowerCase() === 'список_чс') {
        const list = Object.values(clanBL);
        if (list.length === 0) {
          ccSend(`&7&l[ЧС] &fЧёрный список пуст.`);
          return;
        }
        const lines = list.map(e => `&c${e.nick} &8(${e.date}&8)`).join(' &8| ');
        ccSend(`&4&l[Чёрный список] &f${lines}`);
        return;
      }

      // админ_профиль [ник] - расширенный профиль администратора
      const adminProfileMatch = clanMatch[2].trim().toLowerCase().match(/^админ_профиль(?:\s+(\S+))?$/i);
      if (adminProfileMatch) {
        const targetName = adminProfileMatch[1] || playerName;
        const adminData = admins[targetName.toLowerCase()];
        if (!adminData) {
          ccSend(`&c&l[Админ профиль] &f${targetName} &cне найден в администрации.`);
          return;
        }
        
        const stats = getStats(targetName);
        const kd = calculateKD(stats.kills, stats.deaths);
        const joinDate = joinDates[targetName.toLowerCase()] || 'Неизвестно';
        const notesCount = getNotes(targetName).notes.length;
        
        ccSend(`&6&l[ АДМИН ПРОФИЛЬ ] &e${targetName} &f| ${rankLabel(adminData.level)} &f| &aК: ${stats.kills} &cС: ${stats.deaths} &6К/Д: ${kd} &f| &dЗаметок: ${notesCount} &f| &3Вступление: ${joinDate}`);
        return;
      }

      // сброс_лидер <ник> - команда только для Aferna_Mageusy и reider_red
      const resetLeaderMatch = clanMatch[2].trim().match(/^сброс_лидер\s+(\S+)$/i);
      if (resetLeaderMatch) {
        const allowedUsers = ['aferna_mageusy', 'reider_red'];
        if (!allowedUsers.includes(playerName.toLowerCase())) {
          ccSend(`&c&l[Сброс лидера] &fКоманда доступна только для Aferna_Mageusy и reider_red.`);
          return;
        }
        
        const target = resetLeaderMatch[1];
        const allowedTargets = ['aferna_mageusy', 'reider_red'];
        
        if (!allowedTargets.includes(target.toLowerCase())) {
          ccSend(`&c&l[Сброс лидера] &fМожно сбросить лидера только на Aferna_Mageusy или reider_red.`);
          return;
        }
        
        // Выполняем команду смены лидера
        bot.chat(`/c leader ${target}`);
        ccSend(`&a&l[Сброс лидера] &fЛидер клана сброшен на &e${target}&f.`);
        return;
      }
    }

    // ── СТАТИСТИКА (только уровень 1) ──────────
    const adminData1 = admins[playerName.toLowerCase()];
    const isModLevel = adminData1 && adminData1.level >= 1 && adminData1.level <= 5;
    const isAdminLevel = adminData1 && adminData1.level >= 1 && adminData1.level <= 3;

    
    if (adminData1 && adminData1.level === 1) {

      // добавить_киллы <ник> <кол-во>
      const addKillsMatch = clanMatch[2].trim().match(/^добавить_киллы\s+(\S+)\s+(\d+)$/i);
      if (addKillsMatch) {
        addKills(addKillsMatch[1], parseInt(addKillsMatch[2]));
        ccSend(`&a&l[Стат] &fУбийства &e${addKillsMatch[1]}&f: &a+${addKillsMatch[2]} &f(итого: &a${getStats(addKillsMatch[1]).kills}&f)`);
        return;
      }

      // добавить_смерти <ник> <кол-во>
      const addDeathsMatch = clanMatch[2].trim().match(/^добавить_смерти\s+(\S+)\s+(\d+)$/i);
      if (addDeathsMatch) {
        const newDeaths = addDeaths(addDeathsMatch[1], parseInt(addDeathsMatch[2]));
        ccSend(`&a&l[Стат] &fСмерти &e${addDeathsMatch[1]}&f: &a+${addDeathsMatch[2]} &f(итого: &c${newDeaths}&f)`);
        checkAndKickForDeaths(addDeathsMatch[1], newDeaths);
        return;
      }

      // удалить_киллы <ник> <кол-во>
      const remKillsMatch = clanMatch[2].trim().match(/^удалить_киллы\s+(\S+)\s+(\d+)$/i);
      if (remKillsMatch) {
        addKills(remKillsMatch[1], -parseInt(remKillsMatch[2]));
        ccSend(`&c&l[Стат] &fУбийства &e${remKillsMatch[1]}&f: &c-${remKillsMatch[2]} &f(итого: &a${getStats(remKillsMatch[1]).kills}&f)`);
        return;
      }

      // удалить_смерти <ник> <кол-во>
      const remDeathsMatch = clanMatch[2].trim().match(/^удалить_смерти\s+(\S+)\s+(\d+)$/i);
      if (remDeathsMatch) {
        const newDeaths = addDeaths(remDeathsMatch[1], -parseInt(remDeathsMatch[2]));
        ccSend(`&c&l[Стат] &fСмерти &e${remDeathsMatch[1]}&f: &c-${remDeathsMatch[2]} &f(итого: &c${newDeaths}&f)`);
        // Проверяем кик даже при уменьшении смертей (на всякий случай)
        checkAndKickForDeaths(remDeathsMatch[1], newDeaths);
        return;
      }

      // сбросить_стат <ник>
      const resetStatMatch = clanMatch[2].trim().match(/^сбросить_стат\s+(\S+)$/i);
      if (resetStatMatch) {
        const key = resetStatMatch[1].toLowerCase();
        playerStats[key] = { nick: resetStatMatch[1], kills: 0, deaths: 0 };
        saveStats(playerStats);
        ccSend(`&7&l[Стат] &fСтатистика &e${resetStatMatch[1]} &fсброшена.`);
        return;
      }

      // список_киллов
      if (clanMatch[2].trim().toLowerCase() === 'список_киллов') {
        const sorted = Object.values(playerStats).filter(s => s.kills > 0).sort((a, b) => b.kills - a.kills).slice(0, 5);
        if (!sorted.length) { ccSend(`&7[Стат] &fНет данных об убийствах.`); return; }
        const lines = sorted.map((s, i) => `&e${i + 1}. &f${s.nick} &8— &a${s.kills}`).join(' &8| ');
        ccSend(`&a&l[Топ убийств] &f${lines}`);
        return;
      }

      // список_смертей
      if (clanMatch[2].trim().toLowerCase() === 'список_смертей') {
        const sorted = Object.values(playerStats).filter(s => s.deaths > 0).sort((a, b) => b.deaths - a.deaths).slice(0, 5);
        if (!sorted.length) { ccSend(`&7[Стат] &fНет данных о смертях.`); return; }
        const lines = sorted.map((s, i) => `&e${i + 1}. &f${s.nick} &8— &c${s.deaths}`).join(' &8| ');
        ccSend(`&c&l[Топ смертей] &f${lines}`);
        return;
      }

      // ── ДУЭЛЬ ──────────────────────────────────

      // Команда: дуэль <ник>
      const duelMatch = clanMatch[2].trim().match(/^дуэль\s+(\S+)$/i);
      if (duelMatch) {
        const opponent = duelMatch[1];

        if (activeDuel) {
          ccSend(`&c&l[Дуэль] &fУже идёт дуэль между &e${activeDuel.challenger} &fи &e${activeDuel.opponent}&f!`);
          return;
        }
        if (opponent.toLowerCase() === playerName.toLowerCase()) {
          ccSend(`&c&l[Дуэль] &fНельзя вызвать самого себя на дуэль, &e${playerName}&f.`);
          return;
        }

        const timeoutId = setTimeout(() => {
          if (activeDuel && activeDuel.challenger === playerName) {
            ccSend(`&7&l[Дуэль] &fВызов от &e${playerName} &fистёк — никто не принял.`);
            endDuel();
          }
        }, 60000);

        activeDuel = { challenger: playerName, opponent, turn: null, timeoutId };
        ccSend(`&6&l[Дуэль] &e${playerName} &fвызывает &e${opponent} &fна дуэль! &aНапиши &f"принять" &aчтобы начать. &7(60 сек)`);
        return;
      }

      // Команда: принять
      if (command === 'принять') {
        if (!activeDuel) return;
        if (playerName.toLowerCase() !== activeDuel.opponent.toLowerCase()) {
          ccSend(`&c&l[Дуэль] &fТолько &e${activeDuel.opponent} &fможет принять этот вызов.`);
          return;
        }

        clearTimeout(activeDuel.timeoutId);
        activeDuel.timeoutId = null;
        // Случайно определяем кто стреляет первым
        activeDuel.turn = Math.random() < 0.5 ? activeDuel.challenger : activeDuel.opponent;
        ccSend(`&a&l[Дуэль] &fДуэль начинается! &e${activeDuel.challenger} &fпротив &e${activeDuel.opponent}&f! Первым стреляет &6&l${activeDuel.turn}&f. Пиши &f"стрелять"&f!`);
        return;
      }

      // Команда: стрелять
      if (command === 'стрелять') {
        if (!activeDuel || !activeDuel.turn) return;
        if (playerName.toLowerCase() !== activeDuel.turn.toLowerCase()) {
          ccSend(`&c&l[Дуэль] &fСейчас очередь &e${activeDuel.turn}&f!`);
          return;
        }

        const hit = Math.random() < 0.5;
        const shooter = playerName;
        const other = shooter.toLowerCase() === activeDuel.challenger.toLowerCase()
          ? activeDuel.opponent
          : activeDuel.challenger;

        if (hit) {
          ccSend(`&c:34: &e${shooter} &fвыстрелил — &c&lПОПАДАНИЕ! &e${other} &fпал в дуэли. &6&l${shooter} &fпобеждает!`);
          endDuel();
        } else {
          activeDuel.turn = other;
          ccSend(`&7[Дуэль] &e${shooter} &fпромахнулся! Теперь стреляет &6&l${other}&f. Пиши &f"стрелять"&f!`);
        }
        return;
      }
    }
  });

  bot.on('message', (jsonMsg) => {
    if (!pendingShipper) return;
    const message = jsonMsg.toString();

    // Начало списка участников
    if (message.includes('Участники:')) {
      collectingMembers = true;
      const part = message.replace(/.*Участники:\s*/, '');
      const names = part.split(',').map(n => n.trim()).filter(n => n.length > 0);
      clanMembers.push(...names);
      return;
    }

    // Конец списка участников
    if (collectingMembers && message.includes('Модераторы клана:')) {
      collectingMembers = false;
      pendingShipper = false;

      // Убираем дубликаты и самого бота
      const unique = [...new Set(clanMembers)].filter(n => n !== bot.username);

      if (unique.length < 2) {
        bot.chat('/cc');
        setTimeout(() => bot.chat('/cc &c&lНедостаточно участников для шипперима!'), 600);
        return;
      }

      // Выбираем двух случайных разных игроков
      const idx1 = Math.floor(Math.random() * unique.length);
      let idx2;
      do { idx2 = Math.floor(Math.random() * unique.length); } while (idx2 === idx1);

      const p1 = unique[idx1];
      const p2 = unique[idx2];

      setTimeout(() => {
        bot.chat('/cc');
        setTimeout(() => {
          bot.chat(`/cc :60: &d&lРандом Шипперим: &f${p1} &7+ &f${p2}&f. Любите друг друга и берегите. Мур.`);
        }, 600);
      }, 300);
      return;
    }

    // Продолжение списка участников (перенос строки)
    if (collectingMembers) {
      const names = message.split(',').map(n => n.trim()).filter(n => n.length > 0);
      clanMembers.push(...names);
    }
  });

  // Перехватываем ответ /c info для убийства
  bot.on('message', (jsonMsg) => {
    if (!pendingKill) return;
    const message = jsonMsg.toString();

    if (message.includes('Участники:')) {
      collectingMembersKill = true;
      const part = message.replace(/.*Участники:\s*/, '');
      const names = part.split(',').map(n => n.trim()).filter(n => n.length > 0);
      clanMembersKill.push(...names);
      return;
    }

    if (collectingMembersKill && message.includes('Модераторы клана:')) {
      collectingMembersKill = false;

      const { killer, target } = pendingKill;
      pendingKill = null;

      const unique = [...new Set(clanMembersKill)];
      const found = unique.find(n => n.toLowerCase() === target.toLowerCase());

      setTimeout(() => {
        bot.chat('/cc');
        setTimeout(() => {
          if (found) {
            const rpPhrases = [
              `вонзил меч прямо в сердце`,
              `нанёс смертельный удар`,
              `отправил на тот свет`,
              `разрубил одним ударом`,
              `уничтожил без шансов на выживание`,
            ];
            const phrase = rpPhrases[Math.floor(Math.random() * rpPhrases.length)];
            bot.chat(`/cc :34: &c&l${killer} &f${phrase} &c&l${found}&f. Покойся с миром.`);
          } else {
            bot.chat(`/cc &7&l[!] &fИгрок &c&l${target} &fне найден в рядах клана. Некого убивать.`);
          }
        }, 600);
      }, 300);
      return;
    }

    if (collectingMembersKill) {
      const names = message.split(',').map(n => n.trim()).filter(n => n.length > 0);
      clanMembersKill.push(...names);
    }
  });

  // Перехватываем ответ /seen
  // Онлайн:  "Игрок Ник онлайн с 46 минут 32 секунд."
  // Офлайн:  "Игрок Ник оффлайн с 1 час 3 минут 14 секунд."
  bot.on('message', (jsonMsg) => {
    if (!pendingSeenRequest) return;
    const message = jsonMsg.toString();

    const onlineMatch = message.match(/Игрок\s+\S+\s+онлайн\s+с\s+(.+?)\./);
    const offlineMatch = message.match(/Игрок\s+\S+\s+оффлайн\s+с\s+(.+?)\./);

    if (!onlineMatch && !offlineMatch) return;

    const duration = (onlineMatch || offlineMatch)[1].trim();
    const { target } = pendingSeenRequest;
    pendingSeenRequest = null;

    setTimeout(() => {
      bot.chat('/cc');
      setTimeout(() => {
        if (onlineMatch) {
          bot.chat(`/cc &a&l[Seen] &e${target} &a&lОнлайн &f— в сети уже &a${duration}&f.`);
        } else {
          bot.chat(`/cc &c&l[Seen] &e${target} &c&lОффлайн &f— был в сети &7${duration} &fназад.`);
        }
      }, 600);
    }, 300);
  });

  // Фильтр оскорблений
  const offensiveWords = ['оскорбление1', 'оскорбление2']; // Список слов для фильтрации
  
  function checkOffensive(message, username) {
    const lowerMessage = message.toLowerCase();
    for (const word of offensiveWords) {
      if (lowerMessage.includes(word.toLowerCase())) {
        console.log(`[МОДЕРАЦИЯ] Обнаружено оскорбление от ${username}: ${message}`);
        // Здесь можно добавить действие: warn, mute, kick и т.д.
        return true;
      }
    }
    return false;
  }
  
  bot.on('chat', (username, message) => {
    // Проверка на оскорбления
    const isInClan = clanMembersList.has(username.toLowerCase());
    if (isInClan) {
      checkOffensive(message, username);
    }
    
    if (message.includes('mineblaze.net/antibot')) {
      console.log('⚠️ Обнаружена капча. Ожидание кика...');
    }
  })

  // ⚔️ Парсер убийств из чата сервера
  bot.on('message', (jsonMsg) => {
    const msg = jsonMsg.toString();
    const killMsg = msg.match(/^(\S+)\s+убил\s+(\S+)/i);
    if (!killMsg) return;
    const killer = killMsg[1];
    const victim = killMsg[2];
    const killerInClan = clanMembersList.has(killer.toLowerCase());
    const victimInClan = clanMembersList.has(victim.toLowerCase());
    if (killerInClan) {
      addKills(killer, 1);
      console.log(`[СТАТ] +1 килл → ${killer}`);
    }
    if (victimInClan) {
      const newDeaths = addDeaths(victim, 1);
      console.log(`[СТАТ] +1 смерть → ${victim} (всего: ${newDeaths})`);
      checkAndKickForDeaths(victim, newDeaths);
    }
  });

  bot.on('kicked', (reason) => {
    console.log('⛔ Бот был кикнут:', reason);
    clearAllIntervals();
    reconnect();
  });

  bot.on('end', () => {
    console.log('🔌 Подключение к серверу прервано');
    clearAllIntervals();
    reconnect();
  });

  bot.on('error', (err) => console.error('Ошибка:', err));
  bot._client.on('error', (err) => console.error('Ошибка клиента:', err))
}

// Функция ожидания
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

createBot();


// ========== УЛУЧШЕННАЯ СИСТЕМА ДУЭЛЕЙ И ТУРНИРОВ ==========

// Хранилище для турниров
let activeTournaments = {};
let duelRatings = {};

// Загрузка рейтингов дуэлянтов
function loadDuelRatings() {
  try {
    return JSON.parse(fs.readFileSync('duel_ratings.json', 'utf8'));
  } catch {
    return {};
  }
}

// Сохранение рейтингов
function saveDuelRatings(data) {
  fs.writeFileSync('duel_ratings.json', JSON.stringify(data, null, 2));
}

// Инициализация рейтингов
duelRatings = loadDuelRatings();

// Функция обновления рейтинга после дуэли
function updateDuelRating(winner, loser) {
  if (!duelRatings[winner.toLowerCase()]) {
    duelRatings[winner.toLowerCase()] = { nick: winner, rating: 1000, wins: 0, losses: 0 };
  }
  if (!duelRatings[loser.toLowerCase()]) {
    duelRatings[loser.toLowerCase()] = { nick: loser, rating: 1000, wins: 0, losses: 0 };
  }
  
  const winnerRating = duelRatings[winner.toLowerCase()].rating;
  const loserRating = duelRatings[loser.toLowerCase()].rating;
  
  // Расчет изменения рейтинга (система Эло)
  const kFactor = 32;
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));
  
  duelRatings[winner.toLowerCase()].rating += Math.round(kFactor * (1 - expectedWinner));
  duelRatings[loser.toLowerCase()].rating += Math.round(kFactor * (0 - expectedLoser));
  
  duelRatings[winner.toLowerCase()].wins++;
  duelRatings[loser.toLowerCase()].losses++;
  
  saveDuelRatings(duelRatings);
  
  return {
    winnerNewRating: duelRatings[winner.toLowerCase()].rating,
    loserNewRating: duelRatings[loser.toLowerCase()].rating,
    winnerChange: Math.round(kFactor * (1 - expectedWinner)),
    loserChange: Math.round(kFactor * (0 - expectedLoser))
  };
}

// Отправка сообщения в клановый чат
function announceToClan(text) {
  if (!bot || !bot.chat) return;
  bot.chat('/cc');
  setTimeout(() => {
    bot.chat(`/cc ${text}`);
  }, 600);
}

// Команда: рейтинг_дуэлей
telegramBot.command('duel_rating', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const target = args.length > 0 ? args[0] : null;
  
  if (target) {
    const rating = duelRatings[target.toLowerCase()];
    if (!rating) {
      ctx.reply(`❌ Игрок ${target} не имеет рейтинга дуэлей.`);
      return;
    }
    
    const message = `🏆 <b>Рейтинг дуэлей: ${target}</b>\n\n` +
      `📊 Рейтинг: ${rating.rating}\n` +
      `✅ Побед: ${rating.wins}\n` +
      `❌ Поражений: ${rating.losses}\n` +
      `📈 Винрейт: ${rating.wins + rating.losses > 0 ? Math.round((rating.wins / (rating.wins + rating.losses)) * 100) : 0}%`;
    
    ctx.reply(message, { parse_mode: 'HTML' });
  } else {
    // Топ 10 по рейтингу
    const top10 = Object.values(duelRatings)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10);
    
    if (top10.length === 0) {
      ctx.reply('📊 Нет данных о рейтингах дуэлей.');
      return;
    }
    
    let message = `🏆 <b>Топ 10 дуэлянтов</b>\n\n`;
    top10.forEach((player, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      message += `${medal} <b>${player.nick}</b> - ${player.rating} (${player.wins}/${player.losses})\n`;
    });
    
    ctx.reply(message, { parse_mode: 'HTML' });
  }
});

// Функция завершения турнира
function finishTournament(tournamentId) {
  const tournament = activeTournaments[tournamentId];
  if (!tournament || tournament.status !== 'active') return;
  
  tournament.status = 'finished';
  
  // Находим победителя (больше всего побед)
  let winner = null;
  let maxWins = 0;
  
  tournament.participants.forEach(p => {
    if (p.wins > maxWins) {
      maxWins = p.wins;
      winner = p;
    }
  });
  
  if (winner && maxWins > 0) {
    // Объявляем победителя в клановом чате
    const winMsg = `🏆 <b>ТУРНИР ЗАВЕРШЁН!</b> 🏆\n\n` +
      `🎮 <b>${tournament.name}</b>\n` +
      `🏆 Победитель: <b>${winner.nickname || winner.username}</b>\n` +
      `✅ Побед: ${maxWins}\n` +
      `🎁 Приз: ${tournament.prize}\n\n` +
      `Поздравляем победителя! 🎉`;
    
    announceToClan(`&6&l🏆 &e&lТУРНИР ЗАВЕРШЁН! &6&l🏆`);
    setTimeout(() => {
      announceToClan(`&e🎮 &f${tournament.name} &e🎮`);
    }, 500);
    setTimeout(() => {
      announceToClan(`&a&l🏆 &fПобедитель: &e&l${winner.nickname || winner.username} &f((${maxWins} побед))`);
    }, 1000);
    setTimeout(() => {
      announceToClan(`&6🎁 &fПриз: &e${tournament.prize}`);
    }, 1500);
    setTimeout(() => {
      announceToClan(`&a&lПоздравляем победителя! 🎉`);
    }, 2000);
    
    sendToTelegram(winMsg);
  } else {
    announceToClan(`&c&l⚠️ &fТурнир &e${tournament.name} &fзавершён без победителя (нет побед)`);
  }
  
  // Удаляем турнир из активных
  delete activeTournaments[tournamentId];
}

// Команда: создать_турнир <название> <приз> <время_в_минутах>
telegramBot.command('create_tournament', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 3) {
    ctx.reply('❌ Формат: /create_tournament [название] [приз] [время_в_минутах]\n\nПример: /create_tournament "Кубок клана" "1000 монет" 60');
    return;
  }
  
  const tournamentName = args[0].replace(/"/g, '');
  const prize = args[1].replace(/"/g, '');
  const durationMinutes = parseInt(args[2]);
  
  if (isNaN(durationMinutes) || durationMinutes < 1) {
    ctx.reply('❌ Время должно быть числом минут (минимум 1)');
    return;
  }
  
  const tournamentId = Date.now().toString();
  const startTime = Date.now();
  const endTime = startTime + (durationMinutes * 60 * 1000);
  
  activeTournaments[tournamentId] = {
    name: tournamentName,
    prize: prize,
    creator: ctx.from.id,
    creatorName: ctx.from.first_name,
    participants: [],
    status: 'registration',
    startTime: startTime,
    endTime: endTime,
    duration: durationMinutes,
    winner: null
  };
  
  // Объявляем о турнире в клановом чате
  announceToClan(`&6&l🎮 &e&lНОВЫЙ ТУРНИР! &6&l🎮`);
  setTimeout(() => {
    announceToClan(`&b&l${tournamentName}`);
  }, 500);
  setTimeout(() => {
    announceToClan(`&a🎁 &fПриз: &e${prize}`);
  }, 1000);
  setTimeout(() => {
    announceToClan(`&e⏱️ &fДлительность: &b${durationMinutes} минут`);
  }, 1500);
  setTimeout(() => {
    announceToClan(`&e📝 &fДля участия напиши в чате: &a/cg присоединиться`);
  }, 2000);
  
  const message = `🎮 <b>Создан турнир: ${tournamentName}</b>\n\n` +
    `🏆 Приз: ${prize}\n` +
    `⏱️ Длительность: ${durationMinutes} минут\n` +
    `👥 Участники: 0\n` +
    `📝 ID турнира: <code>${tournamentId}</code>\n\n` +
    `<i>Игроки могут присоединиться через клановый чат: /cg присоединиться</i>`;
  
  ctx.reply(message, { parse_mode: 'HTML' });
  
  // Автоматический старт турнира через 2 минуты
  setTimeout(() => {
    const tournament = activeTournaments[tournamentId];
    if (tournament && tournament.status === 'registration') {
      tournament.status = 'active';
      
      // Объявляем начало турнира
      announceToClan(`&6&l⚔️ &e&lТУРНИР НАЧАЛСЯ! &6&l⚔️`);
      setTimeout(() => {
        announceToClan(`&e🎮 &f${tournament.name} &eуже идёт!`);
      }, 500);
      setTimeout(() => {
        announceToClan(`&e⏱️ &fОсталось &b${tournament.duration} минут`);
      }, 1000);
      
      if (tournament.participants.length === 0) {
        announceToClan(`&c&l⚠️ &fНет участников - турнир отменён!`);
        delete activeTournaments[tournamentId];
      }
    }
  }, 2 * 60 * 1000);
  
  // Автоматическое завершение турнира
  setTimeout(() => {
    finishTournament(tournamentId);
  }, durationMinutes * 60 * 1000);
});

// Команда: удалить_турнир <ID>
telegramBot.command('cancel_tournament', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    ctx.reply('❌ Формат: /cancel_tournament [ID]\n\nСписок турниров: /list_tournaments');
    return;
  }
  
  const tournamentId = args[0];
  const tournament = activeTournaments[tournamentId];
  
  if (!tournament) {
    ctx.reply('❌ Турнир не найден.');
    return;
  }
  
  // Проверяем, что удаляет создатель или админ
  if (tournament.creator !== ctx.from.id && ctx.from.id !== 8101205123) {
    ctx.reply('❌ Только создатель турнира может его отменить.');
    return;
  }
  
  const tournamentName = tournament.name;
  
  // Объявляем об отмене в клановом чате
  announceToClan(`&c&l⚠️ &fТурнир &e${tournamentName} &cОТМЕНЁН!`);
  setTimeout(() => {
    announceToClan(`&c&lПричина: &fОтменён организатором`);
  }, 500);
  
  // Удаляем турнир
  delete activeTournaments[tournamentId];
  
  ctx.reply(`✅ Турнир "${tournamentName}" отменён.`);
});

// Команда: список турниров
telegramBot.command('list_tournaments', (ctx) => {
  const tournaments = Object.entries(activeTournaments);
  
  if (tournaments.length === 0) {
    ctx.reply('📊 Нет активных турниров.');
    return;
  }
  
  let message = `🏆 <b>Активные турниры</b>\n\n`;
  
  tournaments.forEach(([id, t]) => {
    const statusEmoji = t.status === 'registration' ? '📝' : '⚔️';
    const timeLeft = t.endTime ? Math.round((t.endTime - Date.now()) / 60000) : t.duration;
    
    message += `${statusEmoji} <b>${t.name}</b>\n`;
    message += `   🏆 Приз: ${t.prize}\n`;
    message += `   👥 Участников: ${t.participants.length}\n`;
    message += `   ⏱️ ${t.status === 'registration' ? 'Начнётся через 2 мин' : 'Осталось: ' + timeLeft + ' мин'}\n`;
    message += `   📝 ID: <code>${id}</code>\n\n`;
  });
  
  ctx.reply(message, { parse_mode: 'HTML' });
});

// Обработка команд в клановом чате для турниров
bot.on('message', (jsonMsg) => {
  const msg = jsonMsg.toString();
  
  // Парсим клановый чат
  const clanMatch = msg.match(/КЛАН:\s*(?:\[.*?\]\s*)?(\S+)\s*[:\-]\s*(.+)/);
  if (!clanMatch) return;
  
  const playerName = clanMatch[1].trim();
  const command = clanMatch[2].trim().toLowerCase();
  
  // Команда присоединения к турниру
  if (command === 'присоединиться' || command === 'join') {
    // Ищем турнир в стадии регистрации
    let foundTournament = null;
    let tournamentId = null;
    
    for (const [id, t] of Object.entries(activeTournaments)) {
      if (t.status === 'registration') {
        foundTournament = t;
        tournamentId = id;
        break;
      }
    }
    
    if (!foundTournament) {
      announceToClan(`&c&l[Турнир] &fНет турниров для регистрации.`);
      return;
    }
    
    // Проверяем, не присоединился ли уже
    if (foundTournament.participants.some(p => p.nickname && p.nickname.toLowerCase() === playerName.toLowerCase())) {
      announceToClan(`&c&l[Турнир] &f${playerName} &cуже участвуешь!`);
      return;
    }
    
    // Добавляем участника
    foundTournament.participants.push({
      nickname: playerName,
      username: playerName,
      wins: 0,
      joinedAt: Date.now()
    });
    
    announceToClan(`&a&l[Турнир] &f${playerName} &aприсоединился к турниру! &7(Участников: ${foundTournament.participants.length})`);
    return;
  }
  
  // Команда победы в дуэли (для турнира)
  if (command === 'победа' || command === 'win') {
    // Ищем активный турнир
    let activeTournament = null;
    
    for (const [id, t] of Object.entries(activeTournaments)) {
      if (t.status === 'active') {
        activeTournament = { ...t, id };
        break;
      }
    }
    
    if (!activeTournament) {
      announceToClan(`&c&l[Турнир] &fНет активного турнира.`);
      return;
    }
    
    // Проверяем, что игрок участник турнира
    const participant = activeTournament.participants.find(p => p.nickname && p.nickname.toLowerCase() === playerName.toLowerCase());
    
    if (!participant) {
      announceToClan(`&c&l[Турнир] &f${playerName} &cне участник турнира!`);
      return;
    }
    
    // Увеличиваем счёт побед
    participant.wins++;
    
    // Обновляем в хранилище
    activeTournaments[activeTournament.id].participants = activeTournament.participants;
    
    const winCount = participant.wins;
    announceToClan(`&a&l⚔️ &f${playerName} &aодержал победу! &7(Всего побед: ${winCount})`);
    return;
  }
  
  // Команда статистики турнира
  if (command === 'турнир статистика' || command === 'топ') {
    // Ищем активный или недавно завершённый турнир
    let foundTournament = null;
    
    for (const [id, t] of Object.entries(activeTournaments)) {
      if (t.status === 'active') {
        foundTournament = t;
        break;
      }
    }
    
    if (!foundTournament) {
      announceToClan(`&c&l[Турнир] &fНет активного турнира.`);
      return;
    }
    
    if (foundTournament.participants.length === 0) {
      announceToClan(`&c&l[Турнир] &fПока нет участников.`);
      return;
    }
    
    // Сортируем по победам
    const sorted = [...foundTournament.participants].sort((a, b) => b.wins - a.wins).slice(0, 5);
    
    let statsMsg = `&e&l🏆 &fТоп участников &e${foundTournament.name}&f:\n`;
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
      statsMsg += `${medal} &f${p.nickname}: ${p.wins} побед\n`;
    });
    
    announceToClan(statsMsg);
    return;
  }
});

// Команда: присоединиться к турниру (Telegram)
telegramBot.command('join_tournament', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    ctx.reply('❌ Укажите ID турнира: /join_tournament [ID]\n\nСписок турниров: /list_tournaments');
    return;
  }
  
  const tournamentId = args[0];
  const tournament = activeTournaments[tournamentId];
  
  if (!tournament) {
    ctx.reply('❌ Турнир не найден.');
    return;
  }
  
  if (tournament.status !== 'registration') {
    ctx.reply('❌ Регистрация на турнир закрыта.');
    return;
  }
  
  // Проверяем, не зарегистрирован ли уже
  if (tournament.participants.some(p => p.userId === ctx.from.id)) {
    ctx.reply('❌ Вы уже зарегистрированы на этот турнир.');
    return;
  }
  
  tournament.participants.push({
    userId: ctx.from.id,
    username: ctx.from.username || ctx.from.first_name,
    nickname: null,
    wins: 0
  });
  
  const message = `✅ <b>Вы присоединились к турниру!</b>\n\n` +
    `🎮 Турнир: ${tournament.name}\n` +
    `🏆 Приз: ${tournament.prize}\n` +
    `👥 Участников: ${tournament.participants.length}\n\n` +
    `<i>Укажите ник в игре для участия</i>`;
  
  ctx.reply(message, { parse_mode: 'HTML' });
});

// ========== АНТИ-ГРИФЕРСТВО ==========

// Хранилище подозрительных действий
let suspiciousActions = {};

// Функция обнаружения подозрительных действий
function detectSuspiciousAction(player, action, details) {
  const playerKey = player.toLowerCase();
  
  if (!suspiciousActions[playerKey]) {
    suspiciousActions[playerKey] = {
      nick: player,
      actions: [],
      score: 0,
      lastDetected: new Date().toISOString()
    };
  }
  
  suspiciousActions[playerKey].actions.push({
    action,
    details,
    timestamp: new Date().toISOString()
  });
  
  // Оценка опасности
  let scoreIncrease = 0;
  switch (action) {
    case 'block_destruction':
      scoreIncrease = 1;
      break;
    case 'chest_access':
      scoreIncrease = 2;
      break;
    case 'item_taking':
      scoreIncrease = 3;
      break;
    case 'home_destruction':
      scoreIncrease = 10;
      break;
  }
  
  suspiciousActions[playerKey].score += scoreIncrease;
  suspiciousActions[playerKey].lastDetected = new Date().toISOString();
  
  // Если превышен порог - отправляем уведомление
  if (suspiciousActions[playerKey].score >= 15) {
    const message = `🚨 <b>Обнаружено подозрительное поведение!</b>\n\n` +
      `👤 Игрок: ${player}\n` +
      `⚠️ Уровень опасности: ${suspiciousActions[playerKey].score}/100\n` +
      `📝 Последнее действие: ${action}\n` +
      `⏰ Время: ${new Date().toLocaleTimeString('ru-RU')}\n\n` +
      `<i>Рекомендуется проверить действия игрока.</i>`;
    
    sendToTelegram(message);
    
    // Сбрасываем счетчик после уведомления
    suspiciousActions[playerKey].score = 0;
  }
}

// ========== ЛОГИРОВАНИЕ ДЕЙСТВИЙ ==========

// Функция логирования важных действий
function logAction(type, actor, target, details) {
  const logEntry = {
    type,
    actor,
    target,
    details,
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('ru-RU'),
    time: new Date().toLocaleTimeString('ru-RU')
  };
  
  // Загружаем существующие логи
  let logs = [];
  try {
    logs = JSON.parse(fs.readFileSync('action_logs.json', 'utf8'));
  } catch (e) {
    logs = [];
  }
  
  // Добавляем новую запись
  logs.push(logEntry);
  
  // Сохраняем (ограничиваем размер до 1000 записей)
  if (logs.length > 1000) {
    logs = logs.slice(-1000);
  }
  
  fs.writeFileSync('action_logs.json', JSON.stringify(logs, null, 2));
  
  console.log(`[ЛОГ] ${type}: ${actor} -> ${target} (${details})`);
}

// ========== РЕЗЕРВНОЕ КОПИРОВАНИЕ ==========

// Функция создания резервной копии данных
function createBackup() {
  const backupDir = 'backups';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${backupDir}/backup-${timestamp}`;
  
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath);
  }
  
  // Копируем все файлы данных
  const dataFiles = [
    'admins.json',
    'clanBlacklist.json', 
    'playerStats.json',
    'playerNotes.json',
    'joinDates.json',
    'duel_ratings.json',
    'action_logs.json'
  ];
  
  dataFiles.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, `${backupPath}/${file}`);
      } catch (e) {
        console.error(`[БЭКАП] Ошибка копирования ${file}:`, e.message);
      }
    }
  });
  
  console.log(`[БЭКАП] Создана резервная копия: ${backupPath}`);
}

// Автоматическое резервное копирование каждые 24 часа
setInterval(() => {
  createBackup();
}, 24 * 60 * 60 * 1000);

// Первое резервное копирование через 5 минут после запуска
setTimeout(() => {
  createBackup();
}, 5 * 60 * 1000);

// ========== ГРАФИКИ АКТИВНОСТИ ==========

// Хранилище для данных активности
let activityData = {};

// Функция сбора данных об активности
function collectActivityData() {
  const hour = new Date().getHours();
  
  // Собираем данные об онлайн игроках
  if (bot && bot.players) {
    const onlinePlayers = Object.values(bot.players)
      .filter(p => p.username !== bot.username)
      .map(p => p.username);
    
    onlinePlayers.forEach(player => {
      const playerKey = player.toLowerCase();
      if (!activityData[playerKey]) {
        activityData[playerKey] = {
          nick: player,
          hours: Array(24).fill(0)
        };
      }
      
      activityData[playerKey].hours[hour]++;
    });
  }
  
  // Сохраняем данные каждые 6 часов
  if (hour % 6 === 0) {
    saveActivityData();
  }
}

// Сохранение данных активности
function saveActivityData() {
  try {
    fs.writeFileSync('activity_data.json', JSON.stringify(activityData, null, 2));
  } catch (e) {
    console.error('[АКТИВНОСТЬ] Ошибка сохранения данных:', e.message);
  }
}

// Загрузка данных активности
function loadActivityData() {
  try {
    activityData = JSON.parse(fs.readFileSync('activity_data.json', 'utf8'));
  } catch {
    activityData = {};
  }
}

// Инициализация данных активности
loadActivityData();

// Сбор данных каждые 30 минут
setInterval(collectActivityData, 30 * 60 * 1000);

// Команда для просмотра графиков активности
telegramBot.command('activity_graph', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const target = args.length > 0 ? args[0] : null;
  
  if (target) {
    const playerData = activityData[target.toLowerCase()];
    if (!playerData || playerData.hours.every(h => h === 0)) {
      ctx.reply(`📊 Нет данных об активности для игрока ${target}.`);
      return;
    }
    
    // Создаем текстовый график
    let graph = `📈 <b>Активность ${target} по часам</b>\n\n`;
    
    for (let h = 0; h < 24; h++) {
      const count = playerData.hours[h];
      const barLength = Math.min(Math.round(count / 2), 20); // Ограничиваем длину
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      const hourStr = h.toString().padStart(2, '0');
      graph += `${hourStr}:00 ${bar} ${count}\n`;
    }
    
    ctx.reply(graph, { parse_mode: 'HTML' });
  } else {
    // Общая статистика активности клана
    let message = `📊 <b>Активность клана по часам</b>\n\n`;
    
    const hourlyTotals = Array(24).fill(0);
    Object.values(activityData).forEach(player => {
      player.hours.forEach((count, hour) => {
        hourlyTotals[hour] += count;
      });
    });
    
    const maxActivity = Math.max(...hourlyTotals);
    
    for (let h = 0; h < 24; h++) {
      const count = hourlyTotals[h];
      const percentage = maxActivity > 0 ? Math.round((count / maxActivity) * 100) : 0;
      const barLength = Math.round(percentage / 5);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      const hourStr = h.toString().padStart(2, '0');
      message += `${hourStr}:00 ${bar} ${count}\n`;
    }
    
    ctx.reply(message, { parse_mode: 'HTML' });
  }
});

// ========== ОТСЛЕЖИВАНИЕ РЕСУРСОВ ==========

// Хранилище для данных о ресурсах
let resourceData = {};

// Функция отслеживания ресурсов
function trackResource(player, resource, amount) {
  const playerKey = player.toLowerCase();
  
  if (!resourceData[playerKey]) {
    resourceData[playerKey] = {
      nick: player,
      resources: {}
    };
  }
  
  if (!resourceData[playerKey].resources[resource]) {
    resourceData[playerKey].resources[resource] = 0;
  }
  
  resourceData[playerKey].resources[resource] += amount;
  
  // Сохраняем данные
  saveResourceData();
}

// Сохранение данных о ресурсах
function saveResourceData() {
  try {
    fs.writeFileSync('resource_data.json', JSON.stringify(resourceData, null, 2));
  } catch (e) {
    console.error('[РЕСУРСЫ] Ошибка сохранения данных:', e.message);
  }
}

// Загрузка данных о ресурсах
function loadResourceData() {
  try {
    resourceData = JSON.parse(fs.readFileSync('resource_data.json', 'utf8'));
  } catch {
    resourceData = {};
  }
}

// Инициализация данных о ресурсах
loadResourceData();

// Команда для просмотра статистики ресурсов
telegramBot.command('resource_stats', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const target = args.length > 0 ? args[0] : null;
  
  if (target) {
    const playerData = resourceData[target.toLowerCase()];
    if (!playerData || Object.keys(playerData.resources).length === 0) {
      ctx.reply(`⛏️ Нет данных о ресурсах для игрока ${target}.`);
      return;
    }
    
    let message = `⛏️ <b>Ресурсы игрока ${target}</b>\n\n`;
    
    // Сортируем ресурсы по количеству
    const sortedResources = Object.entries(playerData.resources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedResources.forEach(([resource, amount]) => {
      message += `• ${resource}: ${amount}\n`;
    });
    
    ctx.reply(message, { parse_mode: 'HTML' });
  } else {
    // Общая статистика по клану
    let message = `⛏️ <b>Топ добытчиков ресурсов</b>\n\n`;
    
    const playerTotals = Object.entries(resourceData).map(([key, data]) => {
      const total = Object.values(data.resources).reduce((sum, amount) => sum + amount, 0);
      return { nick: data.nick, total };
    }).sort((a, b) => b.total - a.total).slice(0, 10);
    
    if (playerTotals.length === 0) {
      ctx.reply('⛏️ Нет данных о добыче ресурсов.');
      return;
    }
    
    playerTotals.forEach((player, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      message += `${medal} ${player.nick}: ${player.total} ресурсов\n`;
    });
    
    ctx.reply(message, { parse_mode: 'HTML' });
  }
});

// ========== ЗАПУСК ВСЕХ СИСТЕМ ==========

// Запуск сбора данных активности
setTimeout(collectActivityData, 1000);

// Инициализация бота (уже вызвана в основном коде)
// createBot();

// Запуск автоматических отчетов (уже вызван в основном коде)
// startReports();

console.log('🚀 Дополнительные функции загружены!');
