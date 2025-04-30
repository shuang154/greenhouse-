// server.js - 智能温室云服务中转
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// 创建Express应用
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 设备注册表
const devices = {};
// 用户会话表
const sessions = {};

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// API路由
app.get('/api/devices', (req, res) => {
    const deviceList = Object.keys(devices).map(id => ({
        id,
        name: devices[id].name || "未命名设备",
        type: devices[id].type || "未知设备",
        online: devices[id].online || false,
        lastSeen: devices[id].lastSeen || new Date()
    }));
    res.json(deviceList);
});

// 获取特定设备的最新数据
app.get('/api/devices/:deviceId/data', (req, res) => {
    const deviceId = req.params.deviceId;
    if (!devices[deviceId]) {
        return res.status(404).json({ error: '设备不存在' });
    }
    
    res.json(devices[deviceId].data || {});
});

// 为单页应用提供HTML页面
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket事件处理
io.on('connection', (socket) => {
    log(`新连接: ${socket.id}`);
    
    // 设备注册
    socket.on('register_device', (data) => {
        const deviceId = data.device_id;
        log(`设备注册: ${deviceId}, ${data.device_name}`);
        
        // 记录设备信息
        devices[deviceId] = {
            socketId: socket.id,
            name: data.device_name || "未命名设备",
            type: data.device_type || "未知设备",
            online: true,
            lastSeen: new Date(),
            data: {}
        };
        
        // 绑定设备ID到socket
        socket.deviceId = deviceId;
        
        // 发送确认注册成功
        socket.emit('register_response', { 
            success: true, 
            message: '设备注册成功' 
        });
    });
    
    // 设备数据上报
    socket.on('device_data', (data) => {
        const deviceId = data.device_id;
        if (!deviceId || !devices[deviceId]) {
            log(`收到未注册设备的数据: ${deviceId || 'unknown'}`);
            return;
        }
        
        // 更新设备数据
        devices[deviceId].data = data;
        devices[deviceId].lastSeen = new Date();
        
        log(`设备 ${deviceId} 数据更新`);
        
        // 将数据转发给关注此设备的用户
        Object.keys(sessions).forEach(sessionId => {
            const session = sessions[sessionId];
            if (session.watchingDevice === deviceId) {
                io.to(session.socketId).emit('device_data_update', data);
            }
        });
    });
    
    // 用户登录
    socket.on('user_login', (data) => {
        // 简化版登录，不涉及密码验证
        const sessionId = socket.id;
        sessions[sessionId] = {
            socketId: sessionId,
            userId: data.user_id || 'anonymous',
            watchingDevice: null
        };
        socket.sessionId = sessionId;
        
        log(`用户登录: ${data.user_id || 'anonymous'}`);
        socket.emit('login_response', { success: true });
    });
    
    // 用户查看设备
    socket.on('watch_device', (data) => {
        const deviceId = data.device_id;
        const sessionId = socket.sessionId;
        
        if (!sessionId || !sessions[sessionId]) {
            socket.emit('watch_response', { success: false, error: '用户未登录' });
            return;
        }
        
        if (!deviceId || !devices[deviceId]) {
            socket.emit('watch_response', { success: false, error: '设备不存在' });
            return;
        }
        
        // 记录用户正在查看的设备
        sessions[sessionId].watchingDevice = deviceId;
        log(`用户 ${sessions[sessionId].userId} 开始查看设备 ${deviceId}`);
        
        // 发送设备当前数据
        if (devices[deviceId].data) {
            socket.emit('device_data_update', devices[deviceId].data);
        }
        socket.emit('watch_response', { success: true });
    });
    
    // 用户发送控制命令
    socket.on('send_command', (data) => {
        const deviceId = data.device_id;
        const sessionId = socket.sessionId;
        
        if (!sessionId || !sessions[sessionId]) {
            socket.emit('command_response', { success: false, error: '未登录' });
            return;
        }
        
        if (!deviceId || !devices[deviceId]) {
            socket.emit('command_response', { success: false, error: '设备不存在' });
            return;
        }
        
        if (!devices[deviceId].online) {
            socket.emit('command_response', { success: false, error: '设备离线' });
            return;
        }
        
        log(`用户 ${sessions[sessionId].userId} 向设备 ${deviceId} 发送命令: ${data.command}`);
        
        // 转发命令到设备
        const deviceSocketId = devices[deviceId].socketId;
        io.to(deviceSocketId).emit('control_command', {
            command: data.command,
            device: data.device,
            action: data.action,
            value: data.value,
            command_id: data.command_id || Date.now()
        });
        
        socket.emit('command_response', { success: true });
    });
    
    // 设备返回命令执行结果
    socket.on('command_result', (data) => {
        const deviceId = socket.deviceId;
        if (!deviceId || !devices[deviceId]) return;
        
        // 找到发送命令的用户
        Object.keys(sessions).forEach(sessionId => {
            const session = sessions[sessionId];
            if (session.watchingDevice === deviceId) {
                io.to(session.socketId).emit('command_result', data);
            }
        });
    });
    
    // 断开连接处理
    socket.on('disconnect', () => {
        // 处理设备断开
        if (socket.deviceId && devices[socket.deviceId]) {
            devices[socket.deviceId].online = false;
            log(`设备断开: ${socket.deviceId}`);
            
            // 通知查看该设备的用户
            Object.keys(sessions).forEach(sessionId => {
                const session = sessions[sessionId];
                if (session.watchingDevice === socket.deviceId) {
                    io.to(session.socketId).emit('device_status_update', {
                        device_id: socket.deviceId,
                        online: false
                    });
                }
            });
        }
        
        // 处理用户断开
        if (socket.sessionId && sessions[socket.sessionId]) {
            log(`用户断开: ${sessions[socket.sessionId].userId}`);
            delete sessions[socket.sessionId];
        }
    });
});

// 启动服务器 - 修改这里，绑定到所有网络接口
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    log(`服务器运行在端口 ${PORT}, 绑定到所有网络接口`);
});

// 定期清理离线设备数据(超过1天未活动的设备)
setInterval(() => {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    
    Object.keys(devices).forEach(deviceId => {
        const device = devices[deviceId];
        if (!device.online && device.lastSeen < oneDayAgo) {
            log(`清理长时间离线设备: ${deviceId}`);
            delete devices[deviceId];
        }
    });
}, 3600000); // 每小时检查一次
