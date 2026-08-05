/**
 * @file    buzzer.h
 * @brief   Audible alarm driver using hardware PWM generation (TIM4 CH1 on PB6)
 * @platform STM32F103C8T6
 */

#ifndef BUZZER_H
#define BUZZER_H

#include "common.h"
#include "adas.h"

/* ─── API Prototypes ─────────────────────────────────────────────────────── */

/**
 * @brief  Initialize the buzzer driver with a hardware timer and channel.
 * @param  htim     Pointer to the HAL Timer structure (e.g., &htim4)
 * @param  channel  Timer channel macro (e.g., TIM_CHANNEL_1)
 */
void Buzzer_Init(TIM_HandleTypeDef *htim, uint32_t channel);

/**
 * @brief  Set the active alarm level for pattern generation.
 * @param  level  Target AlarmLevel_t severity
 */
void Buzzer_SetAlarmLevel(AlarmLevel_t level);

/**
 * @brief  Process the buzzer beep schedules. Call periodically at 100Hz (10ms).
 */
void Buzzer_Update(void);

/**
 * @brief  Force PWM output off and reset alarms.
 */
void Buzzer_Stop(void);

#endif /* BUZZER_H */
