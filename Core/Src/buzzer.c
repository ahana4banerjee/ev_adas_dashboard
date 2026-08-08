/**
 * @file    buzzer.c
 * @brief   Audible alarm driver utilizing hardware PWM (TIM4 CH1 on PB6)
 */

#include "buzzer.h"

/* ─── Private Variables ──────────────────────────────────────────────────── */
static TIM_HandleTypeDef  *_htim   = NULL;
static uint32_t            _channel = 0;
static AlarmLevel_t        _current_level = ALARM_NONE;
static uint32_t            _tick_counter  = 0;
static uint8_t             _is_pwm_active = 0;

/* ─── Private Helper Function Prototypes ─────────────────────────────────── */
static void Set_Buzzer_Frequency(uint32_t frequency);
static void Start_Buzzer_PWM(void);
static void Stop_Buzzer_PWM(void);

/* ─── API Implementations ────────────────────────────────────────────────── */

void Buzzer_Init(TIM_HandleTypeDef *htim, uint32_t channel)
{
    _htim          = htim;
    _channel       = channel;
    _current_level = ALARM_NONE;
    _tick_counter  = 0;
    _is_pwm_active = 0;

    /* Ensure buzzer is quiet initially */
    Stop_Buzzer_PWM();
}

void Buzzer_SetAlarmLevel(AlarmLevel_t level)
{
    if (level != _current_level) {
        _current_level = level;
        _tick_counter  = 0;  /* Reset pattern timer for immediate transition */
        
        if (level == ALARM_NONE) {
            Buzzer_Stop();
        }
    }
}

void Buzzer_Update(void)
{
    if (!_htim) return;

    switch (_current_level)
    {
        case ALARM_NONE:
            Stop_Buzzer_PWM();
            break;

        case ALARM_ADVISORY:
            /* Single short beep pattern (150ms ON, then SILENT) */
            if (_tick_counter < 15) {
                Set_Buzzer_Frequency(1200); /* 1.2 kHz advisory alert */
                Start_Buzzer_PWM();
            } else {
                Stop_Buzzer_PWM();
                /* Remain in advisory state silently until reset by caller */
            }
            _tick_counter++;
            break;

        case ALARM_WARNING:
            /* Slow beeping pattern (200ms ON / 800ms OFF = 1s cycle) */
            {
                uint32_t phase = _tick_counter % 100;
                if (phase < 20) {
                    Set_Buzzer_Frequency(1200); /* 1.2 kHz warning alert */
                    Start_Buzzer_PWM();
                } else {
                    Stop_Buzzer_PWM();
                }
            }
            _tick_counter++;
            break;

        case ALARM_CRITICAL:
            /* Fast urgent beeping pattern (100ms ON / 100ms OFF = 200ms cycle) */
            {
                uint32_t phase = _tick_counter % 20;
                if (phase < 10) {
                    Set_Buzzer_Frequency(2500); /* 2.5 kHz critical alert */
                    Start_Buzzer_PWM();
                } else {
                    Stop_Buzzer_PWM();
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
    Stop_Buzzer_PWM();
}

/* ─── Private Helper Function Implementations ────────────────────────────── */

/**
 * @brief  Adjust timer reload registers to generate the target PWM frequency.
 *         Formula: ARR = (TimerClock / TargetFreq) - 1
 */
static void Set_Buzzer_Frequency(uint32_t frequency)
{
    if (!_htim || frequency == 0) return;

    /* Base count rate is 1 MHz (72 MHz clock / 72 prescaler) */
    uint32_t arr = (1000000U / frequency) - 1;
    uint32_t ccr = (arr + 1) / 2;

    __HAL_TIM_SET_AUTORELOAD(_htim, arr);
    __HAL_TIM_SET_COMPARE(_htim, _channel, ccr);
}

/**
 * @brief  Enable hardware timer PWM output if not active.
 */
static void Start_Buzzer_PWM(void)
{
    if (!_is_pwm_active && _htim) {
        HAL_TIM_PWM_Start(_htim, _channel);
        if (_htim->Instance == TIM1) {
            __HAL_TIM_MOE_ENABLE(_htim);  /* Required for TIM1 Advanced Timer */
        }
        _is_pwm_active = 1;
    }
}

static void Stop_Buzzer_PWM(void)
{
    if (_htim) {
        __HAL_TIM_SET_COMPARE(_htim, _channel, 0);
        HAL_TIM_PWM_Stop(_htim, _channel);
        if (_htim->Instance == TIM1) {
            __HAL_TIM_MOE_DISABLE(_htim); /* Required for TIM1 Advanced Timer */
        }
        _is_pwm_active = 0;
    }
}

