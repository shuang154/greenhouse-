/**
 * 智能温室远程监控系统 - 前端JavaScript
 */

// 全局变量
let socket;
let currentDevice = null;
let isConnected = false;
let temperatureChart = null;
let humidityChart = null;
let dataHistory = {
    timestamps: [],
    airTemperature: [],
    airHumidity: [],
    soilMoisture: [],
    lightIntensity: []
};

// 当文档加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    // 初始化WebSocket连接
    initWebSocket();
    
    // 初始化导航事件
    initNavigation();
    
    // 初始化控制面板事件
    initControlPanel();
});

/**
 * 初始化WebSocket连接
 */
function initWebSocket() {
    // 修改：显式指定服务器URL和配置
    const socketURL = window.location.origin;
    console.log('正在连接到Socket.IO服务器:', socketURL);
    
    socket = io(socketURL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
    });
    
    // 添加连接错误处理
    socket.on('connect_error', function(error) {
        console.error('Socket.IO连接错误:', error);
        isConnected = false;
        updateConnectionStatus(false, '连接错误: ' + error.message);
    });
    
    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`尝试重新连接 (${attemptNumber})`);
        updateConnectionStatus(false, `正在尝试重新连接 (${attemptNumber}/5)...`);
    });
    
    socket.on('reconnect_failed', () => {
        console.error('重新连接失败，已达到最大尝试次数');
        updateConnectionStatus(false, '重新连接失败，请刷新页面重试');
    });
    
    // 连接成功事件
    socket.on('connect', function() {
        console.log('已连接到服务器');
        isConnected = true;
        updateConnectionStatus(true);
        
        // 模拟用户登录（实际应用中应有真实的用户认证）
        socket.emit('user_login', { user_id: 'user_' + Date.now() });
    });
    
    // 登录响应
    socket.on('login_response', function(data) {
        if (data.success) {
            console.log('登录成功');
            loadDeviceList();
        } else {
            console.error('登录失败:', data.error);
            updateConnectionStatus(false, '登录失败: ' + data.error);
        }
    });
    
    // 设备数据更新
    socket.on('device_data_update', function(data) {
        console.log('收到设备数据更新:', data);
        updateDashboard(data);
    });
    
    // 控制命令结果
    socket.on('command_result', function(data) {
        console.log('收到命令执行结果:', data);
        if (data.success) {
            showAlert('success', '命令执行成功: ' + data.message);
        } else {
            showAlert('danger', '命令执行失败: ' + data.error);
        }
    });
    
    // 设备状态更新
    socket.on('device_status_update', function(data) {
        console.log('设备状态更新:', data);
        if (data.device_id === currentDevice && !data.online) {
            showAlert('warning', '设备已离线，部分功能可能不可用');
        }
        
        // 更新设备列表中的状态
        updateDeviceStatus(data.device_id, data.online);
    });
    
    // 查看设备响应
    socket.on('watch_response', function(data) {
        if (!data.success) {
            showAlert('danger', '查看设备失败: ' + data.error);
        }
    });
    
    // 命令响应
    socket.on('command_response', function(data) {
        if (!data.success) {
            showAlert('danger', '发送命令失败: ' + data.error);
        }
    });
    
    // 连接断开事件
    socket.on('disconnect', function() {
        console.log('与服务器的连接已断开');
        isConnected = false;
        updateConnectionStatus(false);
    });
}

/**
 * 更新连接状态显示
 */
function updateConnectionStatus(connected, message) {
    const statusElement = document.getElementById('connection-status');
    
    if (connected) {
        statusElement.innerHTML = '<i class="bi bi-check-circle"></i> 已连接到服务器';
        statusElement.classList.remove('alert-info', 'alert-danger');
        statusElement.classList.add('alert-success', 'connected');
    } else {
        statusElement.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${message || '与服务器的连接已断开，尝试重新连接...'}`;
        statusElement.classList.remove('alert-info', 'alert-success');
        statusElement.classList.add('alert-danger', 'disconnected');
    }
}

/**
 * 加载设备列表
 */
function loadDeviceList() {
    if (!isConnected) return;
    
    fetch('/api/devices')
        .then(response => response.json())
        .then(devices => {
            const deviceListElement = document.getElementById('device-list');
            
            if (devices.length === 0) {
                deviceListElement.innerHTML = `
                    <div class="col-12 text-center py-5">
                        <i class="bi bi-info-circle fs-1 text-muted"></i>
                        <p class="mt-3">暂无设备，请先添加或连接设备</p>
                    </div>
                `;
                return;
            }
            
            // 生成设备卡片
            let deviceCardsHtml = '';
            devices.forEach(device => {
                const statusBadge = device.online ? 
                    '<span class="badge bg-success">在线</span>' : 
                    '<span class="badge bg-danger">离线</span>';
                
                const cardClass = device.online ? 'card device-card h-100' : 'card device-card h-100 device-offline';
                
                deviceCardsHtml += `
                    <div class="col-md-6 col-lg-4 mb-4">
                        <div class="${cardClass}">
                            <div class="card-header bg-light">
                                <div class="d-flex justify-content-between align-items-center">
                                    <h5 class="mb-0">${device.name}</h5>
                                    ${statusBadge}
                                </div>
                            </div>
                            <div class="card-body">
                                <p><i class="bi bi-info-circle"></i> 设备类型: ${device.type || '智能温室'}</p>
                                <p><i class="bi bi-clock"></i> 最后在线: ${new Date(device.lastSeen).toLocaleString()}</p>
                            </div>
                            <div class="card-footer">
                                <button class="btn btn-primary btn-sm ${device.online ? '' : 'disabled'}" onclick="watchDevice('${device.id}')">
                                    <i class="bi bi-eye"></i> 查看设备
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            deviceListElement.innerHTML = deviceCardsHtml;
        })
        .catch(error => {
            console.error('获取设备列表失败:', error);
            document.getElementById('device-list').innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-exclamation-triangle fs-1 text-danger"></i>
                    <p class="mt-3">获取设备列表失败，请刷新页面重试</p>
                </div>
            `;
        });
}

/**
 * 查看设备详情
 */
function watchDevice(deviceId) {
    if (!isConnected) return;
    
    currentDevice = deviceId;
    
    // 告诉服务器我们正在查看这个设备
    socket.emit('watch_device', { device_id: deviceId });
    
    // 显示设备监控界面
    document.getElementById('devices-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    document.getElementById('control-section').style.display = 'block';
    
    // 更新导航状态
    document.getElementById('nav-devices').classList.remove('active');
    document.getElementById('nav-dashboard').classList.add('active');
    
    // 初始化图表
    initCharts();
    
    // 获取设备名称
    fetch(`/api/devices/${deviceId}/data`)
        .then(response => response.json())
        .then(data => {
            if (data && data.device_name) {
                document.getElementById('device-name').textContent = data.device_name;
            }
        })
        .catch(error => {
            console.error('获取设备详情失败:', error);
        });
}

/**
 * 更新设备状态
 */
function updateDeviceStatus(deviceId, online) {
    const deviceCards = document.querySelectorAll('.device-card');
    deviceCards.forEach(card => {
        const watchButton = card.querySelector('button');
        if (watchButton && watchButton.getAttribute('onclick').includes(deviceId)) {
            // 更新卡片状态
            if (online) {
                card.classList.remove('device-offline');
                watchButton.classList.remove('disabled');
                card.querySelector('.badge').className = 'badge bg-success';
                card.querySelector('.badge').textContent = '在线';
            } else {
                card.classList.add('device-offline');
                watchButton.classList.add('disabled');
                card.querySelector('.badge').className = 'badge bg-danger';
                card.querySelector('.badge').textContent = '离线';
            }
        }
    });
}

/**
 * 初始化图表
 */
function initCharts() {
    // 清除旧图表，避免内存泄漏
    if (temperatureChart) {
        temperatureChart.destroy();
    }
    if (humidityChart) {
        humidityChart.destroy();
    }
    
    // 初始化温度图表
    const tempCtx = document.getElementById('temperature-chart').getContext('2d');
    temperatureChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '空气温度 (°C)',
                data: [],
                borderColor: 'rgba(13, 110, 253, 1)',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: '温度 (°C)'
                    }
                },
                x: {
                    title: {
                        display: false
                    }
                }
            }
        }
    });
    
    // 初始化湿度图表
    const humidityCtx = document.getElementById('humidity-chart').getContext('2d');
    humidityChart = new Chart(humidityCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '空气湿度 (%)',
                data: [],
                borderColor: 'rgba(13, 202, 240, 1)',
                backgroundColor: 'rgba(13, 202, 240, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    max: 100,
                    title: {
                        display: true,
                        text: '湿度 (%)'
                    }
                },
                x: {
                    title: {
                        display: false
                    }
                }
            }
        }
    });
}

/**
 * 更新仪表盘数据
 */
function updateDashboard(data) {
    if (!data || !data.sensors) return;
    
    const sensors = data.sensors;
    
    // 更新传感器值
    document.getElementById('air-temperature').textContent = sensors.air_temperature ? sensors.air_temperature.toFixed(1) : '--';
    document.getElementById('air-humidity').textContent = sensors.air_humidity ? sensors.air_humidity.toFixed(1) : '--';
    document.getElementById('soil-moisture').textContent = sensors.soil_moisture ? sensors.soil_moisture.toFixed(1) : '--';
    document.getElementById('light-intensity').textContent = sensors.light_intensity ? Math.round(sensors.light_intensity) : '--';
    
    // 更新控制面板状态
    if (data.controllers) {
        updateControlPanelState(data.controllers);
    }
    
    // 添加数据到历史记录
    const now = new Date();
    const timeLabel = now.getHours().toString().padStart(2, '0') + ':' + 
                      now.getMinutes().toString().padStart(2, '0');
    
    // 限制数据点数量
    const MAX_DATA_POINTS = 10;
    
    // 更新温度图表
    if (temperatureChart) {
        if (temperatureChart.data.labels.length >= MAX_DATA_POINTS) {
            temperatureChart.data.labels.shift();
            temperatureChart.data.datasets[0].data.shift();
        }
        temperatureChart.data.labels.push(timeLabel);
        temperatureChart.data.datasets[0].data.push(sensors.air_temperature);
        temperatureChart.update();
    }
    
    // 更新湿度图表
    if (humidityChart) {
        if (humidityChart.data.labels.length >= MAX_DATA_POINTS) {
            humidityChart.data.labels.shift();
            humidityChart.data.datasets[0].data.shift();
        }
        humidityChart.data.labels.push(timeLabel);
        humidityChart.data.datasets[0].data.push(sensors.air_humidity);
        humidityChart.update();
    }
}

/**
 * 更新控制面板状态
 */
function updateControlPanelState(controllers) {
    // 自动模式开关
    const autoModeSwitch = document.getElementById('auto-mode-switch');
    autoModeSwitch.checked = controllers.auto_mode;
    document.getElementById('auto-mode-label').textContent = controllers.auto_mode ? '自动模式' : '手动模式';
    
    // 风扇开关
    const fanSwitch = document.getElementById('fan-switch');
    fanSwitch.checked = controllers.fan_status;
    document.getElementById('fan-label').textContent = controllers.fan_status ? '风扇已开启' : '风扇已关闭';
    document.getElementById('fan-status').textContent = controllers.fan_status ? '已开启' : '已关闭';
    document.getElementById('fan-status').className = controllers.fan_status ? 
        'badge rounded-pill text-bg-success' : 'badge rounded-pill text-bg-danger';
    
    // 舵机控制
    const servoRange = document.getElementById('servo-range');
    servoRange.value = controllers.servo_angle || 0;
    document.getElementById('servo-value').textContent = controllers.servo_angle || 0;
    
    // 启用/禁用控制（基于自动模式）
    toggleControlsEnabled(!controllers.auto_mode);
}

/**
 * 启用/禁用控制组件
 */
function toggleControlsEnabled(enabled) {
    const controls = [
        document.getElementById('fan-switch'),
        document.getElementById('servo-range'),
        document.getElementById('servo-apply')
    ];
    
    controls.forEach(control => {
        if (control) {
            control.disabled = !enabled;
        }
    });
}

/**
 * 初始化导航事件
 */
function initNavigation() {
    // 设备列表按钮
    document.getElementById('nav-devices').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('devices-section').style.display = 'block';
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('control-section').style.display = 'none';
        
        // 更新导航状态
        document.getElementById('nav-dashboard').classList.remove('active');
        document.getElementById('nav-control').classList.remove('active');
        this.classList.add('active');
        
        // 重新加载设备列表
        loadDeviceList();
    });
    
    // 监控面板按钮
    document.getElementById('nav-dashboard').addEventListener('click', function(e) {
        e.preventDefault();
        if (!currentDevice) return;
        
        document.getElementById('devices-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        document.getElementById('control-section').style.display = 'none';
        
        // 更新导航状态
        document.getElementById('nav-devices').classList.remove('active');
        document.getElementById('nav-control').classList.remove('active');
        this.classList.add('active');
    });
    
    // 控制面板按钮
    document.getElementById('nav-control').addEventListener('click', function(e) {
        e.preventDefault();
        if (!currentDevice) return;
        
        document.getElementById('devices-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('control-section').style.display = 'block';
        
        // 更新导航状态
        document.getElementById('nav-devices').classList.remove('active');
        document.getElementById('nav-dashboard').classList.remove('active');
        this.classList.add('active');
    });
}

/**
 * 初始化控制面板事件
 */
function initControlPanel() {
    // 自动模式开关
    document.getElementById('auto-mode-switch').addEventListener('change', function() {
        if (!isConnected || !currentDevice) return;
        
        const autoMode = this.checked;
        sendCommand('set_auto_mode', null, null, autoMode);
    });
    
    // 风扇开关
    document.getElementById('fan-switch').addEventListener('change', function() {
        if (!isConnected || !currentDevice) return;
        
        const fanStatus = this.checked;
        sendCommand('control_device', 'fan', fanStatus ? 'on' : 'off');
    });
    
    // 舵机角度显示
    document.getElementById('servo-range').addEventListener('input', function() {
        document.getElementById('servo-value').textContent = this.value;
    });
    
    // 舵机角度应用按钮
    document.getElementById('servo-apply').addEventListener('click', function() {
        if (!isConnected || !currentDevice) return;
        
        const angle = document.getElementById('servo-range').value;
        sendCommand('control_device', 'servo', 'set', angle);
    });
}

/**
 * 发送控制命令
 */
function sendCommand(command, device, action, value) {
    if (!isConnected || !currentDevice) return;
    
    socket.emit('send_command', {
        device_id: currentDevice,
        command: command,
        device: device,
        action: action,
        value: value,
        command_id: Date.now()
    });
}

/**
 * 显示提示消息
 */
function showAlert(type, message) {
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} alert-dismissible fade show`;
    alertElement.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // 添加到页面
    document.querySelector('.container').insertBefore(alertElement, document.querySelector('.container').firstChild);
    
    // 自动关闭
    setTimeout(() => {
        const bsAlert = new bootstrap.Alert(alertElement);
        bsAlert.close();
    }, 5000);
}