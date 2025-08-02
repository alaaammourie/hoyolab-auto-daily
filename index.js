#!/usr/bin/env node

const cookies = process.env.COOKIE.split('\n').map(s => s.trim())
const games = process.env.GAMES.split('\n').map(s => s.trim())
const discordWebhook = process.env.DISCORD_WEBHOOK
const discordUser = process.env.DISCORD_USER
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramChatId = process.env.TELEGRAM_CHAT_ID
const msgDelimiter = ':'
const messages = []
const endpoints = {
  zzz: 'https://sg-act-nap-api.hoyolab.com/event/luna/zzz/os/sign?act_id=e202406031448091',
  gi:  'https://sg-hk4e-api.hoyolab.com/event/sol/sign?act_id=e202102251931481',
  hsr: 'https://sg-public-api.hoyolab.com/event/luna/os/sign?act_id=e202303301540311',
  hi3: 'https://sg-public-api.hoyolab.com/event/mani/sign?act_id=e202110291205111',
  tot: 'https://sg-public-api.hoyolab.com/event/luna/os/sign?act_id=e202202281857121',
}

let hasErrors = false
let latestGames = []

async function run(cookie, games) {
  if (!games) {
    games = latestGames
  } else {
    games = games.split(' ')
    latestGames = games
  }

  for (let game of games) {
    game = game.toLowerCase()

    log('debug', `\n----- CHECKING IN FOR ${game} -----`)

    if (!(game in endpoints)) {
      log('error', `Game ${game} is invalid. Available games are: zzz, gi, hsr, hi3, and tot`)
      continue
    }

    // begin check in
    const endpoint = endpoints[game]
    const url = new URL(endpoint)
    const actId = url.searchParams.get('act_id')

    url.searchParams.set('lang', 'en-us')

    const body = JSON.stringify({
      lang: 'en-us',
      act_id: actId
    })

    // headers from valid browser request
    const headers = new Headers()

    headers.set('accept', 'application/json, text/plain, */*')
    headers.set('accept-encoding', 'gzip, deflate, br, zstd')
    headers.set('accept-language', 'en-US,en;q=0.6')
    headers.set('connection', 'keep-alive')

    headers.set('origin', 'https://act.hoyolab.com')
    headers.set('referrer', 'https://act.hoyolab.com')
    headers.set('content-type', 'application.json;charset=UTF-8')
    headers.set('cookie', cookie)

    headers.set('sec-ch-ua', '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"')
    headers.set('sec-ch-ua-mobile', '?0')
    headers.set('sec-ch-ua-platform', '"Linux"')
    headers.set('sec-fetch-dest', 'empty')
    headers.set('sec-fech-mode', 'cors')
    headers.set('sec-fetch-site', 'same-site')
    headers.set('sec-gpc', '1')

    headers.set("x-rpc-signgame", game)

    headers.set('user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')

    const res = await fetch(url, { method: 'POST', headers, body })
    const json = await res.json()
    const code = String(json.retcode)
    const successCodes = {
      '0': 'Successfully checked in!',
      '-5003': 'Already checked in for today',
    }

    // success responses
    if (code in successCodes) {
      log('info', game, `${successCodes[code]}`)
      continue
    }

    // error responses
    const errorCodes = {
      '-100': 'Error not logged in. Your cookie is invalid, try setting up again',
      '-10002': 'Error not found. You haven\'t played this game'
    }

    log('debug', game, `Headers`, Object.fromEntries(res.headers))
    log('debug', game, `Response`, json)

    if (code in errorCodes) {
      log('error', game, `${errorCodes[code]}`)
      continue
    }

    log('error', game, `Error undocumented, report to Issues page if this persists`)
  }
}

// custom log function to store messages
function log(type, ...data) {

  // log to real console
  console[type](...data)

  // ignore debug and toggle hasErrors
  switch (type) {
    case 'debug': return
    case 'error': hasErrors = true
  }

  // check if it's a game specific message, and set it as uppercase for clarity, and add delimiter
  if(data[0] in endpoints) {
    data[0] = data[0].toUpperCase() + msgDelimiter
  }

  // serialize data and add to messages
  const string = data
    .map(value => {
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2).replace(/^"|"$/, '')
      }

      return value
    })
    .join(' ')

  messages.push({ type, string })
}

// must be function to return early
async function discordWebhookSend() {
  log('debug', '\n----- DISCORD WEBHOOK -----')

  if (!discordWebhook.toLowerCase().trim().startsWith('https://discord.com/api/webhooks/')) {
    log('error', 'DISCORD_WEBHOOK is not a Discord webhook URL. Must start with `https://discord.com/api/webhooks/`')
    return
  }
  let discordMsg = ""
  if (discordUser) {
      discordMsg = `<@${discordUser}>\n`
  }
  discordMsg += messages.map(msg => `(${msg.type.toUpperCase()}) ${msg.string}`).join('\n')

  const res = await fetch(discordWebhook, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      content: discordMsg
    })
  })

  if (res.status === 204) {
    log('info', 'Successfully sent message to Discord webhook!')
    return
  }

  log('error', 'Error sending message to Discord webhook, please check URL and permissions')
}

// Telegram bot function
async function telegramBotSend() {
  log('debug', '\n----- TELEGRAM BOT -----')

  if (!telegramBotToken || !telegramChatId) {
    log('error', 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set to use Telegram notifications')
    return
  }

  // Create a more formatted message for Telegram
  const currentDate = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  let telegramMsg = `🎮 <b>HoYoLAB Auto Check-in Report</b>\n`
  telegramMsg += `📅 <i>${currentDate} (UTC+8)</i>\n`
  telegramMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`

  // Group messages by account
  const accountMessages = {}
  let currentAccount = null
  let accountCounter = 0

  messages.forEach(msg => {
    // Check if this is an account separator message
    if (msg.string.includes('CHECKING IN FOR ACCOUNT')) {
      const accountMatch = msg.string.match(/ACCOUNT (\d+)/)
      if (accountMatch) {
        currentAccount = `Account ${accountMatch[1]}`
        accountCounter++
        if (!accountMessages[currentAccount]) {
          accountMessages[currentAccount] = []
        }
      }
    } else if (currentAccount) {
      // Add game-specific messages to current account
      accountMessages[currentAccount].push(msg)
    } else {
      // Handle messages that don't belong to any account
      if (!accountMessages['General']) {
        accountMessages['General'] = []
      }
      accountMessages['General'].push(msg)
    }
  })

  // Format messages for each account
  Object.keys(accountMessages).forEach((account, index) => {
    if (accountMessages[account].length === 0) return

    // Account header
    if (account !== 'General') {
      telegramMsg += `👤 <b>${account}</b>\n`
      telegramMsg += `┌─────────────────────────┐\n`
    }

    // Game status messages
    accountMessages[account].forEach(msg => {
      const typeEmoji = {
        'info': '✅',
        'error': '❌',
        'warn': '⚠️'
      }
      const emoji = typeEmoji[msg.type] || '📝'
      
      // Escape HTML characters
      const escapedString = msg.string
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      // Format game messages nicely
      if (escapedString.includes(':')) {
        const [game, status] = escapedString.split(':', 2)
        telegramMsg += `│ ${emoji} <b>${game.trim()}</b>: ${status.trim()}\n`
      } else {
        telegramMsg += `│ ${emoji} ${escapedString}\n`
      }
    })

    if (account !== 'General') {
      telegramMsg += `└─────────────────────────┘\n`
      
      // Add separator between accounts (but not after the last one)
      if (index < Object.keys(accountMessages).length - 1) {
        telegramMsg += `\n`
      }
    }
  })

  // Add summary
  const totalSuccess = messages.filter(msg => msg.type === 'info').length
  const totalErrors = messages.filter(msg => msg.type === 'error').length
  const totalWarnings = messages.filter(msg => msg.type === 'warn').length

  telegramMsg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
  telegramMsg += `📊 <b>Summary:</b>\n`
  telegramMsg += `✅ Success: ${totalSuccess} | ❌ Errors: ${totalErrors}`
  if (totalWarnings > 0) {
    telegramMsg += ` | ⚠️ Warnings: ${totalWarnings}`
  }
  telegramMsg += `\n👥 Total Accounts: ${accountCounter}`

  // Add footer
  telegramMsg += `\n\n🤖 <i>Automated by GitHub Actions</i>`

  const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`
  
  const res = await fetch(telegramUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text: telegramMsg,
      parse_mode: 'HTML'
    })
  })

  const responseJson = await res.json()

  if (responseJson.ok) {
    log('info', 'Successfully sent message to Telegram!')
    return
  }

  log('error', `Error sending message to Telegram: ${responseJson.description || 'Unknown error'}`)
  log('debug', 'Telegram API Response:', responseJson)
}

if (!cookies || !cookies.length) {
  throw new Error('COOKIE environment variable not set!')
}

if (!games || !games.length) {
  throw new Error('GAMES environment variable not set!')
}

for (const index in cookies) {
  log('info', `-- CHECKING IN FOR ACCOUNT ${Number(index) + 1} --`)
  await run(cookies[index], games[index])
}

// Send notifications
if (discordWebhook && URL.canParse(discordWebhook)) {
  await discordWebhookSend()
}

if (telegramBotToken && telegramChatId) {
  await telegramBotSend()
}

if (hasErrors) {
  console.log('')
  throw new Error('Error(s) occured.')
}