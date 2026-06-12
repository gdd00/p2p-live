# p2p-live

基于 IPv6 直连的极简个人直播服务端工具。OBS 推流到本机，观众通过公网 IPv6 地址直接访问网页观看。

## 文件结构

```
p2p-live/
├── package.json
├── server.js
├── README.md
└── public/
    └── index.html
```

## 快速启动

```bash
npm install
npm start
```

---

# 部署手册

## 一、运行服务端

### 1.1 安装依赖 & 启动

```bash
cd p2p-live
npm install
npm start
```

### 1.2 确认监听成功

看到以下输出即表示启动成功：

```
Node Media Server v2.7.4
Node Media Rtmp Server started on port: 1935
Node Media Http Server started on port: 8000
Node Media WebSocket Server started on port: 8000

本机 IPv6 地址: 2xxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx
OBS 推流地址: rtmp://[2xxx:...]:1935/live/stream
观众播放地址: http://[2xxx:...]:8000/
```

### 1.3 手动验证端口监听

另开一个终端窗口，运行：

```bash
netstat -an | findstr ":8000"
netstat -an | findstr ":1935"
```

正常输出应同时包含 `[::]`（IPv6）和 `0.0.0.0`（IPv4），状态为 `LISTENING`：

```
  TCP    [::]:1935              [::]:0                 LISTENING
  TCP    [::]:8000              [::]:0                 LISTENING
```

> **注意**：本工具使用的 `node-media-server` v2 源码已手动添加 IPv6 绑定补丁（`listen(port, '::')`）。如果未来升级或重装该库，需要确认端口是否仍绑定到 `[::]`。

## 二、OBS 推流设置

### 2.1 推流服务器 & 推流码

| 设置项 | 填入内容 |
|---|---|
| **推流方式** | 自定义推流服务器（Custom Streaming Server） |
| **服务器（Server）** | `rtmp://[你的IPv6地址]:1935/live` |
| **推流码（Stream Key）** | `stream` |

> **注意**：`/live` 是应用名（app），`stream` 是流名（stream key）。OBS 里**服务器填 app 路径，推流码填流名**。

### 2.2 视频编码器设置

在 OBS **设置 > 输出 > 输出模式选"高级"**：

| 设置项 | 推荐值 | 说明 |
|---|---|---|
| **编码器** | x264 或 NVIDIA NVENC H.264 | FLV 容器仅支持 H.264 视频，**不可用 H.265/AV1** |
| **码率** | 2000 - 4000 Kbps | 个人直播，4000 Kbps 足够 1080p |
| **关键帧间隔** | **2 秒** | 必须设置，否则观众端首屏加载会极慢 |
| **预设** | veryfast / fast | 平衡画质与 CPU 占用 |

在 OBS **设置 > 音频** 中：

| 设置项 | 推荐值 | 说明 |
|---|---|---|
| **编码器** | AAC | FLV 容器支持的音频格式 |
| **码率** | 128 Kbps | 标准音质 |
| **采样率** |  48 kHz | 标准采样率

### 2.3 验证推流成功

OBS 点击"开始推流"后，服务端终端会打印推流连接日志，此时观众打开播放页面即可看到画面。

## 三、系统与网络防火墙设置

### 3.1 Windows 防火墙放行

以**管理员身份**打开 PowerShell 或 CMD，执行以下两条命令：

```powershell
# 放行 RTMP 推流端口（TCP 1935）
netsh advfirewall firewall add rule name="Live-RTMP" dir=in action=allow protocol=TCP localport=1935

# 放行 HTTP-FLV 播放端口（TCP 8000）
netsh advfirewall firewall add rule name="Live-HTTP" dir=in action=allow protocol=TCP localport=8000
```

验证规则是否生效：

```powershell
netsh advfirewall firewall show rule name="Live-RTMP"
netsh advfirewall firewall show rule name="Live-HTTP"
```

### 3.2 家庭路由器 IPv6 防火墙

IPv6 没有 NAT，每台设备有独立的公网 IP。但大多数家用路由器默认**阻止所有入站 IPv6 连接**（即 IPv6 防火墙/SPI 防火墙）。

你需要进入路由器管理页面放行入站连接。不同品牌路由器的操作路径大致如下：

| 品牌 | 设置路径参考 |
|---|---|
| **华为/荣耀** | 更多功能 > 网络设置 > IPv6 防火墙 > 关闭或添加放行规则 |
| **小米/Redmi** | 高级设置 > 安全设置 > IPv6 防火墙 > 关闭 |
| **TP-LINK** | IPv6 设置 > IPv6 防火墙 > 关闭 |
| **华硕（ASUS）** | IPv6 > 防火墙设置 > 关闭 |

> **关键区别**：IPv4 时代需要"端口映射 / DMZ"，因为内网设备共享一个公网 IP。IPv6 时代**不需要端口映射**，只需**关闭路由器 IPv6 防火墙**或添加入站放行规则。

### 3.3 验证外网可访问

让外网朋友用浏览器访问你的 IPv6 地址：

```
http://[你的公网IPv6地址]:8000/
```

或者你自己用手机（关闭 Wi-Fi，用蜂窝数据）访问同一地址进行自测。大多数手机运营商都提供公网 IPv6。

## 常见问题排查

### 代理软件 TUN 模式导致 IPv6 连接失败

**仅windows：** 如果你使用了 Sing-box、mihomo 等代理软件并开启了 TUN 模式，TUN 虚拟网卡会接管所有系统流量（包括 IPv6），导致你无法通过自己的公网 IPv6 地址连接本机服务。

**现象：**
- `rtmp://127.0.0.1:1935/live` 推流正常
- `rtmp://[IPv6地址]:1935/live` 推流失败，OBS 提示"无法连接到服务器"
- `ping [IPv6地址]` 显示"一般故障"
- `ipconfig` 中出现 `singbox_tun`、`Clash`、`wintun` 等虚拟网卡

**解决方法（三选一）：**

1. **临时关闭 TUN 模式**：推流和直播测试期间关掉代理的 TUN 模式，确认正常后再开
2. **添加绕过规则**：在代理配置中加入直连规则，让本机 IPv6 流量不走代理
   ```json
   // Sing-box / Clash 等通用思路
   {
     "rules": [
       {
         "ip_cidr": ["2xxx::/16", "2000::/3"],
         "outbound": "direct"
       }
     ]
   }
   ```
3. **在代理软件中为 OBS 和 node.exe 设置进程级绕过**：让这两个程序不经过 TUN

### 症状：OBS 提示"无法连接到服务器"

1. **先用 IPv4 本地测试**：OBS 服务器填 `rtmp://127.0.0.1:1935/live`，推流码 `stream`，能成功推流说明服务本身正常
2. **检查代理 TUN 模式**（见上方专节）：这是最容易被忽略的原因
3. **检查 Windows 防火墙**：运行 `netsh advfirewall firewall show rule name="Live-RTMP"` 确认规则存在
4. **检查路由器 IPv6 防火墙**：进入路由器管理页面关闭 IPv6 防火墙
5. **检查端口监听**：`netstat -an | findstr ":1935"` 应显示 `[::]:1935` 或 `0.0.0.0:1935` 且状态为 `LISTENING`

### 症状：推流成功但观众看不了

1. 检查路由器 IPv6 防火墙是否放行 8000 端口
2. 检查 Windows 防火墙规则是否存在
3. 确认 OBS 关键帧间隔设置为 **2 秒**

### 症状：浏览器播放器黑屏

- OBS 关键帧间隔未设置为 2 秒
- 推流尚未开始（等 OBS 推流后再刷新页面）
- 浏览器不支持 MSE（使用 Chrome/Edge/Firefox 最新版）
- 回看2.2 视频编码器设置
