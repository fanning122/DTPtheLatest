// start_server.js - 智能启动脚本
const fs = require('fs');
const path = require('path');

// 检测运行环境
function getEnvironment() {
    // Heroku 环境变量
    if (process.env.NODE_ENV === 'production' || process.env.HEROKU_APP_NAME) {
        return 'heroku';
    }
    
    // 检测是否在本地开发环境
    if (process.argv.includes('--local') || process.argv.includes('-l')) {
        return 'local';
    }
    
    // 默认根据是否存在 Heroku 相关配置判断
    if (process.env.PORT && !process.argv.includes('--local')) {
        return 'heroku';
    }
    
    return 'local';
}

// 主启动函数
function startServer() {
    const environment = getEnvironment();
    
    console.log('🎬 Teleprompter Server Starting...');
    console.log('📊 Environment Detection:');
    console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`   - HEROKU_APP_NAME: ${process.env.HEROKU_APP_NAME || 'not set'}`);
    console.log(`   - PORT: ${process.env.PORT || '3000 (default)'}`);
    console.log(`   - Detected: ${environment.toUpperCase()}`);
    
    if (environment === 'heroku') {
        console.log('🚀 Starting Heroku Production Server...');
        console.log('🔒 Mode: One-to-One Connection');
        
        // 启动 Heroku 服务器
        if (fs.existsSync(path.join(__dirname, 'websocket_server.js'))) {
            require('./websocket_server.js');
        } else {
            console.error('❌ Error: websocket_server.js not found');
            process.exit(1);
        }
    } else {
        console.log('🏠 Starting Local LAN Server...');
        console.log('🔒 Mode: One-to-One Connection');
        console.log('💡 Tip: Use --local to force local mode');
        
        // 启动本地服务器
        if (fs.existsSync(path.join(__dirname, 'local_server.js'))) {
            require('./local_server.js');
        } else {
            console.error('❌ Error: local_server.js not found');
            process.exit(1);
        }
    }
}

// 处理命令行参数
function handleCommandLine() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🎬 Teleprompter Server Usage:

  node start_server.js           # Auto-detect environment
  node start_server.js --local   # Force local mode
  node start_server.js --help    # Show this help

Environment Detection:
  - Heroku: NODE_ENV=production or HEROKU_APP_NAME exists
  - Local:  Other cases or --local flag

Features:
  ✅ One-to-one connection mode
  ✅ WebSocket real-time communication
  ✅ Local network access
  ✅ Heroku deployment ready
        `);
        process.exit(0);
    }
}

// 启动应用
handleCommandLine();
startServer();