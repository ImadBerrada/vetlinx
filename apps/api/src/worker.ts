import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './platform/delivery/worker.module';
import { DeliveryWorkerService } from './platform/delivery/delivery-worker.service';

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn'],
  });
  const worker = app.get(DeliveryWorkerService);
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  try {
    do {
      try {
        await worker.tick();
      } catch {
        process.stderr.write('Worker cycle failed; retrying.\n');
        if (process.argv.includes('--once')) process.exitCode = 1;
      }
      if (process.argv.includes('--once')) break;
      for (let count = 0; count < 10 && !stopping; count++)
        await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (!stopping);
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  process.stderr.write('Worker startup failed.\n');
  process.exitCode = 1;
});
