#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- BLE UUID 定义 (使用通用的 NUS 服务的 Read Characteristic UUID) ---
#define SERVICE_UUID              "6E400001-B5A3-F393-E0A9-E50E24DCCA9E" // Nordic UART Service
#define CHARACTERISTIC_UUID_TX    "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" // TX Characteristic (Notify)

// --- 配置参数 (Configurable Constants) ---
const int FSR_READ_INTERVAL_MS = 50;     // 压力值检测间隔（毫秒）
// ADC 读数范围为 0-4095
const int PRESSURE_LOWER_THRESHOLD = 800;  // 压力值有效下限 (对应 ADC 读数)
const int PRESSURE_UPPER_THRESHOLD = 3200; // 压力值有效上限 (对应 ADC 读数)
const int STABLE_DURATION_MS = 2000;       // 压力值持续稳定时间（毫秒）

// RGB LED 亮度映射配置
// 直接使用 ESP32 12 位 ADC 范围
const int MAP_MIN_INPUT = PRESSURE_LOWER_THRESHOLD;   // 压力值映射输入的起点 (ADC读数)
const int MAP_MAX_INPUT = PRESSURE_UPPER_THRESHOLD;   // 压力值映射输入的终点 (ADC读数)
const int LED_MAX_BRIGHTNESS = 255;         // LED最大亮度 (8位 PWM 输出)

// --- 硬件引脚定义 (已根据您的要求修正) ---
const int fsrPin = 0;    // FSR 模拟输入引脚 (GPIO0, ADC1_CH0)
const int redPin = 5;    // 红色 LED (GPIO5) <--- 修正
const int greenPin = 6;  // 绿色 LED (GPIO6) <--- 修正
const int bluePin = 7;   // 蓝色 LED (GPIO7) <--- 修正

// ESP32 PWM 通道配置
const int ledChannel_R = 0;
const int ledChannel_G = 1;
const int ledChannel_B = 2;
const int ledFreq = 5000;  // PWM 频率
const int ledResolution = 8; // 8位分辨率 (0-255)

// --- 状态变量 (State Variables) ---
int currentPressureValue = 0;
unsigned long lastReadTime = 0;
unsigned long pressureStartTime = 0; // 压力稳定开始计时时间

// 0: 初始/待机 (红灯)
// 1: 压力检测中/计时 (绿灯)
// 2: 数据发送成功 (蓝灯)
int systemState = 0;

// --- BLE 对象 ---
BLECharacteristic *pCharacteristicTX = nullptr;
bool deviceConnected = false;

// --- BLE 服务器回调函数 ---
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("[BLE] Host connected.");
    };

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("[BLE] Host disconnected. Restarting advertising.");
        BLEDevice::startAdvertising(); // 重新开始广播
    }
};

// --- 辅助函数：设置LED颜色与亮度 ---
void setLedColor(int r_val, int g_val, int b_val) {
  // 使用 PWM 设置亮度
  ledcWrite(ledChannel_R, r_val);
  ledcWrite(ledChannel_G, g_val);
  ledcWrite(ledChannel_B, b_val);
}

// --- 辅助函数：配置 PWM (Setup) ---
void setupLedPwm() {
  // 配置 PWM 通道
  ledcSetup(ledChannel_R, ledFreq, ledResolution);
  ledcSetup(ledChannel_G, ledFreq, ledResolution);
  ledcSetup(ledChannel_B, ledFreq, ledResolution);

  // 绑定引脚
  ledcAttachPin(redPin, ledChannel_R);
  ledcAttachPin(greenPin, ledChannel_G);
  ledcAttachPin(bluePin, ledChannel_B);
  
  // 初始状态：红灯
  setLedColor(LED_MAX_BRIGHTNESS, 0, 0); 
}

// --- 辅助函数：将压力值映射到亮度 (已适配 ESP32 12位 ADC) ---
int mapPressureToBrightness(int pressure) {
    if (pressure < MAP_MIN_INPUT) return 0;
    if (pressure > MAP_MAX_INPUT) return LED_MAX_BRIGHTNESS;

    // 将压力值（800-3200）映射到亮度（0-255）
    return map(pressure, MAP_MIN_INPUT, MAP_MAX_INPUT, 0, LED_MAX_BRIGHTNESS);
}


// --- 辅助函数：无线发送压力数据 (蓝牙 Notify) ---
void sendPressureData(int pressure) {
    if (deviceConnected) {
        // 将整数转换为字符串以便通过 BLE 发送
        String dataToSend = String(pressure); 

        // BLE Notify/Indicatión 发送
        pCharacteristicTX->setValue((uint8_t*)dataToSend.c_str(), dataToSend.length());
        pCharacteristicTX->notify();
        
        Serial.print("[BLE] Sent ADC Value: ");
        Serial.println(pressure);
    } else {
        Serial.println("[BLE] Not connected. Data not sent.");
    }
}


void setup() {
  Serial.begin(115200);
  Serial.println("ESP32-C3 FSR Slave Initializing...");
  
  // 配置 LED PWM
  setupLedPwm();

  // 配置模拟输入引脚
  pinMode(fsrPin, INPUT);
  
  // --- BLE 初始化 ---
    BLEDevice::init("FSR_Sensor_C3");
    BLEServer *pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    BLEService *pService = pServer->createService(SERVICE_UUID);
    pCharacteristicTX = pService->createCharacteristic(
                                                 CHARACTERISTIC_UUID_TX,
                                                 BLECharacteristic::PROPERTY_NOTIFY
                                                 );
    pCharacteristicTX->addDescriptor(new BLE2902()); // 添加 Notify 描述符

    pService->start();

    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    BLEDevice::startAdvertising();
    Serial.println("[BLE] Advertising started.");
}

void loop() {
  
  // --- 压力读取与计时 ---
  if (millis() - lastReadTime >= FSR_READ_INTERVAL_MS) {
    
    // 读取 FSR 原始 ADC 值 (0-4095)
    currentPressureValue = analogRead(fsrPin);
    lastReadTime = millis();
    
    Serial.print("Pressure (ADC): ");
    Serial.print(currentPressureValue);
    Serial.print(" | State: ");
    Serial.println(systemState);

    // --- 状态机逻辑 ---
    switch (systemState) {
      case 0: // 初始/待机状态 (红灯)
        setLedColor(LED_MAX_BRIGHTNESS, 0, 0); // 保持红灯

        // 检查是否进入压力检测范围
        if (currentPressureValue >= PRESSURE_LOWER_THRESHOLD && currentPressureValue <= PRESSURE_UPPER_THRESHOLD) {
           systemState = 1; // 切换到计时状态
           pressureStartTime = millis();
           setLedColor(0, mapPressureToBrightness(currentPressureValue), 0); // 立即亮绿灯
        }
        break;

      case 1: // 压力检测中/计时状态 (绿灯)
        
        // 实时调整绿灯亮度
        int brightness = mapPressureToBrightness(currentPressureValue);
        setLedColor(0, brightness, 0); 
        
        if (currentPressureValue >= PRESSURE_LOWER_THRESHOLD && currentPressureValue <= PRESSURE_UPPER_THRESHOLD) {
          // 持续稳定在区间内
          if (millis() - pressureStartTime >= STABLE_DURATION_MS) {
            
            // 达到稳定时间，发送数据并切换到成功状态
            sendPressureData(currentPressureValue);
            systemState = 2; 
            
          }
        } else {
          // 压力值跳出区间，计时清零，回到待机状态
          pressureStartTime = 0;
          systemState = 0;
        }
        break;

      case 2: // 数据发送成功状态 (蓝灯)
        setLedColor(0, 0, LED_MAX_BRIGHTNESS); // 保持蓝灯
        
        // 成功状态下，等待 3 秒后自动复位到状态 0
        if (millis() - pressureStartTime > STABLE_DURATION_MS + 3000) {
            systemState = 0;
        }
        break;
    }
  }
  // 如果设备断开，且不在广播状态，则重新开始广播（避免长时等待）
    if (!deviceConnected && !BLEDevice::getAdvertising()->isAdvertising()) {
        BLEDevice::startAdvertising();
    }
}