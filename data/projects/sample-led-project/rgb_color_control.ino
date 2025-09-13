// RGB LED颜色控制项目
// 使用按键控制RGB LED循环切换颜色（红→绿→蓝→红...）
// 演示数字输入检测和PWM输出的基本概念

// 引脚定义
const int BUTTON_PIN = 2;    // 按键连接到D2
const int RED_PIN = 9;       // 红色LED连接到D9 (PWM)
const int GREEN_PIN = 10;    // 绿色LED连接到D10 (PWM)
const int BLUE_PIN = 11;     // 蓝色LED连接到D11 (PWM)

// 颜色状态定义
enum ColorState {
  RED,
  GREEN,
  BLUE,
  OFF
};

// 全局变量
ColorState currentColor = OFF;  // 当前颜色状态
bool lastButtonState = HIGH;    // 上次按键状态
unsigned long lastDebounceTime = 0;  // 去抖动计时器
const unsigned long debounceDelay = 50;  // 去抖动延迟时间（毫秒）

void setup() {
  // 初始化串口通信
  Serial.begin(9600);

  // 设置引脚模式
  pinMode(BUTTON_PIN, INPUT_PULLUP);  // 按键输入，启用内部上拉电阻
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);

  // 初始化LED为关闭状态
  setColor(OFF);

  Serial.println("RGB LED颜色控制项目已启动");
  Serial.println("按下按键切换颜色: 关闭 → 红色 → 绿色 → 蓝色 → 关闭...");
}

void loop() {
  // 读取按键状态
  bool reading = digitalRead(BUTTON_PIN);

  // 检测按键状态变化（带去抖动）
  if (reading != lastButtonState) {
    lastDebounceTime = millis();  // 重置去抖动计时器
  }

  // 如果按键状态稳定超过去抖动延迟时间
  if ((millis() - lastDebounceTime) > debounceDelay) {
    // 如果按键被按下（从HIGH变为LOW）
    if (reading == LOW && lastButtonState == HIGH) {
      // 切换到下一个颜色
      switchColor();

      // 打印当前颜色状态
      printCurrentColor();

      delay(200);  // 简单的按键去抖动
    }
  }

  // 更新按键状态
  lastButtonState = reading;
}

// 切换到下一个颜色
void switchColor() {
  switch (currentColor) {
    case OFF:
      currentColor = RED;
      break;
    case RED:
      currentColor = GREEN;
      break;
    case GREEN:
      currentColor = BLUE;
      break;
    case BLUE:
      currentColor = OFF;
      break;
  }

  // 设置LED颜色
  setColor(currentColor);
}

// 设置LED颜色
void setColor(ColorState color) {
  switch (color) {
    case RED:
      analogWrite(RED_PIN, 255);    // 红色全亮
      analogWrite(GREEN_PIN, 0);    // 绿色关闭
      analogWrite(BLUE_PIN, 0);     // 蓝色关闭
      break;

    case GREEN:
      analogWrite(RED_PIN, 0);      // 红色关闭
      analogWrite(GREEN_PIN, 255);  // 绿色全亮
      analogWrite(BLUE_PIN, 0);     // 蓝色关闭
      break;

    case BLUE:
      analogWrite(RED_PIN, 0);      // 红色关闭
      analogWrite(GREEN_PIN, 0);    // 绿色关闭
      analogWrite(BLUE_PIN, 255);   // 蓝色全亮
      break;

    case OFF:
    default:
      analogWrite(RED_PIN, 0);      // 红色关闭
      analogWrite(GREEN_PIN, 0);    // 绿色关闭
      analogWrite(BLUE_PIN, 0);     // 蓝色关闭
      break;
  }
}

// 打印当前颜色状态
void printCurrentColor() {
  Serial.print("当前颜色: ");
  switch (currentColor) {
    case RED:
      Serial.println("红色");
      break;
    case GREEN:
      Serial.println("绿色");
      break;
    case BLUE:
      Serial.println("蓝色");
      break;
    case OFF:
      Serial.println("关闭");
      break;
  }
}

// 可选：添加颜色渐变效果
void fadeToColor(ColorState targetColor, int duration) {
  // 获取目标颜色的RGB值
  int targetRed = 0, targetGreen = 0, targetBlue = 0;

  switch (targetColor) {
    case RED:
      targetRed = 255;
      break;
    case GREEN:
      targetGreen = 255;
      break;
    case BLUE:
      targetBlue = 255;
      break;
  }

  // 获取当前颜色的RGB值
  int currentRed = getCurrentPWM(RED_PIN);
  int currentGreen = getCurrentPWM(GREEN_PIN);
  int currentBlue = getCurrentPWM(BLUE_PIN);

  // 计算每一步的变化量
  int steps = 50;
  int delayTime = duration / steps;

  for (int i = 0; i <= steps; i++) {
    int red = currentRed + (targetRed - currentRed) * i / steps;
    int green = currentGreen + (targetGreen - currentGreen) * i / steps;
    int blue = currentBlue + (targetBlue - currentBlue) * i / steps;

    analogWrite(RED_PIN, red);
    analogWrite(GREEN_PIN, green);
    analogWrite(BLUE_PIN, blue);

    delay(delayTime);
  }
}

// 获取当前PWM值（近似值）
int getCurrentPWM(int pin) {
  // 注意：Arduino没有直接读取PWM输出的方法
  // 这里返回一个近似值，实际应用中可能需要额外变量跟踪
  return 0; // 简化实现
}
