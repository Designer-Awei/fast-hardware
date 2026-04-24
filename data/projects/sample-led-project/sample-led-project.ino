/*
 * 项目：sample-led-project
 * 功能：按下按钮切换 RGB LED 的红色通道状态
 * 连线说明：
 *   - 按键 (button-1) S 信号 -> D2
 *   - RGB 红色 (rgb-led-1 R) -> D11
 *   - RGB 绿色 (G) ->  D10
 *   - RGB 蓝色 (B) ->  D9
 */

// 引脚定义（基于画布连线）
const int BUTTON_PIN = 2;        // 按键信号引脚 (D2)
const int LED_RED_PIN = 11;      // RGB 红色引脚 (D11)
const int LED_GREEN_PIN = 10;    // RGB 绿色引脚 (D10)
const int LED_BLUE_PIN = 9;      // RGB 蓝色引脚 (D9)

// 状态变量
bool ledState = false;
bool lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
unsigned long debounceDelay = 50; // 消抖时间 50ms

void setup() {
  Serial.begin(9600);

  // 配置按键为输入，启用内部上拉电阻
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // 配置 RGB LED 引脚为输出
  pinMode(LED_RED_PIN, OUTPUT);
  // 以下引脚在画布中未连线，但代码中配置以便后续扩展
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_BLUE_PIN, OUTPUT);

  // 初始状态：关闭所有 LED
  digitalWrite(LED_RED_PIN, LOW);
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_BLUE_PIN, LOW);
}

void loop() {
  // 读取按键状态
  int reading = digitalRead(BUTTON_PIN);

  // 消抖处理
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    // 如果状态稳定且按键被按下（低电平有效，因为使用了上拉）
    if (reading == LOW && lastButtonState == HIGH) {
      ledState = !ledState;
      digitalWrite(LED_RED_PIN, ledState ? HIGH : LOW);
      Serial.println(ledState ? "Red LED ON" : "Red LED OFF");
    }
  }

  lastButtonState = reading;