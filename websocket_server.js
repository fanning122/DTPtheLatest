const WebSocket = require('ws');
const http = require('http');

// 创建HTTP服务器 - 简化版本，只处理WebSocket
const server = http.createServer((req, res) => {
    console.log(`收到HTTP请求: ${req.url}`);
    
    // 简单的根路径响应
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
                <head><title>Teleprompter WebSocket Server</title></head>
                <body>
                    <h1>Teleprompter WebSocket Server is Running</h1>
                    <p>Server: ${process.env.HEROKU_APP_NAME || 'Local'}</p>
                    <p>Port: ${process.env.PORT || 3000}</p>
                    <p>Status: ✅ Connected clients: ${Object.values(connections).filter(Boolean).length}</p>
                </body>
            </html>
        `);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Teleprompter WebSocket Server');
    }
});

// 创建WebSocket服务器
const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info) => {
        console.log(`WebSocket连接尝试: ${info.req.url}`);
        return true;
    }
});

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
    console.log(`WebSocket连接建立: ${url}`);
    
    // 解析客户端类型
    let clientType = 'unknown';
    if (url.includes('type=display')) {
        clientType = 'display';

        // 添加一对一限制
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
        
        // 添加一对一限制
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
    
    console.log(`客户端注册为: ${clientType}`);
    console.log(`当前连接: 控制器 ${connections.controller ? '✅' : '❌'}, 显示器 ${connections.display ? '✅' : '❌'}`);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`从 ${clientType} 收到消息:`, data.type, data);
            
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
        console.log(`${clientType} 客户端断开连接: ${code} - ${reason}`);
        if (clientType === 'display') {
            connections.display = null;
        } else if (clientType === 'controller') {
            connections.controller = null;
        }
        
        // 通知另一端连接状态变化
        notifyConnectionStatus();
    });
    
    ws.on('error', (error) => {
        console.error(`${clientType} WebSocket错误:`, error);
    });
    
    // 发送连接确认消息
    ws.send(JSON.stringify({
        type: 'welcome',
        message: `已连接为 ${clientType}`,
        role: clientType,
        timestamp: Date.now()
    }));
    
    // 通知另一端新连接
    notifyConnectionStatus();
});

// 通知双方连接状态
function notifyConnectionStatus() {
    const status = {
        type: 'connectionStatus',
        controller: connections.controller ? 'connected' : 'disconnected',
        display: connections.display ? 'connected' : 'disconnected',
        timestamp: Date.now()
    };
    
    [connections.controller, connections.display].forEach(ws => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(status));
        }
    });
}

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 服务器运行在端口: ${PORT}`);
    console.log('📡 等待客户端连接...');
});