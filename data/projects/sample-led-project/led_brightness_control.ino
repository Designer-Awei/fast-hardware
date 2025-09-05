/*
 * LED亮度控制项目
 * 项目描述：使用PWM控制LED的亮度，实现呼吸灯效果
 * 
 * 硬件连接：
 * - Arduino D9 引脚 -> 220Ω电阻 -> LED正极
 * - LED负极 -> Arduino GND
 * 
 * 功能说明：
 * - 使用analogWrite()函数输出PWM信号
 * - 通过改变PWM占空比控制LED亮度
 * - 实现从暗到亮再到暗的循环效果
 * 
 * 作者：Fast Hardware LLM生成
 * 创建时间：2024-01-01
 * 版本：1.0.0
 */

// 定义引脚
const int LED_PIN = 9;          // LED连接到数字引脚9（支持PWM）

// 定义变量
int brightness = 0;             // LED当前亮度值 (0-255)
int fadeAmount = 5;             // 每次亮度变化的量
const int FADE_DELAY = 30;      // 渐变延迟时间（毫秒）

/**
 * 初始化函数
 * 在程序开始时执行一次
 */
void setup() {
  // 初始化串口通信，波特率9600
  Serial.begin(9600);
  
  // 打印项目信息
  Serial.println("=====================================");
  Serial.println("    LED亮度控制项目启动");
  Serial.println("=====================================");
  Serial.println("功能：PWM控制LED亮度实现呼吸灯效果");
  Serial.println("连接：D9 -> 220Ω -> LED+ | LED- -> GND");
  Serial.println("=====================================");
  
  // 设置LED引脚为输出模式
  pinMode(LED_PIN, OUTPUT);
  
  // 初始状态：LED关闭
  analogWrite(LED_PIN, 0);
  Serial.println("系统初始化完成，开始呼吸灯效果...");
}

/**
 * 主循环函数
 * 持续执行，实现呼吸灯效果
 */
void loop() {
  // 设置LED亮度（PWM输出）
  analogWrite(LED_PIN, brightness);
  
  // 输出当前亮度值到串口（可选，用于调试）
  if (brightness % 25 == 0) {  // 每25个亮度值输出一次，减少串口信息量
    Serial.print("当前LED亮度: ");
    Serial.print(brightness);
    Serial.print(" / 255 (");
    Serial.print((brightness * 100) / 255);
    Serial.println("%)");
  }
  
  // 计算下一次的亮度值
  brightness = brightness + fadeAmount;
  
  // 检查亮度边界并反转渐变方向
  if (brightness <= 0) {
    brightness = 0;
    fadeAmount = -fadeAmount;  // 改为增亮
    Serial.println("-> 开始增亮");
  } 
  else if (brightness >= 255) {
    brightness = 255;
    fadeAmount = -fadeAmount;  // 改为减暗
    Serial.println("-> 开始减暗");
  }
  
  // 延迟一段时间再进行下一次亮度调整
  delay(FADE_DELAY);
}

/**
 * 自定义函数：设置LED亮度
 * @param level 亮度等级 (0-255)
 */
void setLEDBrightness(int level) {
  // 确保亮度值在有效范围内
  level = constrain(level, 0, 255);
  
  // 设置LED亮度
  analogWrite(LED_PIN, level);
  
  // 串口输出
  Serial.print("LED亮度设置为: ");
  Serial.println(level);
}

/**
 * 自定义函数：LED闪烁
 * @param times 闪烁次数
 * @param delayTime 闪烁间隔（毫秒）
 */
void blinkLED(int times, int delayTime) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);   // 点亮LED
    delay(delayTime);
    digitalWrite(LED_PIN, LOW);    // 熄灭LED
    delay(delayTime);
  }
}
