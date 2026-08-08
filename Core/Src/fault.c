#include "fault.h"
#include "ultrasonic.h"
#include "alarm_manager.h"
#include "event_manager.h"
#include "buzzer.h"
#include "dtc_manager.h"

extern TIM_HandleTypeDef htim1;

void Fault_Init(Fault_HandleTypeDef *flt)
{
    flt->flags  = FAULT_NONE;
    flt->active = 0;
}

void Fault_Check(Fault_HandleTypeDef *flt,
                 EV_HandleTypeDef *ev,
                 ADAS_HandleTypeDef *adas)
{
    uint8_t new_flags = FAULT_NONE;

    if (ev->motor_temp >= EV_MAX_MOTOR_TEMP_C)
        new_flags |= FAULT_OT;

    if (ev->soc <= EV_FAULT_SOC_PCT)
        new_flags |= FAULT_SOC;

    if (adas->collision_warn == 2 && HCSR04_IsValid(HCSR04_FRONT))
        new_flags |= FAULT_COL;

    /* Detect transitions to publish events and log DTC freeze frames */
    if ((new_flags & FAULT_OT) && !(flt->flags & FAULT_OT)) {
        EventManager_Publish(EVENT_MOTOR_OVERHEAT, EVENT_SEVERITY_CRITICAL, EVENT_SOURCE_FAULT, "Motor temperature limit exceeded");
        DTC_Log(DTC_MOTOR_OVERHEAT, ev, "Motor temperature limit exceeded");
    }
    if ((new_flags & FAULT_SOC) && !(flt->flags & FAULT_SOC)) {
        EventManager_Publish(EVENT_BATTERY_LOW, EVENT_SEVERITY_CRITICAL, EVENT_SOURCE_FAULT, "Battery state of charge critically low");
        DTC_Log(DTC_BATTERY_LOW, ev, "Battery state of charge critically low");
    }
    if ((new_flags & FAULT_COL) && !(flt->flags & FAULT_COL)) {
        EventManager_Publish(EVENT_CRITICAL_COLLISION, EVENT_SEVERITY_CRITICAL, EVENT_SOURCE_FAULT, "Critical front collision hazard");
        DTC_Log(DTC_COLLISION_LATCH, ev, "Critical front collision hazard");
    }

    flt->flags = new_flags;

    if (flt->flags != FAULT_NONE)
    {
        flt->active = 1;
        ev->state    = STATE_FAULT;   // ← add this
        
        AlarmManager_SetAlert(ALERT_FAULT, ALARM_CRITICAL);

        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_11, GPIO_PIN_SET);
    }
    else
    {
        flt->active = 0;
        ev->state = STATE_DRIVING;

        AlarmManager_ClearAlert(ALERT_FAULT);

        HAL_GPIO_WritePin(GPIOB, GPIO_PIN_11, GPIO_PIN_RESET);
    }
}

void Fault_Clear(Fault_HandleTypeDef *flt, EV_HandleTypeDef *ev)
{
    flt->flags  = FAULT_NONE;
    flt->active = 0;

    ev->state = STATE_PARKED;
    
    AlarmManager_Init();
    Buzzer_Stop();
    EventManager_Publish(EVENT_FAULT_CLEARED, EVENT_SEVERITY_INFO, EVENT_SOURCE_FAULT, "All active faults cleared");

    /* Reset EV to safe state */
    ev->speed_kmh   = 0.0f;
    ev->motor_torque = 0.0f;
    ev->motor_temp  = 25.0f;
    ev->soc         = 80.0f;

    /* Clear dynamic simulation locks */
    ev->override_temp_active = 0;
    ev->override_soc_active  = 0;

    /* Turn off fault LED */
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_11, GPIO_PIN_RESET);
}
