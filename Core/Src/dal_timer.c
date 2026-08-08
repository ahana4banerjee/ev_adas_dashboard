/**
 * @file    dal_timer.c
 * @brief   Driver Abstraction Layer (DAL) for Hardware Timers and PWM implementation
 */

#include "dal_timer.h"

static TIM_HandleTypeDef *_htim_pwm    = NULL;
static uint32_t           _pwm_channel = 0;
static TIM_HandleTypeDef *_htim_delay  = NULL;
static uint8_t            _pwm_running = 0;

void DAL_Timer_Init(TIM_HandleTypeDef *htim_pwm, uint32_t pwm_channel, TIM_HandleTypeDef *htim_delay)
{
    _htim_pwm     = htim_pwm;
    _pwm_channel  = pwm_channel;
    _htim_delay   = htim_delay;
    _pwm_running  = 0;
    DAL_PWM_Stop();
}

void DAL_Timer_DelayUs(uint32_t us)
{
    if (!_htim_delay) return;
    __HAL_TIM_SET_COUNTER(_htim_delay, 0);
    while (__HAL_TIM_GET_COUNTER(_htim_delay) < us);
}

void DAL_PWM_SetFrequency(uint32_t frequency_hz)
{
    if (!_htim_pwm || frequency_hz == 0) return;

    /* Base count rate is 1 MHz (72 MHz / 72 prescaler) */
    uint32_t arr = (1000000U / frequency_hz) - 1;
    uint32_t ccr = (arr + 1) / 2;

    __HAL_TIM_SET_AUTORELOAD(_htim_pwm, arr);
    __HAL_TIM_SET_COMPARE(_htim_pwm, _pwm_channel, ccr);
}

void DAL_PWM_Start(uint32_t frequency_hz)
{
    if (!_htim_pwm) return;
    DAL_PWM_SetFrequency(frequency_hz);

    if (!_pwm_running) {
        HAL_TIM_PWM_Start(_htim_pwm, _pwm_channel);
        if (_htim_pwm->Instance == TIM1) {
            __HAL_TIM_MOE_ENABLE(_htim_pwm);
        }
        _pwm_running = 1;
    }
}

void DAL_PWM_Stop(void)
{
    if (!_htim_pwm) return;
    __HAL_TIM_SET_COMPARE(_htim_pwm, _pwm_channel, 0);
    HAL_TIM_PWM_Stop(_htim_pwm, _pwm_channel);
    if (_htim_pwm->Instance == TIM1) {
        __HAL_TIM_MOE_DISABLE(_htim_pwm);
    }
    _pwm_running = 0;
}
