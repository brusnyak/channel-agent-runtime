import { loadRuntimeEnv } from '../src/config/env.mjs';

loadRuntimeEnv();

const appToken = process.env.SLACK_APP_TOKEN;
const botToken = process.env.SLACK_BOT_TOKEN;

if (appToken) {
  const response = await fetch('https://slack.com/api/apps.connections.open', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${appToken}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
  });
  const data = await response.json();
  console.log(
    JSON.stringify(
      {
        app_token_ok: Boolean(data.ok),
        app_token_error: data.ok ? null : data.error,
        channel_configured: Boolean(process.env.SLACK_CHANNEL_ID),
      },
      null,
      2,
    ),
  );
} else {
  console.log('Slack app token missing.');
}

if (botToken) {
  const response = await fetch('https://slack.com/api/auth.test', {
    headers: {
      authorization: `Bearer ${botToken}`,
    },
  });
  const data = await response.json();
  console.log(
    JSON.stringify(
      {
        bot_token_ok: Boolean(data.ok),
        bot_user_id: data.user_id,
        team: data.team,
        bot_token_error: data.ok ? null : data.error,
      },
      null,
      2,
    ),
  );
} else {
  console.log('Slack bot token missing: install the app to workspace and copy Bot User OAuth Token (xoxb-...).');
}
