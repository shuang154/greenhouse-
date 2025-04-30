/**
 * 智能温室设备模拟器
 * 用于测试温室监控系统服务器连接
 */

const io = require('socket.io-client');

// 服务器连接配置
const SERVER_URL = 'http://47.93.80.194:3000'; // 修改为您的服务器地址
const DEVICE_ID = 'simulator-device-1';
const DEVICE_NAME = '智能温室1号';

console.log(`正在连接到服务器 ${SERVER_URL}...`);
const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'], 
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    timeout: 10000
});

// 连接事件处理
socket.on('connect', () => {
    console.log('已连接到服务器，socket ID:', socket.id);
    
    // 注册设备
    registerDevice();
});

socket.on('connect_error', (error) => {
    console.error('连接错误:', error.message);
});

socket.on('disconnect', () => {
    console.log('与服务器的连接已断开');
});

socket.on('register_response', (response) => {
    console.log('设备注册响应:', response);
    
    if (response.success) {
        console.log('设备注册成功，开始发送模拟数据...');
        // 设备注册成功后开始发送数据
        startSendingData();
    } else {
        console.error('设备注册失败:', response.error);
    }
});

socket.on('control_command', (command) => {
    console.log('收到控制命令:', command);
    
    // 模拟命令处理
    let result = {
        command_id: command.command_id,
        success: true,
        message: `成功执行命令: ${command.command}`
    };
    
    // 根据命令类型进行特定处理
    switch (command.command) {
        case 'set_auto_mode':
            console.log(`设置自动模式: ${command.value ? '开启' : '关闭'}`);
            deviceState.controllers.auto_mode = command.value;
            break;
            
        case 'control_device':
            if (command.device === 'fan') {
                console.log(`控制风扇: ${command.action}`);
                deviceState.controllers.fan_status = (command.action === 'on');
            } else if (command.device === 'servo') {
                console.log(`设置舵机角度: ${command.value}°`);
                deviceState.controllers.servo_angle = parseInt(command.value, 10);
            }
            break;
            
        default:
            console.log(`未知命令: ${command.command}`);
            result.success = false;
            result.error = '未知命令';
    }
    
    // 发送命令处理结果
    socket.emit('command_result', result);
    
    // 更新设备状态后立即发送一次数据更新
    sendDeviceData();
});

// 模拟设备状态
let deviceState = {
    sensors: {
        air_temperature: 25.0,
        air_humidity: 60.0,
        soil_moisture: 45.0,
        light_intensity: 5000
    },
    controllers: {
        auto_mode: true,
        fan_status: false,
        servo_angle: 0
    }
};

/**
 * 注册设备
 */
function registerDevice() {
    socket.emit('register_device', {
        device_id: DEVICE_ID,
        device_name: DEVICE_NAME,
        device_type: '智能温室'
    });
}

/**
 * 发送设备数据
 */
function sendDeviceData() {
    // 构建数据包
    const data = {
        device_id: DEVICE_ID,
        device_name: DEVICE_NAME,
        sensors: { ...deviceState.sensors },
        controllers: { ...deviceState.controllers },
        timestamp: Date.now()
    };
    
    // 发送到服务器
    socket.emit('device_data', data);
    console.log('已发送设备数据:', new Date().toLocaleTimeString());
}

/**
 * 开始定期发送数据
 */
function startSendingData() {
    // 立即发送一次
    sendDeviceData();
    
    // 设置定时发送
    setInterval(() => {
        // 更新传感器数据（模拟真实变化）
        updateSensorData();
        
        // 发送数据
        sendDeviceData();
    }, 5000); // 每5秒发送一次
}

/**
 * 更新传感器数据（模拟真实变化）
 */
function updateSensorData() {
    // 空气温度变化（23-28度之间波动）
    deviceState.sensors.air_temperature = clamp(
        deviceState.sensors.air_temperature + (Math.random() * 0.6 - 0.3),
        23, 28
    );
    
    // 空气湿度变化（50-75%之间波动）
    deviceState.sensors.air_humidity = clamp(
        deviceState.sensors.air_humidity + (Math.random() * 3 - 1.5),
        50, 75
    );
    
    // 土壤湿度变化（40-60%之间缓慢波动）
    deviceState.sensors.soil_moisture = clamp(
        deviceState.sensors.soil_moisture + (Math.random() * 1.4 - 0.7),
        40, 60
    );
    
    // 光照强度变化（4000-7000之间波动）
    deviceState.sensors.light_intensity = clamp(
        deviceState.sensors.light_intensity + (Math.random() * 300 - 150),
        4000, 7000
    );
}

/**
 * 限制数值在指定范围内
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// 处理进程中断，优雅退出
process.on('SIGINT', () => {
    console.log('正在断开连接...');
    socket.disconnect();
    process.exit();
});

console.log('设备模拟器已启动，按 Ctrl+C 退出');
