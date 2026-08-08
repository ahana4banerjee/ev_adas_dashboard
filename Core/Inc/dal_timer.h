/**
 * @file    dal_timer.h
 * @brief   Driver Abstraction Layer (DAL) for Hardware Timers and PWM
 */

#ifndef DAL_TIMER_H
#define DAL_TIMER_H

#include "common.h"

/**
 * @brief  Initialize timer and PWM output abstractions.
 * @param  htim_pwm    Pointer to timer handle generating buzzer PWM
 * @param  pwm_channel Timer channel index
 * @param  htim_delay  Pointer to 1MHz base timer for microsecond busy-delays
 */
void DAL_Timer_Init(TIM_HandleTypeDef *htim_pwm, uint32_t pwm_channel, TIM_HandleTypeDef *htim_delay);

/**
 * @brief  Busy-wait delay for specified microseconds.
 * @param  us Microseconds to delay
 */
void DAL_Timer_DelayUs(uint32_t us);

/**
 * @brief  Start hardware PWM generation at the specified frequency.
 * @param  frequency_hz Target tone frequency in Hertz
 */
void DAL_PWM_Start(uint32_t frequency_hz);

/**
 * @brief  Stop PWM output and pull output pin LOW.
 */
void DAL_PWM_Stop(void);

/**
 * @brief  Dynamically adjust the output PWM tone frequency.
 * @param  frequency_hz Tone frequency in Hertz
 */
void DAL_PWM_SetFrequency(uint32_t frequency_hz);

#endif /* DAL_TIMER_H */
