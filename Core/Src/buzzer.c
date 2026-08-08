/**
 * @file    buzzer.c
 * @brief   Audible alarm driver utilizing Driver Abstraction Layer (DAL) PWM
 */

#include "buzzer.h"
#include "dal_timer.h"

/* ─── Private Variables ──────────────────────────────────────────────────── */
static AlarmLevel_t _current_level = ALARM_NONE;
static uint32_t     _tick_counter  = 0;

/* ─── API Implementations ────────────────────────────────────────────────── */

void Buzzer_Init(TIM_HandleTypeDef *htim, uint32_t channel)
{
    (void)htim;
    (void)channel;
    _current_level = ALARM_NONE;
    _tick_counter  = 0;

    /* Ensure buzzer output is shut off */
    DAL_PWM_Stop();
}

void Buzzer_SetAlarmLevel(AlarmLevel_t level)
{
    if (level != _current_level) {
        _current_level = level;
        _tick_counter  = 0;
        
        if (level == ALARM_NONE) {
            Buzzer_Stop();
        }
    }
}

void Buzzer_Update(void)
{
    switch (_current_level)
    {
        case ALARM_NONE:
            DAL_PWM_Stop();
            break;

        case ALARM_ADVISORY:
            /* Single short beep pattern (150ms ON, then SILENT) */
            if (_tick_counter < 15) {
                DAL_PWM_Start(1200); /* 1.2 kHz advisory alert */
            } else {
                DAL_PWM_Stop();
            }
            _tick_counter++;
            break;

        case ALARM_WARNING:
            /* Slow beeping pattern (200ms ON / 800ms OFF = 1s cycle) */
            {
                uint32_t phase = _tick_counter % 100;
                if (phase < 20) {
                    DAL_PWM_Start(1200); /* 1.2 kHz warning alert */
                } else {
                    DAL_PWM_Stop();
                }
            }
            _tick_counter++;
            break;

        case ALARM_CRITICAL:
            /* Fast urgent beeping pattern (100ms ON / 100ms OFF = 200ms cycle) */
            {
                uint32_t phase = _tick_counter % 20;
                if (phase < 10) {
                    DAL_PWM_Start(2500); /* 2.5 kHz critical alert */
                } else {
                    DAL_PWM_Stop();
                }
            }
            _tick_counter++;
            break;
    }
}

void Buzzer_Stop(void)
{
    _current_level = ALARM_NONE;
    _tick_counter  = 0;
    DAL_PWM_Stop();
}
