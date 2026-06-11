import si from 'systeminformation';
import { EventEmitter } from 'events';

export const systemEvents = new EventEmitter();

let isMonitoring = false;
let monitorInterval = null;

export async function getSystemMetrics() {
  try {
    const [cpu, mem, disk, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo()
    ]);

    const mainDisk = disk.find(d => d.mount === '/' || d.mount === 'C:') || disk[0];

    return {
      cpu: {
        usage: Math.round(cpu.currentLoad),
        cores: cpu.cpus.map(c => Math.round(c.load))
      },
      memory: {
        total: Math.round(mem.total / (1024 * 1024 * 1024)), // GB
        used: Math.round(mem.active / (1024 * 1024 * 1024)), // GB
        percent: Math.round((mem.active / mem.total) * 100)
      },
      disk: mainDisk ? {
        total: Math.round(mainDisk.size / (1024 * 1024 * 1024)),
        used: Math.round(mainDisk.used / (1024 * 1024 * 1024)),
        percent: Math.round(mainDisk.use)
      } : null,
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        uptime: osInfo.uptime
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Ошибка получения системных метрик:', error);
    return null;
  }
}

export function startMonitoring(intervalMs = 3000) {
  if (isMonitoring) return;
  isMonitoring = true;
  
  console.log(`📊 Запуск системного мониторинга (каждые ${intervalMs}мс)`);
  
  monitorInterval = setInterval(async () => {
    const metrics = await getSystemMetrics();
    if (metrics) {
      systemEvents.emit('metrics', metrics);
    }
  }, intervalMs);
}

export function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isMonitoring = false;
  console.log('🛑 Системный мониторинг остановлен');
}
