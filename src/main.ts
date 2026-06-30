import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Injected by webpack in the HMR dev build; undefined in the plain
// `node dist/main.js` production build (so the block below is a no-op there).
declare const module: {
  hot?: { accept(): void; dispose(callback: () => void): void };
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Run onModuleDestroy/onApplicationShutdown hooks and close the app on
  // SIGTERM/SIGINT — i.e. graceful shutdown for `docker stop` / tini in prod.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3333);

  // Hot Module Replacement (dev): swap changed modules into the running process
  // instead of restarting it, so the port is never rebound — no EADDRINUSE.
  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => {
      void app.close();
    });
  }
}

void bootstrap();
