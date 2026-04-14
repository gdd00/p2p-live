const NodeMediaServer = require('node-media-server');
const path = require('path');
const os = require('os');

// ============================================================
// 1. 获取本机全局单播 IPv6 地址（排除回环 ::1 和链路本地 fe80）
// ============================================================
function getGlobalIPv6() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 筛选：IPv6、非内部回环、非链路本地地址（fe80::）
      if (iface.family === 'IPv6' && !iface.internal && !iface.address.startsWith('fe80')) {
        return iface.address;
      }
    }
  }
  // 兜底：找不到公网 IPv6 时返回 ::（双栈绑定地址）
  return '::';
}

// ============================================================
// 2. node-media-server v2 配置
// ============================================================
const config = {
  // ---------- RTMP 服务（接收 OBS 推流） ----------
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },

  // ---------- HTTP 服务（静态文件 + HTTP-FLV 流分发） ----------
  http: {
    port: 8000,
    allow_origin: '*',                              // 允许跨域
    webroot: path.join(__dirname, 'public'),        // 静态文件目录
  },
};

// ============================================================
// 3. 创建并启动服务
// ============================================================
const nms = new NodeMediaServer(config);

nms.run();

// 等待服务器启动后打印连接信息
setTimeout(() => {
  const ipv6 = getGlobalIPv6();

  console.log('========================================');
  console.log('  IPv6 直播服务已启动');
  console.log('========================================');
  console.log(`  本机 IPv6 地址: ${ipv6}`);
  console.log('');
  console.log('  [推流] OBS 推流地址:');
  console.log(`     rtmp://[${ipv6}]:1935/live/stream`);
  console.log('');
  console.log('  [观看] 观众播放地址:');
  console.log(`     http://[${ipv6}]:8000/`);
  console.log('========================================');
}, 1000);
