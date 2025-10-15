// local_server.js - 本地局域网服务器（一对一连接版）
const WebSocket = require('ws');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

// 获取本地IP地址
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

// 静态文件服务（保持不变）
function serveStaticFile(req, res) {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);
    
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
    }
    
    const extname = path.extname(filePath).toLowerCase();
    const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon'
    };
    
    const contentType = contentTypes[extname] || 'text/plain';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(`
                    <html>
                        <head><title>404 Not Found</title></head>
                        <body>
                            <h1>404 - File Not Found</h1>
                            <p>请求的文件不存在: ${req.url}</p>
                            <ul>
                                <li>display.html</li>
                                <li>controller.html</li>
                            </ul>
                        </body>
                    </html>
                `);
            } else {
                res.writeHead(500);
                res.end(`服务器错误: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

// 创建HTTP服务器
const server = http.createServer((req, res) => {
    console.log(`收到HTTP请求: ${req.url}`);
    
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Teleprompter Local Server</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                        .container { max-width: 800px; margin: 0 auto; }
                        .card { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
                        .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; 
                               text-decoration: none; border-radius: 5px; margin: 5px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🎬 Teleprompter 本地服务器</h1>
                        <div class="card">
                            <h2>📊 服务器信息</h2>
                            <p><strong>环境:</strong> 🏠 本地局域网</p>
                            <p><strong>服务器IP:</strong> ${getLocalIP()}</p>
                            <p><strong>端口:</strong> ${process.env.PORT || 3000}</p>
                            <p><strong>模式:</strong> 🔒 一对一连接</p>
                        </div>
                        <div class="card">
                            <h2>🔗 快速访问</h2>
                            <p>
                                <a href="/display.html" class="btn">📺 显示端 (Display)</a>
                                <a href="/controller.html" class="btn">🎮 控制端 (Controller)</a>
                            </p>
                        </div>
                    </div>
                </body>
            </html>
        `);
    } else {
        serveStaticFile(req, res);
    }
});

// 创建WebSocket服务器
const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info) => {
        console.log(`WebSocket连接尝试: ${info.req.url} from ${info.req.socket.remoteAddress}`);
        return true;
    }
});

// 连接管理 - 一对一限制
let connections = {
    display: null,
    controller: null
};

// 改进的消息转发函数
function forwardMessage(sourceType, targetType, data) {
    const source = connections[sourceType];
    const target = connections[targetType];
    
    if (target && target.readyState === WebSocket.OPEN) {
        console.log(`转发消息: ${sourceType} -> ${targetType}`, data.type);
        target.send(JSON.stringify({
            ...data,
            forwarded: true,
            timestamp: Date.now()
        }));
        return true;
    } else {
        console.log(`无法转发: ${targetType} 未连接`);
        return false;
    }
}

wss.on('connection', (ws, req) => {
    const url = req.url;
    const clientIP = req.socket.remoteAddress;
    console.log(`WebSocket连接建立: ${url} from ${clientIP}`);
    
    // 解析客户端类型
    let clientType = 'unknown';
    if (url.includes('type=display')) {
        clientType = 'display';
        
        // 一对一限制：如果已存在显示端连接，拒绝新连接
        if (connections.display) {
            console.log(`❌ 拒绝新的显示端连接：已存在连接`);
            ws.send(JSON.stringify({
                type: 'error',
                message: '显示端已有一个设备连接，请断开现有连接后再试',
                code: 'ALREADY_CONNECTED'
            }));
            ws.close(1008, 'Display already connected');
            return;
        }
        connections.display = ws;
        
    } else if (url.includes('type=controller')) {
        clientType = 'controller';
        
        // 一对一限制：如果已存在控制端连接，拒绝新连接
        if (connections.controller) {
            console.log(`❌ 拒绝新的控制端连接：已存在连接`);
            ws.send(JSON.stringify({
                type: 'error',
                message: '控制端已有一个设备连接，请断开现有连接后再试',
                code: 'ALREADY_CONNECTED'
            }));
            ws.close(1008, 'Controller already connected');
            return;
        }
        connections.controller = ws;
    }
    
    console.log(`✅ 客户端注册为: ${clientType}`);
    console.log(`📊 当前连接状态: 控制器 ${connections.controller ? '✅' : '❌'}, 显示器 ${connections.display ? '✅' : '❌'}`);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`从 ${clientType} 收到消息:`, data.type);
            
            // 控制器 -> 显示器 消息转发
            if (clientType === 'controller') {
                const success = forwardMessage('controller', 'display', data);
                
                // 如果转发失败，通知控制器
                if (!success) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: '显示端未连接',
                        timestamp: Date.now()
                    }));
                }
            }
            
            // 显示器 -> 控制器 消息转发（位置更新等）
            if (clientType === 'display' && data.type === 'positionUpdate') {
                forwardMessage('display', 'controller', data);
            }
            
        } catch (error) {
            console.error('消息解析错误:', error);
        }
    });
    
    ws.on('close', (code, reason) => {
        console.log(`🔌 ${clientType} 客户端断开连接: ${code} - ${reason}`);
        if (clientType === 'display') {
            connections.display = null;
        } else if (clientType === 'controller') {
            connections.controller = null;
        }
        
        // 通知另一端连接状态变化
        notifyConnectionStatus();
    });
    
    ws.on('error', (error) => {
        console.error(`❌ ${clientType} WebSocket错误:`, error);
    });
    
    // 发送连接确认消息
    ws.send(JSON.stringify({
        type: 'welcome',
        message: `已连接为 ${clientType}`,
        role: clientType,
        timestamp: Date.now(),
        mode: 'one-to-one'
    }));
    
    // 通知双方连接状态
    notifyConnectionStatus();
});

// 通知双方连接状态
function notifyConnectionStatus() {
    const status = {
        type: 'connectionStatus',
        controller: connections.controller ? 'connected' : 'disconnected',
        display: connections.display ? 'connected' : 'disconnected',
        timestamp: Date.now(),
        mode: 'one-to-one'
    };
    
    [connections.controller, connections.display].forEach(ws => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(status));
        }
    });
}

const PORT = process.env.PORT || 3000;
const localIP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 本地服务器运行在端口: ${PORT}`);
    console.log(`🏠 本地访问: http://localhost:${PORT}`);
    console.log(`📡 局域网访问: http://${localIP}:${PORT}`);
    console.log('🔒 连接模式: 一对一 (一个控制器 + 一个显示器)');
    console.log('💡 在手机/平板浏览器中访问上述局域网URL即可连接');
});