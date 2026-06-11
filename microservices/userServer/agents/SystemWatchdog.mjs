import { systemEvents } from '../services/system_monitor.mjs';
class SystemWatchdog {
  constructor(io) {
    this.io = io;
    this.name = 'Watchdog';
    this.id = 'system_watchdog_1';
    this.cooldown = false;
  }
  log(message, type = 'warning') {
    console.log(`[Watchdog] ${message}`);
    if (this.io) {
      this.io.emit('agent:log', { agentId: this.id, name: this.name, message, type, timestamp: new Date().toISOString() });
    }
  }
  start() {
    this.log('Системный Watchdog активирован.', 'success');
    systemEvents.on('metrics', (metrics) => {
      if (this.cooldown) return;
      const cpuUsage = metrics.cpu?.usage || 0;
      const memUsage = metrics.memory?.percent || 0;
      if (cpuUsage > 90 || memUsage > 95) {
        this.log(`ВНИМАНИЅ! Критическая нагрузк�a: CPU /${cpuUsage.toFixed(1)}%, RAM ${memUsage.toFixed(1)}%. Принимаю меры...`, 'error');
        this.cooldown = true;
        this.log('Система перегружена.', 'thinking');
        setTimeout(() => {
          this.log('Охлаждение завершено. Мониторинг восстановлен.', 'info');
        }, 30000);
      }
    });
  }
}
export function startWatchdog(io) {
  const watchdog = new SystemWatchdog(io);
  watchdog.start();
  return watchdog;
}