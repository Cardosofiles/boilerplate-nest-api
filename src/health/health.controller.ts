import { Controller, Get } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

/**
 * Root drive differs per platform: `/` inside the Linux container (and CI),
 * `C:\` when the app runs directly on a Windows host. Resolving it here keeps
 * the disk probe working in every environment.
 */
const DISK_PATH = process.platform === 'win32' ? 'C:\\' : '/';

// Thresholds are intentionally generous for a boilerplate — tune per workload.
const HEAP_THRESHOLD = 300 * 1024 * 1024; // 300 MB
const RSS_THRESHOLD = 512 * 1024 * 1024; // 512 MB
const DISK_THRESHOLD_PERCENT = 0.9; // fail when >90% full

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
  ) {}

  /**
   * Full health check — aggregates every indicator.
   * Use for dashboards / manual inspection.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', HEAP_THRESHOLD),
      () => this.memory.checkRSS('memory_rss', RSS_THRESHOLD),
      () =>
        this.disk.checkStorage('disk', {
          path: DISK_PATH,
          thresholdPercent: DISK_THRESHOLD_PERCENT,
        }),
    ]);
  }

  /**
   * Liveness probe — "is the process up and the event loop responsive?".
   * Kept dependency-free so transient pressure never triggers a restart.
   * Wired to the Docker HEALTHCHECK and to Kubernetes `livenessProbe`.
   */
  @Get('liveness')
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  /**
   * Readiness probe — "can this instance safely receive traffic?".
   * Wire to Kubernetes `readinessProbe`; extend with DB/cache/broker pings.
   */
  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', HEAP_THRESHOLD),
      () =>
        this.disk.checkStorage('disk', {
          path: DISK_PATH,
          thresholdPercent: DISK_THRESHOLD_PERCENT,
        }),
    ]);
  }
}
