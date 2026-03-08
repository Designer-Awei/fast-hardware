#include <Arduino.h> 

// ************************************************
// --- ADC 关键设置：为 ESP32C3 增加 ADC 衰减 ---
// ************************************************
void setup_adc_attenuation() {
  // 设置 12 位分辨率 (0-4095)
  analogReadResolution(12); 
  // 设置 11dB 衰减，将 ADC 测量范围设置为 0V 到约 3.3V
  analogSetAttenuation(ADC_11db); 
}

// --- 配置参数 (Configurable Constants) ---
const int FSR_READ_INTERVAL_MS = 100;    
const int PRESSURE_THRESHOLD = 2000;     
const int STABLE_DURATION_MS = 2000;     

const int FAST_FLASH_MS = 125;           
const int SLOW_FLASH_MS = 500;           
const int POST_SEND_FLASH_COUNT = 2;     

// !!! LED 亮度最大值改为 8 位 (0-255) 以兼容 analogWrite !!!
const int LED_BRIGHTNESS_MAX = 255;     
const int BREATH_CYCLE_MS = 4000;        

// --- 硬件引脚定义 ---
const int fsrPin = 1;   
const int ledPin = 2;   

// --- 状态变量 (State Variables) ---
int systemState = 0; 
// ... (其他变量声明同版本 1)

int currentPressureValue = 0;
unsigned long lastReadTime = 0;
unsigned long pressureStartTime = 0; 
unsigned long lastFlashToggleTime = 0; 
bool isLedOn = false; 
unsigned long breathStartTime = 0; 
int flashCount = 0; 

// --- 函数前置声明 ---
void setLedBrightness(int brightness);
void updateSolidOrFlashingLed(int state, int flash_duration_ms);
void updateBreathingLed();
void sendBleData();


// --- 辅助函数：设置LED亮度 (使用 analogWrite) ---
void setLedBrightness(int brightness) {
  if (brightness < 0) brightness = 0;
  if (brightness > LED_BRIGHTNESS_MAX) brightness = LED_BRIGHTNESS_MAX;
  
  // 替换 ledcWrite 为 analogWrite (兼容模式)
  analogWrite(ledPin, brightness); 
}

// --- 辅助函数：实现常亮/常灭/闪烁的亮度设置 (analogWrite) ---
void updateSolidOrFlashingLed(int state, int flash_duration_ms) {
    // ... (逻辑同版本 1)
    if (state == 2) {
        setLedBrightness(LED_BRIGHTNESS_MAX); 
        return;
    }
    
    unsigned long currentTime = millis();
    if (currentTime - lastFlashToggleTime >= flash_duration_ms) {
        lastFlashToggleTime = currentTime;
        isLedOn = !isLedOn;

        if (isLedOn) {
            setLedBrightness(LED_BRIGHTNESS_MAX); 
        } else {
            setLedBrightness(0); 
            
            if (systemState == 3) {
                flashCount++;
                if (flashCount >= POST_SEND_FLASH_COUNT * 2) { 
                    Serial.println("[STATE 3->0] Send feedback done. Returning to Ready.");
                    systemState = 0;
                    flashCount = 0;
                    breathStartTime = millis(); 
                }
            }
        }
    }
}

// --- 辅助函数：实现呼吸灯效果 (analogWrite) ---
void updateBreathingLed() {
    unsigned long currentTime = millis();
    unsigned long elapsedTime = currentTime - breathStartTime;
    
    float phase = (float)(elapsedTime % BREATH_CYCLE_MS) / BREATH_CYCLE_MS;
    float sin_value = sin(phase * TWO_PI); 
    float brightness_ratio = (sin_value + 1.0) / 2.0; 
    
    // 映射到 0-255
    int brightness = (int)(brightness_ratio * LED_BRIGHTNESS_MAX);
    
    setLedBrightness(brightness);
}

// --- 辅助函数：模拟 BLE 发送过程 ---
void sendBleData() {
    Serial.println("[BLE] Attempting to send data via BLE...");
    delay(500); 
    Serial.println("[BLE] Data sent successfully (SIMULATED).");
}


void setup() {
  Serial.begin(115200);
  Serial.println("=========================================");
  Serial.println("ESP32-C3 FSR Test Initializing (AnalogWrite Mode)...");
  
  // *** 1. ADC 衰减设置 ***
  setup_adc_attenuation();
  pinMode(fsrPin, INPUT); 

  // *** 2. LED 引脚配置 ***
  // 只需设置为输出
  pinMode(ledPin, OUTPUT);

  Serial.print("Pressure Threshold (0-4095): ");
  Serial.println(PRESSURE_THRESHOLD);
  Serial.println("=========================================");

  systemState = 0;
  breathStartTime = millis(); 
}

void loop() {
  // --- 压力读取与状态机更新（定时任务） ---
  if (millis() - lastReadTime >= FSR_READ_INTERVAL_MS) {
    
    currentPressureValue = analogRead(fsrPin);
    lastReadTime = millis();
    
    // *** 实时读数反馈 ***
    Serial.print("[LOOP] Pressure: ");
    Serial.print(currentPressureValue);
    Serial.print(" | State: ");
    Serial.println(systemState);

    // --- 状态机逻辑 ---
    switch (systemState) {
      case 0: // 准备状态
        if (currentPressureValue > PRESSURE_THRESHOLD) {
          Serial.println("[STATE 0->1] Threshold reached! Starting timer.");
          systemState = 1; 
          pressureStartTime = millis(); 
          lastFlashToggleTime = millis(); 
          isLedOn = true; 
        }
        break;

      case 1: // 检测状态
        if (currentPressureValue > PRESSURE_THRESHOLD) {
          if (millis() - pressureStartTime >= STABLE_DURATION_MS) {
            Serial.println("[STATE 1->2] Stable duration reached! SUCCESS.");
            systemState = 2; // 稳定按压成功
          } 
        } else {
          Serial.println("[STATE 1->0] Pressure lost! Resetting to Ready.");
          systemState = 0; // 压力释放，回到准备状态
          breathStartTime = millis(); 
        }
        break;

      case 2: // 检测完成
        Serial.println("[STATE 2->3] Success. Starting simulated BLE send.");
        sendBleData(); // 模拟发送
        systemState = 3; 
        flashCount = 0;
        lastFlashToggleTime = millis(); 
        isLedOn = true; 
        break;

      case 3: // 发送信号
        break;
    }
  }
  
  // --- LED 指示灯更新 ---
  switch (systemState) {
    case 0:
      updateBreathingLed(); 
      break;
    case 1:
      updateSolidOrFlashingLed(1, FAST_FLASH_MS); 
      break;
    case 2:
      updateSolidOrFlashingLed(2, 0); 
      break;
    case 3:
      updateSolidOrFlashingLed(3, SLOW_FLASH_MS); 
      break;
  }
}