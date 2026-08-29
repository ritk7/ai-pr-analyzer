import mongoose from 'mongoose';
import { createApp } from './app.js';
import { config } from './config/index.js';

async function main() {
  if (!config.mongoUri) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoUri, { dbName: 'ai_pr_analyzer' });
    console.log('Connected to MongoDB.');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  const app = createApp();
  // Bind to loopback by default so an unauthenticated dev server is not exposed on the
  // local network. Set HOST=0.0.0.0 deliberately (with API_KEY set) to expose it.
  app.listen(config.port, config.host, () => {
    console.log(`AI PR & Code Review Assistant API listening on http://${config.host}:${config.port}`);
    if (!config.github.token) {
      console.warn('GITHUB_TOKEN is not set — GitHub calls will use the unauthenticated rate limit (60/hr).');
    }
    if (config.apiKey) {
      console.log('API key auth is ENABLED for POST /api/analyze.');
    } else {
      console.warn(
        'API_KEY is not set — POST /api/analyze is unauthenticated. Fine for loopback-only ' +
          'development; set API_KEY before exposing this server beyond localhost.',
      );
    }
  });
}

main();
